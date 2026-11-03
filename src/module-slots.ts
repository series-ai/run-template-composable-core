import type { ResultsAction } from './modules/ui/game-shell/types';
// modules:imports

/** Buttons on the results screen, in order. Studio adds a module's button here when it installs one. */
export const resultsActions: ResultsAction[] = [
  // modules:results-actions
];

export type StartupTask = () => unknown;

/** Work to run once the game host is ready, such as scheduling reminders. Studio adds a module's task here when it installs one. */
export const startupTasks: StartupTask[] = [
  // modules:startup
];

export type RoundEvent =
  | { type: 'start'; mode: string }
  | { type: 'end'; mode: string; score: number; bestScore: number; durationSeconds: number };
export type RoundListener = (event: RoundEvent) => void;

/** Called when a round starts and when it ends, such as to report analytics. Studio adds a module's listener here when it installs one. */
export const roundListeners: RoundListener[] = [
  // modules:round-events
];
