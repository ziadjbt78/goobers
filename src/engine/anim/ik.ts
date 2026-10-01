import * as THREE from 'three';

/**
 * Two-bone analytic IK with a pole vector. One solver drives 2, 4, 6 and 8 legs.
 * Deterministic, allocation-free in the hot path, exactly unit-tested.
 */
const _axis = new THREE.Vector3();
const _perp = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _alt = new THREE.Vector3();

export interface IK2Result {
  knee: THREE.Vector3;
  reached: boolean;
  /** normalised extension 0..1 (1 = fully straight) */
  extension: number;
}

/**
 * Two-bone analytic IK with a pole vector. One solver drives 2, 4, 6 and 8 legs.
 * Deterministic, allocation-free in the hot path, exactly unit-tested.
 *
 * `prev` (optional) is the knee position solved on the previous frame. A two-bone
 * solve has TWO valid answers mirrored across the root->target axis, and near
 * full extension a hair of hip motion flips which one is "nearest" — that jump
 * is the classic IK pop. Passing the previous knee picks the answer on the same
 * branch, so the knee can never snap across in a single frame.
 */
export function solveIK2(
  root: THREE.Vector3,
  target: THREE.Vector3,
  L1: number,
  L2: number,
  pole: THREE.Vector3,
  out: THREE.Vector3,
  prev?: THREE.Vector3,
): IK2Result {
  _axis.copy(target).sub(root);
  let d = _axis.length();
  if (d < 1e-6) {
    _axis.set(0, 1, 0);
    d = 1e-6;
  }
  _axis.multiplyScalar(1 / d);

  const minD = Math.abs(L1 - L2) + 1e-4;
  const maxD = L1 + L2 - 1e-4;
  const reached = d <= maxD;
  const dc = Math.min(Math.max(d, minD), maxD);

  const a = (L1 * L1 - L2 * L2 + dc * dc) / (2 * dc);
  const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));

  _perp.copy(pole).addScaledVector(_axis, -pole.dot(_axis));
  if (_perp.lengthSq() < 0.04) {
    // The pole is all but parallel to the limb, so anything derived from it is
    // noise — and noise here is what flips the knee from one frame to the next.
    // Fall back deterministically: world up, then world X.
    _tmp.set(0, 1, 0).addScaledVector(_axis, -_axis.y);
    if (_tmp.lengthSq() < 0.04) _tmp.set(1, 0, 0).addScaledVector(_axis, -_axis.x);
    _perp.copy(_tmp);
  }
  _perp.normalize();

  out.copy(root).addScaledVector(_axis, a).addScaledVector(_perp, h);
  if (prev) {
    _alt.copy(root).addScaledVector(_axis, a).addScaledVector(_perp, -h);
    if (_alt.distanceToSquared(prev) < out.distanceToSquared(prev)) out.copy(_alt);
  }
  return { knee: out, reached, extension: dc / (L1 + L2) };
}
