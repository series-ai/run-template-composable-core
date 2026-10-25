import {
  useRef,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from 'react'
import SkinPanel from './SkinPanel'
import { useDismissOnEscape } from './useDismissOnEscape'
import { useFocusTrap } from './useFocusTrap'
import { joinClassName } from './classNames'

export interface SkinDialogProps
  extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  open?: boolean
  title?: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  children?: ReactNode
  showBackdrop?: boolean
  onDismiss?: () => void
  width?: CSSProperties['width']
}

export function SkinDialog({
  open = true,
  title,
  subtitle,
  actions,
  children,
  showBackdrop = true,
  onDismiss,
  width = 'min(460px, calc(100vw - 32px))',
  className,
  style,
  ...rest
}: SkinDialogProps) {
  const shellRef = useRef<HTMLDivElement>(null)
  useFocusTrap(shellRef, open)
  useDismissOnEscape(open, onDismiss)

  if (!open) {
    return null
  }

  return (
    <div
      ref={shellRef}
      aria-modal="true"
      aria-label={typeof title === 'string' ? title : undefined}
      className={joinClassName('ui-dialog-shell', className)}
      data-focus-scope
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onDismiss?.()
        }
      }}
      role="dialog"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 500,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
        background: showBackdrop
          ? 'var(--game-shell-backdrop, rgba(0, 0, 0, 0.72))'
          : 'transparent',
        pointerEvents: 'auto',
      }}
    >
      <SkinPanel
        {...rest}
        actions={actions}
        style={{
          width,
          maxWidth: '100%',
          maxHeight: 'calc(100dvh - 32px)',
          overflowY: 'auto',
          ...style,
        }}
        subtitle={subtitle}
        title={title}
        variant="modal"
      >
        <div className="ui-dialog__body">{children}</div>
      </SkinPanel>
    </div>
  )
}

export default SkinDialog
