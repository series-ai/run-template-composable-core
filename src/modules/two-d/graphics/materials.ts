/**
 * Flat2D materials and premultiplied alpha blend state.
 */

import * as THREE from 'three';
import { validateColorRgba } from './color';
import type { BlendMode, ColorRgba, ProfileId } from './types';

import { getWhiteFallbackTexture } from '@modules/two-d/scene/materials';

/**
 * Configure blending factors for premultiplied alpha rendering.
 */
export function configurePmaBlendMode(material: THREE.Material, mode: BlendMode): void {
  material.transparent = true;
  material.blending = THREE.CustomBlending;

  if (mode === 'additive') {
    material.blendSrc = THREE.OneFactor;
    material.blendDst = THREE.OneFactor;
    material.blendSrcAlpha = THREE.OneFactor;
    material.blendDstAlpha = THREE.OneFactor;
  } else if (mode === 'multiply') {
    // Preserve destination color outside transparent regions:
    // OutColor = SrcColor * DstColor + DstColor * (1 - SrcAlpha)
    material.blendSrc = THREE.DstColorFactor;
    material.blendDst = THREE.OneMinusSrcAlphaFactor;
    material.blendSrcAlpha = THREE.OneFactor;
    material.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
  } else if (mode === 'screen') {
    // OutColor = SrcColor + DstColor * (1 - SrcColor)
    material.blendSrc = THREE.OneFactor;
    material.blendDst = THREE.OneMinusSrcColorFactor;
    material.blendSrcAlpha = THREE.OneFactor;
    material.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
  } else {
    // Normal premultiplied alpha:
    // OutColor = SrcColor + DstColor * (1 - SrcAlpha)
    material.blendSrc = THREE.OneFactor;
    material.blendDst = THREE.OneMinusSrcAlphaFactor;
    material.blendSrcAlpha = THREE.OneFactor;
    material.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
  }
}

export interface Flat2DMaterialOptions {
  texture?: THREE.Texture;
  sourcePremultiplied?: boolean;
  tint?: ColorRgba;
  opacity?: number;
  blendMode?: BlendMode;
}

/**
 * Premultiplied alpha Flat2D material.
 * Requires profileId 'flat-2d'.
 */
export class Flat2DMaterial extends THREE.ShaderMaterial {
  readonly profileId: ProfileId = 'flat-2d';

  constructor(options?: Flat2DMaterialOptions) {
    const tex = options?.texture ?? getWhiteFallbackTexture();
    const tint = options?.tint ? validateColorRgba(options.tint) : [1, 1, 1, 1];
    const opacity = options?.opacity ?? 1.0;
    const blendMode = options?.blendMode ?? 'normal';

    super({
      uniforms: {
        uMap: { value: tex },
        uColor: { value: new THREE.Vector3(tint[0], tint[1], tint[2]) },
        uAlpha: { value: tint[3] },
        uOpacity: { value: opacity },
        uSourcePma: { value: options?.sourcePremultiplied ? 1 : 0 },
      },
      vertexShader: /* glsl */ `
        attribute vec4 color;
        varying float vVertexAlpha;
        varying vec2 vUv;
        void main() {
          vVertexAlpha = color.a;
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform sampler2D uMap;
        uniform vec3 uColor;
        uniform float uAlpha;
        uniform float uOpacity;
        uniform float uSourcePma;
        varying float vVertexAlpha;
        varying vec2 vUv;

        void main() {
          vec4 tex = textureLod(uMap, vUv, 0.0);
          float combinedAlpha = tex.a * uAlpha * uOpacity * vVertexAlpha;
          vec3 finalRgb = tex.rgb * uColor * (uAlpha * uOpacity * vVertexAlpha) * (uSourcePma > 0.5 ? 1.0 : tex.a);
          gl_FragColor = vec4(finalRgb, combinedAlpha);
        }
      `,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
    });

    configurePmaBlendMode(this, blendMode);
  }

  setTint(color: ColorRgba): void {
    const validated = validateColorRgba(color);
    const colorUniform = this.uniforms['uColor'] as { value: THREE.Vector3 } | undefined;
    const alphaUniform = this.uniforms['uAlpha'] as { value: number } | undefined;
    if (colorUniform && alphaUniform) {
      colorUniform.value.set(validated[0], validated[1], validated[2]);
      alphaUniform.value = validated[3];
    }
  }

  setOpacity(opacity: number): void {
    if (typeof opacity !== 'number' || !Number.isFinite(opacity)) {
      throw new RangeError('Opacity must be a finite number.');
    }
    const uniform = this.uniforms['uOpacity'] as { value: number } | undefined;
    if (uniform) {
      uniform.value = Math.max(0, Math.min(1, opacity));
    }
  }

  setTexture(texture: THREE.Texture): void {
    const mapUniform = this.uniforms['uMap'] as { value: THREE.Texture } | undefined;
    if (mapUniform) {
      mapUniform.value = texture;
    }
  }
}
