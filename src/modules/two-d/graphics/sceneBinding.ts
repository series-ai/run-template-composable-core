import * as THREE from 'three';
import type { SpriteOptions, SpriteScene } from '@modules/two-d/scene/SpriteScene';
import type { ForeignRenderableAdapter } from './types';

export function bindForeignToScene(scene: SpriteScene, adapter: ForeignRenderableAdapter,
  options: SpriteOptions): () => void {
  const originals = new Map<THREE.ShaderMaterial, {
    color?: THREE.Vector3; alpha?: number; opacity?: number; tint?: THREE.Vector4;
  }>();
  adapter.object.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    if (!(object.material instanceof THREE.ShaderMaterial)) throw new Error('Foreign layers require a tested flat shader.');
    const material = object.material; const uniforms = material.uniforms;
    if (!material.transparent || material.depthTest || material.depthWrite || material.toneMapped) throw new Error('Foreign layer render state is incompatible.');
    originals.set(material, { color: uniforms.uColor?.value?.clone(), alpha: uniforms.uAlpha?.value,
      opacity: uniforms.uOpacity?.value, tint: uniforms.uTint?.value?.clone() });
    object.raycast = () => {};
  });
  scene.registerForeign(adapter.id, options, {
    profileId: adapter.profileId,
    pick: (x, y) => adapter.pick(x, y),
    sync: ({ matrix: [a, b, c, d, tx, ty], visible, opacity, tint, renderOrder }) => {
      adapter.object.visible = visible;
      adapter.object.matrixAutoUpdate = false;
      adapter.object.matrix.set(a, c, 0, tx, b, d, 0, ty, 0, 0, 1, 0, 0, 0, 0, 1);
      adapter.object.updateMatrixWorld(true); adapter.setRenderOrder(renderOrder);
      for (const [material, original] of originals) {
        if (original.color) material.uniforms.uColor!.value.set(original.color.x * tint[0], original.color.y * tint[1], original.color.z * tint[2]);
        if (original.alpha !== undefined) material.uniforms.uAlpha!.value = original.alpha * tint[3];
        if (original.opacity !== undefined) material.uniforms.uOpacity!.value = original.opacity * opacity;
        if (original.tint) material.uniforms.uTint!.value.set(original.tint.x * tint[0], original.tint.y * tint[1], original.tint.z * tint[2], original.tint.w * tint[3] * opacity);
      }
    },
  });
  return () => { scene.removeNode(adapter.id); adapter.object.visible = false; };
}
