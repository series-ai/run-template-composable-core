import { useRef, useState } from 'react'
import SkinButton from './SkinButton'
import SkinIcon, { isSkinIconName } from './SkinIcon'
import SkinPanel from './SkinPanel'
import { useFocusTrap } from './useFocusTrap'
import type { GameShellActions, GameShellView, StartAction } from './types'

export interface GameShellStartOverlayProps {
  view: GameShellView
  actions: GameShellActions
  startActions?: StartAction[]
  onOpenSettings?: () => void
  onOpenHelp?: () => void
}

export function GameShellStartOverlay({
  view,
  actions,
  startActions,
  onOpenSettings,
  onOpenHelp,
}: GameShellStartOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  useFocusTrap(containerRef, true)
  const [actionNotice, setActionNotice] = useState<string | null>(null)
  const online = view.online
  // The game shows `connecting` as soon as a room is requested, which hides these buttons, so
  // the screen needs no busy state of its own that could outlive a cancelled request.
  const inRoom = online?.state === 'connecting' || online?.state === 'waiting'
  const playOnline = actions.playOnline
  const runStartAction = (action: StartAction): void => {
    if (!playOnline) return
    setActionNotice(null)
    action.run({ playOnline }).catch((error: unknown) => {
      console.warn('A start screen action failed.', error)
      setActionNotice('That did not work. Please try again.')
    })
  }

  const {
    objective,
    bestScore,
    dimension,
    canPickDimension,
    levelName,
    notice,
  } = view

  return (
    <div
      ref={containerRef}
      aria-label="Game Start Screen"
      className="game-shell__start-overlay"
      data-focus-scope
      role="region"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        paddingTop: 'max(20px, env(safe-area-inset-top))',
        paddingBottom: 'max(20px, env(safe-area-inset-bottom))',
        background: 'var(--game-shell-backdrop, rgba(0, 0, 0, 0.65))',
        pointerEvents: 'auto',
      }}
    >
      <SkinPanel
        className="game-shell__start-card"
        style={{
          width: '100%',
          maxWidth: 420,
          textAlign: 'center',
        }}
        subtitle={levelName ?? 'Ready to Play'}
        title="Ready"
        variant="card"
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            alignItems: 'center',
          }}
        >
          {notice || actionNotice || (online?.state === 'ended' && online.message) ? (
            <div className="game-shell__notice-banner">
              <span>{actionNotice ?? (online?.state === 'ended' ? online.message : notice)}</span>
            </div>
          ) : null}

          {inRoom ? (
            <div className="game-shell__start-objective" aria-live="polite">
              <span className="game-shell__stat-label">
                {online?.state === 'connecting' ? 'Connecting' : 'Waiting for your friend'}
              </span>
              {online?.roomCode ? (
                <p className="game-shell__objective-text">Room code: <strong>{online.roomCode}</strong></p>
              ) : null}
            </div>
          ) : null}

          {objective ? (
            <div className="game-shell__start-objective">
              <span className="game-shell__stat-label">Objective</span>
              <p className="game-shell__objective-text">{objective}</p>
            </div>
          ) : null}

          {bestScore > 0 ? (
            <div className="game-shell__start-best">
              <SkinIcon name="trophy" size={16} />
              <span>Best Score: {bestScore}</span>
            </div>
          ) : null}

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              width: '100%',
              gap: '10px',
              marginTop: '8px',
            }}
          >
            {inRoom ? (
              <SkinButton data-autofocus iconName="close" onClick={() => actions.leaveOnline?.()} size="hero" variant="secondary">
                Leave
              </SkinButton>
            ) : (
              <SkinButton
                data-autofocus
                iconName="play"
                onClick={() => { if (online?.state === 'ended') actions.leaveOnline?.(); actions.start() }}
                size="hero"
                variant="primary"
              >
                Play
              </SkinButton>
            )}

            {!inRoom && playOnline ? startActions?.map((action) => (
              <SkinButton
                key={action.id}
                iconName={isSkinIconName(action.icon) ? action.icon : undefined}
                onClick={() => runStartAction(action)}
                size="default"
                variant="secondary"
              >
                {action.label}
              </SkinButton>
            )) : null}

            <div
              style={{
                display: 'flex',
                gap: '8px',
                width: '100%',
                justifyContent: 'center',
              }}
            >
              {canPickDimension && !inRoom ? (
                <SkinButton
                  iconName={dimension === '2d' ? '3d' : '2d'}
                  onClick={() =>
                    actions.setDimension(dimension === '2d' ? '3d' : '2d')
                  }
                  size="default"
                  variant="secondary"
                >
                  {dimension === '2d' ? 'Switch to 3D' : 'Switch to 2D'}
                </SkinButton>
              ) : null}

              {onOpenHelp ? (
                <SkinButton
                  iconName="help"
                  onClick={onOpenHelp}
                  size="default"
                  variant="ghost"
                >
                  Help
                </SkinButton>
              ) : null}

              {onOpenSettings ? (
                <SkinButton
                  aria-label="Settings"
                  iconName="settings"
                  onClick={onOpenSettings}
                  size="default"
                  variant="ghost"
                />
              ) : null}
            </div>
          </div>
        </div>
      </SkinPanel>
    </div>
  )
}

export default GameShellStartOverlay
