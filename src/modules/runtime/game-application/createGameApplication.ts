/**
 * GameApplication factory and lifecycle management.
 */

import type {
  CreateGameApplicationOptions,
  GameApplication,
  GameSettings,
  GameViewModel,
  InputAction,
  PresentationFrame,
  RoundCheckpoint,
  RoundResume,
  FixedStepStats,
  ProgressSave,
} from './types.js';
import type { SceneDefinition2D, SceneDefinition3D } from './scene.js';
import { InputManager } from './input.js';
import { FixedStepRuntime } from './runtime.js';
import { UIStore } from './store.js';
import { PersistenceJournal, CURRENT_CHECKPOINT_VERSION } from './journal.js';
import { WorldAdapter2D } from './adapter2d.js';
import { WorldAdapter3D } from './adapter3d.js';
import { initPhysics2D } from '@series-inc/rundot-syncplay/physics/2d';
import {
  createSyncplayRunner,
  type SyncplayRoomTransport,
  type SyncplayRunner,
  type SyncplayRunnerSnapshot,
} from '@series-inc/rundot-syncplay/browser';
import {
  createNetRuntime,
  decodeNetInput,
  encodeNetInput,
  localNetInput,
  NET_NEUTRAL_INPUT,
  type NetInput,
  type NetProjection,
} from './netRuntime.js';
import { seatEntityId } from './scene.js';
import type { OnlineView } from './types.js';

/** Ticks a tap holds jump or restart down, so the room sees it as a press. */
const TAP_TICKS = 4;

interface OnlineSession {
  readonly runner: SyncplayRunner<NetInput, NetProjection, never>;
  adapter?: WorldAdapter2D;
  snapshot?: SyncplayRunnerSnapshot<NetProjection>;
  readonly held: Map<string, boolean>;
  /** Local reasons input is off, such as an open menu. The shared round keeps going. */
  readonly suspended: Set<string>;
  jumpTicks: number;
  restartTicks: number;
  view: OnlineView;
  unsubscribe: () => void;
}

function sameOnlineView(a: OnlineView | undefined, b: OnlineView): boolean {
  return !!a && a.state === b.state && a.roomCode === b.roomCode && a.message === b.message;
}

/**
 * Creates a headless GameApplication owner with Syncplay physics.
 */
