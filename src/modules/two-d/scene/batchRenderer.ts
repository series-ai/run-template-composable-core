/**
 * Multi-texture batch renderer for 2D sprites.
 */

import * as THREE from 'three';
import { applyBlendMode, createMultiTextureBatchMaterial, getWhiteFallbackTexture } from './materials';
import type { SpriteScene } from './SpriteScene';
import type { BatchRun, BlendMode, SpriteInstancePlan } from './types';

const MAX_TEXTURES_PER_BATCH = 4;

/**
 * Split ordered sprite instance plans into contiguous multi-texture batch runs.
 * Preserves exact global transparent order across atlases.
 */
export function buildMultiTextureBatchRuns(
  instances: SpriteInstancePlan[],
  startRenderOrder = 0,
): BatchRun[] {
  const runs: BatchRun[] = [];
  let currentRun: BatchRun | null = null;
  let currentAtlasIndexMap = new Map<string, number>();

  for (let i = 0; i < instances.length; i += 1) {
    const inst = instances[i]!;
    const blendMode: BlendMode = inst.blendMode ?? 'normal';
    const clipKey = inst.clipRect
      ? `${inst.clipRect.x},${inst.clipRect.y},${inst.clipRect.width},${inst.clipRect.height}`
      : '';
    const maskKey = inst.maskId ?? '';

    let canAddToCurrent = false;
    if (currentRun !== null) {
      const matchBlend = currentRun.blendMode === blendMode;
      const matchMask = (currentRun.maskId ?? '') === maskKey;
      const matchClip =
        (currentRun.clipRect
          ? `${currentRun.clipRect.x},${currentRun.clipRect.y},${currentRun.clipRect.width},${currentRun.clipRect.height}`
          : '') === clipKey;

      const previous = instances[i - 1];
      if (previous && inst.renderOrder === previous.renderOrder + 1 && matchBlend && matchMask && matchClip) {
        if (currentAtlasIndexMap.has(inst.atlasId)) {
          canAddToCurrent = true;
        } else if (currentRun.atlasIds.length < MAX_TEXTURES_PER_BATCH) {
          canAddToCurrent = true;
          currentAtlasIndexMap.set(inst.atlasId, currentRun.atlasIds.length);
          currentRun.atlasIds.push(inst.atlasId);
        }
      }
    }

    if (!canAddToCurrent) {
      currentAtlasIndexMap = new Map<string, number>();
      currentAtlasIndexMap.set(inst.atlasId, 0);

      currentRun = {
        materialKey: `${blendMode}_${clipKey}_${maskKey}`,
        blendMode,
        atlasIds: [inst.atlasId],
        renderOrder: startRenderOrder + inst.renderOrder,
        instances: [],
        clipRect: inst.clipRect,
        maskId: inst.maskId,
      };
      runs.push(currentRun);
    }

    currentRun!.instances.push(inst);
  }

  return runs;
}

/**
 * Shared unit quad base geometry for instancing.
 */
export function createBaseQuadGeometry(): THREE.InstancedBufferGeometry {
  const geom = new THREE.InstancedBufferGeometry();

  // Positions: unit quad from (0, 0) to (1, 1)
  const positions = new Float32Array([
    0, 0, 0,
    1, 0, 0,
    1, 1, 0,
    0, 1, 0,
  ]);

  // UV coordinates
  const uvs = new Float32Array([
    0, 0,
    1, 0,
    1, 1,
    0, 1,
  ]);

  // Indices
  const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);

  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geom.setIndex(new THREE.BufferAttribute(indices, 1));

  return geom;
}

export interface BatchMeshAllocation {
  mesh: THREE.Mesh;
  instancedGeometry: THREE.InstancedBufferGeometry;
  material: THREE.ShaderMaterial;
  capacity: number;
  currentBlendMode: BlendMode;
}

/**
 * Manager for reusable instanced batch meshes.
 * Prevents per-actor mesh allocations.
 */
