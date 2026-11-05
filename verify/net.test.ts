import assert from 'node:assert/strict';
import { test } from 'node:test';
import { initPhysics2D } from '@series-inc/rundot-syncplay/physics/2d';
import { createSyncplaySession } from '@series-inc/rundot-syncplay';
import {
  assertDeterministicAsync,
  assertLateJoinHydrationAsync,
  assertTwoClientConvergenceAsync,
} from '@series-inc/rundot-syncplay/testing';
import {
  createNetRuntime,
  localNetInput,
  decodeNetInput,
  encodeNetInput,
  NET_NEUTRAL_INPUT,
  NET_SEATS,
  netSessionConfigBytes,
  netSessionConfigDigest,
  type NetInput,
  type NetRuntimeHandle,
} from '../src/modules/runtime/game-application/netRuntime.ts';
import { netRuntimeIdentity } from '../src/core/netIdentity.generated.ts';
import { deriveNetIdentity } from '../scripts/net-identity.mjs';

await initPhysics2D();

const roomConfig = {
  playerCount: NET_SEATS, seed: 1, hardToleranceTicks: 4, tickRateHz: 60,
  redundancyWindowTicks: 8, runtimeIdentity: netRuntimeIdentity, sessionConfigBytes: netSessionConfigBytes,
  sessionConfigDigest: netSessionConfigDigest, neutralInput: null,
  snapshotCadenceTicks: 8, transferTimeoutTicks: 120,
} as const;

/** Runs right, jumps every 40 ticks, then turns back: enough to collect stars and use physics. */
function scriptedInput(slot: number, tick: number): NetInput {
  const phase = Math.floor(tick / 90) % 2;
  return {
    moveX: (phase === 0) === (slot === 0) ? 1 : -1,
    jumpHeld: (tick + slot * 7) % 40 < 4,
    actionHeld: false,
    here: true,
    restartHeld: false,
  };
}

const clientOptions = (_index: number) => ({
  runtimeFactory: (identity: typeof netRuntimeIdentity, bytes: Uint8Array) => createNetRuntime(netRuntimeIdentity, identity, bytes),
  defaultInput: NET_NEUTRAL_INPUT,
  localInputForTick: scriptedInput,
  encodeInput: encodeNetInput,
  decodeInput: decodeNetInput,
  maxPredictionTicks: 8,
  checksumCadenceTicks: 4,
});

test('rollback, replay and hydration all give the same checksums', async () => {
  const result = await assertDeterministicAsync({
    runtimeFactory: () => createNetRuntime(netRuntimeIdentity),
    policy: { playerCount: NET_SEATS, defaultInput: NET_NEUTRAL_INPUT, checksumIntervalFrames: 1 },
    frames: 600,
    seeds: [1, 2],
    inputFuzz: (random, _slot) => ({
      moveX: (random.nextInt(0, 2) - 1) as -1 | 0 | 1,
      jumpHeld: random.nextInt(0, 3) === 0,
      actionHeld: random.nextInt(0, 4) === 0,
      here: true,
      restartHeld: random.nextInt(0, 50) === 0,
    }),
  });
  assert.equal(result.ok, true);
});

test('two clients over a lossy, laggy link converge', async () => {
  const proof = await assertTwoClientConvergenceAsync({
    roomConfig,
    clientOptions,
    steps: 400,
    link: { latencyMin: 2, latencyMax: 6, lossRate: 0.05 },
  });
  assert.ok(proof.frame > 300, `converged at frame ${proof.frame}`);
  assert.ok(proof.rollbackCount > 0, 'the link should force rollbacks');
});

test('a friend who joins late hydrates into the same world', async () => {
  const proof = await assertLateJoinHydrationAsync({
    roomConfig, clientOptions, initialClientCount: 1, beforeJoinSteps: 120, afterJoinSteps: 120,
  });
  assert.ok(proof.hydratedThrough > 0);
});

test('the round waits for both seats, then both players move', () => {
  let handle: NetRuntimeHandle | undefined;
  const lease = createNetRuntime(netRuntimeIdentity, undefined, undefined, { onCreate: (h) => { handle = h; } });
  const session = createSyncplaySession(lease.runtime, { playerCount: NET_SEATS, defaultInput: NET_NEUTRAL_INPUT });
  const run = (inputs: readonly NetInput[], frames: number) => {
    for (let i = 0; i < frames; i += 1) { inputs.forEach((input, seat) => session.setInput(seat, input)); session.stepFrames(1); }
  };
  run([{ ...NET_NEUTRAL_INPUT, here: true, moveX: 1 as const }, NET_NEUTRAL_INPUT], 30);
  assert.equal(handle!.adapter.status, 'ready', 'one player alone must not start the round');
  const both = [{ ...NET_NEUTRAL_INPUT, here: true, moveX: 1 as const }, { ...NET_NEUTRAL_INPUT, here: true, moveX: 1 as const }];
  const before = handle!.adapter.getPresentation(0).poses.filter((p) => p.entityId.startsWith('player'));
  run(both, 30);
  assert.equal(handle!.adapter.status, 'running');
  const after = handle!.adapter.getPresentation(0).poses.filter((p) => p.entityId.startsWith('player'));
  assert.equal(after.length, 2);
  const dx = after.map((pose, i) => pose.current.xMeters - before[i]!.current.xMeters);
  assert.ok(dx[0]! > 1 && dx[1]! > 1, `players moved ${dx.join(', ')}`);
  session.dispose();
  lease.dispose();
});

test('the checked-in identity matches the simulation sources (run npm run gen:net-identity)', () => {
  assert.deepEqual({ ...netRuntimeIdentity }, deriveNetIdentity());
});

test('a room from another build is refused', () => {
  assert.throws(
    () => createNetRuntime(netRuntimeIdentity, { ...netRuntimeIdentity, engineIdentityHash: '0'.repeat(64) }),
    { message: 'COOP_RUNTIME_IDENTITY_MISMATCH' },
  );
});

test('a player behind a menu sends no movement but can still restart the round', () => {
  const held = new Map([['right', true], ['jump', true]]);
  const open = localNetInput({ held, suspended: true, jumpTapped: true, restartTapped: true });
  assert.deepEqual(open, { ...NET_NEUTRAL_INPUT, here: true, restartHeld: true });
  const playing = localNetInput({ held, suspended: false, jumpTapped: false, restartTapped: false });
  assert.deepEqual(playing, { moveX: 1, jumpHeld: true, actionHeld: false, here: true, restartHeld: false });
});
