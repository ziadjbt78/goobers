/**
 * Rig.ts — the bridge between the v8 motion layer and a hero render rig.
 *
 * It owns exactly three things and nothing else:
 *   1. the per-species locomotion numbers (heights per second) and the `axes`
 *      signs, which are the ONLY tuning the integration brief allows;
 *   2. the RigAdapter — the object CreatureMotion drives (root, pivot, body,
 *      head, legs, arms, extras, gait, face, emote, vfx, ground);
 *   3. the Face map, which turns one `Face` record into eye lids, pupil scale,
 *      mouth curve/open/width, blush, cheeks, brows and eyeMode symbols.
 *
 * No bone is ever owned twice: the pedestal animator writes the pose, the
 * motion layer writes the additive layer on top, and the Face map is the only
 * writer of the face meshes while a creature is in the World.
 */
import * as THREE from 'three';
import type { HeroHandle } from '../render/hero/HeroRenderer';
import type { HeroTemplate } from '../hero/types';
import type { HeroAnimator } from '../anim/HeroAnimator';
import type { RigAdapter } from './CreatureMotion';
import type { Face } from './Face';
import type { Glyph } from '../render/hero/emotes';
import type { LocoConfig, LocoKind } from './Locomotion';

/** The four sign switches the `G` debug poses exist to verify. */
export interface Axes { pitch: 1 | -1; roll: 1 | -1; limb: 'x' | 'z'; wave: 1 | -1 }

export interface SpeciesSpec {
  kind: LocoKind;
  /** the brief's starting values, all in creature heights (turn in rad/s) */
  walk: number;
  run: number;
  turn: number;
  accel: number;
  decel: number;
  /** distance per full gait cycle at walk, as a fraction of creature height.
   *  MEASURED, not guessed: tools/stride.mjs reports range / 0.5. */
  strideFactor: number;
  axes: Axes;
}

/**
 * Per-species locomotion. `walk/run/turn/accel/decel` are the brief's values.
 * `strideFactor` is written by the calibration run — see the build report.
 */
export const SPECIES: Record<string, SpeciesSpec> = {
  PIP: {
    kind: 'biped', walk: 0.9, run: 2.2, turn: 4, accel: 4, decel: 6,
    strideFactor: 0.199, axes: { pitch: 1, roll: -1, limb: 'x', wave: -1 },
  },
  MOCHI: {
    kind: 'quadruped', walk: 1.1, run: 2.8, turn: 4, accel: 4, decel: 6,
    strideFactor: 0.178, axes: { pitch: 1, roll: -1, limb: 'x', wave: -1 },
  },
  BOP: {
    kind: 'hopper', walk: 1.0, run: 2.4, turn: 4, accel: 4, decel: 6,
    strideFactor: 0.676, axes: { pitch: 1, roll: -1, limb: 'x', wave: 1 },
  },
  ZIK: {
    kind: 'hexapod', walk: 1.0, run: 2.6, turn: 5, accel: 5, decel: 7,
    strideFactor: 0.1765, axes: { pitch: 1, roll: -1, limb: 'x', wave: 1 },
  },
};

export function speciesOf(template: HeroTemplate): SpeciesSpec {
  const key = (template.name || '').split(' ')[0].toUpperCase();
  return SPECIES[key] ?? SPECIES.PIP;
}

/** Target gait frequencies. Short-legged creatures take slower steps, not faster legs. */
export const WALK_FREQ = 2.1;
export const RUN_FREQ = 3.0;
/** Locomotion stretches the stride by 40% at a full run — cadence must respect it. */
export const RUN_STRETCH = 1.4;

export interface LocoCalc {
  cfg: LocoConfig;
  legReach: number;
  reachCap: number;
  walkFreq: number;
  runFreq: number;
  speedCapped: boolean;
}

/**
 * Height-relative tuning -> absolute world units for one concrete creature.
 *
 * The stride is DERIVED from the cadence band rather than from the in-place foot
 * amplitude. Walk holds 2.1 Hz and the run holds 3.0 Hz; the stride carries the
 * speed, and when the leg cannot reach that far the SPEED comes down to meet the
 * leg instead of the legs speeding up. `walkStride * RUN_STRETCH` must still fit
 * inside the reach cap, because Locomotion applies exactly that stretch at a run.
 */
