/**
 * THE FOUR HEROES. Hand-tuned templates, authored to the art-direction bible.
 *
 * Every limb is built through HB.limb(), which:
 *   - aligns the capsule with the ACTUAL joint-to-joint direction, so a splayed
 *     insect leg or a slanted arm is a correctly oriented solid, not a vertical
 *     capsule pretending to be one;
 *   - places the part at the exact midpoint of the two joints, so the pivot-end
 *     hemisphere is centred on the socket and the far-end hemisphere is centred
 *     on the child socket. Same radius at the joint => perfect overlap, no gap,
 *     no bulge, at any rotation.
 *
 * Procedural variation lives in HeroVariant and only ever moves within these
 * ranges; it can never break the art direction.
 */
import * as THREE from 'three';
import { bevelPrism, dirFromYawPitch, egg, ellipsoidSurfaceDist, lens, limbSegment, roundCone, roundedBox, sphere } from './geometry';
import type { EyeDef, FootDef, HeroBoneDef, HeroPartDef, HeroTemplate, HeroId, PartProxy } from './types';

type RGB = [number, number, number];

const DOWN = new THREE.Vector3(0, -1, 0);

/** The point on an ellipsoid's surface along a direction. */
function onSurface(
  center: THREE.Vector3, a: number, b: number, c: number, yaw: number, pitch: number, inset: number,
): THREE.Vector3 {
  const d = dirFromYawPitch(yaw, pitch);
  const sd = ellipsoidSurfaceDist(a, b, c, d.x, d.y, d.z);
  return center.clone().addScaledVector(d, Math.max(0.01, sd - inset));
}

class HB {
  bones: HeroBoneDef[] = [];
  parts: HeroPartDef[] = [];
  eyes: EyeDef[] = [];
  feet: FootDef[] = [];
  private idx = new Map<string, number>();
  private world: THREE.Vector3[] = [];

  bone(name: string, parent: string | null, x: number, y: number, z: number): number {
    const pi = parent === null ? -1 : (this.idx.get(parent) ?? -1);
    const pos = new THREE.Vector3(x, y, z);
    const pw = pi >= 0 ? this.world[pi] : new THREE.Vector3();
    this.bones.push({ name, parent: pi, pos: pos.clone().sub(pw), quat: new THREE.Quaternion() });
    this.world.push(pos);
    this.idx.set(name, this.bones.length - 1);
    return this.bones.length - 1;
  }

  boneIndex(name: string): number { return this.idx.get(name) ?? -1; }
  posOf(name: string): THREE.Vector3 {
    const i = this.idx.get(name);
    return i === undefined ? new THREE.Vector3() : this.world[i].clone();
  }

  private push(
    name: string, boneName: string, geo: THREE.BufferGeometry,
    at: THREE.Vector3, quat: THREE.Quaternion,
    o: { color: RGB; outlineDark?: number; role?: HeroPartDef['role']; rootRadius?: number; proxy?: PartProxy; hero?: boolean },
  ): void {
    const bi = this.boneIndex(boneName);
    const pw = bi >= 0 ? this.world[bi] : new THREE.Vector3();
    const local = at.clone().sub(pw);
    const m = new THREE.Matrix4().compose(local, quat, new THREE.Vector3(1, 1, 1));
    if (!geo.boundingBox) geo.computeBoundingBox();
    const bb = geo.boundingBox as THREE.Box3;
    this.parts.push({
      name, geo, bone: bi, matrix: m,
      color: o.color,
      outlineDark: o.outlineDark ?? 0.72,
      role: o.role ?? 'detail',
      rootRadius: o.rootRadius ?? 0,
      proxy: o.proxy ?? { kind: 'ellipsoid', half: [bb.max.x, bb.max.y, bb.max.z] },
      hero: o.hero,
    });
  }

