/**
 * Types for canonical 2D graphics module.
 */

import type * as THREE from 'three';

export type ProfileId = 'flat-2d';

export type BlendMode = 'normal' | 'additive' | 'multiply' | 'screen';

export type ColorRgba = [number, number, number, number];

export type ColorRgb = [number, number, number];

export interface Vector2D {
  x: number;
  y: number;
}

export type RectPx = import('@modules/two-d/scene/types').RectPx;
export type NineSlicePx = import('@modules/two-d/scene/types').NineSlicePx;
export type AtlasFrame = import('@modules/two-d/scene/types').AtlasFrame;
export type AtlasManifest = import('@modules/two-d/scene/types').AtlasManifest;

/**
 * 2D affine transformation matrix: [a, b, c, d, tx, ty].
 */
export type AffineMatrix2D = [number, number, number, number, number, number];

export interface RectShapeDefinition {
  type: 'rect';
  x: number;
  y: number;
  width: number;
  height: number;
  radius?: number;
  origin?: 'top-left' | 'center';
}

export interface CircleShapeDefinition {
  type: 'circle';
  cx: number;
  cy: number;
  radius: number;
  segments?: number;
}

export interface PolygonShapeDefinition {
  type: 'polygon';
  points: Vector2D[];
}

export interface PathStrokeDefinition {
  type: 'stroke';
  points: Vector2D[];
  width: number;
  closed?: boolean;
  cap?: 'butt' | 'round' | 'square';
  join?: 'miter' | 'bevel' | 'round';
  miterLimit?: number;
}

export type VectorShapeDefinition =
  | RectShapeDefinition
  | CircleShapeDefinition
  | PolygonShapeDefinition
  | PathStrokeDefinition;

export interface VectorMeshOptions {
  profileId: 'flat-2d';
  renderOrder?: number;
  tint?: ColorRgba;
  opacity?: number;
  blendMode?: BlendMode;
  x?: number;
  y?: number;
  scaleX?: number;
  scaleY?: number;
  rotation?: number;
}

export interface RectMask {
  type: 'rect';
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  matrix?: AffineMatrix2D;
  inverted?: boolean;
}

export interface CircleMask {
  type: 'circle';
  cx: number;
  cy: number;
  radius: number;
  matrix?: AffineMatrix2D;
  inverted?: boolean;
}

export interface SpriteAlphaMask {
  type: 'sprite-alpha';
  texture: THREE.Texture;
  uvBounds: [number, number, number, number];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  matrix?: AffineMatrix2D;
  alphaThreshold?: number;
  cpuAlphaData?: Uint8Array;
  cpuWidth?: number;
  cpuHeight?: number;
  inverted?: boolean;
}

export type MaskDefinition = RectMask | CircleMask | SpriteAlphaMask;

export type MaskStack = MaskDefinition[];

export interface BitmapGlyphManifest {
  id: string;
  char: string;
  xAdvance: number;
  width: number;
  height: number;
  xOffset?: number;
  yOffset?: number;
  rectPx: RectPx;
}

export interface BitmapFontManifest {
  fontId: string;
  atlasId: string;
  pixelWidth: number;
  pixelHeight: number;
  lineHeight: number;
  baseLine: number;
  glyphs: Record<string, BitmapGlyphManifest>;
  texture?: THREE.Texture;
}

export interface StudioTextSettings {
  maxCharacters?: number;
  maxLines?: number;
  truncate?: boolean;
  truncationSuffix?: string;
}

export type TextHorizontalAlign = 'left' | 'center' | 'right';

export interface BitmapTextOptions {
  maxWidth?: number;
  align?: TextHorizontalAlign;
  letterSpacing?: number;
  lineSpacing?: number;
  tint?: ColorRgba;
  opacity?: number;
  studioSettings?: StudioTextSettings;
  lifetimeMs?: number;
  renderOrder?: number;
}

export interface GlyphQuad {
  char: string;
  x: number;
  y: number;
  width: number;
  height: number;
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  lifetimeMs?: number;
  remainingMs?: number;
  alpha: number;
}

export interface NineSliceQuad {
  localX: number;
  localY: number;
  width: number;
  height: number;
  u0: number;
  v0: number;
  uWidth: number;
  vHeight: number;
}

export interface TiledQuad {
  localX: number;
  localY: number;
  width: number;
  height: number;
  u0: number;
  v0: number;
  uWidth: number;
  vHeight: number;
}

export interface ColorAdjustOptions {
  brightness?: number;
  contrast?: number;
  saturation?: number;
  sourcePremultiplied?: boolean;
}

export interface BlurOptions {
  quality?: 1 | 2;
  strength?: number;
  sourcePremultiplied?: boolean;
}

export interface OutlineOptions {
  outlineColor: ColorRgba;
  thickness?: number;
  sourcePremultiplied?: boolean;
}

export interface ForeignAdapterOptions {
  profileId: 'flat-2d';
  renderOrder: number;
  pick?: (worldX: number, worldY: number) => boolean;
  x?: number;
  y?: number;
  scaleX?: number;
  scaleY?: number;
  rotation?: number;
}

export interface ForeignRenderableAdapter {
  id: string;
  profileId: 'flat-2d';
  renderOrder: number;
  object: THREE.Object3D;
  pick(worldX: number, worldY: number): boolean;
  setRenderOrder(order: number): void;
  dispose(): void;
}
