/**
 * World bitmap text rendering from glyph atlas with multiline wrapping, alignment, and glyph lifetimes.
 */

import * as THREE from 'three';
import { Flat2DMaterial } from './materials';
import type {
  BitmapFontManifest,
  BitmapGlyphManifest,
  BitmapTextOptions,
  GlyphQuad,
  ProfileId,
} from './types';

/**
 * Validate authoritative bitmap font manifest.
 */
export function validateBitmapFontManifest(raw: unknown): BitmapFontManifest {
  function record(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Invalid bitmap font object.');
    return value as Record<string, unknown>;
  }
  function text(value: unknown): string {
    if (typeof value !== 'string' || !value || value.length > 128) throw new TypeError('Invalid bitmap font ID.');
    return value;
  }
  function number(value: unknown, minimum = 0): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum) throw new RangeError('Invalid bitmap font metric.');
    return value;
  }
  const source = record(raw);
  const pixelWidth = number(source.pixelWidth, 1); const pixelHeight = number(source.pixelHeight, 1);
  if (!Number.isInteger(pixelWidth) || !Number.isInteger(pixelHeight) || pixelWidth > 8192 || pixelHeight > 8192) throw new RangeError('Invalid font atlas dimensions.');
  const entries = Object.entries(record(source.glyphs));
  if (entries.length > 65536) throw new RangeError('Bitmap glyph limit exceeded.');
  const glyphs: Record<string, BitmapGlyphManifest> = {};
  for (const [key, value] of entries) {
    const glyph = record(value); const rect = record(glyph.rectPx);
    if ([...key].length !== 1 || glyph.char !== key) throw new TypeError('Invalid bitmap glyph character.');
    const x = number(rect.x); const y = number(rect.y); const width = number(rect.width); const height = number(rect.height);
    if (x + width > pixelWidth || y + height > pixelHeight) throw new RangeError('Bitmap glyph lies outside the atlas.');
    glyphs[key] = { id: text(glyph.id), char: key, xAdvance: number(glyph.xAdvance),
      width: number(glyph.width), height: number(glyph.height), rectPx: { x, y, width, height },
      xOffset: number(glyph.xOffset ?? 0, -8192), yOffset: number(glyph.yOffset ?? 0, -8192) };
  }
  if (source.texture !== undefined && !(source.texture instanceof THREE.Texture)) throw new TypeError('Invalid font texture.');
  return { fontId: text(source.fontId), atlasId: text(source.atlasId), pixelWidth, pixelHeight,
    lineHeight: number(source.lineHeight, 0.0001), baseLine: number(source.baseLine), glyphs, texture: source.texture };
}

export interface BitmapTextLayoutResult {
  width: number;
  height: number;
  glyphs: GlyphQuad[];
}

/**
 * Calculate layout of bitmap text with multiline wrapping and horizontal alignment.
 */