  part(
    name: string, boneName: string, geo: THREE.BufferGeometry,
    o: {
      at: [number, number, number]; quat?: THREE.Quaternion; rot?: [number, number, number];
      color: RGB; outlineDark?: number; role?: HeroPartDef['role']; rootRadius?: number;
      proxy?: PartProxy; hero?: boolean;
    },
  ): void {
    const q = o.quat ?? new THREE.Quaternion();
    if (!o.quat && o.rot) q.setFromEuler(new THREE.Euler(o.rot[0], o.rot[1], o.rot[2], 'XYZ'));
    this.push(name, boneName, geo, new THREE.Vector3(o.at[0], o.at[1], o.at[2]), q, o);
  }

  /** A limb segment that runs exactly from the pivot joint to the far joint. */
  limb(
    name: string, pivotBone: string, farAt: [number, number, number],
    rPivot: number, rFar: number,
    o: { color: RGB; outlineDark?: number; radial?: number; capSeg?: number; proxyPad?: number },
  ): void {
    const p0 = this.posOf(pivotBone);
    const p1 = new THREE.Vector3(farAt[0], farAt[1], farAt[2]);
    const len = Math.max(1e-3, p0.distanceTo(p1));
    const dir = p1.clone().sub(p0).normalize();
    const quat = new THREE.Quaternion().setFromUnitVectors(DOWN, dir);
    const mid = p0.clone().add(p1).multiplyScalar(0.5);
    this.push(name, pivotBone, limbSegment(rFar, rPivot, len, o.radial ?? 28, o.capSeg ?? 7), mid, quat, {
      color: o.color,
      outlineDark: o.outlineDark ?? 0.72,
      role: 'limb',
      rootRadius: rPivot,
      proxy: { kind: 'capsule', half: [rPivot, len * 0.5 + rPivot, rPivot] },
    });
  }

  foot(boneName: string, chain: [string, string, string], plant: [number, number, number], step: number, lift: number, phase: number, side: number): void {
    this.feet.push({
      bone: this.boneIndex(boneName),
      chain: [this.boneIndex(chain[0]), this.boneIndex(chain[1]), this.boneIndex(chain[2])],
      plant: new THREE.Vector3(plant[0], plant[1], plant[2]),
      step, lift, phase, side,
    });
  }

  eye(anchor: THREE.Vector3, dir: THREE.Vector3, radius: number, side: number): void {
    this.eyes.push({ anchor, dir, radius, side });
  }
}

/* ================================================================== *
 * PIP - biped. Rounded egg body that IS the head; stubby legs; antenna.
 * ================================================================== */
