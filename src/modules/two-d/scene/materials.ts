/**
 * Materials and shaders for canonical 2D sprite rendering.
 */

import * as THREE from 'three';
import type { BlendMode } from './types';

let cachedDummyTexture: THREE.DataTexture | null = null;

/**
 * Get or create a 1x1 white fallback texture.
 */
export function getWhiteFallbackTexture(): THREE.DataTexture {
  if (!cachedDummyTexture) {
    const data = new Uint8Array([255, 255, 255, 255]);
    cachedDummyTexture = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
    cachedDummyTexture.colorSpace = THREE.NoColorSpace;
    cachedDummyTexture.needsUpdate = true;
  }
  return cachedDummyTexture;
}

/**
 * Configure blending factors for premultiplied alpha modes.
 */
export function applyBlendMode(material: THREE.Material, mode: BlendMode): void {
  material.transparent = true;
  material.blending = THREE.CustomBlending;

  if (mode === 'additive') {
    material.blendSrc = THREE.OneFactor;
    material.blendDst = THREE.OneFactor;
    material.blendSrcAlpha = THREE.OneFactor;
    material.blendDstAlpha = THREE.OneFactor;
  } else if (mode === 'multiply') {
    material.blendSrc = THREE.DstColorFactor;
    material.blendDst = THREE.OneMinusSrcAlphaFactor;
    material.blendSrcAlpha = THREE.OneFactor;
    material.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
  } else if (mode === 'screen') {
    material.blendSrc = THREE.OneFactor;
    material.blendDst = THREE.OneMinusSrcColorFactor;
    material.blendSrcAlpha = THREE.OneFactor;
    material.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
  } else {
    // Normal premultiplied alpha
    material.blendSrc = THREE.OneFactor;
    material.blendDst = THREE.OneMinusSrcAlphaFactor;
    material.blendSrcAlpha = THREE.OneFactor;
    material.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
  }
}

const MULTI_TEXTURE_VERTEX_SHADER = /* glsl */ `
attribute vec4 aWorldMatrix0;
attribute vec2 aWorldMatrix1;
attribute vec4 aQuadRect;
attribute vec4 aUvOffsetScale;
attribute float aUvRotate;
attribute vec4 aColorTint;
attribute float aSamplerIndex;

varying vec2 vUv;
varying vec4 vColorTint;
varying float vSamplerIndex;
varying vec2 vWorldPos;
varying float vAxisAligned;

void main() {
  vColorTint = aColorTint;
  vSamplerIndex = aSamplerIndex;
  vAxisAligned = aWorldMatrix0.y == 0.0 && aWorldMatrix0.z == 0.0 ? 1.0 : 0.0;

  // Local quad vertex in metres: derived from trimmed untrimmed-source pivot rectangle
  vec2 localPos = vec2(
    aQuadRect.x + position.x * aQuadRect.z,
    aQuadRect.y + position.y * aQuadRect.w
  );

  // Full 2D affine world transformation
  vec2 world = vec2(
    aWorldMatrix0.x * localPos.x + aWorldMatrix0.z * localPos.y + aWorldMatrix1.x,
    aWorldMatrix0.y * localPos.x + aWorldMatrix0.w * localPos.y + aWorldMatrix1.y
  );
  vWorldPos = world;

  // UV coordinates
  if (aUvRotate > 0.5) {
    // Clockwise 90-degree packed rotation in atlas
    vUv = vec2(
      aUvOffsetScale.x + uv.y * aUvOffsetScale.z,
      aUvOffsetScale.y + uv.x * aUvOffsetScale.w
    );
  } else {
    vUv = vec2(
      aUvOffsetScale.x + uv.x * aUvOffsetScale.z,
      aUvOffsetScale.y + (1.0 - uv.y) * aUvOffsetScale.w
    );
  }

  gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 0.0, 1.0);
}
`;