export function layoutBitmapText(
  rawText: string,
  font: BitmapFontManifest,
  options?: BitmapTextOptions,
): BitmapTextLayoutResult {
  if (rawText.length > 65536) throw new RangeError('Bitmap text limit exceeded.');
  if (options?.maxWidth !== undefined && (!Number.isFinite(options.maxWidth) || options.maxWidth <= 0)) throw new RangeError('Invalid text width.');
  for (const value of [options?.letterSpacing, options?.lineSpacing, options?.lifetimeMs]) {
    if (value !== undefined && !Number.isFinite(value)) throw new RangeError('Invalid text metric.');
  }
  for (const value of [options?.studioSettings?.maxCharacters, options?.studioSettings?.maxLines]) {
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 1)) throw new RangeError('Invalid text limit.');
  }
  let text = rawText;
  const studio = options?.studioSettings;

  // Apply the authored text limit.
  if (studio?.maxCharacters && studio.maxCharacters > 0) {
    if (text.length > studio.maxCharacters) {
      if (studio.truncate) {
        const suffix = studio.truncationSuffix ?? '...';
        const keepLen = Math.max(0, studio.maxCharacters - suffix.length);
        text = text.slice(0, keepLen) + suffix;
      } else {
        text = text.slice(0, studio.maxCharacters);
      }
    }
  }

  const align = options?.align ?? 'left';
  const letterSpacing = options?.letterSpacing ?? 0;
  const lineSpacing = options?.lineSpacing ?? 0;
  const maxWidth = options?.maxWidth && options.maxWidth > 0 ? options.maxWidth : Infinity;
  const effectiveLineHeight = font.lineHeight + lineSpacing;

  // Split input into words and line breaks
  const rawLines = text.split('\n');
  const wrappedLines: string[] = [];

  for (const rawLine of rawLines) {
    if (maxWidth === Infinity) {
      wrappedLines.push(rawLine);
      continue;
    }

    const words = rawLine.split(' ');
    let currentLine = '';
    let currentLineWidth = 0;

    for (let w = 0; w < words.length; w += 1) {
      const word = words[w]!;
      let wordWidth = 0;
      for (const ch of word) {
        const glyph = font.glyphs[ch];
        wordWidth += (glyph ? glyph.xAdvance : font.lineHeight * 0.5) + letterSpacing;
      }

      const spaceWidth = (font.glyphs[' ']?.xAdvance ?? font.lineHeight * 0.5) + letterSpacing;

      if (currentLine.length === 0) {
        currentLine = word;
        currentLineWidth = wordWidth;
      } else if (currentLineWidth + spaceWidth + wordWidth <= maxWidth) {
        currentLine += ` ${word}`;
        currentLineWidth += spaceWidth + wordWidth;
      } else {
        wrappedLines.push(currentLine);
        currentLine = word;
        currentLineWidth = wordWidth;
      }
    }

    wrappedLines.push(currentLine);
  }

  // Apply Studio max lines limit
  if (studio?.maxLines && studio.maxLines > 0 && wrappedLines.length > studio.maxLines) {
    wrappedLines.length = studio.maxLines;
    if (studio.truncate) {
      const last = wrappedLines[studio.maxLines - 1]!;
      const suffix = studio.truncationSuffix ?? '...';
      wrappedLines[studio.maxLines - 1] = last + suffix;
    }
  }

  const placedGlyphs: GlyphQuad[] = [];
  let maxMeasuredWidth = 0;

  for (let lineIndex = 0; lineIndex < wrappedLines.length; lineIndex += 1) {
    const lineText = wrappedLines[lineIndex]!;
    let lineWidth = 0;

    for (let c = 0; c < lineText.length; c += 1) {
      const ch = lineText[c]!;
      const glyph = font.glyphs[ch];
      const advance = (glyph ? glyph.xAdvance : font.lineHeight * 0.5) + letterSpacing;
      lineWidth += advance;
    }

    maxMeasuredWidth = Math.max(maxMeasuredWidth, lineWidth);
  }

  const totalContentWidth = maxWidth !== Infinity ? maxWidth : maxMeasuredWidth;
  const totalHeight = wrappedLines.length * effectiveLineHeight;

  const atlasW = font.pixelWidth;
  const atlasH = font.pixelHeight;

  for (let lineIndex = 0; lineIndex < wrappedLines.length; lineIndex += 1) {
    const lineText = wrappedLines[lineIndex]!;
    let lineWidth = 0;

    for (let c = 0; c < lineText.length; c += 1) {
      const ch = lineText[c]!;
      const glyph = font.glyphs[ch];
      lineWidth += (glyph ? glyph.xAdvance : font.lineHeight * 0.5) + letterSpacing;
    }

    let lineStartX = 0;
    if (align === 'center') {
      lineStartX = (totalContentWidth - lineWidth) * 0.5;
    } else if (align === 'right') {
      lineStartX = totalContentWidth - lineWidth;
    }

    // RH +Yup coordinates: line 0 top at Y = 0, successive lines downwards
    const lineTopY = -lineIndex * effectiveLineHeight;

    let cursorX = lineStartX;
    for (let c = 0; c < lineText.length; c += 1) {
      const ch = lineText[c]!;
      const glyph: BitmapGlyphManifest | undefined = font.glyphs[ch];
      if (!glyph) {
        cursorX += font.lineHeight * 0.5 + letterSpacing;
        continue;
      }

      const gx = cursorX + (glyph.xOffset ?? 0);
      const gy = lineTopY - (glyph.yOffset ?? 0);
      const gw = glyph.width;
      const gh = glyph.height;

      const u0 = glyph.rectPx.x / atlasW;
      const v0 = glyph.rectPx.y / atlasH;
      const u1 = (glyph.rectPx.x + glyph.rectPx.width) / atlasW;
      const v1 = (glyph.rectPx.y + glyph.rectPx.height) / atlasH;

      placedGlyphs.push({
        char: ch,
        x: gx,
        y: gy,
        width: gw,
        height: gh,
        u0,
        v0,
        u1,
        v1,
        lifetimeMs: options?.lifetimeMs,
        remainingMs: options?.lifetimeMs,
        alpha: 1.0,
      });

      cursorX += glyph.xAdvance + letterSpacing;
    }
  }

  return {
    width: totalContentWidth,
    height: totalHeight,
    glyphs: placedGlyphs,
  };
}

/**
 * Build BufferGeometry from placed glyph quads.
 */
