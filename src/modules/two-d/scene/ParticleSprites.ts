import type { ParticleEmitter } from './ParticleEmitter';
import type { SpriteScene } from './SpriteScene';
import type { PresentationClock } from './types';

/** Put all 2D emitters in the shared sprite order and batch. */
export class ParticleSprites {
  private readonly ids: string[] = [];
  private readonly frameWidth: number;
  private disposed = false;

  constructor(private readonly scene: SpriteScene, private readonly emitter: ParticleEmitter,
    options: { id: string; atlasId: string; frameId: string; layerRank?: number; explicitOrder?: number }) {
    const frame = scene.getFrame(options.atlasId, options.frameId);
    if (!frame || !options.id) throw new Error('A particle binding requires an atlas frame and ID.');
    this.frameWidth = frame.sourceSizePx.width / scene.pixelsPerMetre;
    try {
      for (let i = 0; i < emitter.capacity; i++) {
        const id = `${options.id}:${i}`;
        scene.registerSprite(id, { profileId: 'flat-2d', interactive: false, atlasId: options.atlasId,
          frameId: options.frameId, layerRank: options.layerRank ?? 4, explicitOrder: options.explicitOrder ?? 0, visible: false });
        this.ids.push(id);
      }
    } catch (error) { this.dispose(); throw error; }
  }

  update(clock: PresentationClock): void {
    if (this.disposed) return;
    this.emitter.update(clock);
    const particles = this.emitter.getParticles();
    for (let i = 0; i < this.ids.length; i++) {
      const particle = particles[i];
      if (!particle) { this.scene.updateNode(this.ids[i]!, { visible: false }); continue; }
      const scale = particle.size * particle.scale / this.frameWidth;
      this.scene.updateNode(this.ids[i]!, { visible: true, x: particle.x, y: particle.y,
        rotation: particle.rotation, scaleX: scale, scaleY: scale,
        tint: [particle.r, particle.g, particle.b, particle.a] });
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const id of this.ids) this.scene.removeNode(id);
    this.ids.length = 0;
  }
}
