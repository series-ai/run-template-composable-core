/**
 * Encoded sRGB color validation and premultiplied alpha calculations.
 */

import type { ColorRgba } from './types';

/**
 * Validate that an input is a finite 4-element ColorRgba tuple with values in range 0 to 1.
 */
export function validateColorRgba(input: unknown): ColorRgba {
  if (!Array.isArray(input) || input.length !== 4) {
    throw new TypeError('Color must be a 4-element array [r, g, b, a].');
  }
  for (let i = 0; i < 4; i += 1) {
    const val = input[i];
    if (typeof val !== 'number' || !Number.isFinite(val) || val < 0 || val > 1) {
      throw new RangeError(`Color component at index ${i} must be a finite number between 0 and 1.`);
    }
  }
  return [input[0]!, input[1]!, input[2]!, input[3]!];
}

/**
 * Convert a hexadecimal string to ColorRgba.
 * Does not use THREE.Color string parsing.
 */
export function parseHexToColorRgba(hex: string, alpha = 1.0): ColorRgba {
  if (typeof hex !== 'string') {
    throw new TypeError('Hex color must be a string.');
  }

  const clean = hex.startsWith('#') ? hex.slice(1) : hex;
  let r: number;
  let g: number;
  let b: number;
  let a = alpha;

  if (clean.length === 6) {
    r = parseInt(clean.slice(0, 2), 16) / 255;
    g = parseInt(clean.slice(2, 4), 16) / 255;
    b = parseInt(clean.slice(4, 6), 16) / 255;
  } else if (clean.length === 8) {
    r = parseInt(clean.slice(0, 2), 16) / 255;
    g = parseInt(clean.slice(2, 4), 16) / 255;
    b = parseInt(clean.slice(4, 6), 16) / 255;
    a = parseInt(clean.slice(6, 8), 16) / 255;
  } else if (clean.length === 3) {
    r = parseInt(clean[0]! + clean[0]!, 16) / 255;
    g = parseInt(clean[1]! + clean[1]!, 16) / 255;
    b = parseInt(clean[2]! + clean[2], 16) / 255;
  } else {
    throw new TypeError(`Invalid hex color string: "${hex}".`);
  }

  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b) || Number.isNaN(a)) {
    throw new TypeError(`Failed to parse hex color string: "${hex}".`);
  }

  return validateColorRgba([r, g, b, a]);
}

/**
 * Premultiply RGB components by alpha.
 */
export function premultiplyColor(color: ColorRgba): ColorRgba {
  const [r, g, b, a] = color;
  return [r * a, g * a, b * a, a];
}

/**
 * Unpremultiply RGB components by dividing by alpha.
 */
export function unpremultiplyColor(color: ColorRgba): ColorRgba {
  const [r, g, b, a] = color;
  if (a < 0.0001) {
    return [0, 0, 0, 0];
  }
  return [r / a, g / a, b / a, a];
}

/**
 * Compare two colors for equality within epsilon.
 */
export function colorsEqual(a: ColorRgba, b: ColorRgba, epsilon = 0.001): boolean {
  return (
    Math.abs(a[0] - b[0]) <= epsilon &&
    Math.abs(a[1] - b[1]) <= epsilon &&
    Math.abs(a[2] - b[2]) <= epsilon &&
    Math.abs(a[3] - b[3]) <= epsilon
  );
}
