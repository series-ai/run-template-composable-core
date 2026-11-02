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
        if (!isDisposed) {
          input.setHeld(action, held);
        }
      },
      press(action: InputAction): void {
        if (!isDisposed) {
          input.press(action);
        }
      },
    },

    setSuspended(cause: string, suspended: boolean): void {
      if (isDisposed) {
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
      isDisposed = true;
      ++restoreGeneration;
      options.signal?.removeEventListener('abort', onAbort);
      input.reset();
      adapter.dispose();
      runtime.reset();
      store.dispose();
    },

    getPresentation(): PresentationFrame {
      return adapter.getPresentation(lastAlpha);
    },

    subscribe(listener: () => void): () => void {
      return store.subscribe(listener);
    },

    getView(): GameViewModel {
      return store.getView();
    },

    getScene(): SceneDefinition2D | SceneDefinition3D {
      return adapter.getScene();
    },

    getPhysicsDigest(): string {
      return adapter.getPhysicsDigest();
    },

    async save(): Promise<void> {
      if (isDisposed) {
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
      if (!isDisposed) {
        ++restoreGeneration;
        adapter.status = 'running';
        store.update({ status: 'running' });
      }
    },

    pause(): void {
      if (!isDisposed) {
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
      if (!isDisposed) {
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
      if (isDisposed || !Number.isFinite(points) || points < 1 || (key !== undefined && bonusKeys.includes(key))) {
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
  };

  abortCleanup = app.dispose;
  return app;
}
