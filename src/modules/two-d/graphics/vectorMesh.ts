/**
 * Vector mesh factory objects with CPU point containment testing.
 */

import * as THREE from 'three';
import { Flat2DMaterial } from './materials';
import type { ProfileId, VectorMeshOptions, VectorShapeDefinition } from './types';
import { createVectorGeometry } from './vectorGeometry';

/**
 * Determine if a point is within distance of a line segment.
 */
function distanceToSegmentSquared(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const l2 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
  if (l2 === 0) {
    return (px - x1) * (px - x1) + (py - y1) * (py - y1);
  }
  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
  t = Math.max(0, Math.min(1, t));
  const projX = x1 + t * (x2 - x1);
  const projY = y1 + t * (y2 - y1);
  return (px - projX) * (px - projX) + (py - projY) * (py - projY);
}

/**
 * Test if a 2D point is inside a polygon using ray casting.
 */
function isPointInPolygon(px: number, py: number, points: Array<{ x: number; y: number }>): boolean {
  let inside = false;
  const n = points.length;
  for (let i = 0, j = n - 1; i < n; j = i, i += 1) {
    const xi = points[i]!.x;
    const yi = points[i]!.y;
    const xj = points[j]!.x;
    const yj = points[j]!.y;

    const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersect) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Mesh object for rendered 2D vector shapes.
 */
export class VectorMesh extends THREE.Mesh {
  readonly profileId: ProfileId = 'flat-2d';
  readonly shape: VectorShapeDefinition;

  constructor(geometry: THREE.BufferGeometry, material: Flat2DMaterial, shape: VectorShapeDefinition) {
    super(geometry, material);
    this.shape = shape;
  }

  /**
   * Test point containment on the CPU in local or world coordinates.
   */
  pick(worldX: number, worldY: number): boolean {
    // Transform world point into local mesh space
    const local = new THREE.Vector3(worldX, worldY, 0).applyMatrix4(this.matrixWorld.clone().invert());
    const lx = local.x;
    const ly = local.y;

    if (this.shape.type === 'rect') {
      const origin = this.shape.origin ?? 'top-left';
      let left = this.shape.x;
      let top = this.shape.y;
      if (origin === 'center') {
        left = this.shape.x - this.shape.width * 0.5;
        top = this.shape.y + this.shape.height * 0.5;
      }
      const right = left + this.shape.width;
      const bottom = top - this.shape.height;

      if (lx < left || lx >= right || ly <= bottom || ly > top) {
        return false;
      }

      if (this.shape.radius && this.shape.radius > 0) {
        const r = Math.min(this.shape.radius, this.shape.width * 0.5, this.shape.height * 0.5);
        // Test corners
        if (lx < left + r && ly > top - r) {
          return Math.hypot(lx - (left + r), ly - (top - r)) <= r;
        }
        if (lx > right - r && ly > top - r) {
          return Math.hypot(lx - (right - r), ly - (top - r)) <= r;
        }
        if (lx < left + r && ly < bottom + r) {
          return Math.hypot(lx - (left + r), ly - (bottom + r)) <= r;
        }
        if (lx > right - r && ly < bottom + r) {
          return Math.hypot(lx - (right - r), ly - (bottom + r)) <= r;
        }
      }
      return true;
    } else if (this.shape.type === 'circle') {
      return Math.hypot(lx - this.shape.cx, ly - this.shape.cy) <= this.shape.radius;
    } else if (this.shape.type === 'polygon') {
      return isPointInPolygon(lx, ly, this.shape.points);
    } else if (this.shape.type === 'stroke') {
      const halfWidth = this.shape.width * 0.5;
      const hwSq = halfWidth * halfWidth;
      const pts = this.shape.points;
      for (let i = 0; i < pts.length - 1; i += 1) {
        const p0 = pts[i]!;
        const p1 = pts[i + 1]!;
        if (distanceToSegmentSquared(lx, ly, p0.x, p0.y, p1.x, p1.y) <= hwSq) {
          return true;
        }
      }
      return false;
    }
    return false;
  }

  /**
   * Release resources idempotently.
   */
  dispose(): void {
    this.geometry.dispose();
    if (this.material instanceof THREE.Material) {
      this.material.dispose();
    }
  }
}

/**
 * Create a VectorMesh with Flat2DMaterial and explicit render order.
 */
export function createVectorMesh(
  shape: VectorShapeDefinition,
  options: VectorMeshOptions,
): VectorMesh {
  if (options.profileId !== 'flat-2d') {
    throw new Error('Vector mesh requires profileId "flat-2d".');
  }

  const geometry = createVectorGeometry(shape);
  const material = new Flat2DMaterial({
    tint: options.tint,
    opacity: options.opacity,
    blendMode: options.blendMode,
  });

  const mesh = new VectorMesh(geometry, material, shape);
  mesh.renderOrder = options.renderOrder ?? 0;

  if (options.x !== undefined) mesh.position.x = options.x;
  if (options.y !== undefined) mesh.position.y = options.y;
  if (options.scaleX !== undefined) mesh.scale.x = options.scaleX;
  if (options.scaleY !== undefined) mesh.scale.y = options.scaleY;
  if (options.rotation !== undefined) mesh.rotation.z = options.rotation;

  return mesh;
}
