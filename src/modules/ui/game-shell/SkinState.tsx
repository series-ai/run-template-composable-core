import type { HTMLAttributes, ReactNode } from 'react'
import SkinButton from './SkinButton'
import SkinIcon, { type SkinIconName } from './SkinIcon'
import SkinPanel from './SkinPanel'
import { joinClassName } from './classNames'

export type SkinStateVariant = 'loading' | 'error' | 'empty'

export interface SkinStateProps
  extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  variant?: SkinStateVariant
  iconName?: SkinIconName
  title: ReactNode
  message?: ReactNode
  actionLabel?: ReactNode
  onAction?: () => void
}

const ROLE_BY_VARIANT: Record<SkinStateVariant, string> = {
  loading: 'state.loading',
  error: 'state.error',
  empty: 'state.empty',
}

const DEFAULT_ICON: Record<SkinStateVariant, SkinIconName> = {
  loading: 'clock',
  error: 'retry',
  empty: 'info',
}

export function SkinState({
  variant = 'empty',
  iconName,
  title,
  message,
  actionLabel,
  onAction,
  className,
  style,
  ...rest
}: SkinStateProps) {
  const role = ROLE_BY_VARIANT[variant]
  const resolvedIcon = iconName ?? DEFAULT_ICON[variant]

  return (
    <SkinPanel
      {...rest}
      className={joinClassName('ui-state-panel', className)}
      data-ui-skin-role={role}
      style={{
        width: '100%',
        maxWidth: 440,
        margin: '0 auto',
        ...style,
      }}
      variant="card"
    >
      <div className="ui-state-content">
        {variant === 'loading' ? (
          <div aria-hidden="true" className="ui-spinner" />
        ) : (
          <div className="ui-state-icon">
            <SkinIcon name={resolvedIcon} size={32} />
          </div>
        )}
        <h2 className="ui-state-title">{title}</h2>
        {message ? <p className="ui-state-message">{message}</p> : null}
        {actionLabel && onAction ? (
          <div className="ui-state-actions">
            <SkinButton
              onClick={onAction}
              size="default"
              variant={variant === 'error' ? 'primary' : 'secondary'}
            >
              {actionLabel}
            </SkinButton>
          </div>
        ) : null}
      </div>
    </SkinPanel>
  )
}

export default SkinState
