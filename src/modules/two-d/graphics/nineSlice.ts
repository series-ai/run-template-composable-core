/**
 * Nine-slice and repeated tile quad generation using authoritative atlas dimensions.
 */

import type { SpriteScene } from '@modules/two-d/scene/SpriteScene';
import type { AtlasFrame, ColorRgba, NineSlicePx, NineSliceQuad, TiledQuad } from './types';

export const MAX_TILED_QUADS = 4096;

export interface OwnedRegistration {
  ids: string[];
  dispose(): void;
}

export interface NineSliceSceneOptions {
  id: string;
  profileId: 'flat-2d';
  atlasId: string;
  frameId: string;
  targetWidth: number;
  targetHeight: number;
  parentId?: string | null;
  x?: number;
  y?: number;
  scaleX?: number;
  scaleY?: number;
  rotation?: number;
  opacity?: number;
  tint?: ColorRgba;
  layer?: string;
  layerRank?: number;
  subBand?: number;
  explicitOrder?: number;
}

export interface TiledSceneOptions {
  id: string;
  profileId: 'flat-2d';
  atlasId: string;
  frameId: string;
  targetWidth: number;
  targetHeight: number;
  parentId?: string | null;
  x?: number;
  y?: number;
  scaleX?: number;
  scaleY?: number;
  rotation?: number;
  opacity?: number;
  tint?: ColorRgba;
  layer?: string;
  layerRank?: number;
  subBand?: number;
  explicitOrder?: number;
}

/**
 * Generate 9-slice quads using actual atlas dimensions and frame trim.
 */
export function generateNineSliceQuads(
  frame: AtlasFrame,
  targetWidth: number,
  targetHeight: number,
  pixelsPerMeter = 100,
): NineSliceQuad[] {
  if (frame.rotation && frame.rotation !== 'none') {
    throw new Error(
      `Frame "${frame.id}": rotation "${frame.rotation}" is not supported for nine-slice rendering.`,
    );
  }
  if (
    frame.trimmedRectPx &&
    frame.sourceSizePx &&
    (frame.trimmedRectPx.x !== 0 ||
      frame.trimmedRectPx.y !== 0 ||
      frame.trimmedRectPx.width !== frame.sourceSizePx.width ||
      frame.trimmedRectPx.height !== frame.sourceSizePx.height)
  ) {
    throw new Error(
      `Frame "${frame.id}": trimmed frame is not supported for nine-slice rendering.`,
    );
  }

  const ns: NineSlicePx | undefined = frame.nineSlicePx;
  if (!ns) {
    throw new Error(`Frame "${frame.id}" does not define nineSlicePx.`);
  }

  const atlasW = frame.atlasPixelWidth;
  const atlasH = frame.atlasPixelHeight;
  if (!atlasW || atlasW <= 0 || !atlasH || atlasH <= 0) {
    throw new RangeError(
      `Frame "${frame.id}" requires valid positive atlasPixelWidth and atlasPixelHeight. Never guess dimensions.`,
    );
  }

  if (
    !Number.isFinite(targetWidth) ||
    !Number.isFinite(targetHeight) ||
    targetWidth <= 0 ||
    targetHeight <= 0
  ) {
    throw new RangeError('Target dimensions must be positive finite numbers.');
  }

  const left = ns.left / pixelsPerMeter;
  const right = ns.right / pixelsPerMeter;
  const top = ns.top / pixelsPerMeter;
  const bottom = ns.bottom / pixelsPerMeter;

  if (targetWidth < left + right || targetHeight < top + bottom) {
    throw new RangeError(
      `Target dimensions (${targetWidth}x${targetHeight}) are smaller than nine-slice margins.`,
    );
  }

  const centerWidth = targetWidth - (left + right);
  const centerHeight = targetHeight - (top + bottom);

  const rect = frame.rectPx;
  const uLeft = rect.x / atlasW;
  const uRight = (rect.x + rect.width - ns.right) / atlasW;
  const uCenter = (rect.x + ns.left) / atlasW;
  const uWidthLeft = ns.left / atlasW;
  const uWidthRight = ns.right / atlasW;
  const uWidthCenter = (rect.width - ns.left - ns.right) / atlasW;

  const vTopInAtlas = rect.y / atlasH;
  const vHeightTop = ns.top / atlasH;
  const vCenterInAtlas = (rect.y + ns.top) / atlasH;
  const vHeightCenter = (rect.height - ns.top - ns.bottom) / atlasH;
  const vBottomInAtlas = (rect.y + rect.height - ns.bottom) / atlasH;
  const vHeightBottom = ns.bottom / atlasH;

  const quads: NineSliceQuad[] = [];

  // Bottom row: local Y = 0, visual bottom border
  quads.push(
    { localX: 0, localY: 0, width: left, height: bottom, u0: uLeft, v0: vBottomInAtlas, uWidth: uWidthLeft, vHeight: vHeightBottom },
    { localX: left, localY: 0, width: centerWidth, height: bottom, u0: uCenter, v0: vBottomInAtlas, uWidth: uWidthCenter, vHeight: vHeightBottom },
    { localX: left + centerWidth, localY: 0, width: right, height: bottom, u0: uRight, v0: vBottomInAtlas, uWidth: uWidthRight, vHeight: vHeightBottom },
  );

  // Middle row: local Y = bottom, visual center section
  quads.push(
    { localX: 0, localY: bottom, width: left, height: centerHeight, u0: uLeft, v0: vCenterInAtlas, uWidth: uWidthLeft, vHeight: vHeightCenter },
    { localX: left, localY: bottom, width: centerWidth, height: centerHeight, u0: uCenter, v0: vCenterInAtlas, uWidth: uWidthCenter, vHeight: vHeightCenter },
    { localX: left + centerWidth, localY: bottom, width: right, height: centerHeight, u0: uRight, v0: vCenterInAtlas, uWidth: uWidthRight, vHeight: vHeightCenter },
  );

  // Top row: local Y = bottom + centerHeight, visual top border
  quads.push(
    { localX: 0, localY: bottom + centerHeight, width: left, height: top, u0: uLeft, v0: vTopInAtlas, uWidth: uWidthLeft, vHeight: vHeightTop },
    { localX: left, localY: bottom + centerHeight, width: centerWidth, height: top, u0: uCenter, v0: vTopInAtlas, uWidth: uWidthCenter, vHeight: vHeightTop },
    { localX: left + centerWidth, localY: bottom + centerHeight, width: right, height: top, u0: uRight, v0: vTopInAtlas, uWidth: uWidthRight, vHeight: vHeightTop },
  );

  return quads;
}

