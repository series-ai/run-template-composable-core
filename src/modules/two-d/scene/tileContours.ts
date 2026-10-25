/**
 * Seam-safe tile collision contour generation.
 */

import type { BoundingBox2D } from './types';

export interface ContourPoint2D {
  readonly x: number;
  readonly y: number;
}

export interface TileContourLoop {
  readonly vertices: readonly ContourPoint2D[];
  readonly isHole: boolean;
  readonly signedArea: number;
  readonly area: number;
}

export interface TileCollisionPlan {
  readonly layerId: string;
  readonly revision: number;
  readonly loops: readonly TileContourLoop[];
  readonly chains: readonly (readonly ContourPoint2D[])[];
  readonly totalVertices: number;
  readonly bounds: BoundingBox2D;
}

export interface CollisionGridInput {
  readonly layerId?: string;
  readonly revision?: number;
  readonly width: number;
  readonly height: number;
  readonly tileSizeMeters?: number;
  readonly cellWidthMeters?: number;
  readonly cellHeightMeters?: number;
  readonly originX?: number;
  readonly originY?: number;
  readonly solidCells: readonly (boolean | number | null | undefined)[];
}

export interface FloorSeamFixtureOptions {
  readonly tileCount?: number;
  readonly tileSizeMeters?: number;
  readonly originX?: number;
  readonly originY?: number;
  readonly layerId?: string;
}

interface DirectedGridEdge {
  readonly startX: number;
  readonly startY: number;
  readonly endX: number;
  readonly endY: number;
  readonly dirX: number;
  readonly dirY: number;
  visited: boolean;
}

function makeVertexKey(x: number, y: number): string {
  return `${x},${y}`;
}

/**
 * Calculate signed polygon area.
 * Positive value means counter-clockwise winding.
 * Negative value means clockwise winding.
 */
export function computeSignedPolygonArea(vertices: readonly ContourPoint2D[]): number {
  if (!Array.isArray(vertices)) {
    throw new TypeError('computeSignedPolygonArea: vertices must be an array.');
  }
  const count = vertices.length;
  if (count < 3) {
    return 0;
  }
  let doubleArea = 0;
  for (let i = 0; i < count; i += 1) {
    const current = vertices[i]!;
    const next = vertices[(i + 1) % count]!;
    if (
      !current ||
      !next ||
      !Number.isFinite(current.x) ||
      !Number.isFinite(current.y) ||
      !Number.isFinite(next.x) ||
      !Number.isFinite(next.y)
    ) {
      throw new TypeError('computeSignedPolygonArea: vertices must contain finite numbers.');
    }
    doubleArea += current.x * next.y - next.x * current.y;
  }
  return doubleArea * 0.5;
}

/**
 * Simplify consecutive collinear vertices in a closed loop.
 */
export function simplifyContourVertices(vertices: readonly ContourPoint2D[]): ContourPoint2D[] {
  if (!Array.isArray(vertices)) {
    throw new TypeError('simplifyContourVertices: vertices must be an array.');
  }
  for (const v of vertices) {
    if (!v || !Number.isFinite(v.x) || !Number.isFinite(v.y)) {
      throw new TypeError('simplifyContourVertices: vertices must contain finite numbers.');
    }
  }
  if (vertices.length <= 3) {
    return [...vertices];
  }

  let points = [...vertices];
  let changed = true;

  while (changed && points.length > 3) {
    changed = false;
    const nextPoints: ContourPoint2D[] = [];
    const count = points.length;

    for (let i = 0; i < count; i += 1) {
      const prev = points[(i - 1 + count) % count]!;
      const current = points[i]!;
      const next = points[(i + 1) % count]!;

      const dx1 = current.x - prev.x;
      const dy1 = current.y - prev.y;
      const dx2 = next.x - current.x;
      const dy2 = next.y - current.y;

      const cross = dx1 * dy2 - dy1 * dx2;
      const dot = dx1 * dx2 + dy1 * dy2;

      if (Math.abs(cross) < 1e-9 && dot > 0) {
        changed = true;
      } else {
        nextPoints.push(current);
      }
    }

    points = nextPoints;
  }

  return points;
}