function buildPip(p: { base: RGB; belly: RGB; limb: RGB; accent: RGB; deep: RGB }): HeroTemplate {
  const B = new HB();
  const BH = 0.70, A = 0.41, RY = 0.50, C = 0.38;

  B.bone('root', null, 0, 0, 0);
  B.bone('body', 'root', 0, BH, 0);
  B.bone('head', 'body', 0, 0.665, 0);
  B.bone('antenna', 'head', 0, 1.16, 0);

  B.part('body', 'body', egg(A, RY, C, 0.16, 44, 30), {
    at: [0, BH, 0], color: p.base, role: 'body', hero: true,
    proxy: { kind: 'ellipsoid', half: [A, RY, C] },
  });

  const legs: { side: number; tag: string; phase: number }[] = [
    { side: -1, tag: 'l', phase: 0.0 },
    { side: 1, tag: 'r', phase: 0.5 },
  ];
  for (const L of legs) {
    const x = 0.17 * L.side;
    const hip = `hip_${L.tag}`, knee = `knee_${L.tag}`, ankle = `ankle_${L.tag}`;
    B.bone(hip, 'body', x, 0.36, 0);
    B.bone(knee, hip, x, 0.215, 0.045);
    B.bone(ankle, knee, x, 0.085, -0.02);
    B.limb(`thigh_${L.tag}`, hip, [x, 0.215, 0.045], 0.082, 0.072, { color: p.limb, radial: 30 });
    B.limb(`shin_${L.tag}`, knee, [x, 0.085, -0.02], 0.072, 0.062, { color: p.limb, radial: 30 });
    B.part(`shoe_${L.tag}`, ankle, sphere(0.098, 0.055, 0.135, 32, 20), {
      at: [x, 0.055, 0.005], color: p.limb, role: 'limbTip', outlineDark: 0.64,
      proxy: { kind: 'ellipsoid', half: [0.098, 0.055, 0.135] },
    });
    B.foot(ankle, [hip, knee, ankle], [x, 0.085, -0.02], 0.13, 0.075, L.phase, L.side);
  }

  for (const L of legs) {
    const s = L.side;
    const sh = `shoulder_${L.tag}`, el = `elbow_${L.tag}`, hd = `hand_${L.tag}`;
    B.bone(sh, 'body', 0.35 * s, 0.72, 0);
    B.bone(el, sh, 0.40 * s, 0.575, 0);
    B.bone(hd, el, 0.445 * s, 0.43, 0);
    B.limb(`upperarm_${L.tag}`, sh, [0.40 * s, 0.575, 0], 0.075, 0.062, { color: p.limb, radial: 26, capSeg: 6 });
    B.limb(`forearm_${L.tag}`, el, [0.445 * s, 0.43, 0], 0.062, 0.052, { color: p.limb, radial: 26, capSeg: 6 });
    B.part(`mitten_${L.tag}`, hd, sphere(0.074, 0.068, 0.064, 28, 18), {
      at: [0.452 * s, 0.414, 0], color: p.limb, role: 'limbTip', outlineDark: 0.62,
      proxy: { kind: 'ellipsoid', half: [0.074, 0.068, 0.064] },
    });
  }

  B.part('antenna_stalk', 'antenna', limbSegment(0.013, 0.021, 0.17, 16, 5), {
    at: [0, 1.075, 0], color: p.limb, role: 'detail', rootRadius: 0.021,
    proxy: { kind: 'capsule', half: [0.021, 0.106, 0.021] },
  });
  B.part('antenna_tip', 'antenna', sphere(0.049, 0.049, 0.049, 24, 16), {
    at: [0, 0.985, 0], color: p.accent, role: 'detail', outlineDark: 0.60,
    proxy: { kind: 'ellipsoid', half: [0.049, 0.049, 0.049] },
  });

  const bc = new THREE.Vector3(0, BH, 0);
  const eyeR = 0.2132 * 0.5;
  for (const side of [-1, 1] as const) {
    const d = dirFromYawPitch(0.56 * side, -0.10);
    const sd = ellipsoidSurfaceDist(A, RY, C, d.x, d.y, d.z);
    B.eye(bc.clone().addScaledVector(d, sd - 0.30 * eyeR), d, eyeR, side);
  }

  return {
    id: 'pip', name: 'PIP',
    bones: B.bones, parts: B.parts, eyes: B.eyes, feet: B.feet,
    expression: {
      mouthWidth: 0.15,
      mouthCenter: new THREE.Vector3(0, 0.545, 0.352),
      blush: [new THREE.Vector3(-0.262, 0.592, 0.286), new THREE.Vector3(0.262, 0.592, 0.286)],
      brows: [new THREE.Vector3(-0.187, 0.792, 0.276), new THREE.Vector3(0.187, 0.792, 0.276)],
    },
    bodyBone: B.boneIndex('body'), headBone: B.boneIndex('head'),
    height: 1.30, radius: 0.82, locomotion: 'walk',
  };
}

/* ================================================================== *
 * MOCHI - quadruped. Big round head on a short body, 4 stubby legs.
 * ================================================================== */