/**
 * Generate repeated tile quads across target dimensions.
 */
export function generateTiledQuads(
  frame: AtlasFrame,
  targetWidth: number,
  targetHeight: number,
  pixelsPerMeter = 100,
): TiledQuad[] {
  if (
    !Number.isFinite(targetWidth) ||
    !Number.isFinite(targetHeight) ||
    targetWidth <= 0 ||
    targetHeight <= 0
  ) {
    throw new RangeError('Target dimensions must be positive finite numbers.');
  }

  if (frame.rotation && frame.rotation !== 'none') {
    throw new Error(
      `Frame "${frame.id}": rotation "${frame.rotation}" is not supported for tiled rendering.`,
    );
  }
  if (
    frame.trimmedRectPx &&
    frame.sourceSizePx &&
    (frame.trimmedRectPx.x !== 0 ||
      frame.trimmedRectPx.y !== 0 ||
      frame.trimmedRectPx.width !== frame.sourceSizePx.width ||
      frame.trimmedRectPx.height !== frame.sourceSizePx.height)
  ) {
    throw new Error(
      `Frame "${frame.id}": trimmed frame is not supported for tiled rendering.`,
    );
  }

  const atlasW = frame.atlasPixelWidth;
  const atlasH = frame.atlasPixelHeight;
  if (!atlasW || atlasW <= 0 || !atlasH || atlasH <= 0) {
    throw new RangeError(
      `Frame "${frame.id}" requires valid positive atlasPixelWidth and atlasPixelHeight. Never guess dimensions.`,
    );
  }

  const tileW = frame.rectPx.width / pixelsPerMeter;
  const tileH = frame.rectPx.height / pixelsPerMeter;
  if (tileW <= 0 || tileH <= 0) {
    throw new RangeError(`Frame "${frame.id}" has non-positive frame rectangle dimensions.`);
  }

  const cols = Math.ceil(targetWidth / tileW);
  const rows = Math.ceil(targetHeight / tileH);
  if (cols * rows > MAX_TILED_QUADS) {
    throw new RangeError(
      `Tiled quads count (${cols * rows}) exceeds maximum capacity of ${MAX_TILED_QUADS}.`,
    );
  }

  const baseU0 = frame.rectPx.x / atlasW;
  const baseV0 = frame.rectPx.y / atlasH;
  const baseUWidth = frame.rectPx.width / atlasW;
  const baseVHeight = frame.rectPx.height / atlasH;

  const quads: TiledQuad[] = [];

  for (let y = 0; y < targetHeight; y += tileH) {
    const curH = Math.min(tileH, targetHeight - y);
    const fracH = curH / tileH;

    for (let x = 0; x < targetWidth; x += tileW) {
      const curW = Math.min(tileW, targetWidth - x);
      const fracW = curW / tileW;

      quads.push({
        localX: x,
        localY: targetHeight - y - curH,
        width: curW,
        height: curH,
        u0: baseU0,
        v0: baseV0,
        uWidth: baseUWidth * fracW,
        vHeight: baseVHeight * fracH,
      });
    }
  }

  return quads;
}

