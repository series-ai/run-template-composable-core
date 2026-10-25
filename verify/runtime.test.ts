import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GameApplication, StorageLike } from '../src/modules/runtime/game-application/types';
import * as p2 from '@series-inc/rundot-syncplay/physics/2d';
import * as p3 from '@series-inc/rundot-syncplay/physics/3d';

const source = new URL('../src/modules/runtime/game-application/', import.meta.url);
const { createGameApplication } = await import(new URL('createGameApplication.ts', source).href);
const { PersistenceJournal, computeChecksum } = await import(new URL('journal.ts', source).href);

class Storage implements StorageLike {
  readonly values = new Map<string, string>();
  failWrite = false;
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void {
    this.values.set(key, this.failWrite ? value.slice(0, 12) : value);
    if (this.failWrite) throw new Error('Interrupted write');
  }
  removeItem(key: string): void { this.values.delete(key); }
}
function tick(app: GameApplication, count: number): void {
  for (let i = 0; i < count; i++) app.pump(1 / 60);
}

test('dimension saves retain both exact-runtime rounds', async () => {
  const storage = new Storage();
  const expected = new Map<string, { tick: number; digest: string }>();
  for (const dimension of ['2d', '3d'] as const) {
    const app = await createGameApplication({ dimension, storage });
    try {
      await app.restore(); app.start(); tick(app, 90); await app.save();
      expected.set(dimension, { tick: app.getPresentation().currentTick, digest: app.getPhysicsDigest() });
    } finally { app.dispose(); }
  }
  for (const dimension of ['2d', '3d'] as const) {
    const app = await createGameApplication({ dimension, storage });
    try {
      await app.restore();
      assert.equal(app.getPresentation().currentTick, expected.get(dimension)!.tick);
      assert.equal(app.getPhysicsDigest(), expected.get(dimension)!.digest);
    } finally { app.dispose(); }
  }
});

test('a restart cannot discard the best score before the next save', async () => {
  const storage = new Storage(); const app = await createGameApplication({ dimension: '2d', storage });
  app.start(); tick(app, 4); assert.equal(app.getView().bestScore, 100);
  app.restart(); await app.save(); app.dispose();
  const restored = await createGameApplication({ dimension: '2d', storage });
  try { await restored.restore(); assert.equal(restored.getView().bestScore, 100); }
  finally { restored.dispose(); }
});

