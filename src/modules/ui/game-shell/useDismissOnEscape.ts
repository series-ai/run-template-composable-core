import { useEffect } from 'react'

export function useDismissOnEscape(
  active: boolean,
  onDismiss: (() => void) | undefined
): void {
  useEffect(() => {
    if (!active || !onDismiss) {
      return undefined
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onDismiss()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [active, onDismiss])
}
