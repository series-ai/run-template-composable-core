import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as p2 from '@series-inc/rundot-syncplay/physics/2d';

const source = new URL('../src/modules/two-d/scene/', import.meta.url);
const { TileLayer } = await import(new URL('TileLayer.ts', source).href);
const {
  buildTileContours,
  traceGridContours,
  simplifyContourVertices,
  computeSignedPolygonArea,
} = await import(new URL('tileContours.ts', source).href);
const { SpriteScene } = await import(new URL('SpriteScene.ts', source).href);

await p2.initPhysics2D();

test('100 adjacent tile floor moves real WASM body across all 99 seams with zero stops', () => {
  const plan = buildTileContours({ width: 100, height: 1, tileSizeMeters: 1, solidCells: new Array(100).fill(true) });

  assert.equal(plan.loops.length, 1, '100 adjacent floor tiles must produce exactly one loop');
  assert.equal(plan.totalVertices, 4, 'Collinear edges must simplify to four corners');

  const loop = plan.loops[0]!;
  assert.equal(loop.isHole, false);
  assert.equal(loop.area, 100);

  const world = p2.createPhysicsWorld2D({
    tickRate: 60,
    initialGravity: { x: p2.metersPerSecondSquared(0), y: p2.metersPerSecondSquared(-9.8) },
    capacity: { bodies: 16, joints: 4, contourEdges: 128 },
  });

  try {
    const handles = world.edit((edit) => {
      const floor = edit.createBody({
        kind: 'static',
        shape: {
          type: 'chain',
          loop: true,
          vertices: loop.vertices.map((v) => ({ x: p2.meters(v.x), y: p2.meters(v.y) })),
        },
      });

      const runner = edit.createBody({
        kind: 'dynamic',
        shape: { type: 'circle', radius: p2.meters(0.25) },
        x: p2.meters(0.5),
        y: p2.meters(1.25),
        vx: p2.metersPerSecond(25),
      });

      return { floor, runner };
    }).created;

    let stopped = false;
    let seamsCrossed = 0;
    let lastX = 0.5;
    let minVxOnFloor = Infinity;

    for (let tick = 0; tick < 360; tick += 1) {
      world.step();
      const body = world.readBody(handles.runner);

      if (body.x <= 100) {
        if (body.vx < minVxOnFloor) {
          minVxOnFloor = body.vx;
        }
        if (body.vx < 0.5) {
          stopped = true;
          break;
        }
      }

      const currentSeam = Math.floor(body.x);
      const prevSeam = Math.floor(lastX);
      if (currentSeam > prevSeam) {
        seamsCrossed = Math.min(currentSeam, 99);
      }
      lastX = body.x;
    }

    const finalState = world.readBody(handles.runner);
    const nativeDigest = world.digest();

    assert.equal(stopped, false, 'Dynamic body must not stop on internal seams');
    assert.equal(seamsCrossed, 99, 'Dynamic body must cross all 99 internal tile seams');
    assert.ok(finalState.x > 100, 'Dynamic body must travel past the 100 meter floor');
    assert.ok(minVxOnFloor > 10, 'Dynamic body must keep forward speed without friction catches');
    assert.ok(nativeDigest > 0n, 'Native world digest must be a non-zero bigint');
  } finally {
    world.dispose();
  }
});

