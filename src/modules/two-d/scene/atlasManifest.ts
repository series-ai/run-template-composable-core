/**
 * Atlas manifest parser and validation functions.
 */

import type { AtlasFrame, AtlasManifest, NineSlicePx, RectPx, RotationMode, Vector2D } from './types';

export interface GridAtlasConfig {
  atlasId: string;
  imagePath: string;
  pixelWidth: number;
  pixelHeight: number;
  cols: number;
  rows: number;
  frameWidth: number;
  frameHeight: number;
  pivotNormalized?: Vector2D;
  animations?: Record<string, string[]>;
}

export interface PlistImportConfig {
  atlasId: string;
  imagePath: string;
  pixelWidth?: number;
  pixelHeight?: number;
  defaultPivotNormalized?: Vector2D;
  animations?: Record<string, string[]>;
}

function isFinitePositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function validateRect(rect: unknown, context: string): RectPx {
  if (typeof rect !== 'object' || rect === null) {
    throw new TypeError(`${context}: rect must be an object.`);
  }
  const r = rect as Record<string, unknown>;
  if (!isFiniteNumber(r['x']) || !isFiniteNumber(r['y'])) {
    throw new RangeError(`${context}: x and y coordinates must be finite numbers.`);
  }
  if (!isFinitePositiveNumber(r['width']) || !isFinitePositiveNumber(r['height'])) {
    throw new RangeError(`${context}: width and height must be finite positive numbers.`);
  }
  return {
    x: r['x'],
    y: r['y'],
    width: r['width'],
    height: r['height'],
  };
}

function validateNineSlice(raw: unknown, context: string): NineSlicePx | undefined {
  if (raw === undefined || raw === null) {
    return undefined;
  }
  if (typeof raw !== 'object') {
    throw new TypeError(`${context}: nineSlice must be an object.`);
  }
  const ns = raw as Record<string, unknown>;
  const left = ns['left'];
  const top = ns['top'];
  const right = ns['right'];
  const bottom = ns['bottom'];
  if (!isFiniteNumber(left) || !isFiniteNumber(top) || !isFiniteNumber(right) || !isFiniteNumber(bottom)) {
    throw new RangeError(`${context}: nineSlice border values must be finite numbers.`);
  }
  if (left < 0 || top < 0 || right < 0 || bottom < 0) {
    throw new RangeError(`${context}: nineSlice border values cannot be negative.`);
  }
  return { left, top, right, bottom };
}

/**
 * Validate an atlas manifest at system boundaries.
 * Enforces finite numbers, positive dimensions, unique IDs, and valid frame references.
 */
