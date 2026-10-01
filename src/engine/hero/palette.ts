/**
 * Curated palettes only. Every entry is an authored harmony with a real colour
 * hierarchy: a mid base, a lighter belly/face patch, darker limbs and feet in the
 * same hue, and ONE complementary accent for the small parts.
 * Saturation stays 55-75% and base lightness 55-70%. No grey-teal, no mud.
 */
export interface CuratedPalette {
  name: string;
  base: string;
  belly: string;
  limb: string;
  accent: string;
  deep: string;
}

export const PALETTES: CuratedPalette[] = [
  { name: 'Mango', base: '#f2913f', belly: '#ffd9a8', limb: '#cf7223', accent: '#3f7fd6', deep: '#7a3d0d' },
  { name: 'Bubblegum', base: '#f06f9c', belly: '#ffcfdd', limb: '#c94f78', accent: '#3fbfa0', deep: '#7d2244' },
  { name: 'Mint', base: '#4fd0a8', belly: '#c4f4e4', limb: '#2fa282', accent: '#f0708f', deep: '#146352' },
  { name: 'Blueberry', base: '#5f8fe8', belly: '#c6daff', limb: '#3f66bd', accent: '#ffb347', deep: '#22386e' },
  { name: 'Lemon', base: '#f2d24f', belly: '#fdf0b4', limb: '#c9a72a', accent: '#6f6ae0', deep: '#7a6410' },
  { name: 'Grape', base: '#9a6fe0', belly: '#dccbff', limb: '#7149bd', accent: '#7be0a8', deep: '#422577' },
  { name: 'Coral', base: '#f2726a', belly: '#ffd0c8', limb: '#c94f47', accent: '#4fb8d6', deep: '#7a2620' },
  { name: 'Avocado', base: '#8cc44f', belly: '#dcf0b4', limb: '#649938', accent: '#e07a4f', deep: '#3a5c18' },
  { name: 'Peach', base: '#f5a37a', belly: '#ffe0cb', limb: '#cf7b52', accent: '#5fb8a8', deep: '#8c4a25' },
  { name: 'Cyanide', base: '#4fb8d6', belly: '#c2edf7', limb: '#2f8ca8', accent: '#f2a04f', deep: '#175560' },
  { name: 'Rose', base: '#e85f7a', belly: '#ffc9d4', limb: '#bd3f59', accent: '#f2c14f', deep: '#6e1f30' },
  { name: 'Indigo', base: '#6f7ae0', belly: '#c9cfff', limb: '#4b54bd', accent: '#f2884f', deep: '#2b3175' },
];

export function paletteAt(i: number): CuratedPalette {
  const n = PALETTES.length;
  return PALETTES[((i % n) + n) % n];
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

export function hexToRgb01(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0.8, 0.5, 0.5];
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function hexToLinear(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb01(hex);
  return [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)];
}

export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Blend two authored colours in sRGB space so the result stays on-palette. */
export function mixRgb(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  const k = clamp01(t);
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

/** Select a palette deterministically from an integer seed. */
export function paletteForSeed(seed: number): number {
  const n = PALETTES.length;
  return ((seed % n) + n) % n;
}
