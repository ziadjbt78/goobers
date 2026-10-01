/**
 * THE VALIDATOR. The art-direction bible, executable.
 *
 * The genome layer promises that anything it can express is safe; this checks
 * the built rig instead of trusting the promise. Every rule here is a rule the
 * hero rigs already had to pass by hand.
 */
import * as THREE from 'three';
import { solveLeg } from '../anim/pose';
import type { HeroTemplate, HeroPartDef } from './types';

export interface Check { name: string; pass: boolean; detail: string }

export interface Validation {
  ok: boolean;
  failures: string[];
  checks: Check[];
  metrics: {
    parts: number;
    spread: number;
    minBurial: number;
    eyeRatio: number;
    eyeGap: number;
    worstDrift: number;
    worstReach: number;
  };
}

const EPS = 1e-9;

export function boneRestPositions(t: HeroTemplate): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < t.bones.length; i++) {
    const p = t.bones[i].parent >= 0 ? out[t.bones[i].parent] : new THREE.Vector3();
    out.push(t.bones[i].pos.clone().add(p));
  }
  return out;
}

/** Signed distance to a part's proxy surface at a creature-space point. <0 inside. */
export function proxyDepth(part: HeroPartDef, bonePos: THREE.Vector3[], p: THREE.Vector3): number {
  const pos = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  part.matrix.decompose(pos, q, scl);
  const rel = p.clone().sub(pos.add(bonePos[part.bone])).applyQuaternion(q.invert());
  rel.set(rel.x / Math.max(1e-6, scl.x), rel.y / Math.max(1e-6, scl.y), rel.z / Math.max(1e-6, scl.z));
  const [a, b, c] = part.proxy.half;
  // authored units -> creature units, so the number can be compared with a radius
  const radial = part.proxy.kind === 'capsule'
    ? (Math.abs(scl.x) + Math.abs(scl.z)) * 0.5
    : Math.min(Math.abs(scl.x), Math.abs(scl.y), Math.abs(scl.z));
  if (part.proxy.kind === 'capsule') {
    const r = Math.min(a, c);
    const span = Math.max(EPS, b - r);
    const y = Math.max(-span, Math.min(span, rel.y));
    return (Math.hypot(rel.x, rel.y - y, rel.z) - r) * radial;
  }
  const rr = Math.sqrt((rel.x / a) ** 2 + (rel.y / b) ** 2 + (rel.z / c) ** 2);
  return (rr - 1) * Math.min(a, Math.min(b, c)) * radial;
}

/** The mass a face is judged against: nearest ancestor bone that owns geometry. */
export function headPartOf(t: HeroTemplate): HeroPartDef | undefined {
  let b = t.headBone;
  let guard = 0;
  while (b >= 0 && guard++ < 64) {
    const onBone = t.parts.filter((p) => p.bone === b);
    if (onBone.length) {
      const declared = onBone.find((p) => p.role === 'head');
      if (declared) return declared;
      return onBone.reduce((m, p) =>
        p.proxy.half[0] * p.proxy.half[1] * p.proxy.half[2] >
        m.proxy.half[0] * m.proxy.half[1] * m.proxy.half[2] ? p : m);
    }
    b = t.bones[b].parent;
  }
  return undefined;
}

function boneChain(t: HeroTemplate): { bones: THREE.Bone[]; group: THREE.Group } {
  const bones: THREE.Bone[] = [];
  for (const b of t.bones) {
    const bone = new THREE.Bone();
    bone.name = b.name;
    bone.position.copy(b.pos);
    bones.push(bone);
  }
  for (let i = 0; i < t.bones.length; i++) {
    const p = t.bones[i].parent;
    if (p >= 0) bones[p].add(bones[i]);
  }
  const group = new THREE.Group();
  group.add(bones[0]);
  group.updateMatrixWorld(true);
  return { bones, group };
}