export function buildGlyphsGeometry(glyphs: GlyphQuad[]): THREE.BufferGeometry {
  const quadCount = glyphs.length;
  const positions = new Float32Array(quadCount * 4 * 3);
  const uvs = new Float32Array(quadCount * 4 * 2);
  const colors = new Float32Array(quadCount * 4 * 4);
  const indices = new Uint32Array(quadCount * 6);

  for (let i = 0; i < quadCount; i += 1) {
    const g = glyphs[i]!;
    const vBase = i * 4;
    const pBase = vBase * 3;
    const uBase = vBase * 2;
    const cBase = vBase * 4;
    const iBase = i * 6;

    const left = g.x;
    const right = g.x + g.width;
    const top = g.y;
    const bottom = g.y - g.height;

    // Top-left
    positions[pBase] = left;
    positions[pBase + 1] = top;
    positions[pBase + 2] = 0;
    uvs[uBase] = g.u0;
    uvs[uBase + 1] = g.v0;

    // Top-right
    positions[pBase + 3] = right;
    positions[pBase + 4] = top;
    positions[pBase + 5] = 0;
    uvs[uBase + 2] = g.u1;
    uvs[uBase + 3] = g.v0;

    // Bottom-left
    positions[pBase + 6] = left;
    positions[pBase + 7] = bottom;
    positions[pBase + 8] = 0;
    uvs[uBase + 4] = g.u0;
    uvs[uBase + 5] = g.v1;

    // Bottom-right
    positions[pBase + 9] = right;
    positions[pBase + 10] = bottom;
    positions[pBase + 11] = 0;
    uvs[uBase + 6] = g.u1;
    uvs[uBase + 7] = g.v1;

    const a = g.alpha;
    for (let c = 0; c < 4; c += 1) {
      colors[cBase + c * 4] = a;
      colors[cBase + c * 4 + 1] = a;
      colors[cBase + c * 4 + 2] = a;
      colors[cBase + c * 4 + 3] = a;
    }

    indices[iBase] = vBase;
    indices[iBase + 1] = vBase + 2;
    indices[iBase + 2] = vBase + 1;
    indices[iBase + 3] = vBase + 1;
    indices[iBase + 4] = vBase + 2;
    indices[iBase + 5] = vBase + 3;
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 4));
  geom.setIndex(new THREE.BufferAttribute(indices, 1));
  return geom;
}

/**
 * Bitmap text renderable mesh with profileId "flat-2d".
 */
export class BitmapTextMesh extends THREE.Mesh {
  readonly profileId: ProfileId = 'flat-2d';
  readonly font: BitmapFontManifest;
  readonly options: BitmapTextOptions;
  private glyphQuads: GlyphQuad[] = [];

  constructor(text: string, font: BitmapFontManifest, options?: BitmapTextOptions) {
    const validatedFont = validateBitmapFontManifest(font);
    const layout = layoutBitmapText(text, validatedFont, options);
    const geom = buildGlyphsGeometry(layout.glyphs);
    const material = new Flat2DMaterial({
      texture: validatedFont.texture,
      tint: options?.tint,
      opacity: options?.opacity,
    });

    super(geom, material);
    this.font = validatedFont;
    this.options = options ?? {};
    this.glyphQuads = layout.glyphs;
    this.renderOrder = options?.renderOrder ?? 0;
  }

  /**
   * Update the displayed text string.
   */
  updateText(text: string): void {
    const layout = layoutBitmapText(text, this.font, this.options);
    this.glyphQuads = layout.glyphs;
    const oldGeom = this.geometry;
    this.geometry = buildGlyphsGeometry(this.glyphQuads);
    oldGeom.dispose();
  }

  /**
   * Update glyph lifetimes and decay alpha.
   */
  updateLifetimes(deltaMs: number): boolean {
    let changed = false;
    let anyAlive = false;

    for (const g of this.glyphQuads) {
      if (g.lifetimeMs !== undefined && g.remainingMs !== undefined) {
        g.remainingMs -= deltaMs;
        changed = true;
        if (g.remainingMs <= 0) {
          g.remainingMs = 0;
          g.alpha = 0;
        } else {
          g.alpha = Math.max(0, Math.min(1, g.remainingMs / g.lifetimeMs));
          anyAlive = true;
        }
      }
    }

    if (changed) {
      const colorAttr = this.geometry.getAttribute('color') as THREE.BufferAttribute | undefined;
      if (colorAttr) {
        for (let i = 0; i < this.glyphQuads.length; i += 1) {
          const a = this.glyphQuads[i]!.alpha;
          for (let c = 0; c < 4; c += 1) {
            colorAttr.setXYZW(i * 4 + c, a, a, a, a);
          }
        }
        colorAttr.needsUpdate = true;
      }
    }

    return anyAlive;
  }

  /**
   * Idempotent disposal of mesh resources.
   */
  dispose(): void {
    this.geometry.dispose();
    if (this.material instanceof THREE.Material) {
      this.material.dispose();
    }
  }
}

/**
 * Factory function to create a BitmapTextMesh.
 */
export function createBitmapTextMesh(
  text: string,
  font: BitmapFontManifest,
  options?: BitmapTextOptions,
): BitmapTextMesh {
  return new BitmapTextMesh(text, font, options);
}
