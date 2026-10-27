import SkinButton from './SkinButton'
import SkinIcon from './SkinIcon'
import SkinProgress from './SkinProgress'
import type { GameShellActions, GameShellView } from './types'

export interface GameShellHudProps {
  view: GameShellView
  actions: GameShellActions
  onOpenSettings?: () => void
  onOpenHelp?: () => void
}

export function GameShellHud({
  view,
  actions,
  onOpenSettings,
  onOpenHelp,
}: GameShellHudProps) {
  const {
    score,
    bestScore,
    secondsRemaining,
    objective,
    progress,
    notice,
    dimension,
    canPickDimension,
  } = view

  const formatTime = (seconds: number | null): string => {
    if (seconds === null) return '--'
    const wholeSeconds = Math.max(0, Math.ceil(seconds))
    const mins = Math.floor(wholeSeconds / 60)
    const secs = wholeSeconds % 60
    if (mins > 0) {
      return `${mins}:${secs.toString().padStart(2, '0')}`
    }
    return `${secs}s`
  }

  const toggleDimension = () => {
    actions.setDimension(dimension === '2d' ? '3d' : '2d')
  }

  return (
    <header
      aria-label="Game HUD"
      className="game-shell__hud"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        pointerEvents: 'none',
        padding: '12px 16px',
        paddingTop: 'max(12px, env(safe-area-inset-top))',
        zIndex: 40,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}
    >
      <div
        className="game-shell__hud-top-row"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        <div
          className="game-shell__hud-stats"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            pointerEvents: 'auto',
          }}
        >
          <div className="game-shell__hud-stat game-shell__hud-score">
            <span className="game-shell__stat-label">Score</span>
            <span className="game-shell__stat-value">{score}</span>
          </div>

          <div className="game-shell__hud-stat game-shell__hud-best">
            <span className="game-shell__stat-label">
              <SkinIcon name="trophy" size={14} /> Best
            </span>
            <span className="game-shell__stat-value">{bestScore}</span>
          </div>

          {secondsRemaining !== null ? (
            <div className="game-shell__hud-stat game-shell__hud-time">
              <span className="game-shell__stat-label">
                <SkinIcon name="clock" size={14} /> Time
              </span>
              <span className="game-shell__stat-value">
                {formatTime(secondsRemaining)}
              </span>
            </div>
          ) : null}
        </div>

        <div
          className="game-shell__hud-controls"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            pointerEvents: 'auto',
          }}
        >
          {canPickDimension ? (
            <SkinButton
              aria-label={`Switch to ${dimension === '2d' ? '3D' : '2D'}`}
              className="game-shell__dim-btn"
              iconName={dimension === '2d' ? '3d' : '2d'}
              onClick={toggleDimension}
              size="compact"
              variant="secondary"
            >
              {dimension === '2d' ? '3D' : '2D'}
            </SkinButton>
          ) : null}

          {onOpenHelp ? (
            <SkinButton
              aria-label="Help"
              iconName="help"
              onClick={onOpenHelp}
              size="compact"
              variant="ghost"
            />
          ) : null}

          {onOpenSettings ? (
            <SkinButton
              aria-label="Settings"
              iconName="settings"
              onClick={onOpenSettings}
              size="compact"
              variant="ghost"
            />
          ) : null}

          <SkinButton
            aria-label="Pause game"
            iconName="pause"
            onClick={actions.pause}
            size="compact"
            variant="ghost"
          />
        </div>
      </div>

      {objective ? (
        <div
          className="game-shell__hud-objective-bar"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            pointerEvents: 'none',
          }}
        >
          <div
            className="game-shell__hud-objective"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              pointerEvents: 'auto',
            }}
          >
            <SkinIcon name="target" size={14} />
            <span>{objective}</span>
          </div>

          {progress !== undefined ? (
            <div
              className="game-shell__hud-progress-wrap"
              style={{ pointerEvents: 'auto', maxWidth: 280 }}
            >
              <SkinProgress max={100} showValue={false} value={progress} />
            </div>
          ) : null}
        </div>
      ) : null}

      {notice ? (
        <aside
          aria-live="polite"
          className="game-shell__hud-notice"
          style={{ pointerEvents: 'auto' }}
        >
          <span>{notice}</span>
        </aside>
      ) : null}
    </header>
  )
}

export default GameShellHud
