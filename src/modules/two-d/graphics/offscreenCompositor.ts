/**
 * Offscreen compositor with WebGLRenderTarget management and image processing passes.
 */

import * as THREE from 'three';
import { validateColorRgba } from './color';
import type { BlurOptions, ColorAdjustOptions, ColorRgba, OutlineOptions } from './types';

export const MAX_LIVE_OUTPUTS = 2;
export const MAX_OUTPUT_DIMENSION = 512;
export const MAX_EXTRA_PASSES = 4;

const QUAD_VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const COLOR_ADJUST_FRAGMENT_SHADER = /* glsl */ `
precision highp float;
uniform sampler2D uMap;
uniform float uBrightness;
uniform float uContrast;
uniform float uSaturation;
uniform float uSourcePma;
varying vec2 vUv;

void main() {
  vec4 color = textureLod(uMap, vUv, 0.0);
  vec3 rgb = color.rgb;

  if (uSourcePma > 0.5) {
    rgb = color.a > 0.0001 ? color.rgb / color.a : vec3(0.0);
  }

  rgb += uBrightness;
  rgb = (rgb - 0.5) * uContrast + 0.5;

  float gray = dot(rgb, vec3(0.299, 0.587, 0.114));
  rgb = mix(vec3(gray), rgb, uSaturation);
  rgb = clamp(rgb, 0.0, 1.0);

  gl_FragColor = vec4(rgb * color.a, color.a);
}
`;

/**
 * Separable Gaussian blur shader matching Pixi 8.22 kernelSize 5 weights.
 * Reference: pixi.js/lib/filters/defaults/blur/const.mjs GAUSSIAN_VALUES[5].
 */
const BLUR_FRAGMENT_SHADER = /* glsl */ `
precision highp float;
uniform sampler2D uMap;
uniform vec2 uDirection;
uniform vec2 uResolution;
uniform float uStrength;
uniform float uSourcePma;
varying vec2 vUv;

vec4 sampleTexture(vec2 uv) {
  vec4 color = textureLod(uMap, uv, 0.0);
  if (uSourcePma < 0.5) {
    color.rgb *= color.a;
  }
  return color;
}

void main() {
  vec2 texel = (uDirection * uStrength) / uResolution;
  vec4 sum = vec4(0.0);

  sum += sampleTexture(vUv - 2.0 * texel) * 0.153388;
  sum += sampleTexture(vUv - 1.0 * texel) * 0.221461;
  sum += sampleTexture(vUv) * 0.250301;
  sum += sampleTexture(vUv + 1.0 * texel) * 0.221461;
  sum += sampleTexture(vUv + 2.0 * texel) * 0.153388;

  gl_FragColor = sum;
}
`;

const OUTLINE_FRAGMENT_SHADER = /* glsl */ `
precision highp float;
uniform sampler2D uMap;
uniform vec4 uOutlineColor;
uniform vec2 uTexelSize;
uniform float uThickness;
uniform float uSourcePma;
varying vec2 vUv;

void main() {
  vec4 center = textureLod(uMap, vUv, 0.0);
  if (uSourcePma < 0.5) {
    center.rgb *= center.a;
  }

  vec2 step = uTexelSize * uThickness;

  float maxA = 0.0;
  maxA = max(maxA, textureLod(uMap, vUv + vec2(step.x, 0.0), 0.0).a);
  maxA = max(maxA, textureLod(uMap, vUv - vec2(step.x, 0.0), 0.0).a);
  maxA = max(maxA, textureLod(uMap, vUv + vec2(0.0, step.y), 0.0).a);
  maxA = max(maxA, textureLod(uMap, vUv - vec2(0.0, step.y), 0.0).a);
  maxA = max(maxA, textureLod(uMap, vUv + vec2(step.x, step.y), 0.0).a);
  maxA = max(maxA, textureLod(uMap, vUv + vec2(-step.x, step.y), 0.0).a);
  maxA = max(maxA, textureLod(uMap, vUv + vec2(step.x, -step.y), 0.0).a);
  maxA = max(maxA, textureLod(uMap, vUv + vec2(-step.x, -step.y), 0.0).a);

  float outlineAlpha = clamp(maxA - center.a, 0.0, 1.0);
  vec4 outlinePma = vec4(uOutlineColor.rgb * (uOutlineColor.a * outlineAlpha), uOutlineColor.a * outlineAlpha);

  gl_FragColor = center + outlinePma * (1.0 - center.a);
}
`;

