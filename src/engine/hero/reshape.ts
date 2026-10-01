/**
 * RESHAPE — genome -> rig, as per-bone similarity transforms.
 *
 * Every part is welded to a bone, so when a bone's rest frame moves by an
 * affine A, the part must move by the same A. That is the whole trick: nothing
 * is re-authored, so a reshaped creature cannot break the art-direction rules
 * the base template satisfied.
 *
 * Two rules keep it honest:
 *  - a group's scale applies ONCE, at the group's root bone. Applying it at
 *    every bone down the chain compounds (a three-bone leg would cube its
 *    length), which the heredity sweep caught immediately;
 *  - a limb segment scales ALONG its axis only. Its radius is set by the
 *    parent it plugs into, so letting the segment's radius grow with its
 *    length would float the joint out of its socket.
 */
import * as THREE from 'three';
import type { HeroDNA } from './dna';
import { DETAIL_SCALE } from './dna';
import { headPartOf } from './validate';
import type { HeroTemplate } from './types';

interface Affine { s: number; t: THREE.Vector3; extra: number }

type Group = 'head' | 'leg' | 'ear' | 'tail' | 'ant';

function boneGroup(name: string): Group | null {
  if (name === 'head') return 'head';
  if (/^(hip|knee|ankle|coxa|tibia)_/.test(name)) return 'leg';
  if (name.startsWith('ear_')) return 'ear';
  if (name.startsWith('tail')) return 'tail';
  if (name.startsWith('ant')) return 'ant';
  return null;
}

/**
 * The extra local scale this bone adds. Only a group ROOT adds one: its
 * descendants inherit it through their parent's affine and must add nothing.
 */
function extraFor(t: HeroTemplate, dna: HeroDNA, i: number, hasHeadMass: boolean): number {
  const g = boneGroup(t.bones[i].name);
  if (!g) return 1;
  const p = t.bones[i].parent;
  if (p >= 0 && boneGroup(t.bones[p].name) === g) return 1; // not the group root
  switch (g) {
    case 'head': return hasHeadMass ? dna.headSize : 1;
    case 'leg': return dna.legLen;
    case 'ear': return DETAIL_SCALE[dna.earStyle];
    case 'tail': return DETAIL_SCALE[dna.tailStyle];
    case 'ant': return DETAIL_SCALE[dna.antStyle];
    default: return 1;
  }
}