for (const blockedKey of ['progress_slot_a', 'round_resume_2d']) {
  test(`dispose cancels restore while ${blockedKey} is pending`, async () => {
    const values = new Storage(); const original = await createGameApplication({ dimension: '2d', storage: values });
    original.start(); tick(original, 30); await original.save(); original.dispose();
    let release!: () => void; let pending!: () => void; let blocking = false;
    const waiting = new Promise<void>((resolve) => { pending = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const storage: StorageLike = { setItem: (key, value) => values.setItem(key, value),
      getItem: async (key) => { if (blocking && key.endsWith(blockedKey)) { pending(); await gate; } return values.getItem(key); } };
    const app = await createGameApplication({ dimension: '2d', storage });
    blocking = true;
    const restore = app.restore(); await waiting; app.dispose(); release(); await restore;
    assert.throws(() => app.getPhysicsDigest(), /disposed/i);
    assert.equal(app.getRoundCheckpoint(), null);
  });
}

test('two independent owners can initialize at the same time', async () => {
  const apps = await Promise.all([createGameApplication({ dimension: '2d' }), createGameApplication({ dimension: '3d' })]);
  try { assert.deepEqual(apps.map((app) => app.getView().dimension), ['2d', '3d']); }
  finally { apps.forEach((app) => app.dispose()); }
});

test('pause, restart, and host suspension keep one authority', async () => {
  const app = await createGameApplication({ dimension: '2d' });
  try {
    app.start(); app.pump(0); tick(app, 90);
    app.input.setHeld('right', true); app.pause();
    const before = app.getPresentation(); app.pump(5);
    assert.equal(app.getView().status, 'paused'); assert.equal(app.getPresentation().currentTick, before.currentTick);
    app.resume(); app.pump(5); assert.equal(app.getPresentation().currentTick, before.currentTick);
    tick(app, 3);
    const player = app.getPresentation().poses.find((pair) => pair.entityId === 'player');
    assert.ok(player && 'xMeters' in player.current); assert.ok(Math.abs(player.current.xMeters) < 0.01, 'Pause must release held movement');
    app.pause(); app.restart(); app.start(); app.pump(0); tick(app, 1);
    assert.equal(app.getPresentation().currentTick, 1, 'Restart must clear user pause');
    app.setSuspended('hidden', true); app.restart(); app.start(); tick(app, 5);
    assert.equal(app.getPresentation().currentTick, 0, 'Restart must retain host suspension');
    app.setSuspended('hidden', false); app.pump(5); tick(app, 1);
    assert.equal(app.getPresentation().currentTick, 1);
  } finally { app.dispose(); app.dispose(); }
});

test('a press survives a zero-tick pump and cannot repeat across catch-up ticks', async () => {
  const app = await createGameApplication({ dimension: '2d' });
  try {
    app.start(); app.pump(0); tick(app, 120);
    const frame = app.getPresentation(); assert.equal(frame.dimension, '2d');
    const before = frame.poses.find((p) => p.entityId === 'player')!;
    app.input.press('jump'); app.pump(0.001);
    assert.equal(app.getPresentation().currentTick, frame.currentTick);
    tick(app, 2);
    const after = app.getPresentation(); assert.equal(after.dimension, '2d');
    assert.ok(after.poses.find((p) => p.entityId === 'player')!.current.yMeters > before.current.yMeters + 0.1);
    app.pump(1);
    assert.ok(app.getStats().maxTicksInSinglePump <= 8);
    assert.ok(app.getStats().droppedTicks > 0);
    assert.ok(app.getPresentation().alpha >= 0 && app.getPresentation().alpha < 1);
  } finally { app.dispose(); }
});

for (const dimension of ['2d', '3d'] as const) {
  test(`${dimension} checkpoint replays 120 ticks with the captured input and game state`, async () => {
    const app = await createGameApplication({ dimension });
    try {
      app.start(); app.pump(0); tick(app, 90); app.input.setHeld('right', true); app.input.press('jump'); tick(app, 8);
      const checkpoint = app.getRoundCheckpoint()!;
      tick(app, 120); const expected = app.getRoundCheckpoint()!;
      app.input.setHeld('right', false); app.restoreRoundCheckpoint(checkpoint); app.pump(0); tick(app, 120);
      const actual = app.getRoundCheckpoint()!;
      assert.equal(actual.tick, expected.tick);
      assert.deepEqual(actual.canonicalEntityState, expected.canonicalEntityState);
      assert.deepEqual(actual.bodyIdMap, expected.bodyIdMap);
      await (dimension === '2d' ? p2.initPhysics2D() : p3.initPhysics3D());
      const world = dimension === '2d'
        ? p2.createPhysicsWorld2D({ capacity: { bodies: 64, joints: 16, contacts: 128, checkpoints: 4 } })
        : p3.createPhysicsWorld3D({ capacity: { bodies: 64, joints: 16, checkpoints: 4 } });
      try {
        world.restore(new Uint8Array(Buffer.from(expected.physicsCheckpointBase64, 'base64'))); const digest = world.digest();
        world.restore(new Uint8Array(Buffer.from(actual.physicsCheckpointBase64, 'base64'))); assert.equal(world.digest(), digest);
      } finally { world.dispose(); }
    } finally { app.dispose(); }
  });
}

test('an interrupted progress write retains the previous valid generation', async () => {
  const storage = new Storage(); const journal = new PersistenceJournal('journal-proof', storage);
  const first = await journal.saveProgress({ ...journal.createDefaultProgress(), bestScores: { '2d': 200 } });
  storage.failWrite = true;
  await assert.rejects(journal.saveProgress({ ...first, bestScores: { '2d': 900 } }));
  storage.failWrite = false;
  assert.equal((await journal.loadProgress()).bestScores['2d'], 200);
});

test('a future progress schema remains unchanged when this runtime tries to save', async () => {
  const storage = new Storage(); const journal = new PersistenceJournal('future-proof', storage);
  const future = { ...journal.createDefaultProgress(), schemaVersion: 999, generation: 50, newFact: 'retain' };
  const raw = JSON.stringify({ generation: 50, checksum: computeChecksum(JSON.stringify(future)), data: future });
  storage.setItem('future-proof_progress_slot_a', raw);
  await assert.rejects(journal.saveProgress({ ...future, bestScores: { '2d': 0 } }));
  assert.equal(storage.getItem('future-proof_progress_slot_a'), raw);
  assert.equal(storage.values.size, 1);
});

test('round recovery keeps durable progress and settings', async () => {
  const storage = new Storage(); let app = await createGameApplication({ dimension: '2d', storage, gameId: 'restore-proof' });
  try {
    app.start(); app.pump(0); tick(app, 120); const best = app.getView().bestScore; assert.ok(best > 0);
    app.setSettings({ sound: false, reducedMotion: true }); await app.save(); app.dispose();
    const resume = [...storage.values.keys()].find((key) => key.includes('round_resume'))!;
    assert.ok(resume); storage.setItem(resume, '{corrupt');
    app = await createGameApplication({ dimension: '2d', storage, gameId: 'restore-proof' }); await app.restore();
    assert.equal(app.getView().bestScore, best);
    assert.deepEqual(app.getView().settings, { sound: false, reducedMotion: true });
    assert.notEqual(app.getView().status, 'error');
  } finally { app.dispose(); }
});

test('invalid checkpoint data cannot mutate the live world', async () => {
  const app = await createGameApplication({ dimension: '3d' });
  try {
    app.start(); app.pump(0); tick(app, 30);
    const checkpoint = app.getRoundCheckpoint()!; const before = app.getPhysicsDigest();
    const bad = { ...checkpoint, canonicalEntityState: { ...checkpoint.canonicalEntityState, secondsRemaining: NaN } };
    assert.throws(() => app.restoreRoundCheckpoint(bad)); assert.equal(app.getPhysicsDigest(), before);
    assert.throws(() => app.restoreRoundCheckpoint({ ...checkpoint, physicsDigest: '123' }));
    assert.equal(app.getPhysicsDigest(), before); tick(app, 1); assert.equal(app.getPresentation().currentTick, 31);
  } finally { app.dispose(); }
});

test('abort after startup closes the real WASM world', async () => {
  const controller = new AbortController();
  const app = await createGameApplication({ dimension: '2d', signal: controller.signal });
  controller.abort(); assert.equal(app.getRoundCheckpoint(), null);
  assert.throws(() => app.getPhysicsDigest()); app.dispose();
});

test('a failed save can recover and a captured save can finish after disposal', async () => {
  const storage = new Storage(); const app = await createGameApplication({ dimension: '2d', storage, gameId: 'write-proof' });
  app.start(); app.pump(0); tick(app, 60); storage.failWrite = true;
  await assert.rejects(app.save()); storage.failWrite = false;
  const saved = app.save(); app.dispose(); await saved;
  const restored = await createGameApplication({ dimension: '2d', storage, gameId: 'write-proof' });
  try { assert.ok(restored.getView().bestScore > 0); }
  finally { restored.dispose(); }
});

test('the 2D reference round can finish through normal movement and jump input', async () => {
  const app = await createGameApplication({ dimension: '2d' });
  try {
    app.start(); app.pump(0); tick(app, 90); app.input.setHeld('right', true);
    for (let frame = 0; frame < 600 && app.getView().status !== 'results'; frame++) {
      if (frame % 60 === 0) app.input.press('jump');
      tick(app, 1);
    }
    assert.equal(app.getView().status, 'results'); assert.equal(app.getView().score, 500);
  } finally { app.dispose(); }
});

test('the 3D reference round can finish through normal directional input', async () => {
  const app = await createGameApplication({ dimension: '3d' });
  try {
    app.start(); app.pump(0); tick(app, 90);
    for (const [x, z] of [[4, 4], [-4, 4], [4, -4], [-4, -4], [0, 6]]) {
      for (let frame = 0; frame < 300; frame++) {
        const state = app.getPresentation(); assert.equal(state.dimension, '3d');
        const player = state.poses.find((pose) => pose.entityId === 'player')!.current.positionMeters;
        const dx = x - player[0]; const dz = z - player[2];
        app.input.setHeld('right', dx > 0.12); app.input.setHeld('left', dx < -0.12);
        app.input.setHeld('down', dz > 0.12); app.input.setHeld('up', dz < -0.12); tick(app, 1);
        if (Math.abs(dx) < 0.15 && Math.abs(dz) < 0.15) break;
      }
    }
    assert.equal(app.getView().status, 'results'); assert.equal(app.getView().score, 500);
  } finally { app.dispose(); }
});