test('hole topology produces outer counter-clockwise and inner clockwise loops', () => {
  const holeCase = {
    width: 3,
    height: 3,
    solidCells: [
      true, true, true,
      true, false, true,
      true, true, true,
    ],
  };

  const plan = buildTileContours(holeCase);
  assert.equal(plan.loops.length, 2, 'Hollow square must produce outer loop and hole loop');

  const outer = plan.loops.find((l) => !l.isHole);
  const hole = plan.loops.find((l) => l.isHole);

  assert.ok(outer, 'Outer loop must exist');
  assert.ok(hole, 'Hole loop must exist');
  assert.ok(outer.signedArea > 0, 'Outer loop must have positive area');
  assert.ok(hole.signedArea < 0, 'Hole loop must have negative area');
  assert.equal(outer.area, 9, 'Outer area must equal total bounding area');
  assert.equal(hole.area, 1, 'Hole area must equal empty tile area');

  const world = p2.createPhysicsWorld2D({
    tickRate: 60,
    initialGravity: { x: p2.metersPerSecondSquared(0), y: p2.metersPerSecondSquared(-9.8) },
    capacity: { bodies: 16, joints: 4, contourEdges: 128 },
  });

  try {
    const handles = world.edit((edit) => {
      const outerBody = edit.createBody({
        kind: 'static',
        shape: {
          type: 'chain',
          loop: true,
          vertices: outer.vertices.map((v) => ({ x: p2.meters(v.x), y: p2.meters(v.y) })),
        },
      });

      const holeBody = edit.createBody({
        kind: 'static',
        shape: {
          type: 'chain',
          loop: true,
          vertices: hole.vertices.map((v) => ({ x: p2.meters(v.x), y: p2.meters(v.y) })),
        },
      });

      const dropped = edit.createBody({
        kind: 'dynamic',
        shape: { type: 'circle', radius: p2.meters(0.2) },
        x: p2.meters(1.5),
        y: p2.meters(1.8),
      });

      return { outerBody, holeBody, dropped };
    }).created;

    for (let tick = 0; tick < 60; tick += 1) {
      world.step();
    }

    const state = world.readBody(handles.dropped);
    assert.ok(state.y >= 1.15 && state.y <= 1.3, `Body rests on bottom edge of hole, y: ${state.y}`);
    assert.ok(Math.abs(state.vy) < 0.05, 'Body comes to rest inside hole');
  } finally {
    world.dispose();
  }
});

test('diagonal topology resolves diagonal touches into disjoint simple loops', () => {
  // Test diagonal 1: top-left and bottom-right
  const diag1 = buildTileContours({
    width: 2,
    height: 2,
    solidCells: [
      true, false,
      false, true,
    ],
  });

  assert.equal(diag1.loops.length, 2, 'Diagonal 1 must resolve to two loops');
  assert.equal(diag1.loops[0]!.vertices.length, 4);
  assert.equal(diag1.loops[1]!.vertices.length, 4);
  assert.equal(diag1.loops[0]!.area, 1);
  assert.equal(diag1.loops[1]!.area, 1);

  // Test diagonal 2: top-right and bottom-left
  const diag2 = buildTileContours({
    width: 2,
    height: 2,
    solidCells: [
      false, true,
      true, false,
    ],
  });

  assert.equal(diag2.loops.length, 2, 'Diagonal 2 must resolve to two loops');
  assert.equal(diag2.loops[0]!.vertices.length, 4);
  assert.equal(diag2.loops[1]!.vertices.length, 4);
  assert.equal(diag2.loops[0]!.area, 1);
  assert.equal(diag2.loops[1]!.area, 1);

  // Test 3x3 checkerboard: 5 separate solid tiles touching diagonally
  const check = buildTileContours({
    width: 3,
    height: 3,
    solidCells: [
      true, false, true,
      false, true, false,
      true, false, true,
    ],
  });

  assert.equal(check.loops.length, 5, '3x3 checkerboard must resolve to 5 separate loops');
  for (let i = 0; i < 5; i += 1) {
    assert.equal(check.loops[i]!.vertices.length, 4);
    assert.equal(check.loops[i]!.area, 1);
    assert.equal(check.loops[i]!.isHole, false);
  }
});