function buildMochi(p: { base: RGB; belly: RGB; limb: RGB; accent: RGB; deep: RGB }): HeroTemplate {
  const B = new HB();
  const BH = 0.44, BZ = -0.06, BA = 0.30, BB = 0.275, BC = 0.45;
  const HC = new THREE.Vector3(0, 0.58, 0.36), HR = 0.33;

  B.bone('root', null, 0, 0, 0);
  B.bone('body', 'root', 0, BH, BZ);
  B.bone('head', 'body', HC.x, HC.y, HC.z);
  B.bone('ear_l', 'head', -0.17, 0.86, 0.30);
  B.bone('ear_r', 'head', 0.17, 0.86, 0.30);
  B.bone('tail', 'body', 0, 0.44, -0.46);
  B.bone('tail_tip', 'tail', 0, 0.36, -0.62);

  B.part('body', 'body', egg(BA, BB, BC, 0.05, 40, 28), {
    at: [0, BH, BZ], color: p.base, role: 'body', hero: true,
    proxy: { kind: 'ellipsoid', half: [BA, BB, BC] },
  });
  B.part('head', 'head', sphere(HR, HR, HR * 0.96, 44, 30), {
    at: [HC.x, HC.y, HC.z], color: p.base, role: 'head', hero: true, outlineDark: 0.70,
    proxy: { kind: 'ellipsoid', half: [HR, HR, HR] },
  });
  B.part('belly_patch', 'body', lens(0.20, 0.17, 0.10, 30, 18), {
    at: [0, 0.20, BZ + 0.30], color: p.belly, role: 'detail', outlineDark: 0.50,
    proxy: { kind: 'ellipsoid', half: [0.20, 0.17, 0.10] },
  });

  const legs: { side: number; z: number; tag: string; phase: number }[] = [
    { side: -1, z: 0.115, tag: 'fl', phase: 0.0 },
    { side: 1, z: 0.115, tag: 'fr', phase: 0.5 },
    { side: -1, z: -0.235, tag: 'bl', phase: 0.5 },
    { side: 1, z: -0.235, tag: 'br', phase: 0.0 },
  ];
  for (const L of legs) {
    const x = 0.17 * L.side;
    const hip = `hip_${L.tag}`, knee = `knee_${L.tag}`, ankle = `ankle_${L.tag}`;
    B.bone(hip, 'body', x, 0.345, L.z);
    B.bone(knee, hip, x, 0.20, L.z + 0.055);
    B.bone(ankle, knee, x, 0.075, L.z - 0.02);
    B.limb(`thigh_${L.tag}`, hip, [x, 0.20, L.z + 0.055], 0.066, 0.058, { color: p.limb, radial: 26, capSeg: 6 });
    B.limb(`shin_${L.tag}`, knee, [x, 0.075, L.z - 0.02], 0.058, 0.055, { color: p.limb, radial: 26, capSeg: 6 });
    B.part(`paw_${L.tag}`, ankle, sphere(0.070, 0.050, 0.085, 28, 18), {
      at: [x, 0.055, L.z], color: p.limb, role: 'limbTip', outlineDark: 0.62,
      proxy: { kind: 'ellipsoid', half: [0.070, 0.050, 0.085] },
    });
    B.foot(ankle, [hip, knee, ankle], [x, 0.075, L.z - 0.02], 0.10, 0.065, L.phase, L.side);
  }

  for (const side of [-1, 1] as const) {
    const tag = side < 0 ? 'l' : 'r';
    const earDir = new THREE.Vector3(0.30 * side, 0.94, -0.16).normalize();
    const earQuat = new THREE.Quaternion().setFromUnitVectors(DOWN, earDir.clone().negate());
    B.part(`ear_${tag}`, `ear_${tag}`, roundCone(0.088, 0.030, 0.20, 26), {
      at: [0.17 * side, 0.94, 0.30], quat: earQuat, color: p.base, role: 'detail',
      outlineDark: 0.70, rootRadius: 0.088,
      proxy: { kind: 'capsule', half: [0.088, 0.159, 0.088] },
    });
    B.part(`ear_inner_${tag}`, `ear_${tag}`, roundCone(0.050, 0.018, 0.15, 22), {
      at: [0.17 * side - 0.012 * side, 0.945, 0.325], quat: earQuat, color: p.accent, role: 'detail',
      outlineDark: 0.58, proxy: { kind: 'ellipsoid', half: [0.05, 0.093, 0.05] },
    });
  }

  B.part('tail', 'tail', limbSegment(0.036, 0.052, 0.202, 22, 6), {
    at: [0, 0.40, -0.54], rot: [0.85, 0, 0], color: p.base, role: 'detail', rootRadius: 0.052,
    proxy: { kind: 'capsule', half: [0.052, 0.153, 0.052] },
  });
  B.part('tail_puff', 'tail_tip', sphere(0.082, 0.082, 0.082, 28, 18), {
    at: [0, 0.34, -0.63], color: p.accent, role: 'detail', outlineDark: 0.60,
    proxy: { kind: 'ellipsoid', half: [0.082, 0.082, 0.082] },
  });

  const eyeR = 0.27 * (HR * 2) * 0.5;
  for (const side of [-1, 1] as const) {
    const d = dirFromYawPitch(0.60 * side, -0.10);
    B.eye(HC.clone().addScaledVector(d, HR - 0.28 * eyeR), d, eyeR, side);
  }

  return {
    id: 'mochi', name: 'MOCHI',
    bones: B.bones, parts: B.parts, eyes: B.eyes, feet: B.feet,
    expression: {
      mouthWidth: 0.13,
      mouthCenter: new THREE.Vector3(0, 0.478, 0.652),
      blush: [new THREE.Vector3(-0.215, 0.508, 0.618), new THREE.Vector3(0.215, 0.508, 0.618)],
      brows: [new THREE.Vector3(-0.153, 0.665, 0.616), new THREE.Vector3(0.153, 0.665, 0.616)],
    },
    bodyBone: B.boneIndex('body'), headBone: B.boneIndex('head'),
    height: 1.12, radius: 0.80, locomotion: 'walk',
  };
}