/**
 * Register nine-slice quads into SpriteScene sprite stream.
 */
export function registerNineSliceToScene(
  scene: SpriteScene,
  options: NineSliceSceneOptions,
): OwnedRegistration {
  if (options.profileId !== 'flat-2d') {
    throw new Error('registerNineSliceToScene requires profileId "flat-2d".');
  }
  if (!options.id || typeof options.id !== 'string' || options.id.trim().length === 0) {
    throw new TypeError('Explicit non-empty id is required.');
  }

  const manifest = scene.getAtlas(options.atlasId);
  if (!manifest) {
    throw new Error(`Atlas "${options.atlasId}" not found in scene.`);
  }

  const frame = manifest.frames[options.frameId];
  if (!frame) {
    throw new Error(`Frame "${options.frameId}" not found in atlas "${options.atlasId}".`);
  }

  const ppm = scene.pixelsPerMetre;
  const quads = generateNineSliceQuads(frame, options.targetWidth, options.targetHeight, ppm);

  const groupId = options.id;
  scene.registerGroup(groupId, {
    profileId: 'flat-2d',
    hitBounds: { minX: 0, minY: 0, maxX: options.targetWidth, maxY: options.targetHeight },
    layerRank: options.layerRank, subBand: options.subBand, explicitOrder: options.explicitOrder,
    parentId: options.parentId,
    x: options.x,
    y: options.y,
    scaleX: options.scaleX,
    scaleY: options.scaleY,
    rotation: options.rotation,
  });

  const registeredNodeIds: string[] = [groupId];
  const registeredFrameIds: string[] = [];

  const atlasW = manifest.pixelWidth;
  const atlasH = manifest.pixelHeight;

  for (let i = 0; i < quads.length; i += 1) {
    const q = quads[i]!;
    const subFrameId = `${groupId}__${options.frameId}_ns_${i}`;

    const subFrameWidthPx = Math.max(1, Math.round(q.uWidth * atlasW));
    const subFrameHeightPx = Math.max(1, Math.round(q.vHeight * atlasH));

    manifest.frames[subFrameId] = {
      id: subFrameId,
      atlasId: options.atlasId,
      rectPx: {
        x: Math.round(q.u0 * atlasW),
        y: Math.round(q.v0 * atlasH),
        width: subFrameWidthPx,
        height: subFrameHeightPx,
      },
      sourceSizePx: {
        width: subFrameWidthPx,
        height: subFrameHeightPx,
      },
      trimmedRectPx: {
        x: 0,
        y: 0,
        width: subFrameWidthPx,
        height: subFrameHeightPx,
      },
      rotation: 'none',
      pivotNormalized: { x: 0, y: 1 },
      atlasPixelWidth: atlasW,
      atlasPixelHeight: atlasH,
    };
    registeredFrameIds.push(subFrameId);

    const childId = `${groupId}_quad_${i}`;
    const nativeWidthMeters = subFrameWidthPx / ppm;
    const nativeHeightMeters = subFrameHeightPx / ppm;
    const subScaleX = nativeWidthMeters > 0 ? q.width / nativeWidthMeters : 1.0;
    const subScaleY = nativeHeightMeters > 0 ? q.height / nativeHeightMeters : 1.0;

    scene.registerSprite(childId, {
      profileId: 'flat-2d',
      interactive: false,
      parentId: groupId,
      atlasId: options.atlasId,
      frameId: subFrameId,
      x: q.localX,
      y: q.localY,
      scaleX: subScaleX,
      scaleY: subScaleY,
      width: q.width,
      height: q.height,
      opacity: options.opacity,
      tint: options.tint,
      layer: options.layer,
      layerRank: options.layerRank,
      subBand: options.subBand,
      explicitOrder: options.explicitOrder,
    });

    registeredNodeIds.push(childId);
  }

  let disposed = false;
  const dispose = (): void => {
    if (disposed) {
      return;
    }
    disposed = true;
    scene.removeNode(groupId);
    for (const id of registeredNodeIds) {
      scene.removeNode(id);
    }
    for (const frameId of registeredFrameIds) {
      delete manifest.frames[frameId];
    }
  };

  return {
    ids: registeredNodeIds,
    dispose,
  };
}

