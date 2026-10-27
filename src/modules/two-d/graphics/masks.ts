/**
 * Bounded transformed masks for GPU shaders and CPU picking.
 */

import * as THREE from 'three';
import { applyBlendMode, getWhiteFallbackTexture } from '@modules/two-d/scene/materials';
import type {
  AffineMatrix2D,
  CircleMask,
  MaskDefinition,
  MaskStack,
  ProfileId,
  RectMask,
  SpriteAlphaMask,
} from './types';

/**
 * Validate that a mask stack does not exceed the maximum limit of 2 nested masks.
 */
export function validateMaskStack(masks: MaskDefinition[]): void {
  if (masks.length > 2) {
    throw new RangeError(`Exceeded maximum nested mask limit of 2. Requested: ${masks.length}`);
  }
  for (const mask of masks) {
    invertAffineMatrix(mask.matrix);
    if (mask.matrix && !mask.matrix.every(Number.isFinite)) throw new Error('Mask transform is invalid.');
    if (mask.type === 'circle') {
      if (![mask.cx, mask.cy, mask.radius].every(Number.isFinite) || mask.radius <= 0) throw new Error('Circle mask is invalid.');
    } else {
      const bounds = mask.type === 'rect' ? mask : mask.bounds;
      if (!bounds || ![bounds.minX, bounds.minY, bounds.maxX, bounds.maxY].every(Number.isFinite) || bounds.maxX <= bounds.minX || bounds.maxY <= bounds.minY) throw new Error('Mask bounds are invalid.');
      if (mask.type === 'sprite-alpha') {
        const [u0, v0, u1, v1] = mask.uvBounds;
        if (![u0, v0, u1, v1].every(Number.isFinite) || u0 < 0 || v0 < 0 || u1 > 1 || v1 > 1 || u1 <= u0 || v1 <= v0) throw new Error('Mask UV bounds are invalid.');
        if (mask.cpuAlphaData && (!Number.isSafeInteger(mask.cpuWidth) || !Number.isSafeInteger(mask.cpuHeight) || !mask.cpuWidth || !mask.cpuHeight || mask.cpuWidth * mask.cpuHeight !== mask.cpuAlphaData.length)) throw new Error('Mask CPU alpha data is invalid.');
      }
    }
  }
}

/**
 * Invert a 2D affine transformation matrix [a, b, c, d, tx, ty].
 */
export function invertAffineMatrix(m?: AffineMatrix2D): AffineMatrix2D {
  if (!m) {
    return [1, 0, 0, 1, 0, 0];
  }
  const [a, b, c, d, tx, ty] = m;
  const det = a * d - b * c;
  if (Math.abs(det) < 1e-9) {
    throw new Error('Mask transform is singular.');
  }
  const invDet = 1 / det;
  return [
    d * invDet,
    -b * invDet,
    -c * invDet,
    a * invDet,
    (c * ty - d * tx) * invDet,
    (b * tx - a * ty) * invDet,
  ];
}

/**
 * Apply 2D affine transformation to a point.
 */
export function transformPoint(x: number, y: number, m: AffineMatrix2D): [number, number] {
  return [
    m[0] * x + m[2] * y + m[4],
    m[1] * x + m[3] * y + m[5],
  ];
}

/**
 * Convert 2D affine matrix to Three.js Matrix3.
 */
export function affineToMatrix3(m: AffineMatrix2D): THREE.Matrix3 {
  const mat = new THREE.Matrix3();
  mat.set(
    m[0], m[2], m[4],
    m[1], m[3], m[5],
    0, 0, 1,
  );
  return mat;
}

/**
 * Evaluate single mask containment on the CPU.
 */
