import type { CSSProperties, SVGProps } from 'react'

export type SkinIconName =
  | 'play'
  | 'pause'
  | 'resume'
  | 'restart'
  | 'retry'
  | 'settings'
  | 'sound-on'
  | 'sound-off'
  | 'motion'
  | 'help'
  | 'close'
  | 'check'
  | 'chevron-left'
  | 'chevron-right'
  | '2d'
  | '3d'
  | 'trophy'
  | 'clock'
  | 'target'
  | 'info'
  | 'dpad-up'
  | 'dpad-down'
  | 'dpad-left'
  | 'dpad-right'

export interface SkinIconProps extends SVGProps<SVGSVGElement> {
  name: SkinIconName
  size?: number | string
  className?: string
  style?: CSSProperties
}

export function SkinIcon({
  name,
  size = 20,
  className,
  style,
  ...rest
}: SkinIconProps) {
  const iconStyle: CSSProperties = {
    width: size,
    height: size,
    display: 'inline-block',
    verticalAlign: 'middle',
    flexShrink: 0,
    ...style,
  }

  switch (name) {
    case 'play':
      return (
        <svg
          {...rest}
          aria-hidden="true"
          className={className}
          fill="currentColor"
          style={iconStyle}
          viewBox="0 0 24 24"
        >
          <path d="M8 5v14l11-7z" />
        </svg>
      )
    case 'pause':
      return (
        <svg
          {...rest}
          aria-hidden="true"
          className={className}
          fill="currentColor"
          style={iconStyle}
          viewBox="0 0 24 24"
        >
          <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
        </svg>
      )
    case 'resume':
      return (
        <svg
          {...rest}
          aria-hidden="true"
          className={className}
          fill="currentColor"
          style={iconStyle}
          viewBox="0 0 24 24"
        >
          <path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z" />
        </svg>
      )
    case 'restart':
    case 'retry':
      return (
        <svg
          {...rest}
          aria-hidden="true"
          className={className}
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.2"
          style={iconStyle}
          viewBox="0 0 24 24"
        >
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
          <path d="M3 3v5h5" />
        </svg>
      )
    case 'settings':
      return (
        <svg
          {...rest}
          aria-hidden="true"
          className={className}
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.2"
          style={iconStyle}
          viewBox="0 0 24 24"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      )
    case 'sound-on':
      return (
        <svg
          {...rest}
          aria-hidden="true"
          className={className}
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.2"
          style={iconStyle}
          viewBox="0 0 24 24"
        >
          <polygon fill="currentColor" points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
        </svg>
      )
    case 'sound-off':
      return (
        <svg
          {...rest}
          aria-hidden="true"
          className={className}
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.2"
          style={iconStyle}
          viewBox="0 0 24 24"
        >
          <polygon fill="currentColor" points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <line x1="23" x2="17" y1="9" y2="15" />
          <line x1="17" x2="23" y1="9" y2="15" />
        </svg>
      )
    case 'motion':
      return (
        <svg
          {...rest}
          aria-hidden="true"
          className={className}
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.2"
          style={iconStyle}
          viewBox="0 0 24 24"
        >
          <path d="M5 12h14" />
          <path d="M12 5l7 7-7 7" />
        </svg>
      )
    case 'help':
    case 'info':
      return (
        <svg
          {...rest}
          aria-hidden="true"
          className={className}
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.2"
          style={iconStyle}
          viewBox="0 0 24 24"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4" />
          <path d="M12 8h.01" />
        </svg>
      )
    case 'close':
      return (
        <svg
          {...rest}
          aria-hidden="true"
          className={className}
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.2"
          style={iconStyle}
          viewBox="0 0 24 24"
        >
          <line x1="18" x2="6" y1="6" y2="18" />
          <line x1="6" x2="18" y1="6" y2="18" />
        </svg>
      )
    case 'check':
      return (
        <svg
          {...rest}
          aria-hidden="true"
          className={className}
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.5"
          style={iconStyle}
          viewBox="0 0 24 24"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )
    case 'chevron-left':
      return (
        <svg
          {...rest}
          aria-hidden="true"
          className={className}
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.5"
          style={iconStyle}
          viewBox="0 0 24 24"
        >
          <polyline points="15 18 9 12 15 6" />
        </svg>
      )
    case 'chevron-right':
      return (
        <svg
          {...rest}
          aria-hidden="true"
          className={className}
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.5"
          style={iconStyle}
          viewBox="0 0 24 24"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      )
    case '2d':
      return (
        <svg
          {...rest}
          aria-hidden="true"
          className={className}
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          style={iconStyle}
          viewBox="0 0 24 24"
        >
          <rect height="18" rx="2" width="18" x="3" y="3" />
          <path d="M3 9h18" />
          <path d="M9 21V9" />
        </svg>
      )
    case '3d':
      return (
        <svg
          {...rest}
          aria-hidden="true"
          className={className}
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          style={iconStyle}
          viewBox="0 0 24 24"
        >
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
          <line x1="12" x2="12" y1="22.08" y2="12" />
        </svg>
      )
    case 'trophy':
      return (
        <svg
          {...rest}
          aria-hidden="true"
          className={className}
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          style={iconStyle}
          viewBox="0 0 24 24"
        >
          <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
          <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
          <path d="M4 22h16" />
          <path d="M10 14.66V17c0 .55-.45 1-1 1H8v4h8v-4h-1c-.55 0-1-.45-1-1v-2.34" />
          <path d="M6 4h12v7a6 6 0 0 1-12 0V4z" />
        </svg>
      )
    case 'clock':
      return (
        <svg
          {...rest}
          aria-hidden="true"
          className={className}
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          style={iconStyle}
          viewBox="0 0 24 24"
        >
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      )
    case 'target':
      return (
        <svg
          {...rest}
          aria-hidden="true"
          className={className}
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          style={iconStyle}
          viewBox="0 0 24 24"
        >
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="6" />
          <circle cx="12" cy="12" r="2" />
        </svg>
      )
    case 'dpad-up':
      return (
        <svg
          {...rest}
          aria-hidden="true"
          className={className}
          fill="currentColor"
          style={iconStyle}
          viewBox="0 0 24 24"
        >
          <path d="M12 4l-6 6h12z" />
        </svg>
      )
    case 'dpad-down':
      return (
        <svg
          {...rest}
          aria-hidden="true"
          className={className}
          fill="currentColor"
          style={iconStyle}
          viewBox="0 0 24 24"
        >
          <path d="M12 20l6-6H6z" />
        </svg>
      )
    case 'dpad-left':
      return (
        <svg
          {...rest}
          aria-hidden="true"
          className={className}
          fill="currentColor"
          style={iconStyle}
          viewBox="0 0 24 24"
        >
          <path d="M4 12l6 6V6z" />
        </svg>
      )
    case 'dpad-right':
      return (
        <svg
          {...rest}
          aria-hidden="true"
          className={className}
          fill="currentColor"
          style={iconStyle}
          viewBox="0 0 24 24"
        >
          <path d="M20 12l-6-6v12z" />
        </svg>
      )
    default:
      return null
  }
}

export default SkinIcon
