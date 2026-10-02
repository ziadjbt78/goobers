/**
 * Pose math. Rotation-only bone work plus the 2-bone leg IK that plants feet.
 *
 * Everything is expressed in creature space and then converted through the
 * parent bone's world matrix, so a limb can never stretch, scale, or translate
 * away from its socket: the socket IS the bone origin.
 *
 * The aim step is child-offset aware: a splayed insect coxa whose child sits
 * sideways off the bone axis still lands its knee exactly on the solved joint.
 *
 * v19 EXACT path (World): the whole solve runs in the hip parent's OWN space,
 * squash included, and every aim is a minimal arc from the bone's rest
 * direction. That removes the world-frame twist (heading-dependent flips on
 * splayed legs, phantom knee rates) and the squash-shear ankle miss. The
 * legacy path (pedestal / Heroes) is untouched.
 */
import * as THREE from 'three';
import { solveIK2, ikLast } from './ik';

/** The conventional "down" limb axis, kept for callers that use it as a hint. */
export const LIMB_AXIS = new THREE.Vector3(0, -1, 0);

const _q = new THREE.Quaternion();
const _inv = new THREE.Quaternion();
const _d = new THREE.Vector3();
const _u = new THREE.Vector3();
const _v = new THREE.Vector3();
const _root = new THREE.Vector3();
const _tgt = new THREE.Vector3();
const _knee = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _hipW = new THREE.Vector3();
const _pos = new THREE.Vector3();
const _lenA = new THREE.Vector3();
const _lenB = new THREE.Vector3();

/**
 * Point a bone so the direction of its CHILD, expressed in the bone's own
 * local space, runs along `dirWorld`.
 */
export function aimBoneTowards(
  bone: THREE.Bone,
  childLocalDir: THREE.Vector3,
  dirWorld: THREE.Vector3,
  parentWorldQuat: THREE.Quaternion,
): void {
  const u = _u.copy(childLocalDir);
  if (u.lengthSq() < 1e-12) u.set(0, -1, 0);
  u.normalize();
  const d = _d.copy(dirWorld);
  if (d.lengthSq() < 1e-12) d.set(0, -1, 0);
  d.normalize();
  _q.setFromUnitVectors(u, d);
  bone.quaternion.copy(parentWorldQuat).invert().multiply(_q);
}

/** Aim a limb whose child really does sit on local -Y. */
export function aimBone(bone: THREE.Bone, dirWorld: THREE.Vector3, parentWorldQuat: THREE.Quaternion): void {
  aimBoneTowards(bone, LIMB_AXIS, dirWorld, parentWorldQuat);
}

export interface LegSolveInput {
  hip: THREE.Bone;
  knee: THREE.Bone;
  ankle: THREE.Bone;
  /** optional: segment lengths are read from the bones, so callers cannot lie */
  l1?: number;
  l2?: number;
  /** desired world position of the ankle */
  targetWorld: THREE.Vector3;
  /** world-space pole hint (roughly forward) */
  poleWorld: THREE.Vector3;
  /** previous knee position in the hip-parent's local space. Read to keep the
   *  solve on the same branch, then written back with the new knee. */
  prevKnee?: THREE.Vector3;
  /** v19: exact parent-space solve (World path). */
  exact?: boolean;
  /** v19: world rotation the foot holds (creature heading). Default: world identity. */
  footWorld?: THREE.Quaternion;
}

const _xq = new THREE.Quaternion();
const _xinv = new THREE.Quaternion();
const _xh = new THREE.Quaternion();
const _xt = new THREE.Vector3();
const _xr = new THREE.Vector3();
const _xp = new THREE.Vector3();
const _xk = new THREE.Vector3();
const _xu = new THREE.Vector3();
const _xd = new THREE.Vector3();