export function applyDNA(t: HeroTemplate, dna: HeroDNA): HeroTemplate {
  const n = t.bones.length;
  const oldAt: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const p = t.bones[i].parent >= 0 ? oldAt[t.bones[i].parent] : new THREE.Vector3();
    oldAt.push(t.bones[i].pos.clone().add(p));
  }

  // The head gene only means something when the head mass actually hangs off
  // the head bone. On PIP the egg body IS the head, so scaling the head bone
  // would slide the face off the skull; the gene stays inert there.
  const headPart = headPartOf(t);
  const hasHeadMass = !!headPart && headPart.bone === t.headBone;

  // The eye gene is clamped so the eye/head ratio can never leave the bible's
  // 0.24-0.32 band, whatever the genome says.
  let eyeSize = dna.eyeSize;
  {
    let lo = 0.92;
    let hi = 1.10;
    if (headPart && t.eyes[0]) {
      // a girth gene widens the head mass itself, so the eye must grow with it
      // or the face shrinks relative to the skull
      const girthOfHead = headPart.role === 'body' ? dna.girth : 1;
      const baseRatio = (t.eyes[0].radius * 2) / (headPart.proxy.half[0] * 2 * girthOfHead);
      lo = Math.max(lo, 0.245 / Math.max(1e-6, baseRatio));
      hi = Math.min(hi, 0.320 / Math.max(1e-6, baseRatio));
    }
    const l = t.eyes.find((e) => e.side < 0);
    const r = t.eyes.find((e) => e.side > 0);
    if (l && r) {
      // a wider eye eats the gap between the eyes: 0.58-1.00 widths is the band
      const gapBase = Math.abs(r.anchor.x - l.anchor.x) / (2 * l.radius) - 1;
      lo = Math.max(lo, (gapBase + 1) / 2.0);
      hi = Math.min(hi, (gapBase + 1) / 1.58);
    }
    eyeSize = Math.min(Math.max(hi, lo), Math.max(lo, Math.min(hi, dna.eyeSize)));
  }

  // pass 1: bone rest frames, walking parents first so the parent affine exists
  const newAt: THREE.Vector3[] = [];
  const aff: Affine[] = [];
  for (let i = 0; i < n; i++) {
    const pa = t.bones[i].parent >= 0 ? aff[t.bones[i].parent] : null;
    const ps = pa ? pa.s : 1;
    const pt = pa ? pa.t : new THREE.Vector3();
    const mapped = oldAt[i].clone().multiplyScalar(ps).add(pt);
    newAt.push(mapped);
    const e = extraFor(t, dna, i, hasHeadMass);
    aff.push({
      s: ps * e,
      t: pt.clone().multiplyScalar(e).add(mapped.clone().multiplyScalar(1 - e)),
      extra: e,
    });
  }

  // pass 2: a longer leg must not push the foot through the floor. Measure the
  // hip->ankle drop, then lift the whole creature by the extra drop so the
  // plant stays put and only the body rides higher.
  if (dna.legLen !== 1) {
    let drop = 0;
    for (let i = 0; i < n; i++) {
      if (!/^hip_/.test(t.bones[i].name)) continue;
      for (let j = 0; j < n; j++) {
        if (!/^ankle_/.test(t.bones[j].name)) continue;
        let q = j;
        while (q >= 0 && q !== i) q = t.bones[q].parent;
        if (q !== i) continue;
        drop = Math.min(drop, oldAt[j].y - oldAt[i].y);
      }
    }
    const lift = drop * (dna.legLen - 1) * aff[0].s;
    if (lift !== 0) {
      const up = new THREE.Vector3(0, -lift, 0);
      for (const v of newAt) v.add(up);
      for (const a of aff) a.t.add(up);
    }
  }

  // pass 3: bones
  const bones = t.bones.map((b, i) => ({
    name: b.name,
    parent: b.parent,
    pos: b.parent >= 0 ? newAt[i].clone().sub(newAt[b.parent]) : newAt[i].clone(),
    quat: b.quat.clone(),
  }));

  // pass 4: parts. The transform is T(t) * R * S_local: the scale lives in the
  // part's own frame so a capsule grows along its length, not across it.
  const parts = t.parts.map((p) => {
    const a = aff[p.bone];
    const g = boneGroup(t.bones[p.bone].name);
    const limbOnLeg = p.role === 'limb' && g === 'leg';
    const radial = limbOnLeg ? a.s / Math.max(1e-6, a.extra) : a.s;
    const girth = p.role === 'body' ? dna.girth : 1;

    // The part's world transform must be A * (bone rest * local). Working that
    // through gives newLocal = A(offset) - boneAtNew, with the geometry scaled
    // in the PART's own frame: the local offset moves with its bone (skip this
    // and every limb slides out of its socket), and a capsule grows along its
    // length instead of fattening its joints.
    const oldPos = new THREE.Vector3().setFromMatrixPosition(p.matrix);
    const oldQuat = new THREE.Quaternion().setFromRotationMatrix(p.matrix);
    const newPos = oldPos.clone().multiplyScalar(a.s);
    const rot = new THREE.Matrix4().makeRotationFromQuaternion(oldQuat);
    const scl = new THREE.Matrix4().makeScale(radial * girth, a.s, radial * girth);
    const m = new THREE.Matrix4().makeTranslation(newPos.x, newPos.y, newPos.z).multiply(rot).multiply(scl);
    return { ...p, matrix: m, rootRadius: p.rootRadius * radial };
  });

  // pass 5: face and ground contact ride the head and root frames exactly
  const ha = aff[t.headBone];
  const xf = (v: THREE.Vector3, a: Affine): THREE.Vector3 => v.clone().multiplyScalar(a.s).add(a.t);
  const eyes = t.eyes.map((e) => ({ ...e, anchor: xf(e.anchor, ha), radius: e.radius * eyeSize * ha.s }));
  const expression = {
    ...t.expression,
    mouthWidth: t.expression.mouthWidth * ha.s,
    mouthCenter: xf(t.expression.mouthCenter, ha),
    blush: t.expression.blush.map((v) => xf(v, ha)),
    brows: t.expression.brows.map((v) => xf(v, ha)),
  };
  const ra = aff[0];
  const feet = t.feet.map((f) => ({ ...f, plant: xf(f.plant, ra), step: f.step * ra.s, lift: f.lift * ra.s }));

  return { ...t, bones, parts, eyes, expression, feet, height: t.height * ra.s, radius: t.radius * ra.s };
}
