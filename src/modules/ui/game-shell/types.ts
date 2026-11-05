import type { CSSProperties, ReactNode } from 'react'

export type GameStatus = 'loading' | 'ready' | 'running' | 'paused' | 'results' | 'error'

export type GameDimension = '2d' | '3d'

export interface GameSettings {
  sound: boolean
  reducedMotion: boolean
}

export interface GameShellView {
  status: GameStatus
  dimension: GameDimension
  score: number
  bestScore: number
  secondsRemaining: number | null
  objective: string
  progress?: number
  notice?: string
  error?: string
  settings?: GameSettings
  canPickDimension?: boolean
  instructions?: string | string[]
  levelName?: string
  /** Results actions whose reward this round already has, so they stay hidden after a reload. */
  rewardsClaimed?: readonly string[]
  /** Present while the round is shared with other players. The start screen shows `waiting` and `ended`. */
  online?: GameShellOnlineView
}

export interface GameShellOnlineView {
  state: 'connecting' | 'waiting' | 'playing' | 'ended'
  roomCode?: string
  message?: string
}

/** How to reach a shared room: make one, join one by code, or be matched with anyone. */
export type OnlineIntent = { kind: 'create' } | { kind: 'join'; roomCode: string } | { kind: 'quick-match' }

export interface GameShellActions {
  start: () => void
  pause: () => void
  resume: () => void
  restart: () => void
  retry: () => void
  setDimension: (dimension: GameDimension) => void
  setHeld: (action: string, held: boolean) => void
  press: (action: string) => void
  setSettings: (settings: Partial<GameSettings>) => void
  setMenuOpen?: (open: boolean) => void
  /** Adds points to the finished round's score, best score and save. A key counts once per round. */
  addScore?: (points: number, key?: string) => void
  /** Moves the round onto a shared room. Resolves with the room code once the room answers. */
  playOnline?: (intent: OnlineIntent) => Promise<{ roomCode?: string }>
  /** Leaves the shared room for a solo round. */
  leaveOnline?: () => void
}

export interface StartActionContext {
  playOnline: NonNullable<GameShellActions['playOnline']>
}

/** A button another module adds to the start screen, under Play. */
export interface StartAction {
  id: string
  label: string
  /** A SkinIcon name. An unknown name shows no icon. */
  icon?: string
  run: (context: StartActionContext) => Promise<void>
}

export interface ResultsActionContext {
  addScore?: (points: number) => void
}

export interface ResultsActionOutcome {
  /** Shown under the button. */
  notice?: string
  /** Hides the button until the next results screen. */
  claimed?: boolean
}

export interface ResultsActionState {
  /** Grays the button out so it can't be tapped. */
  disabled?: boolean
  /** Button text to show instead of `label`, such as "Come back tomorrow". */
  label?: string
}

/** A button another module adds to the results screen. The shell draws it and resets it each round. */
export interface ResultsAction {
  id: string
  label: string
  /** A SkinIcon name. An unknown name shows no icon. */
  icon?: string
  /** Asked when the results screen opens and after each tap. The button stays gray until it answers. */
  getState?: () => Promise<ResultsActionState>
  run: (context: ResultsActionContext) => Promise<ResultsActionOutcome | void>
}

export interface TouchButtonConfig {
  id: string
  label: string
  tone?: 'primary' | 'secondary' | 'accent'
}

export interface TouchControlsConfig {
  enabled?: boolean
  showDpad?: boolean
  buttons?: TouchButtonConfig[]
}

export interface GameShellStore {
  getSnapshot: () => GameShellView
  subscribe: (listener: () => void) => () => void
  setView: (patch: Partial<GameShellView>) => void
  updateField: <K extends keyof GameShellView>(key: K, value: GameShellView[K]) => void
}

export interface GameShellProps {
  view: GameShellView | GameShellStore
  actions: GameShellActions
  children?: ReactNode
  touchControls?: TouchControlsConfig
  resultsActions?: ResultsAction[]
  startActions?: StartAction[]
  className?: string
  style?: CSSProperties
}
