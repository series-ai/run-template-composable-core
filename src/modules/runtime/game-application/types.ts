/**
 * Types and interfaces for the headless game application owner.
 */

import type { SceneDefinition2D, SceneDefinition3D } from './scene.js';

export type Dimension = '2d' | '3d';

export type GameStatus =
  | 'loading'
  | 'ready'
  | 'running'
  | 'paused'
  | 'results'
  | 'error';

export type InputAction =
  | 'left'
  | 'right'
  | 'up'
  | 'down'
  | 'jump'
  | 'action'
  | string;

/**
 * Storage interface for persistent state.
 */
export interface StorageLike {
  getItem(key: string): Promise<string | null> | string | null;
  setItem(key: string, value: string): Promise<void> | void;
  removeItem?(key: string): Promise<void> | void;
}

/**
 * User preferences stored across game sessions.
 */
export interface GameSettings {
  readonly sound: boolean;
  readonly reducedMotion: boolean;
}

/**
 * UI view model published to subscribers.
 */
export interface GameViewModel {
  readonly status: GameStatus;
  readonly dimension: Dimension;
  readonly score: number;
  readonly bestScore: number;
  readonly secondsRemaining: number | null;
  readonly objective: string;
  readonly progress?: number;
  readonly notice?: string;
  readonly error?: string;
  readonly isSuspended: boolean;
  readonly suspensionCauses: readonly string[];
  readonly settings: GameSettings;
  readonly canPickDimension?: boolean;
  readonly instructions?: readonly string[];
}

/**
 * 2D position and rotation pose in physics metres.
 */
export interface Pose2D {
  readonly xMeters: number;
  readonly yMeters: number;
  readonly angleRadians: number;
}

/**
 * Pair of previous and current poses for 2D entity interpolation.
 */
export interface PosePair2D {
  readonly entityId: string;
  readonly visible: boolean;
  readonly bodyIdDecimal: string;
  readonly previous: Pose2D;
  readonly current: Pose2D;
  readonly snap: boolean;
}

/**
 * 3D position and orientation quaternion in physics metres.
 */
export interface Pose3D {
  readonly positionMeters: readonly [x: number, y: number, z: number];
  readonly orientation: readonly [x: number, y: number, z: number, w: number];
}

/**
 * Pair of previous and current poses for 3D entity interpolation.
 */
export interface PosePair3D {
  readonly entityId: string;
  readonly visible: boolean;
  readonly bodyIdDecimal: string;
  readonly previous: Pose3D;
  readonly current: Pose3D;
  readonly snap: boolean;
}

/**
 * Presentation snapshot published to renderers.
 */
export type PresentationFrame =
  | {
      readonly dimension: '2d';
      readonly epoch: number;
      readonly previousTick: number;
      readonly currentTick: number;
      readonly alpha: number;
      readonly poses: readonly PosePair2D[];
    }
  | {
      readonly dimension: '3d';
      readonly epoch: number;
      readonly previousTick: number;
      readonly currentTick: number;
      readonly alpha: number;
      readonly poses: readonly PosePair3D[];
    };

/**
 * Portable player progress saved to the durable journal.
 */
export interface ProgressSave {
  readonly schemaVersion: number;
  readonly generation: number;
  readonly gameId: string;
  readonly bestScores: Record<string, number>;
  readonly unlocks: readonly string[];
  readonly selectedLevel: string;
  readonly durableInventoryAndSettings: Record<string, unknown>;
  readonly completedRewardIds: readonly string[];
  readonly [key: string]: unknown;
}

/**
 * Serialized input state captured on a simulation tick.
 */
export interface InputCheckpointState {
  readonly heldStates: Record<string, boolean>;
  readonly latchedActions: readonly string[];
}

/**
 * Canonical 2D game rules state.
 */
export interface CanonicalEntityState2D {
  readonly score: number;
  readonly status: GameStatus;
  readonly secondsRemaining: number | null;
  readonly objective: string;
  readonly collectedIds: readonly string[];
  readonly isGrounded: boolean;
  readonly eventSequence: number;
}

/**
 * Canonical 3D game rules state.
 */
export interface CanonicalEntityState3D {
  readonly score: number;
  readonly status: GameStatus;
  readonly secondsRemaining: number | null;
  readonly objective: string;
  readonly collectedIds: readonly string[];
  readonly isGrounded: boolean;
  readonly eventSequence: number;
}

/**
 * Canonical simulation state captured on a single fixed tick.
 */
export interface RoundCheckpoint {
  readonly version: number;
  readonly runtimeIdentity: string;
  readonly dimension: Dimension;
  readonly tick: number;
  readonly physicsEpoch: number;
  readonly canonicalEntityState: CanonicalEntityState2D | CanonicalEntityState3D;
  readonly bodyIdMap: Record<string, string>;
  readonly physicsCheckpointBase64: string;
  readonly eventSequence: number;
  readonly inputState: InputCheckpointState;
  readonly physicsDigest: string;
}

/**
 * Resume record valid only for a matching runtime version.
 */
export interface RoundResume {
  readonly checkpointVersion: number;
  readonly runtimeIdentity: string;
  readonly progressGeneration: number;
  readonly roundCheckpoint: RoundCheckpoint;
}

/**
 * Performance and timing statistics for fixed simulation steps.
 */
export interface FixedStepStats {
  readonly totalPumps: number;
  readonly totalTicks: number;
  readonly droppedSeconds: number;
  readonly droppedTicks: number;
  readonly maxTicksInSinglePump: number;
}

/**
 * Configuration options for creating a game application.
 */
export interface CreateGameApplicationOptions {
  readonly dimension: Dimension;
  readonly storage?: StorageLike;
  readonly fixedDtSeconds?: number;
  readonly gameId?: string;
  readonly signal?: AbortSignal;
  readonly scene2d?: SceneDefinition2D;
  readonly scene3d?: SceneDefinition3D;
}

/**
 * Public interface of the game application owner.
 */
export interface GameApplication {
  pump(deltaSeconds: number): void;
  readonly input: {
    setHeld(action: InputAction, held: boolean): void;
    press(action: InputAction): void;
  };
  setSuspended(cause: string, suspended: boolean): void;
  restart(): void;
  dispose(): void;
  getPresentation(): PresentationFrame;
  subscribe(listener: () => void): () => void;
  getView(): GameViewModel;
  save(): Promise<void>;
  restore(): Promise<void>;
  getStats(): FixedStepStats;
  getRoundCheckpoint(): RoundCheckpoint | null;
  restoreRoundCheckpoint(checkpoint: RoundCheckpoint): void;
  getScene(): SceneDefinition2D | SceneDefinition3D;
  getPhysicsDigest(): string;
  start(): void;
  pause(): void;
  resume(): void;
  retry(): Promise<void>;
  setSettings(settings: Partial<GameSettings>): void;
}
