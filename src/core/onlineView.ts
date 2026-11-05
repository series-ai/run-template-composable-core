import type { GameShellOnlineView } from '../modules/ui/game-shell/types';

const CONNECTING: GameShellOnlineView = Object.freeze({ state: 'connecting' });

/**
 * What the shell shows for online play. A room request in flight wins over the game's own view,
 * which can still hold the previous round's `ended` until the new room arrives.
 */
export function shellOnlineView(game: GameShellOnlineView | undefined, requestPending: boolean): GameShellOnlineView | undefined {
  return requestPending ? CONNECTING : game;
}
