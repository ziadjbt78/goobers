import { osc, pulse, smooth, easeOutBack } from './util';
import type { FaceController } from './Face';
import type { RigAdapter } from './CreatureMotion';

export interface Pose { lift: number; squash: number; pitch: number; roll: number; yaw: number; headPitch: number; headRoll: number; wiggle: number; limbFlail: number; legKick: number; armWave: number; rollOver: number; grow: number; }
export const ZERO_POSE: Pose = { lift: 0, squash: 1, pitch: 0, roll: 0, yaw: 0, headPitch: 0, headRoll: 0, wiggle: 0, limbFlail: 0, legKick: 0, armWave: 0, rollOver: 0, grow: 1 };

export interface Step {
  dur: number; expr?: string; emote?: string; vfx?: string; vfxScale?: number;
  pose?: (k: number, t: number) => Partial<Pose>;
  mouth?: (k: number, t: number) => number;
}

export class Choreo {
  private i = -1; private t = 0; done = false;
  constructor(private steps: Step[]) {}
  update(dt: number, rig: RigAdapter, face: FaceController): Partial<Pose> {
    if (this.done) return {};
    if (this.i < 0 || this.t >= this.steps[this.i].dur) {
      this.i++; this.t = 0;
      if (this.i >= this.steps.length) { this.done = true; face.mouthOverride = null; return {}; }
      const s = this.steps[this.i];
      if (s.expr) face.set(s.expr);
      if (s.emote) rig.emote(s.emote);
      if (s.vfx) rig.vfx(s.vfx, rig.root.position, s.vfxScale ?? 1);
    }
    const s = this.steps[this.i];
    this.t += dt;
    const k = Math.min(1, this.t / s.dur);
    face.mouthOverride = s.mouth ? s.mouth(k, this.t) : null;
    return s.pose ? s.pose(k, this.t) : {};
  }
}