/* ================================================================== *
 * BOP - hopper. A gumdrop with a sprout, no legs, squash locomotion.
 * ================================================================== */
function buildBop(p: { base: RGB; belly: RGB; limb: RGB; accent: RGB; deep: RGB }): HeroTemplate {
  const B = new HB();
  const S = 0.76, CY = 0.40;

  B.bone('root', null, 0, 0, 0);
  B.bone('body', 'root', 0, CY, 0);
  B.bone('head', 'body', 0, 0.46, 0.10);
  B.bone('sprout', 'body', 0, 0.96, 0);
  B.bone('sprout_leaf_l', 'sprout', -0.06, 1.03, 0);
  B.bone('sprout_leaf_r', 'sprout', 0.06, 1.03, 0);

  B.part('body', 'body', roundedBox(S, S, S * 0.94, S * 0.94 * 0.35, 5), {
    at: [0, CY, 0], color: p.base, role: 'body', hero: true, outlineDark: 0.70,
    proxy: { kind: 'ellipsoid', half: [S * 0.5, S * 0.5, S * 0.47] },
  });
  B.part('belly_patch', 'body', lens(0.25, 0.21, 0.09, 28, 18), {
    at: [0, 0.30, 0.30], color: p.belly, role: 'detail', outlineDark: 0.50,
    proxy: { kind: 'ellipsoid', half: [0.25, 0.21, 0.09] },
  });

  B.part('sprout_stalk', 'sprout', limbSegment(0.017, 0.026, 0.155, 18, 5), {
    at: [0, 0.90, 0], color: p.limb, role: 'detail', rootRadius: 0.026,
    proxy: { kind: 'capsule', half: [0.026, 0.104, 0.026] },
  });
  for (const side of [-1, 1] as const) {
    const tag = side < 0 ? 'l' : 'r';
    B.part(`leaf_${tag}`, `sprout_leaf_${tag}`, lens(0.088, 0.054, 0.018, 22, 12), {
      at: [side * 0.105, 1.055, 0], rot: [0.15, 0, side * 0.58],
      color: p.accent, role: 'detail', outlineDark: 0.56,
      proxy: { kind: 'ellipsoid', half: [0.088, 0.054, 0.02] },
    });
  }

  const bc = new THREE.Vector3(0, CY, 0);
  const eyeR = 0.32 * S * 0.5;
  for (const side of [-1, 1] as const) {
    const d = dirFromYawPitch(0.62 * side, -0.06);
    const sd = ellipsoidSurfaceDist(S * 0.5, S * 0.5, S * 0.47, d.x, d.y, d.z);
    B.eye(bc.clone().addScaledVector(d, sd - 0.22 * eyeR), d, eyeR, side);
  }

  return {
    id: 'bop', name: 'BOP',
    bones: B.bones, parts: B.parts, eyes: B.eyes, feet: B.feet,
    expression: {
      mouthWidth: 0.11,
      mouthCenter: new THREE.Vector3(0, 0.345, 0.408),
      blush: [new THREE.Vector3(-0.235, 0.362, 0.312), new THREE.Vector3(0.235, 0.362, 0.312)],
      brows: [new THREE.Vector3(-0.162, 0.610, 0.318), new THREE.Vector3(0.162, 0.610, 0.318)],
    },
    bodyBone: B.boneIndex('body'), headBone: B.boneIndex('head'),
    height: 1.18, radius: 0.72, locomotion: 'hop',
  };
}

