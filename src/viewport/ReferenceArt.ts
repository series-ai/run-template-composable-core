import * as THREE from 'three';
import { SpriteScene } from '../modules/two-d/scene/SpriteScene';
import type { AtlasManifest } from '../modules/two-d/scene/types';
import { AtlasTextures } from '../modules/two-d/scene/atlasTextures';

export class ReferenceArt {
  readonly textures = new Map<string, THREE.Texture>();
  readonly atlas: AtlasManifest;
  private readonly textureOwner = new AtlasTextures();
  constructor() {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 128;
    const context = canvas.getContext('2d'); if (!context) throw new Error('Canvas is unavailable.');
    const colors = ['#72d2c3', '#ffd36c', '#519b78', '#d08c60'];
    for (let i = 0; i < 4; i++) {
      const x = i * 128; context.save(); context.translate(x, 0);
      context.fillStyle = colors[i];
      if (i === 0) {
        context.beginPath(); context.roundRect(10, 10, 108, 108, 35); context.fill();
        context.fillStyle = '#24414b'; context.beginPath(); context.arc(44, 55, 7, 0, Math.PI * 2); context.arc(84, 55, 7, 0, Math.PI * 2); context.fill();
        context.lineWidth = 5; context.strokeStyle = '#24414b'; context.beginPath(); context.arc(64, 75, 16, 0.1, Math.PI - 0.1); context.stroke();
      } else if (i === 1) {
        context.beginPath();
        for (let p = 0; p < 10; p++) { const angle = -Math.PI / 2 + p * Math.PI / 5; const r = p % 2 ? 24 : 53;
          const px = 64 + Math.cos(angle) * r; const py = 64 + Math.sin(angle) * r; if (!p) context.moveTo(px, py); else context.lineTo(px, py); }
        context.closePath(); context.fill();
      } else {
        context.beginPath(); context.roundRect(2, 2, 124, 124, 12); context.fill();
        context.fillStyle = i === 2 ? '#81c68c' : '#e7b786'; context.fillRect(8, 8, 112, 20);
        context.fillStyle = i === 2 ? '#3f8062' : '#966044'; context.fillRect(18, 55, 28, 9); context.fillRect(73, 85, 30, 9);
      }
      context.restore();
    }
    const texture = this.textureOwner.acquire('garden', canvas, canvas.width, canvas.height, 'linear').texture;
    this.textures.set('garden', texture);
    const names = ['player', 'star', 'grass', 'box'];
    this.atlas = { atlasId: 'garden', imagePath: 'generated:garden', pixelWidth: 512, pixelHeight: 128,
      frames: Object.fromEntries(names.map((id, i) => [id, { id, atlasId: 'garden', rectPx: { x: i * 128, y: 0, width: 128, height: 128 },
        sourceSizePx: { width: 128, height: 128 }, trimmedRectPx: { x: 0, y: 0, width: 128, height: 128 },
        pivotNormalized: { x: 0.5, y: 0.5 }, rotation: 'none' }])) };
  }
  createScene(): SpriteScene {
    const scene = new SpriteScene(); scene.registerAtlas(this.atlas); return scene;
  }
  dispose(): void { this.textureOwner.dispose(); this.textures.clear(); }
}