export class BatchMeshPool {
  private readonly baseGeometry: THREE.InstancedBufferGeometry;
  private readonly allocatedMeshes: BatchMeshAllocation[] = [];
  private activeCount = 0;

  constructor() {
    this.baseGeometry = createBaseQuadGeometry();
  }

  reset(): void {
    this.activeCount = 0;
    for (const alloc of this.allocatedMeshes) {
      alloc.mesh.visible = false;
    }
  }

  obtain(
    run: BatchRun,
    textureMap: Map<string, THREE.Texture>,
    scene: SpriteScene,
    pixelsPerMetre = 100,
  ): BatchMeshAllocation {
    const requiredCapacity = Math.max(64, run.instances.length);

    let alloc: BatchMeshAllocation;
    if (this.activeCount < this.allocatedMeshes.length) {
      alloc = this.allocatedMeshes[this.activeCount]!;
      if (alloc.capacity < requiredCapacity) {
        this.reallocateBuffer(alloc, requiredCapacity);
      }
    } else {
      alloc = this.createAllocation(requiredCapacity);
      this.allocatedMeshes.push(alloc);
    }

    this.activeCount += 1;

    // Mutate texture uniforms in place without reallocating material
    const fallback = getWhiteFallbackTexture();
    const uTextures = alloc.material.uniforms['uTextures']!.value as THREE.Texture[];
    const uTexturePma = alloc.material.uniforms['uTexturePma']!.value as THREE.Vector4;
    const uTextureNearest = alloc.material.uniforms['uTextureNearest']!.value as THREE.Vector4;
    for (let i = 0; i < MAX_TEXTURES_PER_BATCH; i += 1) {
      const atlasId = run.atlasIds[i];
      const tex = atlasId ? (textureMap.get(atlasId) ?? fallback) : fallback;
      uTexturePma.setComponent(i, tex.premultiplyAlpha ? 1 : 0);
      uTextureNearest.setComponent(i, tex.magFilter === THREE.NearestFilter && tex.minFilter === THREE.NearestFilter ? 1 : 0);
      if (uTextures[i] !== tex) {
        uTextures[i] = tex;
      }
    }

    // Mutate blend mode only when changed
    if (alloc.currentBlendMode !== run.blendMode) {
      applyBlendMode(alloc.material, run.blendMode);
      alloc.currentBlendMode = run.blendMode;
    }

    // Mutate clip uniform
    if (run.clipRect) {
      alloc.material.uniforms['uHasClip']!.value = 1.0;
      (alloc.material.uniforms['uClipRect']!.value as THREE.Vector4).set(
        run.clipRect.x / pixelsPerMetre,
        run.clipRect.y / pixelsPerMetre,
        (run.clipRect.x + run.clipRect.width) / pixelsPerMetre,
        (run.clipRect.y + run.clipRect.height) / pixelsPerMetre,
      );
    } else {
      alloc.material.uniforms['uHasClip']!.value = 0.0;
    }

    // Mutate mask uniform
    if (run.maskId) {
      const maskNode = scene.getNode(run.maskId);
      if (!maskNode) {
        throw new Error(`BatchMeshPool: mask node "${run.maskId}" does not exist.`);
      }
      if (maskNode.type === 'mask') {
        alloc.material.uniforms['uMaskMode']!.value = 1.0;
        (alloc.material.uniforms['uMaskBounds']!.value as THREE.Vector4).set(
          maskNode.worldBounds.minX,
          maskNode.worldBounds.minY,
          maskNode.worldBounds.maxX,
          maskNode.worldBounds.maxY,
        );
      } else {
        throw new Error(
          `BatchMeshPool: unsupported mask type "${maskNode.type}" for mask "${run.maskId}". Offscreen pass required.`,
        );
      }
    } else {
      alloc.material.uniforms['uMaskMode']!.value = 0.0;
    }

    alloc.mesh.renderOrder = run.renderOrder;
    alloc.mesh.visible = true;

    // Populate instance buffers
    this.fillInstanceData(alloc, run);

    return alloc;
  }

