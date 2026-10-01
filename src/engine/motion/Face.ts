export type EyeMode = 'normal' | 'happyArc' | 'swirl' | 'heart' | 'star' | 'closed';
export interface Face {
  lidUpper: number;    // 0 open ... 1 closed
  lidLower: number;    // 0 ... 1 (raised = smiling eyes)
  lidTilt: number;     // -1 sad ... +1 angry
  pupil: number;       // scale, 1 = default
  mouthCurve: number;  // -1 frown ... +1 smile
  mouthOpen: number;   // 0 ... 1
  mouthWidth: number;  // scale
  blush: number;       // 0 ... 1
  cheek: number;       // cheek puff 0 ... 1
  brow: number;        // 0 hidden ... 1 shown
  browAngle: number;   // -1 worried ... +1 angry
  eyeMode: EyeMode;
}
const BASE: Face = { lidUpper: 0.05, lidLower: 0, lidTilt: 0, pupil: 1, mouthCurve: 0.4, mouthOpen: 0, mouthWidth: 1, blush: 0.3, cheek: 0, brow: 0, browAngle: 0, eyeMode: 'normal' };
export const EXPR: Record<string, Partial<Face>> = {
  neutral: {},
  happy: { lidLower: 0.35, mouthCurve: 0.9, mouthOpen: 0.25, blush: 0.6 },
  joyful: { eyeMode: 'happyArc', mouthCurve: 1, mouthOpen: 0.6, blush: 0.9 },
  love: { eyeMode: 'heart', mouthCurve: 0.8, mouthOpen: 0.2, blush: 1 },
  curious: { lidUpper: 0, pupil: 1.25, mouthCurve: 0.2, mouthOpen: 0.1, brow: 0.6, lidTilt: 0.1 },
  surprised: { lidUpper: 0, pupil: 0.7, mouthOpen: 0.8, mouthWidth: 0.6, mouthCurve: 0, brow: 1, browAngle: -0.3 },
  scared: { lidUpper: 0, pupil: 0.6, mouthCurve: -0.6, mouthOpen: 0.35, brow: 1, browAngle: -0.8, lidLower: 0.1 },
  sad: { lidUpper: 0.35, lidTilt: -0.4, mouthCurve: -0.7, brow: 0.8, browAngle: -1, blush: 0.1 },
  eating: { lidLower: 0.3, mouthCurve: 0.5, cheek: 0.2 },
  sleepy: { lidUpper: 0.65, mouthCurve: 0.1 },
  asleep: { eyeMode: 'closed', mouthOpen: 0.1, mouthCurve: 0.2 },
  dizzy: { eyeMode: 'swirl', mouthCurve: -0.2, mouthOpen: 0.3, mouthWidth: 0.8 },
  yuck: { lidUpper: 0.4, lidLower: 0.4, mouthCurve: -0.9, mouthOpen: 0.2, brow: 0.8, browAngle: 0.5 },
  angry: { lidUpper: 0.3, lidTilt: 0.5, mouthCurve: -0.5, brow: 1, browAngle: 1 },
};
const NUM: (keyof Face)[] = ['lidUpper', 'lidLower', 'lidTilt', 'pupil', 'mouthCurve', 'mouthOpen', 'mouthWidth', 'blush', 'cheek', 'brow', 'browAngle'];

export class FaceController {
  cur: Face = { ...BASE };
  private target: Face = { ...BASE };
  private hold = 0; private blinkT = 0; private nextBlink = 2 + Math.random() * 3; private doubled = false;
  mouthOverride: number | null = null;

  set(name: string, hold = 0) {
    this.target = { ...BASE, ...(EXPR[name] ?? {}) };
    this.hold = hold;
    if (name === 'surprised') this.blinkT = 0.12;
  }
  update(dt: number) {
    if (this.hold > 0 && (this.hold -= dt) <= 0) this.set('neutral');
    const k = 1 - Math.exp(-dt / 0.08);   // ~0.2 s blend
    const c = this.cur as any, t = this.target as any;
    for (const key of NUM) c[key] += (t[key] - c[key]) * k;
    this.cur.eyeMode = this.target.eyeMode;
    if ((this.nextBlink -= dt) <= 0 && this.cur.eyeMode === 'normal') {
      this.blinkT = 0.14;
      if (!this.doubled && Math.random() < 0.2) { this.nextBlink = 0.25; this.doubled = true; }
      else { this.nextBlink = 2 + Math.random() * 4; this.doubled = false; }
    }
    if (this.blinkT > 0) { this.blinkT -= dt; this.cur.lidUpper = 1; }
    if (this.mouthOverride !== null) this.cur.mouthOpen = this.mouthOverride;
  }
}