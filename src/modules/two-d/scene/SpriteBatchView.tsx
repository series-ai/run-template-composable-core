/**
 * R3F View component for batched 2D sprite rendering.
 * Uses shared instanced geometry with ordered multi-texture shader runs.
 */

import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { BatchMeshPool, buildMultiTextureBatchRuns } from './batchRenderer';
import { computeFrameQuadMetrics, type SpriteScene } from './SpriteScene';
import type {
  PickResult,
  PresentationClock,
  SpriteInstancePlan,
} from './types';

export interface SpriteBatchViewProps {
  scene: SpriteScene;
  clock: PresentationClock;
  textures: Map<string, THREE.Texture>;
  pixelsPerMetre?: number;
  onPick?: (result: PickResult) => void;
}

export function SpriteBatchView({ scene, clock: _clock, textures, pixelsPerMetre, onPick }: SpriteBatchViewProps) {
  const { scene: threeScene, camera, gl } = useThree();
  const scope = useRef<{ container: THREE.Group; pool: BatchMeshPool } | null>(null);
  useEffect(() => {
    const owned = { container: new THREE.Group(), pool: new BatchMeshPool() };
    scope.current = owned; threeScene.add(owned.container);
    return () => {
      threeScene.remove(owned.container); owned.pool.dispose(); owned.container.clear();
      if (scope.current === owned) scope.current = null;
    };
  }, [threeScene]);
  useEffect(() => {
    if (!onPick) return;
    const ray = new THREE.Raycaster(); const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const point = new THREE.Vector3(); const ndc = new THREE.Vector2();
    const pick = (event: PointerEvent): void => {
      const rect = gl.domElement.getBoundingClientRect();
      ndc.set((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2);
      ray.setFromCamera(ndc, camera);
      if (!ray.ray.intersectPlane(plane, point)) return;
      const result = scene.pick(point.x, point.y); if (result) onPick(result);
    };
    gl.domElement.addEventListener('pointerdown', pick);
    return () => gl.domElement.removeEventListener('pointerdown', pick);
  }, [camera, gl, onPick, scene]);

  // Frame update loop: render initial frame and updates even when clock is suspended
  useFrame(() => {
    const owned = scope.current; if (!owned) return;
    const { container, pool } = owned;
    // Step 1: Update transform tree and bounds
    const visibleNodes = scene.queryVisibleNodes();
    scene.syncForeignLayers(visibleNodes);

    // Step 2: Build sprite instance plans
    const ppm = pixelsPerMetre ?? scene.pixelsPerMetre ?? 100;
    const instances: SpriteInstancePlan[] = [];

    for (let i = 0; i < visibleNodes.length; i += 1) {
      const node = visibleNodes[i]!;
      if (!node.atlasId || !node.frameId) {
        continue;
      }
      if (node.profileId !== 'flat-2d') {
        continue;
      }

      const frame = scene.getFrame(node.atlasId, node.frameId);
      if (!frame) {
        continue;
      }

      const atlas = scene.getAtlas(node.atlasId);
      const atlasPixelWidth = atlas?.pixelWidth ?? frame.atlasPixelWidth ?? 0;
      const atlasPixelHeight = atlas?.pixelHeight ?? frame.atlasPixelHeight ?? 0;
      if (atlasPixelWidth <= 0 || atlasPixelHeight <= 0) {
        throw new Error(
          `SpriteBatchView: atlas "${node.atlasId}" has invalid dimensions: ${atlasPixelWidth}x${atlasPixelHeight}. Never guess dimensions.`,
        );
      }

      const quadMetrics = computeFrameQuadMetrics(frame, node, ppm);

      instances.push({
        id: node.id,
        atlasId: node.atlasId,
        atlasPixelWidth,
        atlasPixelHeight,
        frame,
        worldMatrix: [...node.worldMatrix],
        quadMetrics,
        tint: [...node.worldTint],
        opacity: node.worldOpacity,
        blendMode: node.blendMode,
        renderOrder: i,
        clipRect: node.clipRect,
        maskId: node.maskId,
      });
    }

    // Step 3: Partition into contiguous multi-texture runs
    const batchRuns = buildMultiTextureBatchRuns(instances);

    // Step 4: Obtain and update batch meshes from pool
    pool.reset();

    for (let r = 0; r < batchRuns.length; r += 1) {
      const run = batchRuns[r]!;
      const alloc = pool.obtain(run, textures, scene, ppm);
      if (alloc.mesh.parent !== container) {
        container.add(alloc.mesh);
      }
    }
  });

  return null;
}

export default SpriteBatchView;