export function validateAtlasManifest(raw: unknown): AtlasManifest {
  if (typeof raw !== 'object' || raw === null) {
    throw new TypeError('validateAtlasManifest: input must be a non-null object.');
  }

  const manifest = raw as Record<string, unknown>;
  const atlasId = manifest['atlasId'];
  if (typeof atlasId !== 'string' || atlasId.trim().length === 0) {
    throw new TypeError('validateAtlasManifest: atlasId must be a non-empty string.');
  }

  const imagePath = manifest['imagePath'];
  if (typeof imagePath !== 'string' || imagePath.trim().length === 0) {
    throw new TypeError('validateAtlasManifest: imagePath must be a non-empty string.');
  }

  const pixelWidth = manifest['pixelWidth'];
  const pixelHeight = manifest['pixelHeight'];
  if (!isFinitePositiveNumber(pixelWidth) || !isFinitePositiveNumber(pixelHeight)) {
    throw new RangeError('validateAtlasManifest: pixelWidth and pixelHeight must be finite positive numbers.');
  }

  const rawFrames = manifest['frames'];
  if (typeof rawFrames !== 'object' || rawFrames === null) {
    throw new TypeError('validateAtlasManifest: frames must be an object.');
  }

  const framesRecord = rawFrames as Record<string, unknown>;
  const validatedFrames: Record<string, AtlasFrame> = {};

  for (const [frameKey, rawFrame] of Object.entries(framesRecord)) {
    if (typeof rawFrame !== 'object' || rawFrame === null) {
      throw new TypeError(`validateAtlasManifest: frame ${frameKey} must be an object.`);
    }
    const f = rawFrame as Record<string, unknown>;
    const id = f['id'];
    if (typeof id !== 'string' || id.trim().length === 0) {
      throw new TypeError(`validateAtlasManifest: frame id for ${frameKey} must be a non-empty string.`);
    }

    const rectPx = validateRect(f['rectPx'], `frame ${id} rectPx`);
    if (rectPx.x < 0 || rectPx.y < 0 || rectPx.x + rectPx.width > pixelWidth || rectPx.y + rectPx.height > pixelHeight) {
      throw new RangeError(`validateAtlasManifest: frame ${id} rectPx exceeds atlas boundaries.`);
    }

    const sourceSizeRaw = f['sourceSizePx'];
    if (typeof sourceSizeRaw !== 'object' || sourceSizeRaw === null) {
      throw new TypeError(`validateAtlasManifest: frame ${id} sourceSizePx must be an object.`);
    }
    const ss = sourceSizeRaw as Record<string, unknown>;
    if (!isFinitePositiveNumber(ss['width']) || !isFinitePositiveNumber(ss['height'])) {
      throw new RangeError(`validateAtlasManifest: frame ${id} sourceSizePx dimensions must be finite positive numbers.`);
    }
    const sourceSizePx = { width: ss['width'], height: ss['height'] };

    const trimmedRectPx = validateRect(f['trimmedRectPx'], `frame ${id} trimmedRectPx`);

    const rot = f['rotation'];
    const rotation: RotationMode = rot === 'cw90' ? 'cw90' : 'none';

    const pivotRaw = f['pivotNormalized'];
    if (typeof pivotRaw !== 'object' || pivotRaw === null) {
      throw new TypeError(`validateAtlasManifest: frame ${id} pivotNormalized must be an object.`);
    }
    const piv = pivotRaw as Record<string, unknown>;
    if (!isFiniteNumber(piv['x']) || !isFiniteNumber(piv['y'])) {
      throw new RangeError(`validateAtlasManifest: frame ${id} pivotNormalized must have finite x and y.`);
    }
    const pivotNormalized: Vector2D = { x: piv['x'], y: piv['y'] };

    const nineSlicePx = validateNineSlice(f['nineSlicePx'], `frame ${id}`);

    validatedFrames[id] = {
      id,
      atlasId,
      rectPx,
      sourceSizePx,
      trimmedRectPx,
      rotation,
      pivotNormalized,
      nineSlicePx,
      atlasPixelWidth: pixelWidth,
      atlasPixelHeight: pixelHeight,
    };
  }

  const rawAnimations = manifest['animations'];
  let validatedAnimations: Record<string, string[]> | undefined;
  if (rawAnimations !== undefined && rawAnimations !== null) {
    if (typeof rawAnimations !== 'object') {
      throw new TypeError('validateAtlasManifest: animations must be an object.');
    }
    validatedAnimations = {};
    for (const [animKey, frameIds] of Object.entries(rawAnimations as Record<string, unknown>)) {
      if (!Array.isArray(frameIds)) {
        throw new TypeError(`validateAtlasManifest: animation ${animKey} must be an array of frame ids.`);
      }
      for (const frameId of frameIds) {
        if (typeof frameId !== 'string') {
          throw new TypeError(`validateAtlasManifest: animation ${animKey} frame id must be a string.`);
        }
        if (!validatedFrames[frameId]) {
          throw new Error(`validateAtlasManifest: animation ${animKey} references unknown frame id "${frameId}".`);
        }
      }
      validatedAnimations[animKey] = [...frameIds];
    }
  }

  return {
    atlasId,
    imagePath,
    pixelWidth,
    pixelHeight,
    frames: validatedFrames,
    animations: validatedAnimations,
  };
}

/**
 * Create an AtlasManifest from a uniform grid.
 */
export function createGridAtlasManifest(config: GridAtlasConfig): AtlasManifest {
  if (!isFinitePositiveNumber(config.pixelWidth) || !isFinitePositiveNumber(config.pixelHeight)) {
    throw new RangeError('createGridAtlasManifest: pixel dimensions must be finite positive numbers.');
  }
  if (!isFinitePositiveNumber(config.cols) || !isFinitePositiveNumber(config.rows)) {
    throw new RangeError('createGridAtlasManifest: rows and cols must be finite positive numbers.');
  }
  if (!isFinitePositiveNumber(config.frameWidth) || !isFinitePositiveNumber(config.frameHeight)) {
    throw new RangeError('createGridAtlasManifest: frame dimensions must be finite positive numbers.');
  }

  const pivotNormalized = config.pivotNormalized ?? { x: 0.5, y: 0.5 };
  const frames: Record<string, AtlasFrame> = {};
  const totalFrames = config.cols * config.rows;

  for (let index = 0; index < totalFrames; index += 1) {
    const col = index % config.cols;
    const row = Math.floor(index / config.cols);
    const x = col * config.frameWidth;
    const y = row * config.frameHeight;
    const id = `${config.atlasId}_${index}`;
    const rectPx: RectPx = {
      x,
      y,
      width: config.frameWidth,
      height: config.frameHeight,
    };

    frames[id] = {
      id,
      atlasId: config.atlasId,
      rectPx,
      sourceSizePx: { width: config.frameWidth, height: config.frameHeight },
      trimmedRectPx: { ...rectPx, x: 0, y: 0 },
      rotation: 'none',
      pivotNormalized: { ...pivotNormalized },
    };
  }

  return validateAtlasManifest({
    atlasId: config.atlasId,
    imagePath: config.imagePath,
    pixelWidth: config.pixelWidth,
    pixelHeight: config.pixelHeight,
    frames,
    animations: config.animations,
  });
}

