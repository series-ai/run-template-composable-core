import SkinButton from './SkinButton'
import SkinDialog from './SkinDialog'
import SkinSwitch from './SkinSwitch'
import type { GameSettings } from './types'

export interface GameShellSettingsDialogProps {
  open: boolean
  settings?: GameSettings
  onUpdateSettings: (patch: Partial<GameSettings>) => void
  onClose: () => void
}

export function GameShellSettingsDialog({
  open,
  settings = { sound: true, reducedMotion: false },
  onUpdateSettings,
  onClose,
}: GameShellSettingsDialogProps) {
  const soundEnabled = settings.sound ?? true
  const reducedMotion = settings.reducedMotion ?? false

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
          Done
        </SkinButton>
      }
      onDismiss={onClose}
      open={open}
      subtitle="Player preferences"
      title="Settings"
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          padding: '8px 0',
        }}
      >
        <SkinSwitch
          checked={soundEnabled}
          hint="Play game sound effects and music."
          label="Sound"
          onChange={(checked) => onUpdateSettings({ sound: checked })}
        />

        <SkinSwitch
          checked={reducedMotion}
          hint="Turn off camera shake and fast screen effects."
          label="Reduced Motion"
          onChange={(checked) => onUpdateSettings({ reducedMotion: checked })}
        />
      </div>
    </SkinDialog>
  )
}

export default GameShellSettingsDialog