export function locoConfigFor(template: HeroTemplate, height: number, liveReach?: number): LocoConfig {
  return explainLoco(template, height, liveReach).cfg;
}

export function explainLoco(template: HeroTemplate, height: number, liveReach?: number): LocoCalc {
  const s = speciesOf(template);
  // Reach comes from the LIVE rig when the caller has it: `dna.scale` is applied
  // per-bone by reshape, so template offsets alone under-report the real leg.
  let restReach = 0;
  const f0 = template.feet[0];
  if (f0) {
    restReach = template.bones[f0.chain[1]].pos.length() + template.bones[f0.chain[2]].pos.length();
  }
  const ratio = template.height > 1e-6 ? height / template.height : 1;
  const legReach = liveReach && liveReach > 1e-6 ? liveReach : restReach * ratio;
  const reachCap = legReach > 0 ? legReach * 0.95 : Infinity;

  const targetWalk = s.walk * height;
  const targetRun = s.run * height;
  let walkSpeed = targetWalk;
  let runSpeed = targetRun;
  let stride: number;
  let runStride: number;
  let speedCapped = false;

  if (s.kind === 'hopper') {
    stride = s.strideFactor * height;
    runStride = stride * RUN_STRETCH;
    walkSpeed = Math.min(targetWalk, stride * WALK_FREQ);
    runSpeed = Math.max(walkSpeed * 1.15, Math.min(targetRun, runStride * RUN_FREQ));
  } else {
    stride = Math.min(targetWalk / WALK_FREQ, reachCap / RUN_STRETCH);
    runStride = Math.min(reachCap, stride * RUN_STRETCH);
    walkSpeed = stride * WALK_FREQ;
    runSpeed = runStride * RUN_FREQ;
    if (stride < targetWalk / WALK_FREQ - 1e-9 || runStride < targetRun / RUN_FREQ - 1e-9) speedCapped = true;
    if (runSpeed < walkSpeed * 1.15) runSpeed = walkSpeed * 1.15;
  }

  return {
    cfg: {
      kind: s.kind,
      walkSpeed, runSpeed, stride,
      turnRate: s.turn,
      accel: s.accel * height,
      decel: s.decel * height,
    },
    legReach, reachCap, walkFreq: walkSpeed / stride, runFreq: runSpeed / runStride,
    speedCapped,
  };
}

/** The emote names the motion layer speaks -> the glyph atlas the World draws. */
const EMOTE: Record<string, Glyph> = {
  heart: 'heart', note: 'note', alert: 'bang', bang: 'bang',
  question: 'question', zzz: 'zzz', stars: 'star', star: 'star', sweat: 'sweat',
};

export interface RigHooks {
  /** glyph above the head, same renderer the v7 World used */
  emote(g: Glyph, life: number, punch: number): void;
  /** ground/air effects, resolved by the Sim's Vfx */
  vfx(kind: string, x: number, y: number, z: number, scale: number): void;
  ground(x: number, z: number): number;
}

const MOUTH_BASE = -Math.PI * 0.5 - 1.55 * 0.5;

