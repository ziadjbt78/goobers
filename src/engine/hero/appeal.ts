/**
 * APPEAL — the taste layer, as numbers.
 *
 * A creature can be valid and still be boring. This scores how much it looks
 * like something you would want to pick up, so the zoo can show the good ones
 * and the breeder can select on them.
 */
import { hexToRgb01 } from './palette';
import type { Validation } from './validate';
import { headPartOf } from './validate';
import type { HeroTemplate } from './types';

export interface Appeal { score: number; notes: string[] }

/** 1 at `ideal`, falling off smoothly; 0 outside `span`. */
function band(v: number, ideal: number, span: number): number {
  const x = Math.abs(v - ideal) / span;
  return x >= 1 ? 0 : 1 - x * x;
}

function hsl(hex: string): { h: number; s: number; l: number } {
  const [r, g, b] = hexToRgb01(hex);
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  const d = mx - mn;
  const s = d < 1e-6 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d > 1e-6) {
    if (mx === r) h = 60 * (((g - b) / d) % 6);
    else if (mx === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  return { h: (h + 360) % 360, s, l };
}

export function scoreAppeal(
  t: HeroTemplate,
  v: Validation,
  palette: { base: string; belly: string; limb: string; accent: string; deep: string },
): Appeal {
  const notes: string[] = [];
  const parts: number[] = [];

  const head = headPartOf(t);
  const headW = head ? head.proxy.half[0] * 2 : 0.3;
  const e = t.eyes[0];

  // --- the face is 60% of the charm -------------------------------------
  if (e) {
    // eyes want to be big but not cartoonishly so
    const ratio = (e.radius * 2) / headW;
    const s = band(ratio, 0.295, 0.075);
    parts.push(0.22 * s);
    if (s < 0.5) notes.push('eye scale off the sweet spot');

    const l = t.eyes.find((q) => q.side < 0);
    const r = t.eyes.find((q) => q.side > 0);
    if (l && r) {
      const gap = (Math.abs(r.anchor.x - l.anchor.x) - l.radius - r.radius) / (l.radius * 2);
      const g = band(gap, 0.78, 0.35);
      parts.push(0.16 * g);
      if (g < 0.5) notes.push('eye spacing is odd');
    }
    // a face that is fully inside the head silhouette always reads better
    const inside = head ? Math.min(1, e.radius / (head.proxy.half[1] * 0.9)) : 1;
    parts.push(0.06 * (1 - Math.abs(inside - 0.55)));

  } else {
    notes.push('no eyes');
  }

  // --- silhouette --------------------------------------------------------
  const spread = band(Math.log10(Math.max(21, v.metrics.spread)) / 3.2, 0.62, 0.45);
  parts.push(0.16 * spread);

  const count = band(v.metrics.parts, 16, 9);
  parts.push(0.10 * count);
  if (count < 0.4) notes.push('part count out of the sweet spot');

  // --- proportion: legs want a real length, not stubs --------------------
  // legs want a real length between the ground and the body, not stubs
  let hipY = 0;
  let footY = 0;
  for (const bone of t.bones) if (/^hip_/.test(bone.name)) hipY = Math.max(hipY, bone.pos.y);
  if (t.feet.length) footY = t.feet[0].plant.y;
  const legFrac = t.height > 0 ? (hipY - footY) / t.height : 0.3;
  parts.push(0.10 * band(legFrac, 0.30, 0.16));

  // --- colour: the bible's own saturation / lightness window -------------
  const base = hsl(palette.base);
  const sScore = band(base.s, 0.65, 0.25);
  const lScore = band(base.l, 0.62, 0.22);
  parts.push(0.14 * (sScore * 0.5 + lScore * 0.5));
  if (sScore < 0.4) notes.push('base colour is flat or muddy');
  // the accent must actually differ in hue, or it is not an accent
  const accent = hsl(palette.accent);
  let dh = Math.abs(accent.h - base.h);
  if (dh > 180) dh = 360 - dh;
  const hScore = band(dh, 150, 150);
  parts.push(0.06 * hScore);

  // --- validity penalty --------------------------------------------------
  const penalty = Math.min(0.6, v.failures.length * 0.12);

  const raw = parts.reduce((a, b) => a + b, 0);
  const score = Math.max(0, Math.min(100, (raw - penalty) * 100));
  if (!v.ok) notes.push(`${v.failures.length} rig rule violation(s)`);
  return { score, notes };
}