/**
 * Offscreen compositor with real Render-To-Texture capability.
 * Enforces budget limits: max 2 active outputs, max dimensions 512x512, max 4 extra effect passes.
 */
export class OffscreenCompositor {
  private activeOutputs = 0;
  private currentPassCount = 0;
  private readonly allocatedTargets = new Set<THREE.WebGLRenderTarget>();
  private readonly fullScreenQuad: THREE.Mesh;
  private readonly orthoCamera: THREE.Camera;
  private readonly colorAdjustMaterial: THREE.ShaderMaterial;
  private readonly blurMaterial: THREE.ShaderMaterial;
  private readonly outlineMaterial: THREE.ShaderMaterial;
  private disposed = false;

  constructor() {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3),
    );
    geom.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
    geom.setIndex(new THREE.BufferAttribute(new Uint16Array([0, 1, 2, 0, 2, 3]), 1));

    this.orthoCamera = new THREE.Camera();

    this.colorAdjustMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: null },
        uBrightness: { value: 0.0 },
        uContrast: { value: 1.0 },
        uSaturation: { value: 1.0 },
        uSourcePma: { value: 1.0 },
      },
      vertexShader: QUAD_VERTEX_SHADER,
      fragmentShader: COLOR_ADJUST_FRAGMENT_SHADER,
      transparent: false,
      blending: THREE.NoBlending,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });

    this.blurMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: null },
        uDirection: { value: new THREE.Vector2(1, 0) },
        uResolution: { value: new THREE.Vector2(512, 512) },
        uStrength: { value: 1.0 },
        uSourcePma: { value: 1.0 },
      },
      vertexShader: QUAD_VERTEX_SHADER,
      fragmentShader: BLUR_FRAGMENT_SHADER,
      transparent: false,
      blending: THREE.NoBlending,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });

    this.outlineMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: null },
        uOutlineColor: { value: new THREE.Vector4(1, 1, 1, 1) },
        uTexelSize: { value: new THREE.Vector2(1 / 512, 1 / 512) },
        uThickness: { value: 1.0 },
        uSourcePma: { value: 1.0 },
      },
      vertexShader: QUAD_VERTEX_SHADER,
      fragmentShader: OUTLINE_FRAGMENT_SHADER,
      transparent: false,
      blending: THREE.NoBlending,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });

    this.fullScreenQuad = new THREE.Mesh(geom, this.colorAdjustMaterial);
  }

  private validateDimensions(width: number, height: number): void {
    if (
      !Number.isInteger(width) ||
      !Number.isInteger(height) ||
      width < 1 ||
      height < 1 ||
      width > MAX_OUTPUT_DIMENSION ||
      height > MAX_OUTPUT_DIMENSION
    ) {
      throw new RangeError(
        `Render target dimensions must be finite integers between 1 and ${MAX_OUTPUT_DIMENSION}. Requested: ${width}x${height}`,
      );
    }
  }

  private assertOwnedTarget(target: THREE.WebGLRenderTarget, paramName = 'Target'): void {
    if (!this.allocatedTargets.has(target)) {
      throw new Error(`${paramName} must be an owned render target allocated by this compositor.`);
    }
    this.validateDimensions(target.width, target.height);
  }

  /**
   * Create an offscreen WebGLRenderTarget with RGBA8 format and NoColorSpace.
   */
  createRenderTarget(width: number, height: number): THREE.WebGLRenderTarget {
    this.assertNotDisposed();
    this.validateDimensions(width, height);
    if (this.activeOutputs >= MAX_LIVE_OUTPUTS) {
      throw new RangeError(
        `Exceeded maximum allowed ${MAX_LIVE_OUTPUTS} active render targets. Currently active: ${this.activeOutputs}`,
      );
    }

    const rt = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      colorSpace: THREE.NoColorSpace,
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: false,
    });

    this.activeOutputs += 1;
    this.allocatedTargets.add(rt);
    return rt;
  }

  /**
   * Release an allocated render target.
   */
  releaseRenderTarget(rt: THREE.WebGLRenderTarget): void {
    if (this.allocatedTargets.has(rt)) {
      this.allocatedTargets.delete(rt);
      this.activeOutputs = Math.max(0, this.activeOutputs - 1);
      rt.dispose();
    }
  }

  /**
   * Reset the pass counter for a new compositing sequence.
   */
  resetPassCount(): void {
    this.currentPassCount = 0;
  }

  /**
   * Execute a render pass while preserving all renderer state.
   */
  private runPass(
    renderer: THREE.WebGLRenderer,
    target: THREE.WebGLRenderTarget,
    renderFn: () => void,
    clearColor: ColorRgba = [0, 0, 0, 0],
  ): void {
    const prevRenderTarget = renderer.getRenderTarget();
    const prevAutoClear = renderer.autoClear;
    const prevClearColor = renderer.getClearColor(new THREE.Color());
    const prevClearAlpha = renderer.getClearAlpha();
    const prevViewport = renderer.getViewport(new THREE.Vector4());
    const prevScissor = renderer.getScissor(new THREE.Vector4());
    const prevScissorTest = renderer.getScissorTest();
    const prevCubeFace = renderer.getActiveCubeFace();
    const prevMipmapLevel = renderer.getActiveMipmapLevel();
    const currentViewport = renderer.getCurrentViewport(new THREE.Vector4());
    const context = renderer.getContext();
    const currentScissor = new THREE.Vector4().fromArray(context.getParameter(context.SCISSOR_BOX));
    const currentScissorTest = context.isEnabled(context.SCISSOR_TEST);
    const targetViewport = target.viewport.clone();
    const targetScissor = target.scissor.clone();
    const targetScissorTest = target.scissorTest;

    try {
      renderer.autoClear = false;
      target.viewport.set(0, 0, target.width, target.height);
      target.scissor.copy(target.viewport);
      target.scissorTest = false;
      renderer.setRenderTarget(target);
      renderer.setClearColor(new THREE.Color(clearColor[0], clearColor[1], clearColor[2]), clearColor[3]);
      renderer.clear(true, true, true);

      renderFn();
    } finally {
      target.viewport.copy(targetViewport);
      target.scissor.copy(targetScissor);
      target.scissorTest = targetScissorTest;
      renderer.autoClear = prevAutoClear;
      renderer.setClearColor(prevClearColor, prevClearAlpha);
      renderer.setViewport(prevViewport);
      renderer.setScissor(prevScissor);
      renderer.setScissorTest(prevScissorTest);
      if (prevRenderTarget) {
        const viewport = prevRenderTarget.viewport.clone();
        const scissor = prevRenderTarget.scissor.clone();
        const scissorTest = prevRenderTarget.scissorTest;
        prevRenderTarget.viewport.copy(currentViewport);
        prevRenderTarget.scissor.copy(currentScissor);
        prevRenderTarget.scissorTest = currentScissorTest;
        renderer.setRenderTarget(prevRenderTarget, prevCubeFace, prevMipmapLevel);
        prevRenderTarget.viewport.copy(viewport);
        prevRenderTarget.scissor.copy(scissor);
        prevRenderTarget.scissorTest = scissorTest;
      } else {
        renderer.setRenderTarget(null);
      }
    }
  }

  /**
   * Render a scene and camera into an owned render target.
   */
  renderToTarget(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Object3D,
    camera: THREE.Camera,
    target: THREE.WebGLRenderTarget,
  ): void {
    this.assertNotDisposed();
    this.assertOwnedTarget(target, 'target');
    this.runPass(renderer, target, () => {
      renderer.render(scene, camera);
    });
  }

  /**
   * Clear an owned render target to transparent black or specified color.
   */
  clear(
    renderer: THREE.WebGLRenderer,
    target: THREE.WebGLRenderTarget,
    color?: ColorRgba,
  ): void {
    this.assertNotDisposed();
    this.assertOwnedTarget(target, 'target');
    const clearColor: ColorRgba = color ? validateColorRgba(color) : [0, 0, 0, 0];

    this.runPass(renderer, target, () => {}, clearColor);
  }

  /**
   * Apply color adjustment effect to source texture.
   */
  applyColorAdjust(
    renderer: THREE.WebGLRenderer,
    source: THREE.Texture,
    target: THREE.WebGLRenderTarget,
    options?: ColorAdjustOptions,
  ): void {
    this.assertNotDisposed();
    this.assertOwnedTarget(target, 'target');
    if (source === target.texture) {
      throw new Error('Cannot read and write the same render target.');
    }
    if (this.currentPassCount + 1 > MAX_EXTRA_PASSES) {
      throw new RangeError(
        `Exceeded maximum ${MAX_EXTRA_PASSES} extra effect passes per sequence. Count: ${this.currentPassCount}`,
      );
    }
    this.currentPassCount += 1;

    const brightness = options?.brightness ?? 0.0;
    const contrast = options?.contrast ?? 1.0;
    const saturation = options?.saturation ?? 1.0;

    if (!Number.isFinite(brightness) || brightness < -1.0 || brightness > 1.0) {
      throw new RangeError('Brightness must be a finite number between -1 and 1.');
    }
    if (!Number.isFinite(contrast) || contrast < 0.0 || contrast > 10.0) {
      throw new RangeError('Contrast must be a finite number between 0 and 10.');
    }
    if (!Number.isFinite(saturation) || saturation < 0.0 || saturation > 10.0) {
      throw new RangeError('Saturation must be a finite number between 0 and 10.');
    }

    this.colorAdjustMaterial.uniforms['uMap']!.value = source;
    this.colorAdjustMaterial.uniforms['uBrightness']!.value = brightness;
    this.colorAdjustMaterial.uniforms['uContrast']!.value = contrast;
    this.colorAdjustMaterial.uniforms['uSaturation']!.value = saturation;
    this.colorAdjustMaterial.uniforms['uSourcePma']!.value =
      options?.sourcePremultiplied !== false ? 1.0 : 0.0;

    this.fullScreenQuad.material = this.colorAdjustMaterial;

    this.runPass(renderer, target, () => {
      renderer.render(this.fullScreenQuad, this.orthoCamera);
    });
  }

  /**
   * Apply separable two-pass Gaussian blur.
   * Uses explicit ping-pong across two owned render targets.
   * If a scratch target is passed, it must be an owned render target.
   * If no scratch target is passed, the compositor uses the other owned target.
   * When the source texture belongs to an owned render target, pass 2 overwrites it.
   * Returns the render target that holds the final blurred output.
   */
  applyBlur(renderer: THREE.WebGLRenderer, source: THREE.Texture,
    target: THREE.WebGLRenderTarget, options?: BlurOptions,
    scratchTarget?: THREE.WebGLRenderTarget): THREE.WebGLRenderTarget {
    this.assertNotDisposed(); this.assertOwnedTarget(target, 'target');
    const quality = options?.quality ?? 1;
    if (quality !== 1 && quality !== 2) throw new Error('Blur quality must be 1 or 2.');
    const passCount = quality * 2;
    if (this.currentPassCount + passCount > MAX_EXTRA_PASSES) throw new Error('Blur exceeds the four-pass limit.');
    const strength = options?.strength ?? 1;
    if (!Number.isFinite(strength) || strength < 0 || strength > 100) throw new Error('Blur strength is invalid.');
    const other = scratchTarget ?? [...this.allocatedTargets].find((entry) => entry !== target);
    if (!other || other === target) throw new Error('Blur needs two distinct owned targets.');
    this.assertOwnedTarget(other, 'scratchTarget');
    if (other.width !== target.width || other.height !== target.height) throw new Error('Blur target sizes differ.');
    let input = source;
    let output = target;
    let sourcePma = options?.sourcePremultiplied !== false;
    this.fullScreenQuad.material = this.blurMaterial;
    for (const direction of [[1, 0], [0, 1]]) {
      const initialStrength = strength / Math.sqrt(quality === 2 ? 1.25 : 1);
      for (let pass = 0; pass < quality; pass++) {
        output = input === target.texture ? other : target;
        this.blurMaterial.uniforms.uMap!.value = input;
        this.blurMaterial.uniforms.uResolution!.value.set(target.width, target.height);
        this.blurMaterial.uniforms.uDirection!.value.set(direction[0], direction[1]);
        this.blurMaterial.uniforms.uStrength!.value = initialStrength * (pass ? 0.5 : 1);
        this.blurMaterial.uniforms.uSourcePma!.value = sourcePma ? 1 : 0;
        this.runPass(renderer, output, () => renderer.render(this.fullScreenQuad, this.orthoCamera));
        this.currentPassCount++; input = output.texture; sourcePma = true;
      }
    }
    return output;
  }

  getStats(): { outputs: number; effectPasses: number; textureBytes: number } {
    return { outputs: this.allocatedTargets.size, effectPasses: this.currentPassCount,
      textureBytes: [...this.allocatedTargets].reduce((sum, target) => sum + target.width * target.height * 4, 0) };
  }

  applyOutline(
    renderer: THREE.WebGLRenderer,
    source: THREE.Texture,
    target: THREE.WebGLRenderTarget,
    options: OutlineOptions,
  ): void {
    this.assertNotDisposed();
    this.assertOwnedTarget(target, 'target');
    if (source === target.texture) {
      throw new Error('Cannot read and write the same render target.');
    }
    if (this.currentPassCount + 1 > MAX_EXTRA_PASSES) {
      throw new RangeError(
        `Exceeded maximum ${MAX_EXTRA_PASSES} extra effect passes per sequence. Count: ${this.currentPassCount}`,
      );
    }
    this.currentPassCount += 1;

    const validatedColor = validateColorRgba(options.outlineColor);
    const thickness = options.thickness ?? 1.0;
    if (!Number.isFinite(thickness) || thickness < 0 || thickness > 64) {
      throw new RangeError('Outline thickness must be a finite number between 0 and 64.');
    }

    this.outlineMaterial.uniforms['uMap']!.value = source;
    const colorUniform = this.outlineMaterial.uniforms['uOutlineColor']!.value as THREE.Vector4;
    colorUniform.set(
      validatedColor[0],
      validatedColor[1],
      validatedColor[2],
      validatedColor[3],
    );
    this.outlineMaterial.uniforms['uTexelSize']!.value.set(1 / target.width, 1 / target.height);
    this.outlineMaterial.uniforms['uThickness']!.value = thickness;
    this.outlineMaterial.uniforms['uSourcePma']!.value =
      options.sourcePremultiplied !== false ? 1.0 : 0.0;

    this.fullScreenQuad.material = this.outlineMaterial;

    this.runPass(renderer, target, () => {
      renderer.render(this.fullScreenQuad, this.orthoCamera);
    });
  }

  private assertNotDisposed(): void {
    if (this.disposed) {
      throw new Error('OffscreenCompositor is disposed.');
    }
  }

  /**
   * Idempotent release of all allocated render targets and shader materials.
   */
  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;

    for (const rt of this.allocatedTargets) {
      rt.dispose();
    }
    this.allocatedTargets.clear();
    this.activeOutputs = 0;

    this.fullScreenQuad.geometry.dispose();
    this.colorAdjustMaterial.dispose();
    this.blurMaterial.dispose();
    this.outlineMaterial.dispose();
  }
}
