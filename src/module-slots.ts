import type { OnlineIntent, ResultsAction, StartAction } from './modules/ui/game-shell/types';
// modules:imports

/** Buttons on the results screen, in order. Studio adds a module's button here when it installs one. */
export const resultsActions: ResultsAction[] = [
  // modules:results-actions
];

/** Buttons on the start screen, under Play, in order. Studio adds a module's button here when it installs one. */
export const startActions: StartAction[] = [
  // modules:start-actions
];

export interface StartupContext {
  /** Moves the round onto a shared room, as a start screen button would. */
  playOnline: (intent: OnlineIntent) => Promise<{ roomCode?: string }>;
}

export type StartupTask = (context: StartupContext) => unknown;

/** Work to run once the game host is ready, such as scheduling reminders. Studio adds a module's task here when it installs one. */
export const startupTasks: StartupTask[] = [
  // modules:startup
];
