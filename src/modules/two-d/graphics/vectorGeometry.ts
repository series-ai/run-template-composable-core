/**
 * 2D vector geometry generators for filled shapes and stroked line paths.
 */

import * as THREE from 'three';
import type {
  CircleShapeDefinition,
  PathStrokeDefinition,
  PolygonShapeDefinition,
  RectShapeDefinition,
  Vector2D,
  VectorShapeDefinition,
} from './types';

/**
 * Calculate signed area of a 2D polygon.
 */
function calculatePolygonArea(points: Vector2D[]): number {
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    area += points[i]!.x * points[j]!.y;
    area -= points[j]!.x * points[i]!.y;
  }
  return area * 0.5;
}

/**
 * Determine if a 2D point is inside a triangle.
 */
function isPointInTriangle(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
): boolean {
  const v0x = cx - ax;
  const v0y = cy - ay;
  const v1x = bx - ax;
  const v1y = by - ay;
  const v2x = px - ax;
  const v2y = py - ay;

  const dot00 = v0x * v0x + v0y * v0y;
  const dot01 = v0x * v1x + v0y * v1y;
  const dot02 = v0x * v2x + v0y * v2y;
  const dot11 = v1x * v1x + v1y * v1y;
  const dot12 = v1x * v2x + v1y * v2y;

  const denom = dot00 * dot11 - dot01 * dot01;
  if (Math.abs(denom) < 1e-9) {
    return false;
  }
  const invDenom = 1 / denom;
  const u = (dot11 * dot02 - dot01 * dot12) * invDenom;
  const v = (dot00 * dot12 - dot01 * dot02) * invDenom;

  return u >= 0 && v >= 0 && u + v <= 1;
}

/**
 * Triangulate a simple 2D polygon using ear clipping.
 */
export function triangulatePolygon(inputPoints: Vector2D[]): number[] {
  const n = inputPoints.length;
  if (n < 3) {
    return [];
  }

  // Ensure counter-clockwise winding
  const area = calculatePolygonArea(inputPoints);
  const indices: number[] = [];
  for (let i = 0; i < n; i += 1) {
    indices.push(area >= 0 ? i : n - 1 - i);
  }

  const triangles: number[] = [];
  let count = indices.length;

  let iterations = 0;
  const maxIterations = count * count * 2;

  while (count > 3 && iterations < maxIterations) {
    iterations += 1;
    let earFound = false;

    for (let i = 0; i < count; i += 1) {
      const prevIdx = indices[(i - 1 + count) % count]!;
      const currIdx = indices[i]!;
      const nextIdx = indices[(i + 1) % count]!;

      const a = inputPoints[prevIdx]!;
      const b = inputPoints[currIdx]!;
      const c = inputPoints[nextIdx]!;

      // Check if angle is convex
      const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
      if (cross <= 1e-7) {
        continue;
      }

      // Check if any other point is inside the triangle
      let pointInside = false;
      for (let j = 0; j < count; j += 1) {
        const testIdx = indices[j]!;
        if (testIdx === prevIdx || testIdx === currIdx || testIdx === nextIdx) {
          continue;
        }
        const p = inputPoints[testIdx]!;
        if (isPointInTriangle(p.x, p.y, a.x, a.y, b.x, b.y, c.x, c.y)) {
          pointInside = true;
          break;
        }
      }

      if (!pointInside) {
        triangles.push(prevIdx, currIdx, nextIdx);
        indices.splice(i, 1);
        count -= 1;
        earFound = true;
        break;
      }
    }

    if (!earFound) {
      // Degenerate polygon fallback
      break;
    }
  }

  if (count === 3) {
    triangles.push(indices[0]!, indices[1]!, indices[2]!);
  }

  return triangles;
}

/**
 * Create a triangulated BufferGeometry for a filled rectangle or rounded rectangle.
 */
export function createRectGeometry(def: RectShapeDefinition): THREE.BufferGeometry {
  const origin = def.origin ?? 'top-left';
  const width = Math.max(0, def.width);
  const height = Math.max(0, def.height);

  let left = def.x;
  let top = def.y;
  if (origin === 'center') {
    left = def.x - width * 0.5;
    top = def.y + height * 0.5;
  }
  const right = left + width;
  const bottom = top - height;

  const radius = def.radius ? Math.max(0, Math.min(def.radius, width * 0.5, height * 0.5)) : 0;

  if (radius <= 0) {
    // Simple 4-vertex quad
    const positions = new Float32Array([
      left, top, 0,
      right, top, 0,
      left, bottom, 0,
      right, bottom, 0,
    ]);
    const uvs = new Float32Array([
      0, 1,
      1, 1,
      0, 0,
      1, 0,
    ]);
    const indices = new Uint16Array([0, 2, 1, 1, 2, 3]);

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geom.setIndex(new THREE.BufferAttribute(indices, 1));
    return geom;
  }

  // Rounded rectangle outline points
  const points: Vector2D[] = [];
  const segmentsPerCorner = 6;

  // Top-right corner
  for (let i = 0; i <= segmentsPerCorner; i += 1) {
    const angle = (Math.PI * 0.5 * (segmentsPerCorner - i)) / segmentsPerCorner;
    points.push({
      x: right - radius + radius * Math.cos(angle),
      y: top - radius + radius * Math.sin(angle),
    });
  }

  // Bottom-right corner
  for (let i = 0; i <= segmentsPerCorner; i += 1) {
    const angle = -(Math.PI * 0.5 * i) / segmentsPerCorner;
    points.push({
      x: right - radius + radius * Math.cos(angle),
      y: bottom + radius + radius * Math.sin(angle),
    });
  }

  // Bottom-left corner
  for (let i = 0; i <= segmentsPerCorner; i += 1) {
    const angle = -Math.PI * 0.5 - (Math.PI * 0.5 * i) / segmentsPerCorner;
    points.push({
      x: left + radius + radius * Math.cos(angle),
      y: bottom + radius + radius * Math.sin(angle),
    });
  }

  // Top-left corner
  for (let i = 0; i <= segmentsPerCorner; i += 1) {
    const angle = Math.PI - (Math.PI * 0.5 * i) / segmentsPerCorner;
    points.push({
      x: left + radius + radius * Math.cos(angle),
      y: top - radius + radius * Math.sin(angle),
    });
  }

  return createPolygonGeometry({ type: 'polygon', points });
}

