/**
 * Syncplay runtime over the 2D world: one player per seat, inputs ordered by the room.
 */

import {
  createInstalledRuntimeAdapter,
  kinetixRuntimeIdentitiesEqual,
  kinetixSessionConfigDigest,
  type KinetixRuntimeIdentity,
} from '@series-inc/rundot-syncplay/core/runtime';
import { defineSyncplayInputCodec, type CanonicalValue } from '@series-inc/rundot-syncplay';
import { WorldAdapter2D } from './adapter2d.js';
import { REFERENCE_SCENE_2D, withSeats, type SceneDefinition2D } from './scene.js';
import type { TickInput } from './input.js';
import type { InputAction, RoundCheckpoint } from './types.js';

export const NET_SEATS = 2;
export const NET_TICK_RATE = 60;

export interface NetInput {
  readonly moveX: -1 | 0 | 1;
  readonly jumpHeld: boolean;
  readonly actionHeld: boolean;
  /** True for a connected player. The room sends the neutral input for an empty seat. */
  readonly here: boolean;
  readonly restartHeld: boolean;
}

export const NET_NEUTRAL_INPUT: NetInput = Object.freeze({
  moveX: 0, jumpHeld: false, actionHeld: false, here: false, restartHeld: false,
});

const codec = defineSyncplayInputCodec<NetInput>({
  moveX: { kind: 'enum', values: [-1, 0, 1] },
  jumpHeld: { kind: 'boolean' },
  actionHeld: { kind: 'boolean' },
  here: { kind: 'boolean' },
  restartHeld: { kind: 'boolean' },
});
export const encodeNetInput = codec.encodeInput;
export const decodeNetInput = (value: CanonicalValue): NetInput => codec.decodeInput(value);

export const netSessionConfigBytes = new TextEncoder().encode(
  JSON.stringify({ game: 'modules-template-coop', players: NET_SEATS, version: 1 }),
);
export const netSessionConfigDigest = kinetixSessionConfigDigest(netSessionConfigBytes);


export interface NetState {
  readonly frame: number;
  readonly checkpoint: RoundCheckpoint;
  readonly prevJump: readonly boolean[];
  readonly prevRestart: readonly boolean[];
}

export interface NetProjection {
  readonly frame: number;
  readonly status: string;
  readonly score: number;
  readonly secondsRemaining: number | null;
  readonly objective: string;
  readonly seatsHere: number;
}

const NO_INPUT_STATE = Object.freeze({ heldStates: {}, latchedActions: [] });
const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** What this player sends for one tick. A suspended player still sends a restart, but no movement. */
export function localNetInput(local: {
  readonly held: ReadonlyMap<string, boolean>;
  readonly suspended: boolean;
  readonly jumpTapped: boolean;
  readonly restartTapped: boolean;
}): NetInput {
  if (local.suspended) return { ...NET_NEUTRAL_INPUT, here: true, restartHeld: local.restartTapped };
  const left = local.held.get('left') ? 1 : 0;
  const right = local.held.get('right') ? 1 : 0;
  return {
    moveX: (right - left) as -1 | 0 | 1,
    jumpHeld: !!local.held.get('jump') || local.jumpTapped,
    actionHeld: !!local.held.get('action'),
    here: true,
    restartHeld: local.restartTapped,
  };
}

function tickInputFor(input: NetInput, prevJumpHeld: boolean): TickInput {
  const jumpPressed = input.jumpHeld && !prevJumpHeld;
  const held: Partial<Record<InputAction, boolean>> = {
    left: input.moveX < 0, right: input.moveX > 0, action: input.actionHeld, jump: input.jumpHeld,
  };
  return {
    pressedActions: jumpPressed ? ['jump'] : [],
    isHeld: (action) => held[action] ?? false,
    wasPressed: (action) => action === 'jump' && jumpPressed,
    axis2D: () => ({ x: input.moveX, y: 0 }),
  };
}

