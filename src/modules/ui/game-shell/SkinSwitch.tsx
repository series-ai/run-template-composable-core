import { useId, type ChangeEvent, type HTMLAttributes, type ReactNode } from 'react'
import { joinClassName } from './classNames'

export interface SkinSwitchProps
  extends Omit<HTMLAttributes<HTMLElement>, 'onChange'> {
  checked?: boolean
  defaultChecked?: boolean
  disabled?: boolean
  label?: ReactNode
  hint?: ReactNode
  name?: string
  onChange?: (checked: boolean) => void
}

export function SkinSwitch({
  checked,
  defaultChecked,
  disabled = false,
  label,
  hint,
  name,
  onChange,
  className,
  style,
  ...rest
}: SkinSwitchProps) {
  const id = useId()
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange?.(event.target.checked)
  }

  return (
    <label
      {...rest}
      className={joinClassName('ui-control ui-control--switch', className)}
      data-disabled={disabled ? 'true' : 'false'}
      style={style}
    >
      <span className="ui-control__row">
        <span className="ui-control__label-group">
          {label ? (
            <span id={`${id}-label`} className="ui-control__label">{label}</span>
          ) : null}
          {hint ? (
            <span id={`${id}-hint`} className="ui-control__hint">{hint}</span>
          ) : null}
        </span>
        <input
          {...(checked === undefined ? { defaultChecked } : { checked })}
          aria-checked={checked}
          aria-labelledby={label ? `${id}-label` : undefined}
          aria-describedby={hint ? `${id}-hint` : undefined}
          className="ui-control__native"
          disabled={disabled}
          name={name}
          onChange={handleChange}
          role="switch"
          type="checkbox"
        />
        <span
          aria-hidden="true"
          className="ui-switch"
          data-ui-renderer-mode="css-theme"
          data-ui-skin-role="input.switch"
        >
          <span className="ui-switch__thumb" />
        </span>
      </span>
    </label>
  )
}

export default SkinSwitch
