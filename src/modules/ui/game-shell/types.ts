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
}

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

/** A button another module adds to the results screen. The shell draws it and resets it each round. */
export interface ResultsAction {
  id: string
  label: string
  /** A SkinIcon name. An unknown name shows no icon. */
  icon?: string
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
  className?: string
  style?: CSSProperties
}
