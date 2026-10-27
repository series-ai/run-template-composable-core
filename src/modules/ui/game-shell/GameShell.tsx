import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import GameShellHelpDialog from './GameShellHelpDialog'
import GameShellHud from './GameShellHud'
import GameShellPauseMenu from './GameShellPauseMenu'
import GameShellResultsOverlay from './GameShellResultsOverlay'
import GameShellSettingsDialog from './GameShellSettingsDialog'
import GameShellStartOverlay from './GameShellStartOverlay'
import SkinState from './SkinState'
import VirtualTouchControls from './VirtualTouchControls'
import { joinClassName } from './classNames'
import type {
  GameShellProps,
  GameShellStore,
  GameShellView,
} from './types'

function isStore(target: GameShellView | GameShellStore): target is GameShellStore {
  return (
    typeof target === 'object' &&
    target !== null &&
    'subscribe' in target &&
    typeof (target as GameShellStore).subscribe === 'function' &&
    'getSnapshot' in target &&
    typeof (target as GameShellStore).getSnapshot === 'function'
  )
}

export function GameShell({
  view: viewProp,
  actions,
  children,
  touchControls,
  className,
  style,
}: GameShellProps) {
  const isViewStore = isStore(viewProp)

  const view = useSyncExternalStore(
    useCallback(
      (listener) => (isViewStore ? viewProp.subscribe(listener) : () => {}),
      [isViewStore, viewProp]
    ),
    useCallback(
      () => (isViewStore ? viewProp.getSnapshot() : viewProp),
      [isViewStore, viewProp]
    )
  )

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const actionsRef = useRef(actions)
  actionsRef.current = actions

  const isMenuOpen =
    view.status === 'paused' ||
    view.status === 'ready' ||
    view.status === 'results' ||
    view.status === 'error' ||
    view.status === 'loading' ||
    settingsOpen ||
    helpOpen

  // Clear gameplay input whenever menus open
  useEffect(() => {
    actionsRef.current.setMenuOpen?.(isMenuOpen)
    if (isMenuOpen) {
      actionsRef.current.setHeld('up', false)
      actionsRef.current.setHeld('down', false)
      actionsRef.current.setHeld('left', false)
      actionsRef.current.setHeld('right', false)
      actionsRef.current.setHeld('action-a', false)
      actionsRef.current.setHeld('action-b', false)
      for (const button of touchControls?.buttons ?? []) actionsRef.current.setHeld(button.id, false)
    }
  }, [isMenuOpen, touchControls?.buttons])

  useEffect(() => {
    const handleWindowBlur = () => {
      actionsRef.current.setHeld('up', false)
      actionsRef.current.setHeld('down', false)
      actionsRef.current.setHeld('left', false)
      actionsRef.current.setHeld('right', false)
      actionsRef.current.setHeld('action-a', false)
      actionsRef.current.setHeld('action-b', false)
    }

    const handleFocusIn = (event: FocusEvent) => {
      // Clear game action holds if focus moves into DOM inputs
      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'SELECT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        handleWindowBlur()
      }
    }

    window.addEventListener('blur', handleWindowBlur)
    window.addEventListener('focusin', handleFocusIn)
    return () => {
      window.removeEventListener('blur', handleWindowBlur)
      window.removeEventListener('focusin', handleFocusIn)
    }
  }, [])

  return (
    <div
      className={joinClassName('game-shell', className)}
      data-dimension={view.dimension}
      data-menu-open={isMenuOpen ? 'true' : 'false'}
      data-status={view.status}
      data-ui-theme="game-shell"
      style={style}
    >

      <div className="game-shell__world" inert={isMenuOpen}>
        {children}
      </div>

      {(view.status === 'running' || view.status === 'paused') ? (
        <GameShellHud
          actions={actions}
          onOpenHelp={() => setHelpOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          view={view}
        />
      ) : null}

      {view.status === 'running' ? (
        <VirtualTouchControls
          actions={actions}
          config={touchControls}
          disabled={isMenuOpen}
        />
      ) : null}

      {view.status === 'ready' ? (
        <GameShellStartOverlay
          actions={actions}
          onOpenHelp={() => setHelpOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          view={view}
        />
      ) : null}

      {view.status === 'loading' ? (
        <div className="game-shell__screen-overlay">
          <SkinState
            message="Please wait while the game world is prepared."
            title="Loading"
            variant="loading"
          />
        </div>
      ) : null}

      {view.status === 'error' ? (
        <div className="game-shell__screen-overlay">
          <SkinState
            actionLabel="Try Again"
            message={view.error ?? 'An unexpected error occurred while loading.'}
            onAction={actions.retry}
            title="Unable to Play"
            variant="error"
          />
        </div>
      ) : null}

      <GameShellPauseMenu
        actions={actions}
        onOpenHelp={() => setHelpOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        open={view.status === 'paused' && !settingsOpen && !helpOpen}
      />

      <GameShellResultsOverlay
        actions={actions}
        open={view.status === 'results' && !settingsOpen && !helpOpen}
        view={view}
      />

      <GameShellSettingsDialog
        onClose={() => setSettingsOpen(false)}
        onUpdateSettings={actions.setSettings}
        open={settingsOpen}
        settings={view.settings}
      />

      <GameShellHelpDialog
        instructions={view.instructions}
        onClose={() => setHelpOpen(false)}
        open={helpOpen}
      />
    </div>
  )
}

export default GameShell