export function evaluateMaskCpu(mask: MaskDefinition, worldX: number, worldY: number): boolean {
  const inv = invertAffineMatrix(mask.matrix);
  const [lx, ly] = transformPoint(worldX, worldY, inv);

  let inside = false;

  if (mask.type === 'rect') {
    const r = mask as RectMask;
    inside = lx >= r.minX && lx <= r.maxX && ly >= r.minY && ly <= r.maxY;
  } else if (mask.type === 'circle') {
    const c = mask as CircleMask;
    inside = Math.hypot(lx - c.cx, ly - c.cy) <= c.radius;
  } else if (mask.type === 'sprite-alpha') {
    const s = mask as SpriteAlphaMask;
    const threshold = s.alphaThreshold ?? 0.1;

    if (s.cpuAlphaData && s.cpuWidth && s.cpuHeight) {
      // Direct CPU alpha sample without GPU readback
      const uvs = s.uvBounds;
      const spanU = s.bounds.maxX - s.bounds.minX;
      const spanV = s.bounds.maxY - s.bounds.minY;

      if (spanU > 0 && spanV > 0) {
        const u = (lx - s.bounds.minX) / spanU;
        const v = (s.bounds.maxY - ly) / spanV;

        if (u >= 0 && u <= 1 && v >= 0 && v <= 1) {
          const px = Math.min(s.cpuWidth - 1, Math.floor((uvs[0] + u * (uvs[2] - uvs[0])) * s.cpuWidth));
          const py = Math.min(s.cpuHeight - 1, Math.floor((uvs[1] + v * (uvs[3] - uvs[1])) * s.cpuHeight));
          const alphaVal = s.cpuAlphaData[py * s.cpuWidth + px]! / 255;
          inside = alphaVal >= threshold;
        }
      }
    } else {
      throw new Error('Sprite mask picking requires CPU alpha data.');
    }
  }

  return mask.inverted ? !inside : inside;
}

/**
 * Evaluate mask stack containment on the CPU.
 * Validates maximum 2 nested masks.
 */
export function evaluateMaskStackCpu(masks: MaskStack, worldX: number, worldY: number): boolean {
  validateMaskStack(masks);
  for (let i = 0; i < masks.length; i += 1) {
    if (!evaluateMaskCpu(masks[i]!, worldX, worldY)) {
      return false;
    }
  }
  return true;
}

const MASK_VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;
varying vec2 vWorldPos;