const MULTI_TEXTURE_FRAGMENT_SHADER = /* glsl */ `
precision highp float;

uniform sampler2D uTextures[4];
uniform vec4 uTexturePma;
uniform vec4 uTextureNearest;
uniform float uHasClip;
uniform vec4 uClipRect;
uniform float uMaskMode;
uniform vec4 uMaskBounds;

varying vec2 vUv;
varying vec4 vColorTint;
varying float vSamplerIndex;
varying vec2 vWorldPos;
varying float vAxisAligned;

vec4 sampleAtlas(int index, vec2 coord) {
  if (index == 0) {
    if (uTextureNearest.x > 0.5 && vAxisAligned > 0.5) coord = round(coord * vec2(textureSize(uTextures[0], 0)) * 4096.0) / (vec2(textureSize(uTextures[0], 0)) * 4096.0);
    return textureLod(uTextures[0], coord, 0.0);
  } else if (index == 1) {
    if (uTextureNearest.y > 0.5 && vAxisAligned > 0.5) coord = round(coord * vec2(textureSize(uTextures[1], 0)) * 4096.0) / (vec2(textureSize(uTextures[1], 0)) * 4096.0);
    return textureLod(uTextures[1], coord, 0.0);
  } else if (index == 2) {
    if (uTextureNearest.z > 0.5 && vAxisAligned > 0.5) coord = round(coord * vec2(textureSize(uTextures[2], 0)) * 4096.0) / (vec2(textureSize(uTextures[2], 0)) * 4096.0);
    return textureLod(uTextures[2], coord, 0.0);
  } else {
    if (uTextureNearest.w > 0.5 && vAxisAligned > 0.5) coord = round(coord * vec2(textureSize(uTextures[3], 0)) * 4096.0) / (vec2(textureSize(uTextures[3], 0)) * 4096.0);
    return textureLod(uTextures[3], coord, 0.0);
  }
}

void main() {
  if (uHasClip > 0.5) {
    if (vWorldPos.x < uClipRect.x || vWorldPos.x > uClipRect.z ||
        vWorldPos.y < uClipRect.y || vWorldPos.y > uClipRect.w) {
      discard;
    }
  }

  if (uMaskMode > 0.5 && uMaskMode < 1.5) {
    if (vWorldPos.x < uMaskBounds.x || vWorldPos.x > uMaskBounds.z ||
        vWorldPos.y < uMaskBounds.y || vWorldPos.y > uMaskBounds.w) {
      discard;
    }
  } else if (uMaskMode > 1.5) {
    if (distance(vWorldPos, uMaskBounds.xy) > uMaskBounds.z) {
      discard;
    }
  }

  int idx = int(floor(vSamplerIndex + 0.5));
  vec4 tex = sampleAtlas(idx, vUv);

  vec3 rgb = tex.rgb * vColorTint.rgb;
  float alpha = tex.a * vColorTint.a;

  // Premultiplied alpha output
  float sourcePma = idx == 0 ? uTexturePma.x : idx == 1 ? uTexturePma.y : idx == 2 ? uTexturePma.z : uTexturePma.w;
  gl_FragColor = vec4(rgb * vColorTint.a * mix(tex.a, 1.0, sourcePma), alpha);
}
`;

/**
 * Create a multi-texture instanced shader material.
 * Supports up to 4 atlas samplers with unrolled LOD0 sampling.
 */
export function createMultiTextureBatchMaterial(
  textures: THREE.Texture[],
  blendMode: BlendMode = 'normal',
): THREE.ShaderMaterial {
  const fallback = getWhiteFallbackTexture();
  const uniformTextures: THREE.Texture[] = [
    textures[0] ?? fallback,
    textures[1] ?? fallback,
    textures[2] ?? fallback,
    textures[3] ?? fallback,
  ];

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTextures: { value: uniformTextures },
      uTexturePma: { value: new THREE.Vector4(...uniformTextures.map((texture) => texture.premultiplyAlpha ? 1 : 0) as [number, number, number, number]) },
      uTextureNearest: { value: new THREE.Vector4(...uniformTextures.map((texture) => texture.magFilter === THREE.NearestFilter ? 1 : 0) as [number, number, number, number]) },
      uHasClip: { value: 0.0 },
      uClipRect: { value: new THREE.Vector4(0, 0, 0, 0) },
      uMaskMode: { value: 0.0 },
      uMaskBounds: { value: new THREE.Vector4(0, 0, 0, 0) },
    },
    vertexShader: MULTI_TEXTURE_VERTEX_SHADER,
    fragmentShader: MULTI_TEXTURE_FRAGMENT_SHADER,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  });

  applyBlendMode(material, blendMode);
  return material;
}

/**
 * Billboard material for world-3d profile.
 * Uses depth testing with standard Three rendering pipeline.
 */
export function createWorld3DBillboardMaterial(texture: THREE.Texture): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: true,
  });
}
