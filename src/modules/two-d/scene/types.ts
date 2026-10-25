/**
 * Types for canonical 2D scene modules.
 */

export type ProfileId = 'flat-2d' | 'world-3d';

export type BlendMode = 'normal' | 'additive' | 'multiply' | 'screen';

export type RotationMode = 'none' | 'cw90';

export type ColorRgba = [number, number, number, number];

export type ColorRgb = [number, number, number];

export interface Vector2D {
  x: number;
  y: number;
}

export interface RectPx {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface NineSlicePx {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface AtlasFrame {
  id: string;
  atlasId: string;
  rectPx: RectPx;
  sourceSizePx: { width: number; height: number };
  trimmedRectPx: RectPx;
  rotation: RotationMode;
  pivotNormalized: Vector2D;
  nineSlicePx?: NineSlicePx;
  atlasPixelWidth?: number;
  atlasPixelHeight?: number;
}

export interface AtlasManifest {
  atlasId: string;
  imagePath: string;
  pixelWidth: number;
  pixelHeight: number;
  frames: Record<string, AtlasFrame>;
  animations?: Record<string, string[]>;
}

export interface PresentationFrameRef {
  frameId: string;
  durationMs: number;
  frameEventIds?: string[];
}

export interface PresentationAnimationClip {
  type: 'presentation';
  id: string;
  playback: 'once' | 'loop';
  fps?: number;
  frames: PresentationFrameRef[];
}

export interface GameplayFrameRef {
  frameId: string;
  durationTicks: number;
  frameEventIds?: string[];
}

export interface GameplayTimelineClip {
  type: 'gameplay';
  id: string;
  playback: 'once' | 'loop';
  frames: GameplayFrameRef[];
}

export type AnimationClip = PresentationAnimationClip | GameplayTimelineClip;

export interface PresentationClock {
  activeSeconds: number;
  deltaSeconds: number;
  epoch: number;
  suspended: boolean;
}

export interface PickResult {
  nodeId: string;
  worldX: number;
  worldY: number;
  localX: number;
  localY: number;
}

export type SceneNodeType = 'group' | 'sprite' | 'tilemap' | 'text' | 'shape' | 'particle' | 'mask' | 'foreign';

export interface BoundingBox2D {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface FrameQuadMetrics {
  localLeft: number;
  localBottom: number;
  localWidth: number;
  localHeight: number;
}

export interface SceneNode {
  interactive: boolean;
  hitBounds?: BoundingBox2D;
  id: string;
  type: SceneNodeType;
  profileId: ProfileId;
  parentId: string | null;
  childrenIds: string[];
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  pivotX: number;
  pivotY: number;
  anchorOffsetXMeters: number;
  anchorOffsetYMeters: number;
  visible: boolean;
  opacity: number;
  tint: ColorRgba;
  worldVisible: boolean;
  worldOpacity: number;
  worldTint: ColorRgba;
  layer: string;
  layerRank: number;
  subBand: number;
  explicitOrder: number;
  sortY: boolean;
  flipX: boolean;
  flipY: boolean;
  atlasId?: string;
  frameId?: string;
  width?: number;
  height?: number;
  blendMode: BlendMode;
  clipRect?: RectPx;
  maskId?: string;
  worldMatrix: [number, number, number, number, number, number];
  worldBounds: BoundingBox2D;
  dirty: boolean;
  disposed: boolean;
}

export interface SpriteInstancePlan {
  id: string;
  atlasId: string;
  atlasPixelWidth: number;
  atlasPixelHeight: number;
  frame: AtlasFrame;
  worldMatrix: [number, number, number, number, number, number];
  quadMetrics: FrameQuadMetrics;
  tint: ColorRgba;
  opacity: number;
  blendMode: BlendMode;
  renderOrder: number;
  clipRect?: RectPx;
  maskId?: string;
}

export interface BatchRun {
  materialKey: string;
  blendMode: BlendMode;
  atlasIds: string[];
  renderOrder: number;
  instances: SpriteInstancePlan[];
  clipRect?: RectPx;
  maskId?: string;
}
