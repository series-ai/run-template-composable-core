/**
 * Fixed codepoint sorting functions.
 * Use fixed character code point comparisons.
 * Do not use localeCompare.
 */

/**
 * Compare two strings by character code point values.
 * Returns -1 if left is less than right.
 * Returns 1 if left is greater than right.
 * Returns 0 if both strings match.
 */
export function compareFixedCodepoints(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

/**
 * Compare numbers stably.
 */
export function compareNumbers(left: number, right: number): number {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}
