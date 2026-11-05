import type { GameShellOnlineView } from '../modules/ui/game-shell/types';

const CONNECTING: GameShellOnlineView = Object.freeze({ state: 'connecting' });

/**
 * What the shell shows for online play. A room request in flight wins over the game's own view,
 * which can still hold the previous round's `ended` until the new room arrives.
 */
export function shellOnlineView(game: GameShellOnlineView | undefined, requestPending: boolean): GameShellOnlineView | undefined {
  return requestPending ? CONNECTING : game;
}

/**
 * Runs one room request. When the player has since left it (`stillCurrent` is false), its result
 * and any failure are dropped and `left` is returned, so a late error can't reach a newer attempt.
 */
export async function unlessLeft<T>(work: Promise<T>, stillCurrent: () => boolean, left: T): Promise<T> {
  try {
    const result = await work;
    return stillCurrent() ? result : left;
  } catch (error) {
    if (!stillCurrent()) return left;
    throw error;
  }
}