function solveLegExact(i: LegSolveInput, hipParent: THREE.Object3D): boolean {
  // getWorldQuaternion / worldToLocal refresh the ancestor chain themselves
  const pw = hipParent.getWorldQuaternion(_xq);
  const targetLocal = hipParent.worldToLocal(_xt.copy(i.targetWorld));
  const hipLocal = _xr.copy(i.hip.position);
  const poleLocal = _xp.copy(i.poleWorld).applyQuaternion(_xinv.copy(pw).invert()).normalize();
  const L1 = i.knee.position.length();
  const L2 = i.ankle.position.length();
  solveIK2(hipLocal, targetLocal, L1, L2, poleLocal, _xk, i.prevKnee, true);

  // hip: minimal arc from its rest child direction onto the solved knee, in parent space
  _xu.copy(i.knee.position).normalize();
  _xd.copy(_xk).sub(hipLocal).normalize();
  i.hip.quaternion.setFromUnitVectors(_xu, _xd);

  // knee: same, in the hip's frame, aiming the shin at the target
  _xh.copy(i.hip.quaternion).invert();
  _xd.copy(targetLocal).sub(hipLocal).applyQuaternion(_xh).sub(i.knee.position).normalize();
  _xu.copy(i.ankle.position).normalize();
  i.knee.quaternion.setFromUnitVectors(_xu, _xd);

  // ankle: foot flat on the ground, facing the creature's heading when given
  _xh.copy(pw).multiply(i.hip.quaternion).multiply(i.knee.quaternion).invert();
  if (i.footWorld) _xh.multiply(i.footWorld);
  i.ankle.quaternion.copy(_xh);

  if (i.prevKnee) i.prevKnee.copy(_xk);
  return ikLast.fallback;
}

/**
 * Solve one leg. The hip's position is never touched; only the hip and knee
 * rotations move, and the ankle is levelled to the world so the foot stays flat.
 * Returns true when the pole grazed the limb axis (forensics).
 */
export function solveLeg(i: LegSolveInput): boolean {
  const hipParent = i.hip.parent;
  if (!hipParent) return false;
  if (i.exact) return solveLegExact(i, hipParent);
  hipParent.updateMatrixWorld(true);

  const pw = new THREE.Quaternion();
  hipParent.getWorldQuaternion(pw);
  const pwInv = _inv.copy(pw).invert();

  const targetLocal = _tgt.copy(i.targetWorld);
  hipParent.worldToLocal(targetLocal);

  const hipLocal = _root.copy(i.hip.position);
  const poleLocal = _pole.copy(i.poleWorld).applyQuaternion(pwInv).normalize();

  // Segment lengths come straight off the bone rest offsets.
  const L1 = _lenA.copy(i.knee.position).length();
  const L2 = _lenB.copy(i.ankle.position).length();
  solveIK2(hipLocal, targetLocal, L1, L2, poleLocal, _knee, i.prevKnee);

  // hip: rotate its rest child direction onto the solved knee direction
  const kneeDirWorld = _v.copy(_knee).sub(hipLocal).applyQuaternion(pw).normalize();
  aimBoneTowards(i.hip, i.knee.position, kneeDirWorld, pw);

  // knee: find where it actually landed, then aim its child at the plant
  const hipWorldQuat = new THREE.Quaternion().multiplyQuaternions(pw, i.hip.quaternion);
  const hipWorldPos = _hipW.copy(hipLocal).applyQuaternion(pw).add(hipParent.getWorldPosition(_pos));
  const kneeWorld = new THREE.Vector3().copy(i.knee.position).applyQuaternion(hipWorldQuat).add(hipWorldPos);
  const shinDirWorld = _v.copy(i.targetWorld).sub(kneeWorld).normalize();
  aimBoneTowards(i.knee, i.ankle.position, shinDirWorld, hipWorldQuat);

  // keep the shoe flat on the ground: cancel the shin's rotation
  const shinWorldQuat = new THREE.Quaternion().multiplyQuaternions(hipWorldQuat, i.knee.quaternion);
  i.ankle.quaternion.copy(shinWorldQuat).invert();

  // remember this frame's knee so tomorrow's solve stays on the same branch
  if (i.prevKnee) i.prevKnee.copy(_knee);
  return false;
}

/** A soft, critically damped 1D spring used for ears, tails and antennae. */
export class Wobble {
  v = 0;
  x = 0;
  step(drive: number, dt: number, k = 42, c = 7): number {
    const a = -k * this.x - c * this.v + drive;
    this.v += a * dt;
    this.x += this.v * dt;
    if (this.x > 0.5) { this.x = 0.5; this.v *= 0.4; }
    if (this.x < -0.5) { this.x = -0.5; this.v *= 0.4; }
    return this.x;
  }
}
