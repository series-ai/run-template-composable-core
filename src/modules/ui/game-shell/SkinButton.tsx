import {
  forwardRef,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ReactNode,
} from 'react'
import SkinIcon, { type SkinIconName } from './SkinIcon'
import { joinClassName } from './classNames'

export type SkinButtonVariant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'icon'
  | 'close'
  | 'pill'

export type SkinButtonTone = 'yellow' | 'green' | 'blue' | 'red' | 'gray'
export type SkinButtonSize = 'compact' | 'default' | 'hero'

export interface SkinButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: SkinButtonVariant
  tone?: SkinButtonTone
  size?: SkinButtonSize
  iconName?: SkinIconName
  iconPosition?: 'start' | 'end'
  active?: boolean
  leadingVisual?: ReactNode
  trailingVisual?: ReactNode
  children?: ReactNode
}

const ROLE_BY_VARIANT: Record<SkinButtonVariant, string> = {
  primary: 'button.primary',
  secondary: 'button.secondary',
  ghost: 'button.ghost',
  icon: 'button.icon',
  close: 'button.close',
  pill: 'button.pill',
}

export const SkinButton = forwardRef<HTMLButtonElement, SkinButtonProps>(
  function SkinButton(
    {
      variant = 'primary',
      tone,
      size = 'default',
      iconName,
      iconPosition = 'start',
      active = false,
      leadingVisual,
      trailingVisual,
      className,
      style,
      children,
      type = 'button',
      disabled,
      ...rest
    },
    ref
  ) {
    const role = ROLE_BY_VARIANT[variant]
    const isIconOnly = Boolean(iconName && !children && !leadingVisual && !trailingVisual)

    const resolvedIcon = iconName ? (
      <SkinIcon
        name={iconName}
        size={size === 'hero' ? 24 : size === 'compact' ? 16 : 20}
      />
    ) : null

    const resolvedLeading =
      leadingVisual ?? (iconPosition === 'start' ? resolvedIcon : null)
    const resolvedTrailing =
      trailingVisual ?? (iconPosition === 'end' ? resolvedIcon : null)

    return (
      <button
        {...rest}
        ref={ref}
        aria-pressed={active ? 'true' : undefined}
        className={joinClassName('ui-button', className)}
        data-active={active ? 'true' : 'false'}
        data-disabled={disabled ? 'true' : 'false'}
        data-icon-only={isIconOnly ? 'true' : 'false'}
        data-size={size}
        data-tone={tone}
        data-ui-renderer-mode="css-theme"
        data-ui-skin-role={role}
        data-variant={variant}
        disabled={disabled}
        style={style as CSSProperties}
        type={type}
      >
        <span aria-hidden="true" className="ui-button__chrome" />
        <span className="ui-button__content">
          {resolvedLeading ? (
            <span className="ui-button__visual ui-button__visual--leading">
              {resolvedLeading}
            </span>
          ) : null}
          {children ? (
            <span className="ui-button__label">{children}</span>
          ) : null}
          {resolvedTrailing ? (
            <span className="ui-button__visual ui-button__visual--trailing">
              {resolvedTrailing}
            </span>
          ) : null}
        </span>
      </button>
    )
  }
)

export default SkinButton