export async function createGameApplication(
  options: CreateGameApplicationOptions,
): Promise<GameApplication> {
  if (options.dimension !== '2d' && options.dimension !== '3d') {
    throw new Error(
      `Invalid dimension: ${String(options.dimension)}. Expected '2d' or '3d'.`,
    );
  }
  if (
    options.fixedDtSeconds !== undefined &&
    (!Number.isFinite(options.fixedDtSeconds) || Math.abs(options.fixedDtSeconds - 1 / 60) > 1e-6)
  ) {
    throw new Error(
      `Unsupported fixedDtSeconds: ${options.fixedDtSeconds}. Only 60 Hz (1/60) is supported.`,
    );
  }
  if (
    options.gameId !== undefined &&
    (typeof options.gameId !== 'string' || options.gameId.length === 0)
  ) {
    throw new Error('Invalid gameId: expected non-empty string.');
  }

  let isDisposed = false;
  let abortCleanup = (): void => { isDisposed = true; };
  const onAbort = (): void => { abortCleanup(); };
  options.signal?.addEventListener('abort', onAbort);

  if (options.signal?.aborted) {
    options.signal.removeEventListener('abort', onAbort);
    throw new Error('GameApplication creation aborted.');
  }

  const dimension = options.dimension;
  const gameId = options.gameId ?? 'rundot_game';
  const journal = new PersistenceJournal(gameId, options.storage);
  const input = new InputManager();
  const runtime = new FixedStepRuntime(options.fixedDtSeconds ?? 1 / 60, 8);

  let adapter: WorldAdapter2D | WorldAdapter3D;

  try {
    if (dimension === '2d') {
      adapter = await WorldAdapter2D.create(options.scene2d);
    } else {
      adapter = await WorldAdapter3D.create(options.scene3d);
    }

    if (isDisposed || options.signal?.aborted) {
      adapter.dispose();
      throw new Error('GameApplication creation aborted.');
    }
  } catch (err) {
    options.signal?.removeEventListener('abort', onAbort);
    throw err;
  }

  // Load durable progress
  let progress: ProgressSave;
  try {
    progress = await journal.loadProgress();
    if (isDisposed || options.signal?.aborted) {
      throw new Error('GameApplication creation aborted.');
    }
  } catch (err) {
    adapter.dispose();
    options.signal?.removeEventListener('abort', onAbort);
    throw err;
  }

  const bestScore = progress.bestScores[dimension] ?? 0;
  const loadedSettings =
    (progress.durableInventoryAndSettings?.settings as Partial<GameSettings>) ?? {};
  let currentSettings: GameSettings = {
    sound: typeof loadedSettings.sound === 'boolean' ? loadedSettings.sound : true,
    reducedMotion:
      typeof loadedSettings.reducedMotion === 'boolean'
        ? loadedSettings.reducedMotion
        : false,
  };

  const initialView: GameViewModel = {
    status: 'ready',
    dimension,
    score: 0,
    bestScore,
    secondsRemaining: 60,
    objective:
      dimension === '2d'
        ? 'Collect all 5 stars to win.'
        : 'Collect all 5 energy orbs.',
    isSuspended: false,
    suspensionCauses: [],
    settings: currentSettings,
    canPickDimension: true,
    instructions:
      dimension === '2d'
        ? [
            'Movement: Arrow keys or A/D',
            'Jump: Space',
            'Action: E',
          ]
        : [
            'Movement: Arrow keys or W/S/A/D',
            'Jump: Space',
            'Action: E',
          ],
  };

  const store = new UIStore(initialView);
  let lastAlpha = 0;
  let saveQueue: Promise<void> = Promise.resolve();
  let restoreGeneration = 0;
  // Points added outside the simulation, such as an ad reward. Cleared with each new round.
  let bonus = 0;
  let bonusKeys: readonly string[] = [];
  const roundScore = (): number => adapter.score + bonus;
  const clearBonus = (): void => {
    bonus = 0;
    bonusKeys = [];
  };

  const app: GameApplication = {
    pump(deltaSeconds: number): void {
      if (isDisposed) {
        return;
      }

      if (online) {
        online.runner.update(Math.max(0, deltaSeconds * 1000));
        publishOnline();
        return;
      }

      if (runtime.isSuspended()) {
        store.update({
          status: adapter.status,
          isSuspended: true,
          suspensionCauses: runtime.getSuspensionCauses(),
        });
        return;
      }

      if (adapter.status !== 'running') {
        store.update({
          status: adapter.status,
          score: roundScore(),
          secondsRemaining:
            adapter.secondsRemaining !== null
              ? Math.max(0, Math.ceil(adapter.secondsRemaining))
              : null,
          objective: adapter.objective,
          isSuspended: runtime.isSuspended(),
          suspensionCauses: runtime.getSuspensionCauses(),
        });
        return;
      }

      const pumpResult = runtime.pump(deltaSeconds, (fixedDt, isFirstTick) => {
        const tickInput = input.pollTick(isFirstTick);
        adapter.step(fixedDt, tickInput);
      });

      lastAlpha = pumpResult.alpha;

      // Update best score if beaten
      if (roundScore() > (progress.bestScores[dimension] ?? 0)) {
        progress = {
          ...progress,
          bestScores: {
            ...progress.bestScores,
            [dimension]: roundScore(),
          },
        };
        store.update({ bestScore: roundScore() });
      }

      store.update({
        status: adapter.status,
        score: roundScore(),
        secondsRemaining:
          adapter.secondsRemaining !== null
            ? Math.max(0, Math.ceil(adapter.secondsRemaining))
            : null,
        objective: adapter.objective,
        isSuspended: runtime.isSuspended(),
        suspensionCauses: runtime.getSuspensionCauses(),
      });
    },

    input: {
      setHeld(action: InputAction, held: boolean): void {
        if (isDisposed) return;
        if (online) online.held.set(action, held);
        else input.setHeld(action, held);
      },
      press(action: InputAction): void {
        if (isDisposed) return;
        if (online) { if (action === 'jump') online.jumpTicks = TAP_TICKS; }
        else input.press(action);
      },
    },

    setSuspended(cause: string, suspended: boolean): void {
      if (isDisposed) {
        return;
      }
      // A shared round keeps going for the other players; only local input stops.
      if (online) {
        if (suspended) online.suspended.add(cause); else online.suspended.delete(cause);
        online.held.clear();
        publishOnline();
        return;
      }
      if (runtime.getSuspensionCauses().includes(cause) === suspended) return;
      runtime.setSuspended(cause, suspended);
      input.reset();
      store.update({
        isSuspended: runtime.isSuspended(),
        suspensionCauses: runtime.getSuspensionCauses(),
      });
    },

    restart(): void {
      if (isDisposed) {
        return;
      }
      if (online) { online.restartTicks = TAP_TICKS; return; }
      ++restoreGeneration;
      lastAlpha = 0;
      // Reset only user pause cause; preserve host/hidden/context causes
      runtime.setSuspended('pause', false);
      adapter.restart();
      clearBonus();
      adapter.status = 'running';
      runtime.reset();
      input.reset();
      store.update({
        status: 'running',
        score: roundScore(),
        rewardsClaimed: bonusKeys,
        secondsRemaining: adapter.secondsRemaining,
        objective: adapter.objective,
        isSuspended: runtime.isSuspended(),
        suspensionCauses: runtime.getSuspensionCauses(),
      });
    },

    dispose(): void {
      if (isDisposed) {
        return;
      }
      app.leaveOnline();
      isDisposed = true;
      ++restoreGeneration;
      options.signal?.removeEventListener('abort', onAbort);
      input.reset();
      adapter.dispose();
      runtime.reset();
      store.dispose();
    },

    getPresentation(): PresentationFrame {
      if (online?.adapter) return online.adapter.getPresentation(online.snapshot?.renderAlpha ?? 1);
      return adapter.getPresentation(lastAlpha);
    },

    subscribe(listener: () => void): () => void {
      return store.subscribe(listener);
    },

    getView(): GameViewModel {
      return store.getView();
    },

    getScene(): SceneDefinition2D | SceneDefinition3D {
      return online?.adapter?.getScene() ?? adapter.getScene();
    },

    getPhysicsDigest(): string {
      return adapter.getPhysicsDigest();
    },

    async save(): Promise<void> {
      if (isDisposed || online) {
        return;
      }

      // Synchronously capture state before the first await
      const currentInput = input.captureState();
      const checkpoint = adapter.captureCheckpoint(currentInput);
      const currentScore = roundScore();
      const bonusToSave = bonus > 0 ? { points: bonus, keys: [...bonusKeys] } : undefined;
      const currentStatus = adapter.status;
      const settingsToSave = { ...currentSettings };
      const bestScoresToSave = { ...progress.bestScores };

      saveQueue = saveQueue.catch(() => undefined).then(async () => {
        const latest = await journal.loadProgress();

        const levelRewardId = `${dimension}_level_clear`;
        let completedRewardIds = latest.completedRewardIds ?? [];
        if (currentStatus === 'results' && currentScore >= 500 && !completedRewardIds.includes(levelRewardId)) {
          completedRewardIds = [...completedRewardIds, levelRewardId];
        }

        const mergedBestScores: Record<string, number> = {
          ...latest.bestScores,
        };
        for (const [key, score] of Object.entries(bestScoresToSave)) mergedBestScores[key] = Math.max(mergedBestScores[key] ?? 0, score);
        mergedBestScores[dimension] = Math.max(mergedBestScores[dimension] ?? 0, currentScore);

        const toSave: ProgressSave = {
          ...latest,
          bestScores: mergedBestScores,
          completedRewardIds,
          durableInventoryAndSettings: {
            ...(latest.durableInventoryAndSettings as Record<string, unknown>),
            settings: settingsToSave,
          },
        };

        progress = await journal.saveProgress(toSave);

        const resume: RoundResume = {
          checkpointVersion: CURRENT_CHECKPOINT_VERSION,
          runtimeIdentity: adapter.runtimeIdentity,
          progressGeneration: progress.generation,
          roundCheckpoint: checkpoint,
          ...(bonusToSave ? { bonus: bonusToSave } : {}),
        };

        await journal.saveResume(dimension, resume);
      });

      return saveQueue;
    },

    async restore(): Promise<void> {
      if (isDisposed) {
        return;
      }

      const generation = ++restoreGeneration;
      const stale = (): boolean => isDisposed || generation !== restoreGeneration;
      const loadedProgress = await journal.loadProgress();
      if (stale()) return;
      progress = loadedProgress;
      if (journal.futureSchemaVersion !== null) {
        store.update({ notice: 'This save needs a newer game version. New progress will not be saved.' });
        return;
      }
      const best = progress.bestScores[dimension] ?? 0;
      const loaded =
        (progress.durableInventoryAndSettings?.settings as Partial<GameSettings>) ?? {};
      currentSettings = {
        sound: typeof loaded.sound === 'boolean' ? loaded.sound : currentSettings.sound,
        reducedMotion:
          typeof loaded.reducedMotion === 'boolean'
            ? loaded.reducedMotion
            : currentSettings.reducedMotion,
      };
      store.update({ bestScore: best, settings: currentSettings });

      const resume = await journal.loadResume(dimension);
      if (stale()) return;
      if (!resume) {
        if (journal.invalidResume) {
          adapter.restart(); input.reset(); runtime.reset(); clearBonus();
          store.update({ status: adapter.status, score: 0, rewardsClaimed: bonusKeys, secondsRemaining: 60,
            notice: 'The saved round was damaged. A new round is ready.' });
          await journal.clearResume(dimension);
        }
        return;
      }

      if (
        resume.checkpointVersion !== CURRENT_CHECKPOINT_VERSION ||
        resume.progressGeneration > progress.generation ||
        resume.runtimeIdentity !== adapter.runtimeIdentity ||
        resume.roundCheckpoint.dimension !== dimension
      ) {
        store.update({
          notice: 'Saved round checkpoint is incompatible. Started fresh round.',
        });
        await journal.clearResume(dimension);
        return;
      }

      try {
        adapter.restoreCheckpoint(resume.roundCheckpoint);
        clearBonus();
        const saved = resume.bonus;
        if (saved && Number.isSafeInteger(saved.points) && saved.points > 0 && Array.isArray(saved.keys)) {
          bonus = saved.points;
          bonusKeys = saved.keys.filter((key): key is string => typeof key === 'string');
        }
        input.reset();
        runtime.reset();
        store.update({
          status: adapter.status,
          score: roundScore(),
          rewardsClaimed: bonusKeys,
          secondsRemaining:
            adapter.secondsRemaining !== null
              ? Math.max(0, Math.ceil(adapter.secondsRemaining))
              : null,
          objective: adapter.objective,
          notice: 'Saved round restored.',
        });
      } catch {
        adapter.restart();
        input.reset(); runtime.reset(); clearBonus();
        store.update({
          status: adapter.status, score: 0, rewardsClaimed: bonusKeys, secondsRemaining: 60, objective: adapter.objective,
          notice: 'Failed to restore corrupted round. Started fresh round.',
        });
        await journal.clearResume(dimension);
      }
    },

    getStats(): FixedStepStats {
      return runtime.getStats();
    },

    getRoundCheckpoint(): RoundCheckpoint | null {
      if (isDisposed) {
        return null;
      }
      const currentInput = input.captureState();
      return adapter.captureCheckpoint(currentInput);
    },

    restoreRoundCheckpoint(checkpoint: RoundCheckpoint): void {
      if (!isDisposed) {
        ++restoreGeneration;
        lastAlpha = 0;
        adapter.restoreCheckpoint(checkpoint);
        clearBonus();
        if (checkpoint.inputState) {
          input.restoreState(checkpoint.inputState);
        }
        runtime.reset();
        store.update({
          status: adapter.status,
          score: roundScore(),
          secondsRemaining:
            adapter.secondsRemaining !== null
              ? Math.max(0, Math.ceil(adapter.secondsRemaining))
              : null,
          objective: adapter.objective,
          rewardsClaimed: bonusKeys,
        });
      }
    },

    start(): void {
      if (!isDisposed && !online) {
        ++restoreGeneration;
        adapter.status = 'running';
        store.update({ status: 'running' });
      }
    },

    pause(): void {
      if (!isDisposed && !online) {
        adapter.status = 'paused';
        runtime.setSuspended('pause', true);
        input.reset();
        store.update({
          status: 'paused',
          isSuspended: runtime.isSuspended(),
          suspensionCauses: runtime.getSuspensionCauses(),
        });
      }
    },

    resume(): void {
      if (!isDisposed && !online) {
        runtime.setSuspended('pause', false);
        if (adapter.status === 'paused') {
          adapter.status = 'running';
        }
        store.update({
          status: adapter.status,
          isSuspended: runtime.isSuspended(),
          suspensionCauses: runtime.getSuspensionCauses(),
        });
      }
    },

    async retry(): Promise<void> {
      if (!isDisposed) {
        app.restart();
      }
    },

    setSettings(settingsPatch: Partial<GameSettings>): void {
      if (isDisposed) {
        return;
      }
      currentSettings = {
        ...currentSettings,
        ...settingsPatch,
      };
      store.update({ settings: currentSettings });
    },

    addBonus(points: number, key?: string): void {
      if (isDisposed || online || !Number.isFinite(points) || points < 1 || (key !== undefined && bonusKeys.includes(key))) {
        return;
      }
      bonus += Math.floor(points);
      if (key !== undefined) bonusKeys = [...bonusKeys, key];
      const score = roundScore();
      if (score > (progress.bestScores[dimension] ?? 0)) {
        progress = { ...progress, bestScores: { ...progress.bestScores, [dimension]: score } };
      }
      store.update({ score, bestScore: progress.bestScores[dimension] ?? 0, rewardsClaimed: bonusKeys });
    },

    async startOnline(connect: () => Promise<SyncplayRoomTransport>): Promise<void> {
      if (isDisposed) return;
      if (dimension !== '2d') throw new Error('Online play needs the 2D game.');
      const expected = options.netIdentity;
      if (!expected) throw new Error('Online play needs the game\'s netIdentity.');
      app.leaveOnline();
      // Leave bumps this, so a start the player already walked away from stops quietly.
      const attempt = ++onlineAttempt;
      await initPhysics2D();
      if (isDisposed || attempt !== onlineAttempt) return;
      const held = new Map<string, boolean>();
      const session: OnlineSession = {
        held, suspended: new Set(runtime.getSuspensionCauses().filter((cause) => cause !== 'pause')), jumpTicks: 0, restartTicks: 0, view: { state: 'connecting' }, unsubscribe: () => undefined,
        runner: createSyncplayRunner({
          runtimeFactory: (identity, bytes) => createNetRuntime(expected, identity, bytes, {
            scene: options.scene2d, onCreate: (handle) => { session.adapter = handle.adapter; },
          }),
          defaultInput: NET_NEUTRAL_INPUT,
          encodeInput: encodeNetInput,
          decodeInput: decodeNetInput,
          presentation: { project: (projection) => projection },
          localInputForTick: () => {
            const input = localNetInput({
              held, suspended: session.suspended.size > 0,
              jumpTapped: session.jumpTicks > 0, restartTapped: session.restartTicks > 0,
            });
            session.jumpTicks = Math.max(0, session.jumpTicks - 1);
            session.restartTicks = Math.max(0, session.restartTicks - 1);
            return input;
          },
        }),
      };
      online = session;
      session.unsubscribe = session.runner.subscribe((snapshot) => {
        session.snapshot = snapshot;
        if (online === session) publishOnline();
      });
      store.update({ status: 'ready', online: session.view, notice: undefined });
      try {
        await session.runner.start({ mode: 'networked', connect });
      } catch (error) {
        // Left while connecting: the runner was disposed on purpose, so this is not a failure.
        if (online !== session) return;
        session.view = { state: 'ended', message: 'Could not reach the room. Try again.' };
        store.update({ online: session.view });
        throw error;
      }
    },

    leaveOnline(): void {
      ++onlineAttempt;
      const session = online;
      if (!session) return;
      online = undefined;
      session.unsubscribe();
      void Promise.resolve(session.runner.dispose()).catch(console.warn);
      lastAlpha = 0;
      // The solo round missed the suspensions that changed while online.
      for (const cause of runtime.getSuspensionCauses()) {
        if (cause !== 'pause' && !session.suspended.has(cause)) runtime.setSuspended(cause, false);
      }
      for (const cause of session.suspended) runtime.setSuspended(cause, true);
      input.reset();
      store.update({
        online: undefined, status: adapter.status === 'running' ? 'ready' : adapter.status, score: roundScore(),
        secondsRemaining: adapter.secondsRemaining, objective: adapter.objective,
        isSuspended: runtime.isSuspended(), suspensionCauses: runtime.getSuspensionCauses(),
      });
    },

    get localPlayerId(): string {
      const slot = online?.snapshot?.localSlot ?? 0;
      return online ? seatEntityId(Math.max(0, slot)) : 'player';
    },
  };

  let online: OnlineSession | undefined;
  let onlineAttempt = 0;

  function publishOnline(): void {
    const session = online;
    if (!session) return;
    const snapshot = session.snapshot;
    const world = session.adapter;
    let next: OnlineView;
    if (!snapshot || snapshot.status === 'connecting' || snapshot.status === 'syncing') {
      next = { state: 'connecting', roomCode: snapshot?.roomCode };
    } else if (snapshot.status === 'error' || snapshot.status === 'stopped') {
      next = { state: 'ended', roomCode: snapshot.roomCode, message: 'The connection to your friend closed.' };
    } else if (!world || world.status === 'ready') {
      next = { state: 'waiting', roomCode: snapshot.roomCode };
    } else {
      next = { state: 'playing', roomCode: snapshot.roomCode };
    }
    if (!sameOnlineView(session.view, next)) session.view = next;
    // A closed connection goes back to the start screen, which offers solo play again.
    const status = next.state === 'ended' || !world || world.status === 'ready' ? 'ready' : world.status;
    store.update({
      online: session.view,
      status,
      score: world?.score ?? 0,
      secondsRemaining: world?.secondsRemaining ?? null,
      objective: world?.objective ?? 'Waiting for your friend.',
      isSuspended: session.suspended.size > 0,
      suspensionCauses: [...session.suspended],
    });
  }

  abortCleanup = app.dispose;
  return app;
}
