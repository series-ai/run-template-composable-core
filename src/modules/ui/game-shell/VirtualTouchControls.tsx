import {
  useCallback,
  useEffect,
  useRef,
  type PointerEvent,
} from 'react'
import SkinIcon, { type SkinIconName } from './SkinIcon'
import type { GameShellActions, TouchControlsConfig } from './types'

export interface VirtualTouchControlsProps {
  actions: GameShellActions
  config?: TouchControlsConfig
  disabled?: boolean
}

interface DpadDirection {
  id: string
  action: string
  label: string
  icon: SkinIconName
}

const DPAD_DIRECTIONS: DpadDirection[] = [
  { id: 'up', action: 'up', label: 'Move Up', icon: 'dpad-up' },
  { id: 'left', action: 'left', label: 'Move Left', icon: 'dpad-left' },
  { id: 'down', action: 'down', label: 'Move Down', icon: 'dpad-down' },
  { id: 'right', action: 'right', label: 'Move Right', icon: 'dpad-right' },
]

export function VirtualTouchControls({
  actions,
  config,
  disabled = false,
}: VirtualTouchControlsProps) {
  const activeHeldRef = useRef<Map<string, Set<number>>>(new Map())
  const actionsRef = useRef(actions)
  actionsRef.current = actions

  const releaseAll = useCallback(() => {
    for (const action of activeHeldRef.current.keys()) {
      actionsRef.current.setHeld(action, false)
    }
    activeHeldRef.current.clear()
  }, [])

  useEffect(() => {
    if (disabled) {
      releaseAll()
    }
  }, [disabled, releaseAll])

  useEffect(() => {
    const handleBlur = () => {
      releaseAll()
    }

    window.addEventListener('blur', handleBlur)
    return () => {
      window.removeEventListener('blur', handleBlur)
      releaseAll()
    }
  }, [releaseAll])

  const handlePointerDown = (
    event: PointerEvent<HTMLButtonElement>,
    action: string
  ) => {
    if (disabled) {
      return
    }
    event.currentTarget.setPointerCapture?.(event.pointerId)
    const pointers = activeHeldRef.current.get(action) ?? new Set<number>()
    pointers.add(event.pointerId)
    activeHeldRef.current.set(action, pointers)
    actionsRef.current.setHeld(action, true)
  }

  const handlePointerUp = (
    event: PointerEvent<HTMLButtonElement>,
    action: string
  ) => {
    const pointers = activeHeldRef.current.get(action)
    if (pointers?.delete(event.pointerId) && pointers.size === 0) {
      activeHeldRef.current.delete(action)
      actionsRef.current.setHeld(action, false)
    }
  }

  const handlePointerCancel = (
    event: PointerEvent<HTMLButtonElement>,
    action: string
  ) => {
    const pointers = activeHeldRef.current.get(action)
    if (pointers?.delete(event.pointerId) && pointers.size === 0) {
      activeHeldRef.current.delete(action)
      actionsRef.current.setHeld(action, false)
    }
  }

  if (config?.enabled === false) {
    return null
  }

  const showDpad = config?.showDpad !== false
  const buttons = config?.buttons ?? [
    { id: 'action-a', label: 'A', tone: 'primary' },
    { id: 'action-b', label: 'B', tone: 'secondary' },
  ]

  return (
    <div
      aria-hidden={disabled ? 'true' : undefined}
      aria-label="Touch Controls"
      className="game-shell__touch-controls"
      data-disabled={disabled ? 'true' : 'false'}
      role="group"
    >
      {showDpad ? (
        <div
          aria-label="Direction Controls"
          className="game-shell__touch-dpad"
          role="group"
        >
          {DPAD_DIRECTIONS.map((dir) => (
            <button
              key={dir.id}
              aria-label={dir.label}
              className={`game-shell__touch-btn game-shell__touch-dpad-${dir.id}`}
              data-action={dir.action}
              disabled={disabled}
              onLostPointerCapture={(e) => handlePointerCancel(e, dir.action)}
              onPointerCancel={(e) => handlePointerCancel(e, dir.action)}
              onPointerDown={(e) => handlePointerDown(e, dir.action)}
              onPointerUp={(e) => handlePointerUp(e, dir.action)}
              type="button"
            >
              <SkinIcon name={dir.icon} size={24} />
            </button>
          ))}
        </div>
      ) : (
        <div />
      )}

      <div
        aria-label="Action Buttons"
        className="game-shell__touch-actions"
        role="group"
      >
        {buttons.map((btn) => (
          <button
            key={btn.id}
            aria-label={`Action ${btn.label}`}
            className="game-shell__touch-btn game-shell__touch-action-btn"
            data-action={btn.id}
            data-tone={btn.tone ?? 'primary'}
            disabled={disabled}
            onLostPointerCapture={(e) => handlePointerCancel(e, btn.id)}
            onPointerCancel={(e) => handlePointerCancel(e, btn.id)}
            onPointerDown={(e) => handlePointerDown(e, btn.id)}
            onPointerUp={(e) => handlePointerUp(e, btn.id)}
            type="button"
          >
            <span>{btn.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export default VirtualTouchControls
