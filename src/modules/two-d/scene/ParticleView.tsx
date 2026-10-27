/**
 * React Three Fiber view for cosmetic particle emitter.
 * Renders particles with one instanced mesh and camera-facing billboard quads.
 * Uses a flat premultiplied alpha (PMA) profile.
 */

import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { applyBlendMode, getWhiteFallbackTexture } from './materials';
import type { ParticleEmitter } from './ParticleEmitter';
import type { BlendMode, PresentationClock } from './types';

export interface ParticleMaterialOptions {
  texture?: THREE.Texture;
  blendMode?: BlendMode;
  depthTest?: boolean;
}

const PARTICLE_VERTEX_SHADER = /* glsl */ `
attribute vec4 aInstanceColor;
varying vec2 vUv;
varying vec4 vColor;

void main() {
  vUv = uv;
  vColor = aInstanceColor;

  #ifdef USE_INSTANCING
    // Transform particle origin into camera view space
    vec4 mvCenter = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);

    // Compute scale values from instance matrix columns
    float scaleX = length(vec3(instanceMatrix[0][0], instanceMatrix[0][1], instanceMatrix[0][2]));
    float scaleY = length(vec3(instanceMatrix[1][0], instanceMatrix[1][1], instanceMatrix[1][2]));

    // Compute 2D roll angle around the camera view axis
    float roll = (scaleX > 0.0001) ? atan(instanceMatrix[0][1], instanceMatrix[0][0]) : 0.0;
    float c = cos(roll);
    float s = sin(roll);

    // Rotate quad vertex in camera view space
    vec2 localPos = position.xy * vec2(scaleX, scaleY);
    vec2 billboardOffset = vec2(
      localPos.x * c - localPos.y * s,
      localPos.x * s + localPos.y * c
    );

    // Add offset directly to view space position
    mvCenter.xy += billboardOffset;
    gl_Position = projectionMatrix * mvCenter;
  #else
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #endif
}
`;

const PARTICLE_FRAGMENT_SHADER = /* glsl */ `
precision highp float;
uniform sampler2D uMap;
uniform float uSourcePma;
varying vec2 vUv;
varying vec4 vColor;

void main() {
  vec4 tex = texture2D(uMap, vUv);
  // Encoded premultiplied alpha (PMA) pipeline:
  // vColor is encoded PMA: rgb is already multiplied by alpha.
  vec3 rgb = tex.rgb * vColor.rgb;
  float alpha = tex.a * vColor.a;
  gl_FragColor = vec4(rgb * mix(tex.a, 1.0, uSourcePma), alpha);
}
`;

export class ParticleMaterial extends THREE.ShaderMaterial {
  readonly profileId = 'flat-2d';

  constructor(options: ParticleMaterialOptions = {}) {
    const tex = options.texture ?? getWhiteFallbackTexture();
    super({
      uniforms: {
        uMap: { value: tex },
        uSourcePma: { value: tex.premultiplyAlpha ? 1 : 0 },
      },
      vertexShader: PARTICLE_VERTEX_SHADER,
      fragmentShader: PARTICLE_FRAGMENT_SHADER,
      transparent: true,
      depthTest: options.depthTest ?? false,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
    });

    applyBlendMode(this, options.blendMode ?? 'normal');
  }

  setTexture(texture: THREE.Texture): void {
    const mapUniform = this.uniforms['uMap'] as { value: THREE.Texture } | undefined;
    if (mapUniform) {
      mapUniform.value = texture;
      this.uniforms.uSourcePma!.value = texture.premultiplyAlpha ? 1 : 0;
    }
  }
}

export interface ParticleViewProps {
  emitter: ParticleEmitter;
  clock?: PresentationClock;
  texture?: THREE.Texture;
  blendMode?: BlendMode;
  renderOrder?: number;
  depthTest?: boolean;
  visible?: boolean;
}

const _dummy = new THREE.Object3D();

export function ParticleView({
  emitter,
  clock,
  texture,
  blendMode = 'normal',
  renderOrder = 0,
  depthTest = false,
  visible = true,
}: ParticleViewProps): React.JSX.Element {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.InstancedMesh | null>(null);
  const colorAttrRef = useRef<THREE.InstancedBufferAttribute | null>(null);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) {
      return;
    }

    const capacity = emitter.capacity;
    const geometry = new THREE.PlaneGeometry(1, 1);
    const colorArray = new Float32Array(capacity * 4);
    const colorAttr = new THREE.InstancedBufferAttribute(colorArray, 4);
    colorAttr.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('aInstanceColor', colorAttr);

    const material = new ParticleMaterial({ texture, blendMode, depthTest });
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.frustumCulled = false;
    mesh.renderOrder = renderOrder;
    mesh.visible = visible;
    mesh.count = 0;

    group.add(mesh);
    meshRef.current = mesh;
    colorAttrRef.current = colorAttr;

    return () => {
      group.remove(mesh);
      geometry.dispose();
      material.dispose();
      meshRef.current = null;
      colorAttrRef.current = null;
    };
  }, [emitter.capacity, depthTest, texture, blendMode, renderOrder, visible]);

  useFrame(() => {
    if (clock) {
      emitter.update(clock);
    }

    const mesh = meshRef.current;
    const colorAttr = colorAttrRef.current;
    if (!mesh || !colorAttr || !mesh.visible) {
      return;
    }

    const activeCount = emitter.activeCount;
    mesh.count = activeCount;
    if (activeCount === 0) {
      return;
    }

    const particles = emitter.getParticles();
    const colorArray = colorAttr.array as Float32Array;

    for (let i = 0; i < activeCount; i += 1) {
      const p = particles[i]!;

      _dummy.position.set(p.x, p.y, p.z);
      _dummy.rotation.set(0, 0, p.rotation);
      const s = p.size * p.scale;
      _dummy.scale.set(s, s, 1);
      _dummy.updateMatrix();
      mesh.setMatrixAt(i, _dummy.matrix);

      const offset = i * 4;
      colorArray[offset + 0] = p.r * p.a;
      colorArray[offset + 1] = p.g * p.a;
      colorArray[offset + 2] = p.b * p.a;
      colorArray[offset + 3] = p.a;
    }

    mesh.instanceMatrix.needsUpdate = true;
    colorAttr.needsUpdate = true;
  });

  return <group ref={groupRef} />;
}

export default ParticleView;