test('atomic replacement replaces physics body after tile edit and replays checkpoint', () => {
  const scene = new SpriteScene();
  const layer = new TileLayer(scene, {
    id: 'edit-layer',
    columns: 6,
    rows: 1,
    cellWidthMeters: 1.0,
    cellHeightMeters: 1.0,
    palette: {
      stone: { atlasId: 'atlas', frameId: 'stone', solid: true },
    },
    cells: ['stone', 'stone', 'stone', null, null, null],
  });

  const world = p2.createPhysicsWorld2D({
    tickRate: 60,
    initialGravity: { x: p2.metersPerSecondSquared(0), y: p2.metersPerSecondSquared(-9.8) },
    capacity: { bodies: 16, joints: 4, contourEdges: 128, checkpoints: 4 },
  });

  try {
    const initialPlan = layer.buildCollisionPlan();
    assert.equal(initialPlan.loops.length, 1);
    assert.equal(initialPlan.bounds.maxX, 3);

    let floorHandle = world.edit((edit) =>
      edit.createBody({
        kind: 'static',
        shape: {
          type: 'chain',
          loop: true,
          vertices: initialPlan.loops[0]!.vertices.map((v) => ({
            x: p2.meters(v.x),
            y: p2.meters(v.y),
          })),
        },
      }),
    ).created;

    const ballHandle = world.edit((edit) =>
      edit.createBody({
        kind: 'dynamic',
        shape: { type: 'circle', radius: p2.meters(0.25) },
        x: p2.meters(1.5),
        y: p2.meters(2.0),
      }),
    ).created;

    for (let i = 0; i < 30; i += 1) {
      world.step();
    }

    // Apply tile edit: expand floor to 5 tiles.
    const rev1 = layer.applyEdit({ col: 3, row: 0, cell: 'stone' });
    const rev2 = layer.applyEdit({ col: 4, row: 0, cell: 'stone' });
    assert.equal(rev1, 1);
    assert.equal(rev2, 2);

    const editedPlan = layer.buildCollisionPlan();
    assert.equal(editedPlan.revision, 2);
    assert.equal(editedPlan.bounds.maxX, 5);

    const replaceResult = world.edit((edit) =>
      edit.replaceBody(floorHandle, {
        kind: 'static',
        shape: {
          type: 'chain',
          loop: true,
          vertices: editedPlan.loops[0]!.vertices.map((v) => ({
            x: p2.meters(v.x),
            y: p2.meters(v.y),
          })),
        },
      }),
    );
    floorHandle = replaceResult.created;

    for (let i = 0; i < 20; i += 1) {
      world.step();
    }

    const checkpoint = world.captureCheckpoint();
    const bytes = world.serializeCheckpoint(checkpoint);
    world.releaseCheckpoint(checkpoint);

    const initialDigest = world.digest();

    for (let i = 0; i < 60; i += 1) {
      world.step();
    }
    const steppedDigest = world.digest();
    assert.notEqual(steppedDigest, initialDigest);

    world.restore(bytes);
    assert.equal(world.digest(), initialDigest, 'Restored digest must match captured digest');

    for (let i = 0; i < 60; i += 1) {
      world.step();
    }
    assert.equal(world.digest(), steppedDigest, 'Simulation step after restore must match exactly');
  } finally {
    world.dispose();
    layer.dispose();
  }
});

