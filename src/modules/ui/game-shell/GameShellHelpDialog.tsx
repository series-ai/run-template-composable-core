import SkinButton from './SkinButton'
import SkinDialog from './SkinDialog'

export interface GameShellHelpDialogProps {
  open: boolean
  instructions?: string | string[]
  onClose: () => void
}

const DEFAULT_INSTRUCTIONS = [
  'Use Arrow Keys or touch D-Pad to move.',
  'Press Space or Action button A to jump or interact.',
  'Press Escape or Pause button to open the menu.',
  'Reach the goal before the timer runs out.',
]

export function GameShellHelpDialog({
  open,
  instructions,
  onClose,
}: GameShellHelpDialogProps) {
  const items = Array.isArray(instructions)
    ? instructions
    : typeof instructions === 'string'
      ? [instructions]
      : DEFAULT_INSTRUCTIONS

  return (
    <SkinDialog
      actions={
        <SkinButton
          data-autofocus
          onClick={onClose}
          size="default"
          style={{ width: '100%' }}
          variant="primary"
        >
          Got It
        </SkinButton>
      }
      onDismiss={onClose}
      open={open}
      subtitle="Controls and rules"
      title="How to Play"
    >
      <ul
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          padding: '8px 0 8px 20px',
          margin: 0,
        }}
      >
        {items.map((item, index) => (
          <li key={index} className="game-shell__help-item">
            {item}
          </li>
        ))}
      </ul>
    </SkinDialog>
  )
}

export default GameShellHelpDialog
