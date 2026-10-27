export function joinClassName(
  ...classes: Array<string | undefined | null | false>
): string {
  return classes.filter(Boolean).join(' ')
}