export function validateTemplate(t: HeroTemplate): Validation {
  const checks: Check[] = [];
  const add = (name: string, pass: boolean, detail: string): void => { checks.push({ name, pass, detail }); };
  const bw = boneRestPositions(t);
  let minBurial = 1;
  let eyeRatio = 0;
  let eyeGap = 0;
  let worstDrift = 0;
  let worstReach = 0;

  add('part count 5..22', t.parts.length >= 5 && t.parts.length <= 22, `${t.parts.length}`);

  const badBone = t.parts.filter((p) => p.bone < 0 || p.bone >= t.bones.length);
  add('every part on a valid bone', badBone.length === 0, badBone.map((p) => p.name).join(','));

  // real geometry vs declared proxy: a swapped-argument factory call is how a
  // part 500x too big gets in
  for (const part of t.parts) {
    const size = new THREE.Box3()
      .setFromBufferAttribute(part.geo.getAttribute('position') as THREE.BufferAttribute)
      .getSize(new THREE.Vector3());
    const q0 = new THREE.Quaternion();
    const p0 = new THREE.Vector3();
    const scl0 = new THREE.Vector3();
    part.matrix.decompose(p0, q0, scl0);
    const hx = part.proxy.half[0] * Math.abs(scl0.x);
    const hy = part.proxy.half[1] * Math.abs(scl0.y);
    const hz = part.proxy.half[2] * Math.abs(scl0.z);
    const want = Math.max(hx, hy, hz) * 2.6 + 0.05;
    const worst = Math.max(size.x, size.y, size.z);
    add(`${part.name} geometry size sane`, worst <= want, `${worst.toFixed(3)} <= ${want.toFixed(3)}`);
  }

  const volumes = t.parts.map((p) => p.proxy.half[0] * p.proxy.half[1] * p.proxy.half[2]);
  const spread = Math.max(...volumes) / Math.max(EPS, Math.min(...volumes));
  add('big-medium-small spread >= 20x', spread >= 20, `${spread.toFixed(1)}x`);

  for (const part of t.parts) {
    if (part.role !== 'limb') continue;
    const parentBone = t.bones[part.bone].parent;
    if (parentBone < 0) continue;
    const parents = t.parts.filter((q) => q.bone === parentBone);
    if (!parents.length) { add(`${part.name} parent part exists`, false, 'none'); continue; }
    const depth = Math.min(...parents.map((q) => proxyDepth(q, bw, bw[part.bone])));
    const ratio = depth / Math.max(1e-6, part.rootRadius);
    minBurial = Math.min(minBurial, -ratio);
    add(`${part.name} buried >= 40%`, ratio <= -0.40, `${(ratio * 100).toFixed(0)}%`);
  }

  const head = headPartOf(t);
  add('head mass found', !!head, head ? head.name : 'none');
  if (head) {
    const hp = new THREE.Vector3();
    const hq = new THREE.Quaternion();
    const hs = new THREE.Vector3();
    head.matrix.decompose(hp, hq, hs);
    const centre = hp.add(bw[head.bone]);
    // the proxy is authored space; the part matrix carries the genome's scale
    const headW = head.proxy.half[0] * 2 * Math.abs(hs.x);
    for (const e of t.eyes) {
      eyeRatio = Math.max(eyeRatio, (e.radius * 2) / headW);
      add('eye diameter 0.23-0.34 of head width', eyeRatio >= 0.23 && eyeRatio <= 0.34, eyeRatio.toFixed(3));
      add('eye at or below head midline', e.anchor.y <= centre.y + 0.02, `${e.anchor.y.toFixed(3)} vs ${centre.y.toFixed(3)}`);
    }
    const l = t.eyes.find((e) => e.side < 0);
    const r = t.eyes.find((e) => e.side > 0);
    if (l && r) {
      eyeGap = (Math.abs(r.anchor.x - l.anchor.x) - l.radius - r.radius) / (l.radius * 2);
      add('eye gap 0.55-1.05 widths', eyeGap >= 0.55 && eyeGap <= 1.05, eyeGap.toFixed(2));
    }
  }

  if (t.feet.length) {
    const { bones, group } = boneChain(t);
    for (const phase of [0, 0.25, 0.5, 0.75]) {
      for (const f of t.feet) {
        const hip = bones[f.chain[0]];
        const knee = bones[f.chain[1]];
        const ankle = bones[f.chain[2]];
        const rest = hip.position.clone();
        const target = new THREE.Vector3(
          f.plant.x,
          f.plant.y + Math.max(0, Math.sin(phase * Math.PI * 2)) * f.lift,
          f.plant.z + (0.5 - phase) * f.step,
        );
        solveLeg({ hip, knee, ankle, targetWorld: target, poleWorld: new THREE.Vector3(0, 0, 1) });
        group.updateMatrixWorld(true);
        worstDrift = Math.max(worstDrift, hip.position.distanceTo(rest));
        const foot = new THREE.Vector3().setFromMatrixPosition(ankle.matrixWorld);
        const err = foot.distanceTo(new THREE.Vector3().copy(target).applyMatrix4(group.matrixWorld));
        worstReach = Math.max(worstReach, err);
      }
    }
    add('socket drift <= 0.001 over gait', worstDrift <= 0.001, worstDrift.toFixed(5));
    // reach tolerance scales with the creature: a fixed 0.02 is a fraction of a
    // pixel on a 1.2 m creature and impossible on a 0.9 m one
    const tol = 0.02 * t.height;
    add('foot reaches plant over gait', worstReach <= tol, `${worstReach.toFixed(4)} <= ${tol.toFixed(4)}`);
  }

  const failures = checks.filter((c) => !c.pass).map((c) => `${c.name} (${c.detail})`);
  return {
    ok: failures.length === 0,
    failures,
    checks,
    metrics: {
      parts: t.parts.length,
      spread,
      minBurial: minBurial === 1 ? 0 : minBurial,
      eyeRatio,
      eyeGap,
      worstDrift,
      worstReach,
    },
  };
}