/**
 * Create a triangulated BufferGeometry for a filled circle.
 */
export function createCircleGeometry(def: CircleShapeDefinition): THREE.BufferGeometry {
  const segments = Math.max(12, def.segments ?? 32);
  const radius = Math.max(0, def.radius);

  const positions: number[] = [def.cx, def.cy, 0];
  const uvs: number[] = [0.5, 0.5];
  const indices: number[] = [];

  for (let i = 0; i <= segments; i += 1) {
    const angle = (2 * Math.PI * i) / segments;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    positions.push(def.cx + radius * cos, def.cy + radius * sin, 0);
    uvs.push(0.5 + 0.5 * cos, 0.5 + 0.5 * sin);
  }

  for (let i = 1; i <= segments; i += 1) {
    indices.push(0, i, i + 1);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geom.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
  geom.setIndex(new THREE.BufferAttribute(new Uint16Array(indices), 1));
  return geom;
}

/**
 * Create a triangulated BufferGeometry for a polygon.
 */
export function createPolygonGeometry(def: PolygonShapeDefinition): THREE.BufferGeometry {
  const points = def.points;
  if (points.length < 3) {
    throw new RangeError('Polygon must have at least 3 points.');
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const pt of points) {
    if (pt.x < minX) minX = pt.x;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.y > maxY) maxY = pt.y;
  }

  const spanX = Math.max(1e-5, maxX - minX);
  const spanY = Math.max(1e-5, maxY - minY);

  const positions = new Float32Array(points.length * 3);
  const uvs = new Float32Array(points.length * 2);

  for (let i = 0; i < points.length; i += 1) {
    const pt = points[i]!;
    positions[i * 3] = pt.x;
    positions[i * 3 + 1] = pt.y;
    positions[i * 3 + 2] = 0;

    uvs[i * 2] = (pt.x - minX) / spanX;
    uvs[i * 2 + 1] = (pt.y - minY) / spanY;
  }

  const indices = triangulatePolygon(points);

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geom.setIndex(new THREE.BufferAttribute(new Uint16Array(indices), 1));
  return geom;
}

/**
 * Create a triangulated BufferGeometry for a stroked line path.
 */
export function createStrokeGeometry(def: PathStrokeDefinition): THREE.BufferGeometry {
  const points = def.points;
  if (points.length < 2) {
    throw new RangeError('Stroked path must have at least 2 points.');
  }

  const halfWidth = Math.max(1e-5, def.width * 0.5);
  const positions: number[] = [];
  const indices: number[] = [];
  const uvs: number[] = [];

  const n = points.length;

  for (let i = 0; i < n - 1; i += 1) {
    const p0 = points[i]!;
    const p1 = points[i + 1]!;

    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-7) {
      continue;
    }

    const nx = (-dy / len) * halfWidth;
    const ny = (dx / len) * halfWidth;

    const baseIdx = positions.length / 3;

    // Segment quad vertices
    positions.push(
      p0.x + nx, p0.y + ny, 0,
      p0.x - nx, p0.y - ny, 0,
      p1.x + nx, p1.y + ny, 0,
      p1.x - nx, p1.y - ny, 0,
    );

    uvs.push(0, 1, 0, 0, 1, 1, 1, 0);

    indices.push(
      baseIdx, baseIdx + 1, baseIdx + 2,
      baseIdx + 2, baseIdx + 1, baseIdx + 3,
    );

    // Miter / bevel join with next segment
    if (i < n - 2) {
      const p2 = points[i + 2]!;
      const d2x = p2.x - p1.x;
      const d2y = p2.y - p1.y;
      const len2 = Math.hypot(d2x, d2y);
      if (len2 >= 1e-7) {
        const n2x = (-d2y / len2) * halfWidth;
        const n2y = (d2x / len2) * halfWidth;

        const joinIdx = positions.length / 3;
        positions.push(
          p1.x, p1.y, 0,
          p1.x + nx, p1.y + ny, 0,
          p1.x + n2x, p1.y + n2y, 0,
        );
        uvs.push(0.5, 0.5, 0, 1, 1, 1);
        indices.push(joinIdx, joinIdx + 1, joinIdx + 2);
      }
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geom.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
  geom.setIndex(new THREE.BufferAttribute(new Uint16Array(indices), 1));
  return geom;
}

/**
 * Dispatch vector shape geometry creation by definition type.
 */
export function createVectorGeometry(shape: VectorShapeDefinition): THREE.BufferGeometry {
  if (shape.type === 'rect') {
    return createRectGeometry(shape);
  } else if (shape.type === 'circle') {
    return createCircleGeometry(shape);
  } else if (shape.type === 'polygon') {
    return createPolygonGeometry(shape);
  } else if (shape.type === 'stroke') {
    return createStrokeGeometry(shape);
  }
  throw new TypeError(`Unknown vector shape type: "${(shape as { type: string }).type}".`);
}