/**
 * Trace boundary loops of solid grid cells.
 * Remove all internal shared edges between solid cells.
 * Resolve diagonal touch vertices with left turns.
 */
export function traceGridContours(input: CollisionGridInput): TileContourLoop[] {
  if (!input || typeof input !== 'object') {
    throw new TypeError('traceGridContours: input must be an object.');
  }

  const width = input.width;
  const height = input.height;

  if (!Number.isInteger(width) || width <= 0) {
    throw new RangeError('traceGridContours: width must be a positive integer.');
  }
  if (!Number.isInteger(height) || height <= 0) {
    throw new RangeError('traceGridContours: height must be a positive integer.');
  }

  const totalCells = width * height;
  if (!Array.isArray(input.solidCells) || input.solidCells.length < totalCells) {
    throw new RangeError(
      `traceGridContours: solidCells must contain at least ${totalCells} elements.`,
    );
  }

  const cellWidth = input.cellWidthMeters ?? input.tileSizeMeters ?? 1.0;
  const cellHeight = input.cellHeightMeters ?? input.tileSizeMeters ?? cellWidth;

  if (!Number.isFinite(cellWidth) || cellWidth <= 0) {
    throw new RangeError('traceGridContours: cellWidthMeters must be a positive finite number.');
  }
  if (!Number.isFinite(cellHeight) || cellHeight <= 0) {
    throw new RangeError('traceGridContours: cellHeightMeters must be a positive finite number.');
  }

  const originX = input.originX ?? 0;
  const originY = input.originY ?? 0;

  if (!Number.isFinite(originX) || !Number.isFinite(originY)) {
    throw new TypeError('traceGridContours: origin coordinates must be finite numbers.');
  }

  const isSolid = (col: number, row: number): boolean => {
    if (col < 0 || col >= width || row < 0 || row >= height) {
      return false;
    }
    const value = input.solidCells[row * width + col];
    return Boolean(value);
  };

  const edgeMap = new Map<string, DirectedGridEdge[]>();

  const addEdge = (startX: number, startY: number, endX: number, endY: number): void => {
    const key = makeVertexKey(startX, startY);
    let list = edgeMap.get(key);
    if (!list) {
      list = [];
      edgeMap.set(key, list);
    }
    const dirX = endX - startX;
    const dirY = endY - startY;
    list.push({
      startX,
      startY,
      endX,
      endY,
      dirX,
      dirY,
      visited: false,
    });
  };

  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      if (!isSolid(col, row)) {
        continue;
      }

      const minGx = col;
      const maxGx = col + 1;
      const minGy = height - 1 - row;
      const maxGy = height - row;

      // Bottom edge: solid cell is above. Vector points right.
      if (!isSolid(col, row + 1)) {
        addEdge(minGx, minGy, maxGx, minGy);
      }

      // Right edge: solid cell is to left. Vector points up.
      if (!isSolid(col + 1, row)) {
        addEdge(maxGx, minGy, maxGx, maxGy);
      }

      // Top edge: solid cell is below. Vector points left.
      if (!isSolid(col, row - 1)) {
        addEdge(maxGx, maxGy, minGx, maxGy);
      }

      // Left edge: solid cell is to right. Vector points down.
      if (!isSolid(col - 1, row)) {
        addEdge(minGx, maxGy, minGx, minGy);
      }
    }
  }

  const getNextEdge = (currentEdge: DirectedGridEdge): DirectedGridEdge | null => {
    const nextKey = makeVertexKey(currentEdge.endX, currentEdge.endY);
    const candidates = edgeMap.get(nextKey);
    if (!candidates || candidates.length === 0) {
      return null;
    }
    if (candidates.length === 1) {
      return candidates[0]!;
    }

    let bestEdge = candidates[0]!;
    let bestCross = -Infinity;
    for (const cand of candidates) {
      const cross = currentEdge.dirX * cand.dirY - currentEdge.dirY * cand.dirX;
      if (cross > bestCross) {
        bestCross = cross;
        bestEdge = cand;
      }
    }
    return bestEdge;
  };

  const loops: TileContourLoop[] = [];

  for (const edgeList of edgeMap.values()) {
    for (const startEdge of edgeList) {
      if (startEdge.visited) {
        continue;
      }

      const gridPoints: ContourPoint2D[] = [];
      let currentEdge: DirectedGridEdge | null = startEdge;

      while (currentEdge && !currentEdge.visited) {
        currentEdge.visited = true;
        gridPoints.push({ x: currentEdge.startX, y: currentEdge.startY });
        currentEdge = getNextEdge(currentEdge);
      }

      if (gridPoints.length < 3) {
        continue;
      }

      // Convert grid coordinates to world coordinates.
      const worldPoints: ContourPoint2D[] = gridPoints.map((pt) => ({
        x: originX + pt.x * cellWidth,
        y: originY + pt.y * cellHeight,
      }));

      const simplified = simplifyContourVertices(worldPoints);
      if (simplified.length < 3) {
        continue;
      }

      const signedArea = computeSignedPolygonArea(simplified);
      const isHole = signedArea < 0;

      loops.push({
        vertices: simplified,
        isHole,
        signedArea,
        area: Math.abs(signedArea),
      });
    }
  }

  return loops;
}