void main() {
  vUv = uv;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorldPos = world.xy;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const MASK_FRAGMENT_SHADER_PREFIX = /* glsl */ `
precision highp float;

uniform int uMaskCount;

// Mask 0
uniform int uMaskType0;
uniform vec4 uMaskBounds0;
uniform mat3 uMaskInvMatrix0;
uniform float uMaskInverted0;
uniform sampler2D uMaskTexture0;
uniform vec4 uMaskUvBounds0;
uniform float uMaskThreshold0;

// Mask 1
uniform int uMaskType1;
uniform vec4 uMaskBounds1;
uniform mat3 uMaskInvMatrix1;
uniform float uMaskInverted1;
uniform sampler2D uMaskTexture1;
uniform vec4 uMaskUvBounds1;
uniform float uMaskThreshold1;

varying vec2 vUv;
varying vec2 vWorldPos;

bool testMask(int maskType, vec4 bounds, mat3 invMat, float inverted, sampler2D tex, vec4 uvBounds, float threshold, vec2 worldPos) {
  if (maskType == 0) return true;
  vec3 local = invMat * vec3(worldPos, 1.0);
  vec2 pos = local.xy;
  bool inside = false;

  if (maskType == 1) {
    // Rect
    inside = (pos.x >= bounds.x && pos.x <= bounds.z && pos.y >= bounds.y && pos.y <= bounds.w);
  } else if (maskType == 2) {
    // Circle
    inside = (distance(pos, bounds.xy) <= bounds.z);
  } else if (maskType == 3) {
    // Sprite alpha
    vec2 span = bounds.zw;
    vec2 uvFrac = (pos - bounds.xy) / max(vec2(0.0001), span);
    vec2 uv = mix(uvBounds.xy, uvBounds.zw, vec2(uvFrac.x, 1.0 - uvFrac.y));
    if (uvFrac.x >= 0.0 && uvFrac.x <= 1.0 && uvFrac.y >= 0.0 && uvFrac.y <= 1.0) {
      inside = (textureLod(tex, uv, 0.0).a >= threshold);
    }
  }

  if (inverted > 0.5) inside = !inside;
  return inside;
}

void applyMasks() {
  if (uMaskCount >= 1) {
    if (!testMask(uMaskType0, uMaskBounds0, uMaskInvMatrix0, uMaskInverted0, uMaskTexture0, uMaskUvBounds0, uMaskThreshold0, vWorldPos)) {
      discard;
    }
  }
  if (uMaskCount >= 2) {
    if (!testMask(uMaskType1, uMaskBounds1, uMaskInvMatrix1, uMaskInverted1, uMaskTexture1, uMaskUvBounds1, uMaskThreshold1, vWorldPos)) {
      discard;
    }
  }
}
`;

/**
 * Configure mask uniforms on a ShaderMaterial.
 */
export function updateMaterialMaskUniforms(material: THREE.ShaderMaterial, masks: MaskStack): void {
  validateMaskStack(masks);
  const fallback = getWhiteFallbackTexture();

  material.uniforms['uMaskCount'] = { value: masks.length };

  const mask0 = masks[0];
  if (mask0) {
    const typeInt = mask0.type === 'rect' ? 1 : mask0.type === 'circle' ? 2 : 3;
    const inv = invertAffineMatrix(mask0.matrix);
    material.uniforms['uMaskType0'] = { value: typeInt };
    material.uniforms['uMaskInvMatrix0'] = { value: affineToMatrix3(inv) };
    material.uniforms['uMaskInverted0'] = { value: mask0.inverted ? 1.0 : 0.0 };

    if (mask0.type === 'rect') {
      material.uniforms['uMaskBounds0'] = { value: new THREE.Vector4(mask0.minX, mask0.minY, mask0.maxX, mask0.maxY) };
      material.uniforms['uMaskTexture0'] = { value: fallback };
      material.uniforms['uMaskUvBounds0'] = { value: new THREE.Vector4(0, 0, 1, 1) };
      material.uniforms['uMaskThreshold0'] = { value: 0.1 };
    } else if (mask0.type === 'circle') {
      material.uniforms['uMaskBounds0'] = { value: new THREE.Vector4(mask0.cx, mask0.cy, mask0.radius, 0) };
      material.uniforms['uMaskTexture0'] = { value: fallback };
      material.uniforms['uMaskUvBounds0'] = { value: new THREE.Vector4(0, 0, 1, 1) };
      material.uniforms['uMaskThreshold0'] = { value: 0.1 };
    } else if (mask0.type === 'sprite-alpha') {
      const uvs = mask0.uvBounds;
      material.uniforms['uMaskBounds0'] = { value: new THREE.Vector4(mask0.bounds.minX, mask0.bounds.minY, mask0.bounds.maxX - mask0.bounds.minX, mask0.bounds.maxY - mask0.bounds.minY) };
      material.uniforms['uMaskTexture0'] = { value: mask0.texture };
      material.uniforms['uMaskUvBounds0'] = { value: new THREE.Vector4(uvs[0], uvs[1], uvs[2], uvs[3]) };
      material.uniforms['uMaskThreshold0'] = { value: mask0.alphaThreshold ?? 0.1 };
    }
  } else {
    material.uniforms['uMaskType0'] = { value: 0 };
    material.uniforms['uMaskBounds0'] = { value: new THREE.Vector4(0, 0, 0, 0) };
    material.uniforms['uMaskInvMatrix0'] = { value: new THREE.Matrix3() };
    material.uniforms['uMaskInverted0'] = { value: 0.0 };
    material.uniforms['uMaskTexture0'] = { value: fallback };
    material.uniforms['uMaskUvBounds0'] = { value: new THREE.Vector4(0, 0, 1, 1) };
    material.uniforms['uMaskThreshold0'] = { value: 0.1 };
  }

  const mask1 = masks[1];
  if (mask1) {
    const typeInt = mask1.type === 'rect' ? 1 : mask1.type === 'circle' ? 2 : 3;
    const inv = invertAffineMatrix(mask1.matrix);
    material.uniforms['uMaskType1'] = { value: typeInt };
    material.uniforms['uMaskInvMatrix1'] = { value: affineToMatrix3(inv) };
    material.uniforms['uMaskInverted1'] = { value: mask1.inverted ? 1.0 : 0.0 };

    if (mask1.type === 'rect') {
      material.uniforms['uMaskBounds1'] = { value: new THREE.Vector4(mask1.minX, mask1.minY, mask1.maxX, mask1.maxY) };
      material.uniforms['uMaskTexture1'] = { value: fallback };
      material.uniforms['uMaskUvBounds1'] = { value: new THREE.Vector4(0, 0, 1, 1) };
      material.uniforms['uMaskThreshold1'] = { value: 0.1 };
    } else if (mask1.type === 'circle') {
      material.uniforms['uMaskBounds1'] = { value: new THREE.Vector4(mask1.cx, mask1.cy, mask1.radius, 0) };
      material.uniforms['uMaskTexture1'] = { value: fallback };
      material.uniforms['uMaskUvBounds1'] = { value: new THREE.Vector4(0, 0, 1, 1) };
      material.uniforms['uMaskThreshold1'] = { value: 0.1 };
    } else if (mask1.type === 'sprite-alpha') {
      const uvs = mask1.uvBounds;
      material.uniforms['uMaskBounds1'] = { value: new THREE.Vector4(mask1.bounds.minX, mask1.bounds.minY, mask1.bounds.maxX - mask1.bounds.minX, mask1.bounds.maxY - mask1.bounds.minY) };
      material.uniforms['uMaskTexture1'] = { value: mask1.texture };
      material.uniforms['uMaskUvBounds1'] = { value: new THREE.Vector4(uvs[0], uvs[1], uvs[2], uvs[3]) };
      material.uniforms['uMaskThreshold1'] = { value: mask1.alphaThreshold ?? 0.1 };
    }
  } else {
    material.uniforms['uMaskType1'] = { value: 0 };
    material.uniforms['uMaskBounds1'] = { value: new THREE.Vector4(0, 0, 0, 0) };
    material.uniforms['uMaskInvMatrix1'] = { value: new THREE.Matrix3() };
    material.uniforms['uMaskInverted1'] = { value: 0.0 };
    material.uniforms['uMaskTexture1'] = { value: fallback };
    material.uniforms['uMaskUvBounds1'] = { value: new THREE.Vector4(0, 0, 1, 1) };
    material.uniforms['uMaskThreshold1'] = { value: 0.1 };
  }
}

/**
 * Create a masked Flat2D ShaderMaterial.
 */
export function createMaskedMaterial(
  texture: THREE.Texture | undefined,
  masks: MaskStack,
): THREE.ShaderMaterial {
  validateMaskStack(masks);
  const tex = texture ?? getWhiteFallbackTexture();

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: tex },
      uSourcePma: { value: tex.premultiplyAlpha ? 1 : 0 },
      uTint: { value: new THREE.Vector4(1, 1, 1, 1) },
    },
    vertexShader: MASK_VERTEX_SHADER,
    fragmentShader: /* glsl */ `
      ${MASK_FRAGMENT_SHADER_PREFIX}

      uniform sampler2D uMap;
      uniform float uSourcePma;
      uniform vec4 uTint;

      void main() {
        applyMasks();
        vec4 tex = textureLod(uMap, vUv, 0.0);
        vec3 rgb = tex.rgb * uTint.rgb;
        float alpha = tex.a * uTint.a;
        gl_FragColor = vec4(rgb * uTint.a * mix(tex.a, 1.0, uSourcePma), alpha);
      }
    `,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  });

  (mat as unknown as { profileId: ProfileId }).profileId = 'flat-2d';
  applyBlendMode(mat, 'normal');
  updateMaterialMaskUniforms(mat, masks);
  return mat;
}