/** The world a runtime steps. The application reads it for presentation. */
export interface NetRuntimeHandle {
  readonly adapter: WorldAdapter2D;
}

/**
 * Builds the runtime for one Syncplay session, as a lease whose `dispose` frees the physics world.
 * `expected` is the game's generated identity; a room carrying any other is refused.
 * `initPhysics2D()` must have resolved first. `onCreate` hands the caller the world it steps, for rendering.
 */
export function createNetRuntime(
  expected: Readonly<KinetixRuntimeIdentity>,
  identity: Readonly<KinetixRuntimeIdentity> = expected,
  configBytes: Uint8Array = netSessionConfigBytes,
  options: { scene?: SceneDefinition2D; onCreate?: (handle: NetRuntimeHandle) => void } = {},
) {
  if (!kinetixRuntimeIdentitiesEqual(identity, expected)) throw new Error('COOP_RUNTIME_IDENTITY_MISMATCH');
  if (kinetixSessionConfigDigest(configBytes) !== netSessionConfigDigest) throw new Error('COOP_RUNTIME_CONFIG_MISMATCH');

  const adapter = WorldAdapter2D.createLoaded(withSeats(options.scene ?? REFERENCE_SCENE_2D, NET_SEATS));
  adapter.status = 'ready';
  let frame = 0;
  let prevJump: boolean[] = Array(NET_SEATS).fill(false);
  let prevRestart: boolean[] = Array(NET_SEATS).fill(false);
  let seatsHere = 0;
  options.onCreate?.({ adapter });

  const capture = (): NetState => Object.freeze({
    frame,
    checkpoint: adapter.captureCheckpoint(NO_INPUT_STATE),
    prevJump: Object.freeze([...prevJump]),
    prevRestart: Object.freeze([...prevRestart]),
  });
  const checksumOf = (state: NetState): Uint8Array => encoder.encode(JSON.stringify({
    frame: state.frame,
    physics: state.checkpoint.physicsDigest,
    round: state.checkpoint.canonicalEntityState,
    prevJump: state.prevJump,
    prevRestart: state.prevRestart,
  }));

  const runtime = createInstalledRuntimeAdapter<NetState, NetInput, never, NetProjection>({
    identity: expected,
    sessionConfigBytes: netSessionConfigBytes,
    captureState: capture,
    restoreState: (state) => {
      adapter.restoreCheckpoint(state.checkpoint);
      frame = state.frame;
      prevJump = [...state.prevJump];
      prevRestart = [...state.prevRestart];
    },
    frameOf: (state) => state.frame,
    step: (inputs) => {
      seatsHere = inputs.filter((input) => input.here).length;
      if (adapter.status === 'ready' && seatsHere === NET_SEATS) adapter.status = 'running';
      const restartPressed = inputs.some((input, seat) => input.restartHeld && !prevRestart[seat]);
      if (adapter.status === 'results' && restartPressed) adapter.restart();
      adapter.step(1 / NET_TICK_RATE, inputs.map((input, seat) => tickInputFor(input, prevJump[seat] ?? false)));
      prevJump = inputs.map((input) => input.jumpHeld);
      prevRestart = inputs.map((input) => input.restartHeld);
      frame += 1;
    },
    capturedStateIsDetached: true,
    serializeState: (state) => encoder.encode(JSON.stringify(state)),
    hydrateState: (_frame, bytes) => JSON.parse(decoder.decode(bytes)) as NetState,
    checksumBytes: checksumOf,
    projectState: (state) => Object.freeze({
      frame: state.frame,
      status: state.checkpoint.canonicalEntityState.status,
      score: state.checkpoint.canonicalEntityState.score,
      secondsRemaining: state.checkpoint.canonicalEntityState.secondsRemaining,
      objective: state.checkpoint.canonicalEntityState.objective,
      seatsHere,
    }),
  });
  return { runtime, dispose: () => adapter.dispose() };
}