// Lift is in creature heights. Angles are in radians.
export const ACTIONS: Record<string, Step[]> = {
  feedEat: [
    { dur: 0.25, expr: 'curious', pose: k => ({ squash: 1 - 0.15 * pulse(k) }) },
    { dur: 0.7, pose: (k, t) => ({ headPitch: 0.45 * smooth(0, 0.3, k) + 0.06 * osc(t, 6), pitch: 0.15 }) },  // sniff
    { dur: 1.8, expr: 'eating', vfx: 'crumbs',
      pose: (k, t) => ({ headPitch: 0.3 + 0.12 * osc(t, 2.5), squash: 1 - 0.1 * Math.abs(osc(t, 2.5)), pitch: 0.12 }),
      mouth: (k, t) => 0.5 + 0.5 * osc(t, 2.5) },                                                            // 4-5 chomps
    { dur: 0.3, expr: 'joyful', pose: k => ({ squash: 1 - 0.25 * pulse(k) }) },                              // gulp
    { dur: 1.3, emote: 'note', pose: (k, t) => ({ wiggle: 1 - 0.5 * k, lift: 0.18 * Math.max(0, osc(t, 1.6)) }) },
  ],
  sadLate: [
    { dur: 0.2, expr: 'surprised' },
    { dur: 1.4, expr: 'sad', emote: 'question', pose: k => ({ headPitch: 0.25 * smooth(0, 0.3, k), squash: 0.94 }) },
  ],
  yuck: [
    { dur: 0.5, expr: 'curious', pose: k => ({ headPitch: 0.35 * pulse(k) }) },
    { dur: 1.2, expr: 'yuck', pose: (k, t) => ({ yaw: 0.35 * osc(t, 3) * (1 - k), pitch: -0.15 }) },
  ],
  callNotice: [
    { dur: 0.12, expr: 'surprised', emote: 'alert', pose: k => ({ squash: 1 + 0.2 * pulse(k), lift: 0.15 * pulse(k) }) },
    { dur: 0.35, pose: k => ({ squash: 1 - 0.18 * pulse(k) }) },
  ],
  callPeek: [
    { dur: 0.3, expr: 'curious', emote: 'question', pose: k => ({ pitch: -0.15 * k }) },
    { dur: 1.0, pose: (k, t) => ({ roll: 0.25 * osc(t, 0.8), pitch: -0.15 }) },
  ],
  callWave: [
    { dur: 0.3, expr: 'sleepy' },
    { dur: 1.4, pose: () => ({ armWave: 1 }) },
  ],
  callArrive: [
    { dur: 0.2, pose: k => ({ squash: 1 - 0.25 * pulse(k) }) },
    { dur: 0.45, expr: 'joyful', pose: k => ({ lift: 0.5 * pulse(k), squash: 1 + 0.2 * pulse(k) }) },
    { dur: 0.25, pose: k => ({ squash: 1 - 0.3 * pulse(k) }) },
    { dur: 0.8, emote: 'heart', pose: k => ({ headPitch: -0.35 * smooth(0, 0.3, k) }) },                   // look up at camera
  ],
  spawn: [
    { dur: 0.35, expr: 'asleep', vfx: 'flash', vfxScale: 1.5, pose: k => ({ grow: Math.max(0.01, easeOutBack(k)) }) },
    { dur: 0.3, pose: k => ({ squash: 1 + 0.3 * pulse(k) }) },                                              // stretch tall
    { dur: 0.12, expr: 'curious' }, { dur: 0.1, expr: 'asleep' }, { dur: 0.12, expr: 'curious' }, { dur: 0.1, expr: 'asleep' },
    { dur: 0.8, expr: 'curious', pose: k => ({ yaw: 0.5 * Math.sin(k * Math.PI * 2) }) },                  // look around
    { dur: 0.5, expr: 'joyful', emote: 'note', pose: k => ({ lift: 0.45 * pulse(k), squash: 1 + 0.15 * pulse(k) }) },
  ],
  landDizzy: [
    { dur: 0.22, vfx: 'dustRing', vfxScale: 1.5, expr: 'surprised', pose: k => ({ squash: 1 - 0.32 * pulse(k) }) },
    { dur: 1.5, expr: 'dizzy', emote: 'stars', pose: (k, t) => ({ roll: 0.18 * osc(t, 1.2), pitch: 0.12 * osc(t + 0.3, 1.2), squash: 0.96 }) },
    { dur: 0.6, expr: 'surprised', pose: (k, t) => ({ yaw: 0.4 * osc(t, 7) * (1 - k), squash: 1 + 0.08 * osc(t, 7) }) }, // shake off
    { dur: 0.3, expr: 'happy' },
  ],
  inspectWave: [
    { dur: 0.3, expr: 'curious', pose: k => ({ headPitch: -0.3 * k }) },
    { dur: 1.4, expr: 'joyful', pose: (k, t) => ({ headPitch: -0.3, armWave: 1, headRoll: 0.15 * osc(t, 1.5) }) },
  ],
  petRelease: [
    { dur: 0.15, pose: k => ({ squash: 1 - 0.2 * pulse(k) }) },
    { dur: 0.4, expr: 'joyful', emote: 'heart', pose: k => ({ lift: 0.45 * pulse(k), squash: 1 + 0.15 * pulse(k) }) },
    { dur: 0.25, pose: k => ({ squash: 1 - 0.18 * pulse(k) }) },
  ],
  celebrate: [
    { dur: 0.4, expr: 'joyful', emote: 'note', pose: k => ({ lift: 0.5 * pulse(k) }) },
    { dur: 0.45, pose: k => ({ lift: 0.35 * pulse(k), yaw: k * Math.PI * 2 }) },                            // spin hop
  ],
};

export function petPose(hold: number, t: number): Partial<Pose> {
  const r = smooth(2.0, 2.6, hold);   // roll onto its back after 2 s
  return { pitch: 0.12 * (1 - r), wiggle: 0.8, legKick: smooth(0.4, 0.8, hold) * (1 - r), rollOver: r, limbFlail: 0.7 * r, squash: 1 - 0.05 * osc(t, 2) };
}

export function callResponse(p: { bold: number; lazy: number }) {
  if (p.lazy > 0.7 && p.bold < 0.5) return { actions: ['callNotice', 'callWave'], speedMul: 0, goes: false };
  if (p.bold >= 0.5) return { actions: ['callNotice'], speedMul: 1, goes: true };     // sprint at runSpeed
  return { actions: ['callNotice', 'callPeek'], speedMul: 0.45, goes: true };          // shy: peek, then walk slowly
}