  private createAllocation(capacity: number): BatchMeshAllocation {
    const geom = new THREE.InstancedBufferGeometry();
    geom.copy(this.baseGeometry);

    const aWorldMatrix0 = new Float32Array(capacity * 4);
    const aWorldMatrix1 = new Float32Array(capacity * 2);
    const aQuadRect = new Float32Array(capacity * 4);
    const aUvOffsetScale = new Float32Array(capacity * 4);
    const aUvRotate = new Float32Array(capacity);
    const aColorTint = new Float32Array(capacity * 4);
    const aSamplerIndex = new Float32Array(capacity);

    geom.setAttribute('aWorldMatrix0', new THREE.InstancedBufferAttribute(aWorldMatrix0, 4));
    geom.setAttribute('aWorldMatrix1', new THREE.InstancedBufferAttribute(aWorldMatrix1, 2));
    geom.setAttribute('aQuadRect', new THREE.InstancedBufferAttribute(aQuadRect, 4));
    geom.setAttribute('aUvOffsetScale', new THREE.InstancedBufferAttribute(aUvOffsetScale, 4));
    geom.setAttribute('aUvRotate', new THREE.InstancedBufferAttribute(aUvRotate, 1));
    geom.setAttribute('aColorTint', new THREE.InstancedBufferAttribute(aColorTint, 4));
    geom.setAttribute('aSamplerIndex', new THREE.InstancedBufferAttribute(aSamplerIndex, 1));

    const material = createMultiTextureBatchMaterial([], 'normal');
    const mesh = new THREE.Mesh(geom, material);
    mesh.frustumCulled = false;

    // Disable GPU raycasting on batch meshes
    mesh.raycast = () => {};

    return {
      mesh,
      instancedGeometry: geom,
      material,
      capacity,
      currentBlendMode: 'normal',
    };
  }

  private reallocateBuffer(alloc: BatchMeshAllocation, newCapacity: number): void {
    alloc.capacity = newCapacity;
    const previous = alloc.instancedGeometry;
    const geom = new THREE.InstancedBufferGeometry();
    geom.copy(this.baseGeometry);
    alloc.instancedGeometry = geom;
    alloc.mesh.geometry = geom;
    previous.dispose();

    const aWorldMatrix0 = new Float32Array(newCapacity * 4);
    const aWorldMatrix1 = new Float32Array(newCapacity * 2);
    const aQuadRect = new Float32Array(newCapacity * 4);
    const aUv = new Float32Array(newCapacity * 4);
    const aRotUv = new Float32Array(newCapacity);
    const aTint = new Float32Array(newCapacity * 4);
    const aSampler = new Float32Array(newCapacity);

    geom.setAttribute('aWorldMatrix0', new THREE.InstancedBufferAttribute(aWorldMatrix0, 4));
    geom.setAttribute('aWorldMatrix1', new THREE.InstancedBufferAttribute(aWorldMatrix1, 2));
    geom.setAttribute('aQuadRect', new THREE.InstancedBufferAttribute(aQuadRect, 4));
    geom.setAttribute('aUvOffsetScale', new THREE.InstancedBufferAttribute(aUv, 4));
    geom.setAttribute('aUvRotate', new THREE.InstancedBufferAttribute(aRotUv, 1));
    geom.setAttribute('aColorTint', new THREE.InstancedBufferAttribute(aTint, 4));
    geom.setAttribute('aSamplerIndex', new THREE.InstancedBufferAttribute(aSampler, 1));
  }