/**
 * Register repeated tile quads into SpriteScene sprite stream.
 */
export function registerTiledToScene(
  scene: SpriteScene,
  options: TiledSceneOptions,
): OwnedRegistration {
  if (options.profileId !== 'flat-2d') {
    throw new Error('registerTiledToScene requires profileId "flat-2d".');
  }
  if (!options.id || typeof options.id !== 'string' || options.id.trim().length === 0) {
    throw new TypeError('Explicit non-empty id is required.');
  }

  const manifest = scene.getAtlas(options.atlasId);
  if (!manifest) {
    throw new Error(`Atlas "${options.atlasId}" not found in scene.`);
  }

  const frame = manifest.frames[options.frameId];
  if (!frame) {
    throw new Error(`Frame "${options.frameId}" not found in atlas "${options.atlasId}".`);
  }

  const ppm = scene.pixelsPerMetre;
  const quads = generateTiledQuads(frame, options.targetWidth, options.targetHeight, ppm);

  const groupId = options.id;
  scene.registerGroup(groupId, {
    profileId: 'flat-2d',
    hitBounds: { minX: 0, minY: 0, maxX: options.targetWidth, maxY: options.targetHeight },
    layerRank: options.layerRank, subBand: options.subBand, explicitOrder: options.explicitOrder,
    parentId: options.parentId,
    x: options.x,
    y: options.y,
    scaleX: options.scaleX,
    scaleY: options.scaleY,
    rotation: options.rotation,
  });

  const registeredNodeIds: string[] = [groupId];
  const registeredFrameIds: string[] = [];

  const atlasW = manifest.pixelWidth;
  const atlasH = manifest.pixelHeight;

  for (let i = 0; i < quads.length; i += 1) {
    const q = quads[i]!;
    const subFrameId = `${groupId}__${options.frameId}_tile_${i}`;

    const subFrameWidthPx = Math.max(1, Math.round(q.uWidth * atlasW));
    const subFrameHeightPx = Math.max(1, Math.round(q.vHeight * atlasH));

    manifest.frames[subFrameId] = {
      id: subFrameId,
      atlasId: options.atlasId,
      rectPx: {
        x: Math.round(q.u0 * atlasW),
        y: Math.round(q.v0 * atlasH),
        width: subFrameWidthPx,
        height: subFrameHeightPx,
      },
      sourceSizePx: {
        width: subFrameWidthPx,
        height: subFrameHeightPx,
      },
      trimmedRectPx: {
        x: 0,
        y: 0,
        width: subFrameWidthPx,
        height: subFrameHeightPx,
      },
      rotation: 'none',
      pivotNormalized: { x: 0, y: 1 },
      atlasPixelWidth: atlasW,
      atlasPixelHeight: atlasH,
    };
    registeredFrameIds.push(subFrameId);

    const childId = `${groupId}_quad_${i}`;
    const nativeWidthMeters = subFrameWidthPx / ppm;
    const nativeHeightMeters = subFrameHeightPx / ppm;
    const subScaleX = nativeWidthMeters > 0 ? q.width / nativeWidthMeters : 1.0;
    const subScaleY = nativeHeightMeters > 0 ? q.height / nativeHeightMeters : 1.0;

    scene.registerSprite(childId, {
      profileId: 'flat-2d',
      interactive: false,
      parentId: groupId,
      atlasId: options.atlasId,
      frameId: subFrameId,
      x: q.localX,
      y: q.localY,
      scaleX: subScaleX,
      scaleY: subScaleY,
      width: q.width,
      height: q.height,
      opacity: options.opacity,
      tint: options.tint,
      layer: options.layer,
      layerRank: options.layerRank,
      subBand: options.subBand,
      explicitOrder: options.explicitOrder,
    });

    registeredNodeIds.push(childId);
  }

  let disposed = false;
  const dispose = (): void => {
    if (disposed) {
      return;
    }
    disposed = true;
    scene.removeNode(groupId);
    for (const id of registeredNodeIds) {
      scene.removeNode(id);
    }
    for (const frameId of registeredFrameIds) {
      delete manifest.frames[frameId];
    }
  };

  return {
    ids: registeredNodeIds,
    dispose,
  };
}
