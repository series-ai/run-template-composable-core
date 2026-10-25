import SkinButton from './SkinButton'
import SkinDialog from './SkinDialog'
import SkinIcon from './SkinIcon'
import type { GameShellActions, GameShellView } from './types'

export interface GameShellResultsOverlayProps {
  open: boolean
  view: GameShellView
  actions: GameShellActions
}

export function GameShellResultsOverlay({
  open,
  view,
  actions,
}: GameShellResultsOverlayProps) {
  const { score, bestScore, dimension, canPickDimension, notice } = view
  const isNewBest = score >= bestScore && score > 0

  return (
    <SkinDialog
      actions={
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            width: '100%',
          }}
        >
          <SkinButton
            data-autofocus
            iconName="play"
            onClick={actions.restart}
            size="hero"
            variant="primary"
          >
            Play Again
          </SkinButton>

          {canPickDimension ? (
            <SkinButton
              iconName={dimension === '2d' ? '3d' : '2d'}
              onClick={() =>
                actions.setDimension(dimension === '2d' ? '3d' : '2d')
              }
              size="default"
              variant="secondary"
            >
              {dimension === '2d' ? 'Play in 3D' : 'Play in 2D'}
            </SkinButton>
          ) : null}
        </div>
      }
      open={open}
      subtitle="Round finished"
      title="Results"
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '16px',
          padding: '8px 0',
          textAlign: 'center',
        }}
      >
        {isNewBest ? (
          <div className="game-shell__new-best-badge">
            <SkinIcon name="trophy" size={18} />
            <span>New Best Score!</span>
          </div>
        ) : null}

        <div className="game-shell__results-scores">
          <div className="game-shell__score-box">
            <span className="game-shell__stat-label">Final Score</span>
            <span className="game-shell__score-display">{score}</span>
          </div>

          <div className="game-shell__score-box">
            <span className="game-shell__stat-label">High Score</span>
            <span className="game-shell__score-display">{bestScore}</span>
          </div>
        </div>

        {notice ? (
          <div className="game-shell__notice-banner">
            <span>{notice}</span>
          </div>
        ) : null}
      </div>
    </SkinDialog>
  )
}

export default GameShellResultsOverlay