export function createRig(
  template: HeroTemplate,
  handle: HeroHandle,
  anim: HeroAnimator,
  hooks: RigHooks,
): RigAdapter {
  const bones = handle.bones;
  const body = bones[template.bodyBone];
  const head = bones[template.headBone];

  // upper-leg bones, front to back — a template already lists them that way, so
  // the LAST entry is a back leg and the pet-roll kick lands where it should
  const legs: THREE.Object3D[] = [];
  for (const f of template.feet) {
    const hip = bones[f.chain[0]];
    if (hip) legs.push(hip);
  }
  const arms: THREE.Object3D[] = [];
  for (const b of bones) {
    if (b.name.startsWith('arm') && b.name.includes('upper')) arms.push(b);
  }
  const extras: THREE.Object3D[] = [];
  for (const b of bones) {
    const n = b.name;
    if (n.startsWith('ear') || n.startsWith('tail') || n.startsWith('ant')
      || n.startsWith('sprout_leaf') || n.startsWith('antenna')) extras.push(b);
  }

  const blushRest = handle.blushRest.map((v) => v.clone());
  let spiralT = 0;

  function setFace(f: Face): void {
    const sym = f.eyeMode;
    const closed = sym === 'closed';
    const showBall = sym === 'normal' || sym === 'star';
    const lidUpper = Math.max(0, Math.min(0.985, closed ? 1 : f.lidUpper));
    const lidLower = Math.max(0, Math.min(1, f.lidLower));
    const pupil = Math.max(0.3, Math.min(2.2, f.pupil));

    for (const e of handle.eyes) {
      const side = e.side >= 0 ? 1 : -1;
      e.lidPivot.rotation.x = -Math.PI * 0.5 + lidUpper * Math.PI * 0.98;
      e.lidPivot.rotation.z = f.lidTilt * 0.35 * side;
      e.lidLower.visible = lidLower > 0.02;
      e.lidLowerPivot.rotation.x = -Math.PI * 0.5 - lidLower * Math.PI * 0.40;

      e.sclera.visible = showBall;
      e.iris.visible = showBall;
      e.big.visible = showBall;
      e.small.visible = showBall;
      e.pupil.visible = sym === 'normal';
      e.pupil.scale.set(pupil, pupil, 1);

      e.arcHappy.visible = sym === 'happyArc';
      e.arcClosed.visible = closed;
      e.heart.visible = sym === 'heart';
      e.star.visible = sym === 'star';
      e.spiral.visible = sym === 'swirl';
      if (sym === 'swirl') e.spiral.rotation.z = -spiralT * 3;

      e.brow.visible = f.brow > 0.1;
      if (e.brow.visible) {
        e.brow.position.y = e.radius * (0.92 + f.brow * 0.20);
        e.brow.rotation.z = f.browAngle * 0.34 * side;
      }
    }

    const curve = Math.max(-1, Math.min(1, f.mouthCurve));
    const open = Math.max(0, Math.min(1, f.mouthOpen));
    const wide = Math.max(0.2, f.mouthWidth);

    handle.mouthOpen.visible = open > 0.06;
    handle.mouth.visible = open <= 0.06;
    if (handle.mouthOpen.visible) {
      handle.mouthOpen.scale.set(
        wide * (1 + open * 0.15),
        (0.6 + open * 0.75) * (1 + f.cheek * 0.25),
        1 + open * 0.2,
      );
    }
    if (handle.mouth.visible) {
      handle.mouth.scale.set(wide, 1, 1);
      // a half-torus arc: 0 rotation is a smile, so a full flip is a frown and
      // the midpoint is a flat line
      handle.mouth.rotation.z = MOUTH_BASE + (1 - curve) * 0.5 * Math.PI;
    }

    for (let i = 0; i < handle.blush.length; i++) {
      const b = handle.blush[i];
      const rest = blushRest[i];
      b.scale.setScalar(0.85 + f.blush * 0.55 + f.cheek * 0.30 + open * 0.08);
      if (rest) b.position.copy(rest).multiplyScalar(1 + f.cheek * 0.03);
    }
  }

  return {
    root: handle.group,
    pivot: handle.pivot,
    body,
    head,
    legs,
    arms,
    extras,
    height: template.height,
    axes: speciesOf(template).axes,

    setGait(amount: number, phase: number): void {
      spiralT += 1 / 60;
      anim.setGait(amount, phase);
    },
    setFace,
    emote(kind: string): void {
      const g = EMOTE[kind];
      if (g) hooks.emote(g, 1.5, 1.1);
    },
    vfx(kind: string, pos: THREE.Vector3, scale = 1): void {
      hooks.vfx(kind, pos.x, pos.y, pos.z, scale);
    },
    groundHeight(x: number, z: number): number { return hooks.ground(x, z); },
  };
}
