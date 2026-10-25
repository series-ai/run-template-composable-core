/**
 * Foreign layer renderable adapter with explicit render order and profile enforcement.
 */

import * as THREE from 'three';
import type {
  ForeignAdapterOptions,
  ForeignRenderableAdapter,
  ProfileId,
  Vector2D,
} from './types';
import type { VectorMesh } from './vectorMesh';

/**
 * Convert asset top-left coordinates to right-handed Y-up world coordinates.
 */
export function convertAssetTopLeftToWorld(
  assetX: number,
  assetY: number,
  stageHeightPx: number,
  pixelsPerMeter = 100,
): Vector2D {
  return {
    x: assetX / pixelsPerMeter,
    y: (stageHeightPx - assetY) / pixelsPerMeter,
  };
}

/**
 * Traverse an object hierarchy to apply render order and assert profileId "flat-2d".
 */
export function applyRenderOrderAndAssertProfile(
  object: THREE.Object3D,
  renderOrder: number,
): void {
  object.renderOrder = renderOrder;

  object.traverse((child) => {
    child.renderOrder = renderOrder;
    if (child instanceof THREE.Mesh) {
      const mat = child.material as unknown as { profileId?: ProfileId };
      if (mat.profileId !== 'flat-2d') {
        throw new Error(
          `Material on mesh "${child.name || child.id}" has invalid profileId "${mat.profileId}". Required: "flat-2d".`,
        );
      }
    }
  });
}

/**
 * Create a foreign renderable adapter for external 2D scene integration.
 */
export function createForeignAdapter(
  id: string,
  object: THREE.Object3D,
  options: ForeignAdapterOptions,
): ForeignRenderableAdapter {
  if (options.profileId !== 'flat-2d') {
    throw new Error('Foreign adapter requires profileId "flat-2d".');
  }

  applyRenderOrderAndAssertProfile(object, options.renderOrder);

  if (options.x !== undefined) object.position.x = options.x;
  if (options.y !== undefined) object.position.y = options.y;
  if (options.scaleX !== undefined) object.scale.x = options.scaleX;
  if (options.scaleY !== undefined) object.scale.y = options.scaleY;
  if (options.rotation !== undefined) object.rotation.z = options.rotation;

  return {
    id,
    profileId: 'flat-2d',
    renderOrder: options.renderOrder,
    object,

    pick(worldX: number, worldY: number): boolean {
      if (options.pick) {
        return options.pick(worldX, worldY);
      }
      if ('pick' in object && typeof (object as VectorMesh).pick === 'function') {
        return (object as VectorMesh).pick(worldX, worldY);
      }
      return false;
    },

    setRenderOrder(order: number): void {
      this.renderOrder = order;
      applyRenderOrderAndAssertProfile(object, order);
    },

    dispose(): void {
      object.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (child.material instanceof THREE.Material) {
            child.material.dispose();
          }
        }
      });
    },
  };
}