/**
 * Build world-space closed chain collision plan.
 */
export function buildTileContours(input: CollisionGridInput): TileCollisionPlan {
  if (!input || typeof input !== 'object') {
    throw new TypeError('buildTileContours: input must be an object.');
  }

  const loops = traceGridContours(input);
  const chains: ContourPoint2D[][] = [];
  let totalVertices = 0;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const loop of loops) {
    chains.push([...loop.vertices]);
    totalVertices += loop.vertices.length;

    for (const v of loop.vertices) {
      if (v.x < minX) minX = v.x;
      if (v.x > maxX) maxX = v.x;
      if (v.y < minY) minY = v.y;
      if (v.y > maxY) maxY = v.y;
    }
  }

  const bounds: BoundingBox2D =
    totalVertices > 0
      ? { minX, minY, maxX, maxY }
      : { minX: 0, minY: 0, maxX: 0, maxY: 0 };

  return {
    layerId: input.layerId ?? 'tile-layer',
    revision: input.revision ?? 0,
    loops,
    chains,
    totalVertices,
    bounds,
  };
}

/**
 * Build floor seam test case input with 100 adjacent tiles.
 */
export function build100TileFloorCase(options?: FloorSeamFixtureOptions): CollisionGridInput {
  const tileCount = options?.tileCount ?? 100;
  if (!Number.isInteger(tileCount) || tileCount <= 0) {
    throw new RangeError('build100TileFloorCase: tileCount must be a positive integer.');
  }
  const tileSize = options?.tileSizeMeters ?? 1.0;
  if (!Number.isFinite(tileSize) || tileSize <= 0) {
    throw new RangeError('build100TileFloorCase: tileSizeMeters must be a positive finite number.');
  }
  const originX = options?.originX ?? 0;
  const originY = options?.originY ?? 0;
  if (!Number.isFinite(originX) || !Number.isFinite(originY)) {
    throw new TypeError('build100TileFloorCase: origin coordinates must be finite numbers.');
  }
  const layerId = options?.layerId ?? 'floor-100';

  const solidCells = new Array<boolean>(tileCount).fill(true);

  return {
    layerId,
    revision: 0,
    width: tileCount,
    height: 1,
    tileSizeMeters: tileSize,
    originX,
    originY,
    solidCells,
  };
}

/**
 * Build floor seam test collision plan with 100 adjacent tiles.
 */
export function build100TileFloorCollisionPlan(options?: FloorSeamFixtureOptions): TileCollisionPlan {
  const gridInput = build100TileFloorCase(options);
  return buildTileContours(gridInput);
}

/**
 * Create full 100 tile floor seam case fixture.
 */
export function create100TileFloorFixture(options?: FloorSeamFixtureOptions): {
  config: CollisionGridInput;
  plan: TileCollisionPlan;
} {
  const config = build100TileFloorCase(options);
  const plan = buildTileContours(config);
  return { config, plan };
}
