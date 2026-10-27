import SkinButton from './SkinButton'
import SkinDialog from './SkinDialog'
import type { GameShellActions } from './types'

export interface GameShellPauseMenuProps {
  open: boolean
  actions: GameShellActions
  onOpenSettings?: () => void
  onOpenHelp?: () => void
}

export function GameShellPauseMenu({
  open,
  actions,
  onOpenSettings,
  onOpenHelp,
}: GameShellPauseMenuProps) {
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
            iconName="resume"
            onClick={actions.resume}
            size="hero"
            variant="primary"
          >
            Resume
          </SkinButton>

          <SkinButton
            iconName="restart"
            onClick={actions.restart}
            size="default"
            variant="secondary"
          >
            Restart Round
          </SkinButton>

          <div
            style={{
              display: 'flex',
              gap: '8px',
              width: '100%',
            }}
          >
            {onOpenSettings ? (
              <SkinButton
                iconName="settings"
                onClick={onOpenSettings}
                size="default"
                style={{ flex: 1 }}
                variant="ghost"
              >
                Settings
              </SkinButton>
            ) : null}

            {onOpenHelp ? (
              <SkinButton
                iconName="help"
                onClick={onOpenHelp}
                size="default"
                style={{ flex: 1 }}
                variant="ghost"
              >
                Help
              </SkinButton>
            ) : null}
          </div>
        </div>
      }
      onDismiss={actions.resume}
      open={open}
      subtitle="Round is paused"
      title="Paused"
    >
      <div
        style={{
          textAlign: 'center',
          padding: '8px 0',
        }}
      >
        <p className="game-shell__muted-text">
          Game inputs are inactive while paused.
        </p>
      </div>
    </SkinDialog>
  )
}

export default GameShellPauseMenu
