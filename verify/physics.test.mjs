import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as p2 from '@series-inc/rundot-syncplay/physics/2d';
import * as p3 from '@series-inc/rundot-syncplay/physics/3d';

await p2.initPhysics2D();
await p3.initPhysics3D();

test('2D WASM prevents ground penetration and replays the same checkpoint', () => {
  const create = () => p2.createPhysicsWorld2D({ tickRate: 60,
    initialGravity: { x: p2.metersPerSecondSquared(0), y: p2.metersPerSecondSquared(-9.8) },
    capacity: { bodies: 16, joints: 4, checkpoints: 4 } });
  const world = create(); const restored = create();
  try {
    const handles = world.edit((edit) => ({
      floor: edit.createBody({ kind: 'static', shape: { type: 'box', halfX: p2.meters(10), halfY: p2.meters(0.5) }, y: p2.meters(-0.5) }),
      ball: edit.createBody({ shape: { type: 'circle', radius: p2.meters(0.5) }, y: p2.meters(3), vx: p2.metersPerSecond(1) }),
    })).created;
    const id = world.readBody(handles.ball).id;
    for (let tick = 0; tick < 40; tick++) world.step();
    const checkpoint = world.captureCheckpoint();
    const bytes = world.serializeCheckpoint(checkpoint); world.releaseCheckpoint(checkpoint);
    restored.restore(bytes);
    assert.equal(restored.digest(), world.digest());
    for (let tick = 0; tick < 120; tick++) {
      world.step(); restored.step();
      assert.equal(restored.digest(), world.digest(), `2D replay diverges at tick ${tick}`);
    }
    const body = restored.readBody(restored.resolveBody(id));
    assert.ok(body.y >= 0.48 && body.y < 0.55, `2D ground height ${body.y}`);
    assert.ok(Math.abs(body.vy) < 0.05, '2D ball must rest on the ground');
    assert.equal(world.info().backend, 'cpp-wasm');
  } finally { world.dispose(); restored.dispose(); }
});

test('3D WASM prevents ground penetration and replays the same checkpoint', () => {
  const create = () => p3.createPhysicsWorld3D({ tickRate: 60,
    initialGravity: { x: p3.metersPerSecondSquared(0), y: p3.metersPerSecondSquared(-9.8), z: p3.metersPerSecondSquared(0) },
    capacity: { bodies: 16, joints: 4, checkpoints: 4 } });
  const world = create(); const restored = create();
  try {
    const handles = world.edit((edit) => ({
      floor: edit.createBody({ kind: 'static', shape: { type: 'box', halfX: p3.meters(10), halfY: p3.meters(0.5), halfZ: p3.meters(10) }, position: { x: p3.meters(0), y: p3.meters(-0.5), z: p3.meters(0) } }),
      box: edit.createBody({ mass: p3.kilograms(1), shape: { type: 'box', halfX: p3.meters(0.5), halfY: p3.meters(0.5), halfZ: p3.meters(0.5) }, position: { x: p3.meters(0), y: p3.meters(3), z: p3.meters(0) } }),
    })).created;
    const id = world.readBody(handles.box).id;
    assert.equal(typeof id, 'bigint');
    for (let tick = 0; tick < 40; tick++) world.step();
    const checkpoint = world.captureCheckpoint();
    const bytes = world.serializeCheckpoint(checkpoint); world.releaseCheckpoint(checkpoint);
    restored.restore(bytes); assert.equal(restored.digest(), world.digest());
    for (let tick = 0; tick < 120; tick++) {
      world.step(); restored.step();
      assert.equal(restored.digest(), world.digest(), `3D replay diverges at tick ${tick}`);
    }
    const body = restored.readBody(restored.resolveBody(id));
    assert.ok(body.position.y >= 0.45 && body.position.y < 0.6, `3D ground height ${body.position.y}`);
    assert.ok(Math.abs(body.linearVelocity.y) < 0.05, '3D box must rest on the ground');
    assert.equal(world.info().backend, 'cpp-wasm');
  } finally { world.dispose(); restored.dispose(); }
});

test('2D public joints keep a body near the fixed world anchor', () => {
  const world = p2.createPhysicsWorld2D({ tickRate: 60, capacity: { bodies: 8, joints: 4 } });
  try {
    const body = world.edit((edit) => edit.createBody({ shape: { type: 'circle', radius: p2.meters(0.25) }, x: p2.meters(2) })).created;
    world.edit((edit) => edit.createJoint({ type: 'distance', a: { kind: 'world', x: p2.meters(0), y: p2.meters(0) }, b: body, restLength: p2.meters(2) }));
    for (let tick = 0; tick < 240; tick++) world.step();
    const state = world.readBody(body);
    assert.ok(Math.abs(Math.hypot(state.x, state.y) - 2) < 0.03);
    assert.equal(world.info().jointCount, 1);
  } finally { world.dispose(); }
});
