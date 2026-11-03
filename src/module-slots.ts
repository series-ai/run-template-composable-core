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
