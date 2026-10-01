/**
 * Motion metrics. Every gate the World animation has to pass is computed here
 * from two consecutive simulation probes, so the film tool and the headless
 * metric run share exactly one definition of "correct".
 */
import * as THREE from 'three';

export interface ProbeFoot { pos: [number, number, number]; swinging: boolean }
export interface ProbeBone { name: string; q: [number, number, number, number] }
export interface ProbeAgent {
  id: number;
  name: string;
  /** v9: this creature's own turn-rate ceiling, so the heading gate is per-species */
  turnRate: number;
  pos: [number, number, number];
  heading: number;
  speed: number;
  feet: ProbeFoot[];
  bones: ProbeBone[];
}
export interface Probe { t: number; agents: ProbeAgent[] }

export interface Violations {
  /** metres a PLANTED foot moved between two steps */
  maxFootSlip: number;
  /** rad/s — catches pops and snaps */
  maxJointRate: number;
  /** rad/s — must stay under the turn limit */
  maxHeadingRate: number;
  /** degrees the body travelled off its own facing */
  maxDriftDeg: number;
  counts: { footSlip: number; jointRate: number; heading: number; drift: number };
  samples: number;
  /** worst planted-foot slip per creature, metres */
  slipByName: Record<string, number>;
  /** worst joint rate per creature, rad/s, and the bone it happens on */
  jointByName: Record<string, number>;
  jointBoneByName: Record<string, string>;
  /** worst heading rate per creature, rad/s */
  headByName: Record<string, number>;
}

const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();

export function compare(a: Probe, b: Probe, dt: number): Violations {
  const out: Violations = {
    maxFootSlip: 0, maxJointRate: 0, maxHeadingRate: 0, maxDriftDeg: 0,
    counts: { footSlip: 0, jointRate: 0, heading: 0, drift: 0 },
    samples: 0,
    slipByName: {}, jointByName: {}, jointBoneByName: {}, headByName: {},
  };
  const byId = new Map<number, ProbeAgent>();
  for (const ag of a.agents) byId.set(ag.id, ag);

  for (const bb of b.agents) {
    const aa = byId.get(bb.id);
    if (!aa) continue;
    out.samples++;
    const spId = bb.name.split(' ')[0];

    // --- planted foot slip --------------------------------------------------
    const nf = Math.min(aa.feet.length, bb.feet.length);
    for (let i = 0; i < nf; i++) {
      const fa = aa.feet[i], fb = bb.feet[i];
      if (fa.swinging || fb.swinging) continue; // airborne feet are allowed to move
      const d = Math.hypot(fb.pos[0] - fa.pos[0], fb.pos[1] - fa.pos[1], fb.pos[2] - fa.pos[2]);
      if (d > out.maxFootSlip) out.maxFootSlip = d;
      if (d > 0.005) out.counts.footSlip++;
      if (d > (out.slipByName[spId] ?? 0)) out.slipByName[spId] = d;
    }

    // --- joint angular rate -------------------------------------------------
    const nb = Math.min(aa.bones.length, bb.bones.length);
    for (let i = 0; i < nb; i++) {
      _qa.set(aa.bones[i].q[0], aa.bones[i].q[1], aa.bones[i].q[2], aa.bones[i].q[3]);
      _qb.set(bb.bones[i].q[0], bb.bones[i].q[1], bb.bones[i].q[2], bb.bones[i].q[3]);
      const ang = 2 * Math.acos(Math.min(1, Math.abs(_qa.dot(_qb))));
      const rate = ang / dt;
      if (rate > out.maxJointRate) out.maxJointRate = rate;
      if (rate > 20) out.counts.jointRate++;
      if (rate > (out.jointByName[spId] ?? 0)) {
        out.jointByName[spId] = rate;
        out.jointBoneByName[spId] = bb.bones[i].name;
      }
    }

    // --- heading rate -------------------------------------------------------
    let dh = bb.heading - aa.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    const hr = Math.abs(dh) / dt;
    if (hr > out.maxHeadingRate) out.maxHeadingRate = hr;
    // v9: per-species ceiling — this creature's own turnRate x 1.05
    const cap = (bb.turnRate ?? 2.6) * 1.05;
    if (hr > cap) out.counts.heading++;
    if (hr > (out.headByName[spId] ?? 0)) out.headByName[spId] = hr;

    // --- sideways / backwards drift ----------------------------------------
    const vx = (bb.pos[0] - aa.pos[0]) / dt;
    const vz = (bb.pos[2] - aa.pos[2]) / dt;
    const sp = Math.hypot(vx, vz);
    if (sp > 0.05) {
      let off = Math.atan2(vx, vz) - bb.heading;
      while (off > Math.PI) off -= Math.PI * 2;
      while (off < -Math.PI) off += Math.PI * 2;
      const deg = Math.abs(off) * 180 / Math.PI;
      if (deg > out.maxDriftDeg) out.maxDriftDeg = deg;
      if (deg > 10) out.counts.drift++;
    }
  }
  return out;
}

export function emptyProbe(): Probe { return { t: 0, agents: [] }; }
