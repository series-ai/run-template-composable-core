import type { GameShellStore, GameShellView } from './types'

export function createGameShellStore(
  initialView: GameShellView
): GameShellStore {
  let state: GameShellView = { ...initialView }
  const listeners = new Set<() => void>()

  const getSnapshot = (): GameShellView => state

  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  const notify = (): void => {
    for (const listener of listeners) {
      listener()
    }
  }

  const setView = (patch: Partial<GameShellView>): void => {
    const nextState = { ...state, ...patch }
    const changed = (Object.keys(patch) as Array<keyof GameShellView>).some(
      (key) => !Object.is(nextState[key], state[key])
    )

    if (changed) {
      state = nextState
      notify()
    }
  }

  const updateField = <K extends keyof GameShellView>(
    key: K,
    value: GameShellView[K]
  ): void => {
    if (state[key] !== value) {
      state = {
        ...state,
        [key]: value,
      }
      notify()
    }
  }

  return {
    getSnapshot,
    subscribe,
    setView,
    updateField,
  }
}