test('TileLayer tracks bounds across tile edits and throws on out-of-bounds edit', () => {
  const scene = new SpriteScene();
  const layer = new TileLayer(scene, {
    id: 'bounds-layer',
    columns: 10,
    rows: 8,
    cellWidthMeters: 2.0,
    cellHeightMeters: 1.5,
    originX: 10,
    originY: 20,
    palette: {
      block: { atlasId: 'atlas1', frameId: 'block', solid: true },
    },
    cells: new Array(80).fill(null),
  });

  try {
    const layerBounds = layer.getBounds();
    assert.equal(layerBounds.minX, 10);
    assert.equal(layerBounds.minY, 20);
    assert.equal(layerBounds.maxX, 30);
    assert.equal(layerBounds.maxY, 32);

    const emptyPlan = layer.buildCollisionPlan();
    assert.equal(emptyPlan.loops.length, 0);
    assert.deepEqual(emptyPlan.bounds, { minX: 0, minY: 0, maxX: 0, maxY: 0 });

    // In top-down row 0, world Y is [30.5, 32], world X is [10, 12].
    layer.setTile(0, 0, 'block');
    const plan1 = layer.buildCollisionPlan();
    assert.equal(plan1.bounds.minX, 10);
    assert.equal(plan1.bounds.maxX, 12);
    assert.equal(plan1.bounds.minY, 30.5);
    assert.equal(plan1.bounds.maxY, 32);

    // Row 7 is bottom row: world Y is [20, 21.5], world X is [28, 30].
    layer.setTile(9, 7, 'block');
    const plan2 = layer.buildCollisionPlan();
    assert.equal(plan2.bounds.minX, 10);
    assert.equal(plan2.bounds.maxX, 30);
    assert.equal(plan2.bounds.minY, 20);
    assert.equal(plan2.bounds.maxY, 32);

    assert.throws(() => layer.setTile(-1, 0, 'block'), RangeError);
    assert.throws(() => layer.setTile(10, 0, 'block'), RangeError);
    assert.throws(() => layer.setTile(0, 8, 'block'), RangeError);
    assert.throws(() => layer.setTile(1.5, 0, 'block'), RangeError);
    assert.throws(() => layer.applyEdit({ col: 0, row: -1, cell: 'block' }), RangeError);
    assert.equal(layer.getTile(-1, 0), null);
    assert.equal(layer.getTile(10, 0), null);
  } finally {
    layer.dispose();
  }
});

test('TileLayer updates animated frames with injected clock and pauses when suspended', () => {
  const scene = new SpriteScene();
  const layer = new TileLayer(scene, {
    id: 'anim-layer',
    columns: 2,
    rows: 2,
    palette: {
      water: {
        atlasId: 'atlas1',
        frameId: 'w1',
        animationFrames: ['w1', 'w2', 'w3', 'w4'],
        animationDurationMs: 400,
      },
    },
    cells: ['water', null, null, null],
  });

  try {
    const tileSpriteId = 'anim-layer:tile:0_0';
    assert.equal(scene.getNode(tileSpriteId)?.frameId, 'w1');

    layer.update({ frameIndex: 1, activeSeconds: 0.15, deltaSeconds: 0.016 });
    assert.equal(scene.getNode(tileSpriteId)?.frameId, 'w2');

    layer.update({ frameIndex: 2, activeSeconds: 0.25, deltaSeconds: 0.016 });
    assert.equal(scene.getNode(tileSpriteId)?.frameId, 'w3');

    layer.update({ frameIndex: 3, activeSeconds: 0.35, deltaSeconds: 0.016 });
    assert.equal(scene.getNode(tileSpriteId)?.frameId, 'w4');

    layer.update({ frameIndex: 4, activeSeconds: 0.55, deltaSeconds: 0.016, suspended: true });
    assert.equal(scene.getNode(tileSpriteId)?.frameId, 'w4', 'Suspended clock must not advance frame');

    layer.update();
    assert.equal(scene.getNode(tileSpriteId)?.frameId, 'w4');
  } finally {
    layer.dispose();
  }
});

test('TileLayer culling toggles chunk visibility using camera frustum', () => {
  const scene = new SpriteScene();
  const layer = new TileLayer(scene, {
    id: 'cull-layer',
    columns: 16,
    rows: 16,
    chunkWidth: 4,
    chunkHeight: 4,
    cellWidthMeters: 1.0,
    cellHeightMeters: 1.0,
    palette: {
      grass: { atlasId: 'atlas1', frameId: 'grass' },
    },
    cells: new Array(256).fill('grass'),
  });

  try {
    const chunks = layer.getChunks();
    assert.equal(chunks.length, 16, '16x16 layer with 4x4 chunks must have 16 chunks');

    // Camera focused near chunk (0, 0) with 2m frustum.
    layer.update(undefined, {
      position: { x: 2, y: 14 },
      frustum: { left: -2, right: 2, bottom: -2, top: 2 },
    });

    const visibleChunks = chunks.filter((c) => scene.getNode(c.id)?.visible);
    assert.ok(visibleChunks.length > 0 && visibleChunks.length < 16, 'Only subset of chunks must be visible');

    const nearChunk = scene.getNode('cull-layer:chunk:0_0');
    const farChunk = scene.getNode('cull-layer:chunk:3_3');
    assert.equal(nearChunk?.visible, true, 'Near chunk must be visible');
    assert.equal(farChunk?.visible, false, 'Distant chunk must be culled');
  } finally {
    layer.dispose();
  }
});

