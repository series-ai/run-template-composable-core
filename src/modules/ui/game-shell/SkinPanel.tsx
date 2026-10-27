import type { HTMLAttributes, ReactNode } from 'react'
import { joinClassName } from './classNames'

export type SkinPanelVariant =
  | 'card'
  | 'section'
  | 'modal'
  | 'sheet'
  | 'hud'

const ROLE_BY_VARIANT: Record<SkinPanelVariant, string> = {
  card: 'panel.card',
  section: 'panel.section',
  modal: 'panel.modal',
  sheet: 'panel.sheet',
  hud: 'panel.hud',
}

export interface SkinPanelProps
  extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  variant?: SkinPanelVariant
  title?: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  children?: ReactNode
}

export function SkinPanel({
  variant = 'card',
  title,
  subtitle,
  actions,
  children,
  className,
  style,
  ...rest
}: SkinPanelProps) {
  const role = ROLE_BY_VARIANT[variant]

  return (
    <section
      {...rest}
      className={joinClassName('ui-surface', 'ui-panel', className)}
      data-ui-renderer-mode="css-theme"
      data-ui-skin-role={role}
      data-variant={variant}
      style={style}
    >
      <span aria-hidden="true" className="ui-panel__chrome" />
      <div className="ui-panel__content" data-ui-slot="content">
        {title || subtitle || actions ? (
          <div className="ui-panel__header" data-ui-slot="header">
            <div className="ui-panel__titles" data-ui-slot="titles">
              {title ? (
                <h2 className="ui-panel__title" data-ui-slot="title">
                  {title}
                </h2>
              ) : null}
              {subtitle ? (
                <div className="ui-panel__subtitle" data-ui-slot="subtitle">
                  {subtitle}
                </div>
              ) : null}
            </div>
            {actions ? (
              <div className="ui-panel__actions" data-ui-slot="actions">
                {actions}
              </div>
            ) : null}
          </div>
        ) : null}
        {children ? (
          <div className="ui-panel__body" data-ui-slot="body">
            {children}
          </div>
        ) : null}
      </div>
    </section>
  )
}

export default SkinPanel