const RECT_RE = /\{\{(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\},\{(\d+(?:\.\d+)?),(\d+(?:\.\d+)?)\}\}/;
const POINT_RE = /\{(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\}/;

function parsePlistRect(raw: string): RectPx | null {
  const match = RECT_RE.exec(raw);
  if (!match) return null;
  return {
    x: parseFloat(match[1]!),
    y: parseFloat(match[2]!),
    width: parseFloat(match[3]!),
    height: parseFloat(match[4]!),
  };
}

function parsePlistPoint(raw: string): Vector2D | null {
  const match = POINT_RE.exec(raw);
  if (!match) return null;
  return {
    x: parseFloat(match[1]!),
    y: parseFloat(match[2]!),
  };
}

/**
 * Parse a Cocos2d TexturePacker format 2 XML plist string into an AtlasManifest.
 */
export function parsePlistAtlasManifest(plistXml: string, config: PlistImportConfig): AtlasManifest {
  const framesMatch = plistXml.match(/<key>frames<\/key>\s*<dict>([\s\S]*?)<\/dict>\s*(?:<key>metadata<\/key>|<\/dict>\s*<\/plist>)/);
  if (!framesMatch) {
    throw new Error('parsePlistAtlasManifest: frames dictionary not found.');
  }

  const framesBlock = framesMatch[1]!;
  const framePattern = /<key>([^<]+)<\/key>\s*<dict>([\s\S]*?)<\/dict>/g;
  const frames: Record<string, AtlasFrame> = {};
  const defaultPivot = config.defaultPivotNormalized ?? { x: 0.5, y: 0.5 };

  let match: RegExpExecArray | null;
  while ((match = framePattern.exec(framesBlock)) !== null) {
    const frameName = match[1]!;
    const dictContent = match[2]!;

    const frameRectMatch = dictContent.match(/<key>frame<\/key>\s*<string>([^<]+)<\/string>/);
    const offsetMatch = dictContent.match(/<key>offset<\/key>\s*<string>([^<]+)<\/string>/);
    const rotatedMatch = dictContent.match(/<key>rotated<\/key>\s*<(true|false)\/>/);
    const sourceSizeMatch = dictContent.match(/<key>sourceSize<\/key>\s*<string>([^<]+)<\/string>/);

    if (!frameRectMatch) {
      throw new Error(`parsePlistAtlasManifest: frame key missing in ${frameName}`);
    }

    const parsedRect = parsePlistRect(frameRectMatch[1]!);
    if (!parsedRect) {
      throw new Error(`parsePlistAtlasManifest: invalid rect string in ${frameName}`);
    }

    const rotated = rotatedMatch ? rotatedMatch[1] === 'true' : false;
    const offset = offsetMatch ? parsePlistPoint(offsetMatch[1]!) ?? { x: 0, y: 0 } : { x: 0, y: 0 };
    const sourceSizePoint = sourceSizeMatch ? parsePlistPoint(sourceSizeMatch[1]!) : null;

    const sourceWidth = sourceSizePoint ? sourceSizePoint.x : (rotated ? parsedRect.height : parsedRect.width);
    const sourceHeight = sourceSizePoint ? sourceSizePoint.y : (rotated ? parsedRect.width : parsedRect.height);

    // In Cocos2d TexturePacker format 2:
    // When rotated is true, the packed rect width and height in the atlas image are swapped.
    const logicalWidth = rotated ? parsedRect.height : parsedRect.width;
    const logicalHeight = rotated ? parsedRect.width : parsedRect.height;

    // Offset is from center of source image to center of trimmed sprite.
    // Cocos2d positive Y is upwards, so offset.y is upwards from center.
    const trimX = (sourceWidth - logicalWidth) / 2 + offset.x;
    const trimY = (sourceHeight - logicalHeight) / 2 - offset.y;

    frames[frameName] = {
      id: frameName,
      atlasId: config.atlasId,
      rectPx: parsedRect,
      sourceSizePx: { width: sourceWidth, height: sourceHeight },
      trimmedRectPx: {
        x: Math.max(0, trimX),
        y: Math.max(0, trimY),
        width: logicalWidth,
        height: logicalHeight,
      },
      rotation: rotated ? 'cw90' : 'none',
      pivotNormalized: { ...defaultPivot },
    };
  }

  // Parse texture size from metadata
  let textureWidth = config.pixelWidth;
  let textureHeight = config.pixelHeight;
  const sizeMatch = plistXml.match(/<key>size<\/key>\s*<string>([^<]+)<\/string>/);
  if (sizeMatch) {
    const sizePoint = parsePlistPoint(sizeMatch[1]!);
    if (sizePoint) {
      textureWidth = textureWidth ?? sizePoint.x;
      textureHeight = textureHeight ?? sizePoint.y;
    }
  }

  if (!textureWidth || !textureHeight) {
    // Deduce minimum dimensions from frames
    let maxRight = 0;
    let maxBottom = 0;
    for (const f of Object.values(frames)) {
      maxRight = Math.max(maxRight, f.rectPx.x + f.rectPx.width);
      maxBottom = Math.max(maxBottom, f.rectPx.y + f.rectPx.height);
    }
    textureWidth = textureWidth ?? maxRight;
    textureHeight = textureHeight ?? maxBottom;
  }

  return validateAtlasManifest({
    atlasId: config.atlasId,
    imagePath: config.imagePath,
    pixelWidth: textureWidth,
    pixelHeight: textureHeight,
    frames,
    animations: config.animations,
  });
}