test('TileLayer dispose removes all registered nodes and rejects calls after dispose', () => {
  const scene = new SpriteScene();
  const layer = new TileLayer(scene, {
    id: 'dispose-layer',
    columns: 4,
    rows: 4,
    chunkWidth: 2,
    chunkHeight: 2,
    palette: {
      stone: { atlasId: 'atlas1', frameId: 'stone' },
    },
    cells: new Array(16).fill('stone'),
  });

  const tileId = 'dispose-layer:tile:0_0';
  const chunkId = 'dispose-layer:chunk:0_0';

  assert.ok(scene.getNode(tileId), 'Tile node must exist before dispose');
  assert.ok(scene.getNode(chunkId), 'Chunk node must exist before dispose');
  assert.equal(layer.isDisposed(), false);

  layer.dispose();

  assert.equal(layer.isDisposed(), true);
  assert.equal(scene.getNode(tileId), undefined, 'Tile node must be removed');
  assert.equal(scene.getNode(chunkId), undefined, 'Chunk node must be removed');

  layer.dispose();
  assert.equal(layer.isDisposed(), true);

  assert.throws(() => layer.setTile(0, 0, 'stone'), /disposed/);
  assert.throws(() => layer.applyEdit({ col: 0, row: 0, cell: 'stone' }), /disposed/);
  assert.throws(() => layer.update(), /disposed/);
  assert.throws(() => layer.updateCulling({ x: 0, y: 0 }, { left: -1, right: 1, bottom: -1, top: 1 }), /disposed/);
  assert.throws(() => layer.buildCollisionPlan(), /disposed/);
  assert.throws(() => layer.getBounds(), /disposed/);
  assert.throws(() => layer.getChunks(), /disposed/);
  assert.throws(() => layer.getTile(0, 0), /disposed/);
});

test('boundary validation rejects invalid configuration and argument values', () => {
  const scene = new SpriteScene();

  assert.throws(() => new TileLayer(scene, { id: '', cells: [] } as any), TypeError);
  assert.throws(() => new TileLayer(null as any, { id: 'x', cells: [] } as any), TypeError);

  assert.throws(() => new TileLayer(scene, { id: 'x', columns: 0, rows: 4, cells: [] }), RangeError);
  assert.throws(() => new TileLayer(scene, { id: 'x', columns: 4, rows: -1, cells: [] }), RangeError);
  assert.throws(() => new TileLayer(scene, { id: 'x', columns: 4, rows: 4, cellWidthMeters: -1, cells: [] }), RangeError);
  assert.throws(() => new TileLayer(scene, { id: 'x', columns: 4, rows: 4, originX: NaN, cells: [] }), TypeError);

  assert.throws(() => new TileLayer(scene, { id: 'x', columns: 4, rows: 4, cells: [null] }), RangeError);

  assert.throws(
    () =>
      new TileLayer(scene, {
        id: 'x',
        columns: 1,
        rows: 1,
        palette: { bad: { atlasId: '', frameId: '' } as any },
        cells: [null],
      }),
    TypeError,
  );

  assert.throws(() => traceGridContours(null as any), TypeError);
  assert.throws(() => traceGridContours({ width: -1, height: 1, solidCells: [] }), RangeError);
  assert.throws(() => traceGridContours({ width: 2, height: 2, solidCells: [true] }), RangeError);
  assert.throws(
    () => traceGridContours({ width: 1, height: 1, cellWidthMeters: NaN, solidCells: [true] }),
    RangeError,
  );

  assert.throws(() => simplifyContourVertices(null as any), TypeError);
  assert.throws(() => computeSignedPolygonArea(null as any), TypeError);
});
