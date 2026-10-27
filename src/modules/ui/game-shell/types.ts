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
  className?: string
  style?: CSSProperties
}
