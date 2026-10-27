/**
 * Orthographic camera and stage calculation helpers.
 */

import type { Vector2D } from './types';

export interface SafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface OrthographicStageConfig {
  viewportWidth: number;
  viewportHeight: number;
  worldUnitsTall: number;
  zoom?: number;
  pixelRatio?: number;
  safeArea?: Partial<SafeAreaInsets>;
}

export interface FrustumBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface OrthographicStageMetrics {
  worldWidth: number;
  worldHeight: number;
  pixelsPerUnit: number;
  safeWorldInsets: SafeAreaInsets;
  frustum: FrustumBounds;
}

export interface ContentFitConfig {
  viewportWidth: number;
  viewportHeight: number;
  contentWidth: number;
  contentHeight: number;
}

export interface ParallaxLayerConfig {
  id: string;
  factorX: number;
  factorY: number;
  offsetX?: number;
  offsetY?: number;
}

export interface CameraFollowOptions {
  deadzoneWidth?: number;
  deadzoneHeight?: number;
  smoothness?: number;
  deltaSeconds?: number;
  minBounds?: Vector2D;
  maxBounds?: Vector2D;
}

const defaultSafeArea: SafeAreaInsets = { top: 0, right: 0, bottom: 0, left: 0 };

/**
 * Calculate orthographic stage metrics from viewport and world dimensions.
 */
export function buildOrthographicStageMetrics(config: OrthographicStageConfig): OrthographicStageMetrics {
  if (config.viewportWidth <= 0 || config.viewportHeight <= 0 || config.worldUnitsTall <= 0) {
    throw new RangeError('buildOrthographicStageMetrics: all dimensions must be positive finite numbers.');
  }

  const zoom = config.zoom ?? 1;
  if (zoom <= 0) {
    throw new RangeError('buildOrthographicStageMetrics: zoom must be greater than zero.');
  }

  const worldHeight = config.worldUnitsTall / zoom;
  const worldWidth = worldHeight * (config.viewportWidth / config.viewportHeight);
  const pixelRatio = config.pixelRatio ?? 1;
  const pixelsPerUnit = (config.viewportHeight * pixelRatio) / worldHeight;
  const safeArea = { ...defaultSafeArea, ...config.safeArea };

  return {
    worldWidth,
    worldHeight,
    pixelsPerUnit,
    safeWorldInsets: {
      top: safeArea.top / pixelsPerUnit,
      right: safeArea.right / pixelsPerUnit,
      bottom: safeArea.bottom / pixelsPerUnit,
      left: safeArea.left / pixelsPerUnit,
    },
    frustum: {
      left: -worldWidth / 2,
      right: worldWidth / 2,
      top: worldHeight / 2,
      bottom: -worldHeight / 2,
    },
  };
}

/**
 * Quantize a world coordinate to the nearest physical device pixel.
 */
export function snapWorldToPixel(value: number, pixelsPerUnit: number): number {
  if (pixelsPerUnit <= 0) {
    return value;
  }
  return Math.round(value * pixelsPerUnit) / pixelsPerUnit;
}

/**
 * Calculate uniform scale to fit a content box into a viewport box.
 * Modes: 'contain' letterboxes, 'cover' crops.
 */
export function fitContentScale(config: ContentFitConfig, mode: 'contain' | 'cover' = 'contain'): number {
  const { viewportWidth, viewportHeight, contentWidth, contentHeight } = config;
  if (![viewportWidth, viewportHeight, contentWidth, contentHeight].every((d) => Number.isFinite(d) && d > 0)) {
    throw new RangeError(
      `fitContentScale: all dimensions must be finite and positive. Got viewport ${viewportWidth}x${viewportHeight}, content ${contentWidth}x${contentHeight}`,
    );
  }
  const scaleX = viewportWidth / contentWidth;
  const scaleY = viewportHeight / contentHeight;
  return mode === 'contain' ? Math.min(scaleX, scaleY) : Math.max(scaleX, scaleY);
}

/**
 * Calculate camera position following a target with deadzone and smoothing.
 */
export function computeCameraFollow(
  current: Vector2D,
  target: Vector2D,
  options?: CameraFollowOptions,
): Vector2D {
  let targetX = current.x;
  let targetY = current.y;

  const halfDeadzoneX = (options?.deadzoneWidth ?? 0) / 2;
  const halfDeadzoneY = (options?.deadzoneHeight ?? 0) / 2;

  const diffX = target.x - current.x;
  if (Math.abs(diffX) > halfDeadzoneX) {
    targetX = target.x - Math.sign(diffX) * halfDeadzoneX;
  }

  const diffY = target.y - current.y;
  if (Math.abs(diffY) > halfDeadzoneY) {
    targetY = target.y - Math.sign(diffY) * halfDeadzoneY;
  }

  const smoothness = options?.smoothness ?? 0;
  const dt = options?.deltaSeconds ?? 0.016;

  let nextX: number;
  let nextY: number;

  if (smoothness <= 0) {
    nextX = targetX;
    nextY = targetY;
  } else {
    const factor = 1.0 - Math.exp(-smoothness * dt);
    nextX = current.x + (targetX - current.x) * factor;
    nextY = current.y + (targetY - current.y) * factor;
  }

  if (options?.minBounds) {
    nextX = Math.max(options.minBounds.x, nextX);
    nextY = Math.max(options.minBounds.y, nextY);
  }
  if (options?.maxBounds) {
    nextX = Math.min(options.maxBounds.x, nextX);
    nextY = Math.min(options.maxBounds.y, nextY);
  }

  return { x: nextX, y: nextY };
}

/**
 * Calculate 2D parallax offset for a layer.
 */
export function computeParallaxOffset(
  cameraX: number,
  cameraY: number,
  layer: ParallaxLayerConfig,
): Vector2D {
  return {
    x: cameraX * layer.factorX + (layer.offsetX ?? 0),
    y: cameraY * layer.factorY + (layer.offsetY ?? 0),
  };
}