  private fillInstanceData(alloc: BatchMeshAllocation, run: BatchRun): void {
    const count = run.instances.length;
    const geom = alloc.instancedGeometry;

    const aWorld0Attr = geom.getAttribute('aWorldMatrix0') as THREE.InstancedBufferAttribute;
    const aWorld1Attr = geom.getAttribute('aWorldMatrix1') as THREE.InstancedBufferAttribute;
    const aQuadRectAttr = geom.getAttribute('aQuadRect') as THREE.InstancedBufferAttribute;
    const aUvAttr = geom.getAttribute('aUvOffsetScale') as THREE.InstancedBufferAttribute;
    const aRotUvAttr = geom.getAttribute('aUvRotate') as THREE.InstancedBufferAttribute;
    const aTintAttr = geom.getAttribute('aColorTint') as THREE.InstancedBufferAttribute;
    const aSamplerAttr = geom.getAttribute('aSamplerIndex') as THREE.InstancedBufferAttribute;

    const aWorld0 = aWorld0Attr.array as Float32Array;
    const aWorld1 = aWorld1Attr.array as Float32Array;
    const aQuadRect = aQuadRectAttr.array as Float32Array;
    const aUv = aUvAttr.array as Float32Array;
    const aRotUv = aRotUvAttr.array as Float32Array;
    const aTint = aTintAttr.array as Float32Array;
    const aSampler = aSamplerAttr.array as Float32Array;

    const atlasMap = new Map<string, number>();
    for (let i = 0; i < run.atlasIds.length; i += 1) {
      atlasMap.set(run.atlasIds[i]!, i);
    }

    for (let i = 0; i < count; i += 1) {
      const inst = run.instances[i]!;
      const frame = inst.frame;

      // Affine transform matrix columns: a, b, c, d
      aWorld0[i * 4] = inst.worldMatrix[0];
      aWorld0[i * 4 + 1] = inst.worldMatrix[1];
      aWorld0[i * 4 + 2] = inst.worldMatrix[2];
      aWorld0[i * 4 + 3] = inst.worldMatrix[3];

      // Translation: tx, ty
      aWorld1[i * 2] = inst.worldMatrix[4];
      aWorld1[i * 2 + 1] = inst.worldMatrix[5];

      // Quad metrics in metres
      aQuadRect[i * 4] = inst.quadMetrics.localLeft;
      aQuadRect[i * 4 + 1] = inst.quadMetrics.localBottom;
      aQuadRect[i * 4 + 2] = inst.quadMetrics.localWidth;
      aQuadRect[i * 4 + 3] = inst.quadMetrics.localHeight;

      // Normalized UV coordinates
      const atlasW = inst.atlasPixelWidth;
      const atlasH = inst.atlasPixelHeight;
      if (!atlasW || atlasW <= 0 || !atlasH || atlasH <= 0) {
        throw new Error(
          `BatchMeshPool: atlas "${inst.atlasId}" has invalid dimensions: ${atlasW}x${atlasH}. Never guess dimensions.`,
        );
      }

      const u0 = frame.rectPx.x / atlasW;
      const v0 = frame.rectPx.y / atlasH;
      const uw = frame.rectPx.width / atlasW;
      const vh = frame.rectPx.height / atlasH;

      aUv[i * 4] = u0;
      aUv[i * 4 + 1] = v0;
      aUv[i * 4 + 2] = uw;
      aUv[i * 4 + 3] = vh;

      // UV Rotate (0 for none, 1 for cw90)
      aRotUv[i] = frame.rotation === 'cw90' ? 1.0 : 0.0;

      // Tint color tuple [r, g, b, a * opacity]
      aTint[i * 4] = inst.tint[0];
      aTint[i * 4 + 1] = inst.tint[1];
      aTint[i * 4 + 2] = inst.tint[2];
      aTint[i * 4 + 3] = inst.tint[3] * inst.opacity;

      // Sampler index in run
      aSampler[i] = atlasMap.get(inst.atlasId) ?? 0;
    }

    geom.instanceCount = count;
    aWorld0Attr.needsUpdate = true;
    aWorld1Attr.needsUpdate = true;
    aQuadRectAttr.needsUpdate = true;
    aUvAttr.needsUpdate = true;
    aRotUvAttr.needsUpdate = true;
    aTintAttr.needsUpdate = true;
    aSamplerAttr.needsUpdate = true;
  }

  dispose(): void {
    for (const alloc of this.allocatedMeshes) {
      alloc.mesh.geometry.dispose();
      alloc.material.dispose();
    }
    this.allocatedMeshes.length = 0;
    this.baseGeometry.dispose();
  }
}