/* ================================================================== *
 * ZIK - hexapod bug. Three beveled prisms, round head, 6 splayed legs.
 * ================================================================== */
function buildZik(p: { base: RGB; belly: RGB; limb: RGB; accent: RGB; deep: RGB }): HeroTemplate {
  const B = new HB();
  const CY = 0.36;

  B.bone('root', null, 0, 0, 0);
  B.bone('body', 'root', 0, CY, 0);
  B.bone('head', 'body', 0, 0.40, 0.32);
  B.bone('ant_l', 'head', -0.075, 0.53, 0.40);
  B.bone('ant_r', 'head', 0.075, 0.53, 0.40);
  B.bone('ant_l_tip', 'ant_l', -0.150, 0.660, 0.520);
  B.bone('ant_r_tip', 'ant_r', 0.150, 0.660, 0.520);

  const segs: { z: number; r: number; len: number; name: string }[] = [
    { z: 0.10, r: 0.200, len: 0.28, name: 'seg_front' },
    { z: -0.12, r: 0.176, len: 0.26, name: 'seg_mid' },
    { z: -0.32, r: 0.146, len: 0.22, name: 'seg_rear' },
  ];
  for (const s of segs) {
    B.part(s.name, 'body', bevelPrism(s.r, s.len, 6, s.r * 0.30, 4), {
      at: [0, CY, s.z], rot: [Math.PI * 0.5, 0, 0],
      color: p.base, role: 'body', hero: s.name === 'seg_front', outlineDark: 0.68,
      proxy: { kind: 'ellipsoid', half: [s.r * 0.866, s.r * 0.866, s.len * 0.5] },
    });
  }
  B.part('head', 'head', sphere(0.185, 0.175, 0.180, 40, 26), {
    at: [0, 0.40, 0.32], color: p.base, role: 'head', hero: true, outlineDark: 0.66,
    proxy: { kind: 'ellipsoid', half: [0.185, 0.175, 0.180] },
  });
  for (const side of [-1, 1] as const) {
    const tag = side < 0 ? 'l' : 'r';
    B.part(`ant_${tag}`, `ant_${tag}`, limbSegment(0.011, 0.018, 0.2167, 14, 5), {
      at: [side * 0.1125, 0.595, 0.460],
      quat: new THREE.Quaternion().setFromUnitVectors(
        DOWN,
        new THREE.Vector3(side * 0.075, 0.130, 0.120).normalize(),
      ),
      color: p.limb, role: 'detail', outlineDark: 0.72, rootRadius: 0.018,
      proxy: { kind: 'capsule', half: [0.018, 0.1263, 0.018] },
    });
    B.part(`ant_tip_${tag}`, `ant_${tag}_tip`, sphere(0.032, 0.032, 0.032, 20, 14), {
      at: [side * 0.150, 0.660, 0.520], color: p.accent, role: 'detail', outlineDark: 0.58,
      proxy: { kind: 'ellipsoid', half: [0.032, 0.032, 0.032] },
    });
  }

  // A high coxa joint and a long tibia give the leg a real bend instead of a
  // near-straight stick, so the IK has room to work at every gait phase.
  const rows: { z: number; name: string; phase: number; hx: number }[] = [
    { z: 0.10, name: 'front', phase: 0.0, hx: 0.115 },
    { z: -0.12, name: 'mid', phase: 0.5, hx: 0.115 },
    { z: -0.32, name: 'rear', phase: 0.0, hx: 0.090 },
  ];
  for (const row of rows) {
    for (const side of [-1, 1] as const) {
      const tag = `${row.name}_${side < 0 ? 'l' : 'r'}`;
      const hip = `hip_${tag}`, knee = `knee_${tag}`, ankle = `ankle_${tag}`;
      const hx = row.hx * side, kx = 0.250 * side, ax = 0.300 * side;
      B.bone(hip, 'body', hx, 0.355, row.z);
      B.bone(knee, hip, kx, 0.315, row.z);
      B.bone(ankle, knee, ax, 0.075, row.z + 0.012);
      B.limb(`coxa_${tag}`, hip, [kx, 0.315, row.z], 0.040, 0.032, { color: p.limb, radial: 20, capSeg: 6 });
      B.limb(`tibia_${tag}`, knee, [ax, 0.075, row.z + 0.012], 0.032, 0.026, { color: p.limb, radial: 20, capSeg: 6 });
      B.foot(ankle, [hip, knee, ankle], [ax, 0.075, row.z + 0.012], 0.085, 0.055, row.phase + (side > 0 ? 0.5 : 0), side);
    }
  }

  const hc = new THREE.Vector3(0, 0.40, 0.32);
  const eyeR = 0.30 * 0.37 * 0.5;
  for (const side of [-1, 1] as const) {
    const d = dirFromYawPitch(0.62 * side, -0.05);
    B.eye(hc.clone().addScaledVector(d, 0.185 - 0.28 * eyeR), d, eyeR, side);
  }

  return {
    id: 'zik', name: 'ZIK',
    bones: B.bones, parts: B.parts, eyes: B.eyes, feet: B.feet,
    expression: {
      mouthWidth: 0.09,
      mouthCenter: new THREE.Vector3(0, 0.322, 0.478),
      blush: [new THREE.Vector3(-0.122, 0.345, 0.452), new THREE.Vector3(0.122, 0.345, 0.452)],
      brows: [new THREE.Vector3(-0.094, 0.478, 0.462), new THREE.Vector3(0.094, 0.478, 0.462)],
    },
    bodyBone: B.boneIndex('body'), headBone: B.boneIndex('head'),
    height: 0.96, radius: 0.68, locomotion: 'skitter',
  };
}

export interface HeroColors { base: RGB; belly: RGB; limb: RGB; accent: RGB; deep: RGB }

export function buildHeroTemplate(id: HeroId, c: HeroColors): HeroTemplate {
  switch (id) {
    case 'mochi': return buildMochi(c);
    case 'bop': return buildBop(c);
    case 'zik': return buildZik(c);
    default: return buildPip(c);
  }
}

export { onSurface as surfacePoint };
