/**
 * Tilemap chunking, animation, culling, and collision authoring helpers.
 */

import type { FrustumBounds } from './camera';
import type { BoundingBox2D, Vector2D } from './types';

export interface TilemapCell {
  id: string;
  solid?: boolean;
  flipX?: boolean;
  flipY?: boolean;
  flipDiagonal?: boolean;
  animationFrames?: string[];
  animationDurationMs?: number;
}

export interface TilemapLayerConfig {
  id: string;
  width: number;
  height: number;
  tileSizeMeters: number;
  chunkWidth: number;
  chunkHeight: number;
  cells: Array<TilemapCell | null>;
  revision?: number;
}

export interface TilemapChunkPlan {
  id: string;
  chunkIndexX: number;
  chunkIndexY: number;
  tileOffsetX: number;
  tileOffsetY: number;
  widthTiles: number;
  heightTiles: number;
  worldBounds: BoundingBox2D;
  cells: Array<TilemapCell | null>;
}

export interface MutableTilemapLayer extends TilemapLayerConfig {
  revision: number;
}

export interface TileEdit {
  tileX: number;
  tileY: number;
  cell: TilemapCell | null;
}

export interface CollisionTileLayer {
  width: number;
  height: number;
  tileSizeMeters: number;
  solidCells: boolean[];
}

export interface CollisionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Split a tilemap layer into spatial chunks.
 * Converts authored top-down rows into bottom-left world coordinates.
 */
export function buildTilemapChunks(config: TilemapLayerConfig): TilemapChunkPlan[] {
  if (config.width <= 0 || config.height <= 0 || config.chunkWidth <= 0 || config.chunkHeight <= 0) {
    throw new RangeError('buildTilemapChunks: tilemap dimensions must be positive integers.');
  }

  const chunks: TilemapChunkPlan[] = [];
  const tileSize = config.tileSizeMeters;

  let chunkIdxY = 0;
  for (let startY = 0; startY < config.height; startY += config.chunkHeight) {
    let chunkIdxX = 0;
    for (let startX = 0; startX < config.width; startX += config.chunkWidth) {
      const actualWidth = Math.min(config.chunkWidth, config.width - startX);
      const actualHeight = Math.min(config.chunkHeight, config.height - startY);
      const chunkCells: Array<TilemapCell | null> = [];

      for (let r = 0; r < actualHeight; r += 1) {
        for (let c = 0; c < actualWidth; c += 1) {
          const worldX = startX + c;
          const worldY = startY + r;
          const index = worldY * config.width + worldX;
          chunkCells.push(config.cells[index] ?? null);
        }
      }

      // World coordinates: +X right, +Y up.
      // Authored row 0 is top row. Convert to Y-up world coordinates.
      const worldMinX = startX * tileSize;
      const worldMaxX = (startX + actualWidth) * tileSize;
      const worldMinY = (config.height - (startY + actualHeight)) * tileSize;
      const worldMaxY = (config.height - startY) * tileSize;

      chunks.push({
        id: `${config.id}_c_${chunkIdxX}_${chunkIdxY}`,
        chunkIndexX: chunkIdxX,
        chunkIndexY: chunkIdxY,
        tileOffsetX: startX,
        tileOffsetY: startY,
        widthTiles: actualWidth,
        heightTiles: actualHeight,
        worldBounds: {
          minX: worldMinX,
          minY: worldMinY,
          maxX: worldMaxX,
          maxY: worldMaxY,
        },
        cells: chunkCells,
      });

      chunkIdxX += 1;
    }
    chunkIdxY += 1;
  }

  return chunks;
}

/**
 * Determine if a chunk intersects the camera frustum.
 */
export function isChunkInFrustum(
  chunk: TilemapChunkPlan,
  frustum: FrustumBounds,
  cameraPosition: Vector2D,
): boolean {
  const frustumMinX = cameraPosition.x + frustum.left;
  const frustumMaxX = cameraPosition.x + frustum.right;
  const frustumMinY = cameraPosition.y + frustum.bottom;
  const frustumMaxY = cameraPosition.y + frustum.top;

  const cb = chunk.worldBounds;
  if (cb.maxX < frustumMinX || cb.minX > frustumMaxX) {
    return false;
  }
  if (cb.maxY < frustumMinY || cb.minY > frustumMaxY) {
    return false;
  }
  return true;
}

/**
 * Apply a single tile edit and increment layer revision.
 */
export function applyTileEdit(layer: MutableTilemapLayer, edit: TileEdit): number {
  if (edit.tileX < 0 || edit.tileX >= layer.width || edit.tileY < 0 || edit.tileY >= layer.height) {
    throw new RangeError(
      `applyTileEdit: tile coordinate (${edit.tileX}, ${edit.tileY}) is outside layer (${layer.width}x${layer.height}).`,
    );
  }

  const index = edit.tileY * layer.width + edit.tileX;
  layer.cells[index] = edit.cell;
  layer.revision += 1;
  return layer.revision;
}

/**
 * Merge solid tile cells into simplified bounding rectangles.
 * Produces authoring merge plans for Syncplay colliders.
 * Does not implement a custom gameplay collision solver.
 */
export function buildTileCollisionMergePlan(layer: CollisionTileLayer): CollisionRect[] {
  if (layer.width <= 0 || layer.height <= 0 || layer.tileSizeMeters <= 0) {
    return [];
  }

  const tileSize = layer.tileSizeMeters;
  const visited = new Uint8Array(layer.width * layer.height);
  const rects: CollisionRect[] = [];

  for (let row = 0; row < layer.height; row += 1) {
    for (let col = 0; col < layer.width; col += 1) {
      const idx = row * layer.width + col;
      if (!layer.solidCells[idx] || visited[idx] === 1) {
        continue;
      }

      // Find width of horizontal run
      let widthCols = 1;
      while (
        col + widthCols < layer.width &&
        layer.solidCells[row * layer.width + (col + widthCols)] &&
        visited[row * layer.width + (col + widthCols)] === 0
      ) {
        widthCols += 1;
      }

      // Extend vertically downwards if all adjacent cells match
      let heightRows = 1;
      let canExtend = true;
      while (row + heightRows < layer.height && canExtend) {
        for (let c = 0; c < widthCols; c += 1) {
          const nextIdx = (row + heightRows) * layer.width + (col + c);
          if (!layer.solidCells[nextIdx] || visited[nextIdx] === 1) {
            canExtend = false;
            break;
          }
        }
        if (canExtend) {
          heightRows += 1;
        }
      }

      // Mark all merged cells as visited
      for (let r = 0; r < heightRows; r += 1) {
        for (let c = 0; c < widthCols; c += 1) {
          visited[(row + r) * layer.width + (col + c)] = 1;
        }
      }

      // Convert row to bottom-left world coordinates (+Y up)
      const worldX = col * tileSize;
      const worldY = (layer.height - (row + heightRows)) * tileSize;
      rects.push({
        x: worldX,
        y: worldY,
        width: widthCols * tileSize,
        height: heightRows * tileSize,
      });
    }
  }

  return rects;
}
