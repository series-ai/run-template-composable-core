import { useEffect, type RefObject } from 'react'

const FOCUSABLE_SELECTOR =
  'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),' +
  'textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
  ).filter((element) => {
    return (
      !element.hasAttribute('hidden') &&
      element.getAttribute('aria-hidden') !== 'true'
    )
  })
}

export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  active: boolean
): void {
  useEffect(() => {
    if (!active) {
      return undefined
    }

    const container = containerRef.current
    if (!container) {
      return undefined
    }

    const previouslyFocused = document.activeElement as HTMLElement | null
    const items = getFocusableElements(container)
    const autofocusItem = container.querySelector<HTMLElement>('[data-autofocus]')

    const targetToFocus = autofocusItem ?? items[0] ?? container
    targetToFocus.focus()

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Tab') {
        return
      }

      const currentItems = getFocusableElements(container)
      if (currentItems.length === 0) {
        event.preventDefault()
        return
      }

      const first = currentItems[0]
      const last = currentItems[currentItems.length - 1]
      const activeElement = document.activeElement

      if (event.shiftKey && activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    container.addEventListener('keydown', onKeyDown)
    return () => {
      container.removeEventListener('keydown', onKeyDown)
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus()
      }
    }
  }, [active, containerRef])
}
