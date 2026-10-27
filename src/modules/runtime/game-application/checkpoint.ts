import type { Dimension, RoundCheckpoint } from './types.js';

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid ${label}.`);
  return value as Record<string, unknown>;
}
function integer(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid ${label}.`);
  return value;
}
function text(value: unknown, label: string, limit = 512): string {
  if (typeof value !== 'string' || value.length > limit) throw new Error(`Invalid ${label}.`);
  return value;
}
function stringList(value: unknown, label: string, unique = true): string[] {
  if (!Array.isArray(value) || value.length > 256) throw new Error(`Invalid ${label}.`);
  const list = value.map((entry) => text(entry, label, 128));
  if (unique && new Set(list).size !== list.length) throw new Error(`Duplicate ${label}.`);
  return list;
}

export function parseRoundCheckpoint(value: unknown, dimension: Dimension, identity: string,
  expectedIds: ReadonlyMap<string, string>, sensorIds: ReadonlySet<string>): RoundCheckpoint {
  const raw = object(value, 'checkpoint');
  if (raw.version !== 1 || raw.runtimeIdentity !== identity || raw.dimension !== dimension) throw new Error('Saved round version does not match.');
  const tick = integer(raw.tick, 'tick'); const physicsEpoch = integer(raw.physicsEpoch, 'epoch');
  const eventSequence = integer(raw.eventSequence, 'event sequence');
  const ids = object(raw.bodyIdMap, 'body map');
  if (Object.keys(ids).length !== expectedIds.size) throw new Error('Saved body map is incomplete.');
  const bodyIdMap: Record<string, string> = {};
  for (const [id, expected] of expectedIds) {
    const decimal = text(ids[id], 'body ID', 20);
    if (!/^[1-9][0-9]*$/.test(decimal) || decimal !== expected) throw new Error('Saved body identity does not match.');
    const numericId = BigInt(decimal);
    if (dimension === '2d' && numericId > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('2D body ID exceeds the public API limit.');
    bodyIdMap[id] = decimal;
  }
  const state = object(raw.canonicalEntityState, 'round state');
  const score = integer(state.score, 'score');
  const status = state.status;
  if (status !== 'ready' && status !== 'running' && status !== 'paused' && status !== 'results') throw new Error('Invalid saved phase.');
  const secondsRemaining = state.secondsRemaining;
  if (secondsRemaining !== null && (typeof secondsRemaining !== 'number' || !Number.isFinite(secondsRemaining) || secondsRemaining < 0 || secondsRemaining > 60)) throw new Error('Invalid saved time.');
  const objective = text(state.objective, 'objective');
  const collectedIds = stringList(state.collectedIds, 'collected IDs');
  if (collectedIds.some((id) => !sensorIds.has(id))) throw new Error('Saved collectible is unknown.');
  if (typeof state.isGrounded !== 'boolean' || integer(state.eventSequence, 'state sequence') !== eventSequence) throw new Error('Invalid saved event state.');
  const input = object(raw.inputState, 'input state'); const held = object(input.heldStates, 'held actions');
  if (Object.keys(held).length > 128) throw new Error('Too many held actions.');
  const heldStates: Record<string, boolean> = {};
  for (const [action, active] of Object.entries(held)) {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(action) || typeof active !== 'boolean') throw new Error('Invalid held action.');
    heldStates[action] = active;
  }
  const latchedActions = stringList(input.latchedActions, 'latched actions', false);
  if (latchedActions.some((action) => !/^[a-zA-Z0-9_-]{1,64}$/.test(action))) throw new Error('Invalid latched action.');
  const physicsCheckpointBase64 = text(raw.physicsCheckpointBase64, 'physics checkpoint', 1_300_000);
  if (!physicsCheckpointBase64.length || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(physicsCheckpointBase64)) throw new Error('Invalid physics checkpoint bytes.');
  const physicsDigest = text(raw.physicsDigest, 'physics digest', 20);
  if (!/^[0-9]+$/.test(physicsDigest)) throw new Error('Invalid physics digest.');
  return { version: 1, dimension, runtimeIdentity: identity, tick, physicsEpoch, eventSequence, bodyIdMap,
    canonicalEntityState: { score, status, secondsRemaining, objective, collectedIds, isGrounded: state.isGrounded, eventSequence },
    physicsCheckpointBase64, physicsDigest, inputState: { heldStates, latchedActions } };
}
