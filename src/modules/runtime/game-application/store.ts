/**
 * UI view model store that notifies subscribers only when values change.
 */

import type { GameViewModel } from './types.js';

type Listener = () => void;

export class UIStore {
  private currentView: GameViewModel;
  private readonly listeners = new Set<Listener>();

  constructor(initialView: GameViewModel) {
    const view = { ...initialView };
    if (view.secondsRemaining !== null && view.secondsRemaining !== undefined) {
      view.secondsRemaining = Math.max(0, Math.ceil(view.secondsRemaining));
    }
    this.currentView = view;
  }

  /**
   * Returns the current view model snapshot.
   */
  getView(): GameViewModel {
    return this.currentView;
  }

  /**
   * Subscribes a listener to view model changes.
   */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  dispose(): void { this.listeners.clear(); }

  /**
   * Updates the view model and notifies listeners when visible values change.
   * Normalizes secondsRemaining to an integer.
   */
  update(patch: Partial<GameViewModel>): void {
    const patchToApply: { -readonly [K in keyof GameViewModel]?: GameViewModel[K] } = {
      ...patch,
    };
    if ('secondsRemaining' in patchToApply) {
      const raw = patchToApply.secondsRemaining;
      patchToApply.secondsRemaining =
        raw === null || raw === undefined ? null : Math.max(0, Math.ceil(raw));
    }

    let hasChanges = false;
    const previous = this.currentView;

    for (const key of Object.keys(patchToApply) as Array<keyof GameViewModel>) {
      const nextValue = patchToApply[key];
      const previousValue = previous[key];

      if (key === 'suspensionCauses') {
        const prevCauses = (previousValue as readonly string[]) ?? [];
        const nextCauses = (nextValue as readonly string[]) ?? [];
        if (
          prevCauses.length !== nextCauses.length ||
          prevCauses.some((c, i) => c !== nextCauses[i])
        ) {
          hasChanges = true;
        }
      } else if (key === 'settings') {
        const prevSettings = previous.settings;
        const nextSettings = patchToApply.settings;
        if (
          nextSettings &&
          (prevSettings.sound !== nextSettings.sound ||
            prevSettings.reducedMotion !== nextSettings.reducedMotion)
        ) {
          hasChanges = true;
        }
      } else if (nextValue !== previousValue) {
        hasChanges = true;
      }
    }

    if (!hasChanges) {
      return;
    }

    this.currentView = {
      ...previous,
      ...patchToApply,
    };

    for (const listener of this.listeners) {
      listener();
    }
  }
}
