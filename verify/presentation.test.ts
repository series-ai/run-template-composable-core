import assert from 'node:assert/strict';
import { test } from 'node:test';

const source = new URL('../src/modules/two-d/scene/', import.meta.url);
const { ParticleEmitter } = await import(new URL('ParticleEmitter.ts', source).href);
const { ParticleSprites } = await import(new URL('ParticleSprites.ts', source).href);
const { SpriteScene } = await import(new URL('SpriteScene.ts', source).href);
const { buildMultiTextureBatchRuns } = await import(new URL('batchRenderer.ts', source).href);
const { resolveAnimationFrame } = await import(new URL('animation.ts', source).href);
const runtimeSource = new URL('../src/modules/runtime/game-application/', import.meta.url);
const { InputManager } = await import(new URL('input.ts', runtimeSource).href);

test('ordered input edges retain duplicate commands through a checkpoint', () => {
  const input = new InputManager();
  for (const action of ['jump', 'action', 'jump']) input.press(action);
  assert.deepEqual(input.pollTick(false).pressedActions, []);
  const restored = new InputManager(); restored.restoreState(input.captureState());
  assert.deepEqual(restored.pollTick(true).pressedActions, ['jump', 'action', 'jump']);
  assert.deepEqual(restored.pollTick(false).pressedActions, []);
  assert.deepEqual(restored.pollTick(true).pressedActions, []);
});

test('cosmetic clocks freeze, deduplicate, reset epochs, and expire after a long gap', () => {
  const emitter = new ParticleEmitter({ maxParticles: 8, seed: 42 });
  const clock = { epoch: 1, activeSeconds: 0, deltaSeconds: 0, suspended: false };
  emitter.update(clock);
  const burst = { count: 20, lifetime: 1, speed: 2, colors: ['#ffffff'], eventKey: 'event-1' };
  assert.equal(emitter.emitBurst([0, 0, 0], burst), 8);
  assert.equal(emitter.emitBurst([0, 0], burst), 0);
  clock.activeSeconds = 0.2; emitter.update(clock);
  const positions = structuredClone(emitter.getParticles()); emitter.update(clock);
  assert.deepEqual(emitter.getParticles(), positions);
  clock.suspended = true; emitter.update(clock); assert.deepEqual(emitter.getParticles(), positions);
  clock.suspended = false; clock.activeSeconds = 10; emitter.update(clock);
  assert.equal(emitter.activeCount, 0, 'A long gap must expire the full lifetime.');
  assert.equal(emitter.emitBurst([0, 0], { ...burst, eventKey: 'event-2' }), 8);
  clock.epoch = 2; clock.activeSeconds = 0; emitter.update(clock); assert.equal(emitter.activeCount, 0);
  emitter.setReducedMotion(true); assert.equal(emitter.emitBurst([0, 0], burst), 0);
  assert.throws(() => new ParticleEmitter({ maxParticles: Infinity }));
  assert.throws(() => emitter.emitBurst([NaN, 0], burst));
});

test('seeded particle birth is independent of other emitters', () => {
  const first = new ParticleEmitter({ seed: 42 }); const second = new ParticleEmitter({ seed: 42 });
  const burst = { count: 8, lifetime: 1, speed: 2, colors: ['#ffffff'] };
  first.emitBurst([0, 0], burst); second.emitBurst([0, 0], burst);
  assert.deepEqual(first.getParticles(), second.getParticles());
});

test('2D character effects share one ordered sprite batch and cannot intercept picking', () => {
  const scene = new SpriteScene();
  scene.registerAtlas({ atlasId: 'a', imagePath: 'a', pixelWidth: 32, pixelHeight: 32, frames: {
    white: { id: 'white', atlasId: 'a', rectPx: { x: 0, y: 0, width: 32, height: 32 },
      sourceSizePx: { width: 32, height: 32 }, trimmedRectPx: { x: 0, y: 0, width: 32, height: 32 },
      rotation: 'none', pivotNormalized: { x: 0.5, y: 0.5 } },
  } });
  scene.registerSprite('player', { profileId: 'flat-2d', atlasId: 'a', frameId: 'white' });
  const emitters = Array.from({ length: 10 }, (_, i) => new ParticleEmitter({ maxParticles: 100, seed: i }));
  const bindings = emitters.map((emitter, i) => new ParticleSprites(scene, emitter, { id: `actor-${i}`, atlasId: 'a', frameId: 'white' }));
  const clock = { epoch: 1, activeSeconds: 0, deltaSeconds: 0, suspended: false };
  for (let i = 0; i < emitters.length; i++) {
    emitters[i]!.update(clock);
    emitters[i]!.emitBurst([0, 0], { count: 100, lifetime: 1, speed: 0, size: 0.1, colors: ['#ffffff'] });
    bindings[i]!.update(clock);
  }
  const nodes = scene.queryVisibleNodes();
  const instances = nodes.filter((node) => node.type === 'sprite').map((node, order) => ({
    id: node.id, atlasId: 'a', atlasPixelWidth: 32, atlasPixelHeight: 32, frame: scene.getFrame('a', 'white')!,
    worldMatrix: node.worldMatrix, quadMetrics: { localLeft: -0.16, localBottom: -0.16, localWidth: 0.32, localHeight: 0.32 },
    tint: node.worldTint, opacity: node.worldOpacity, blendMode: node.blendMode, renderOrder: order,
  }));
  const runs = buildMultiTextureBatchRuns(instances);
  assert.equal(instances.length, 1001); assert.equal(runs.length, 1);
  assert.equal(scene.pick(0, 0)?.nodeId, 'player');
  bindings.forEach((binding) => { binding.dispose(); binding.dispose(); });
  assert.equal(scene.queryVisibleNodes().length, 1);
});

test('independent sprite clips resolve their own phase without a shared frame counter', () => {
  const clip = { type: 'presentation', id: 'walk', playback: 'loop', frames: [
    { frameId: 'a', durationMs: 100 }, { frameId: 'b', durationMs: 300 },
  ] };
  assert.equal(resolveAnimationFrame(clip, 50).frameId, 'a');
  assert.equal(resolveAnimationFrame(clip, 250).frameId, 'b');
  assert.equal(resolveAnimationFrame(clip, 450).frameId, 'a');
});
