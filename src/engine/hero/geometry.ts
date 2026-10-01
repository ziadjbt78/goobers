/**
 * Smooth / creased geometry factories.
 *
 * Two rules decide everything here:
 *  - round solids (sphere, egg, capsule, cone) get WELDED SMOOTH normals, so no
 *    facet is ever visible no matter how the light hits them;
 *  - flat-faced solids (rounded box, hex prism) get creased normals, so the flat
 *    faces stay flat and only the bevel blends. That is the "geometric" read.
 */
import * as THREE from 'three';
import { mergeVertices, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/** Weld coincident vertices and rebuild normals: the cure for visible facets. */
export function smooth(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = mergeVertices(geo, 1e-5);
  g.computeVertexNormals();
  if (geo !== g) geo.dispose();
  return g;
}

/** Smooth the bevel, keep the flat faces flat. */
export function creased(geo: THREE.BufferGeometry, angle = Math.PI / 3): THREE.BufferGeometry {
  const g = toCreasedNormals(geo, angle);
  if (geo !== g) geo.dispose();
  return g;
}

/** Uniform or non-uniform sphere. */
export function sphere(rx: number, ry = rx, rz = rx, radial = 32, heightSeg = 24): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, Math.max(8, radial), Math.max(6, heightSeg));
  g.scale(Math.max(1e-4, rx), Math.max(1e-4, ry), Math.max(1e-4, rz));
  return smooth(g);
}

/**
 * Egg / bean. `taper` narrows the top, which is what makes a body read as a
 * body instead of a ball. 0 = sphere, 0.25 = a clear egg.
 */
export function egg(rx: number, ry: number, rz: number, taper = 0.14, radial = 40, heightSeg = 28): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, Math.max(8, radial), Math.max(6, heightSeg));
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const t = (y + 1) * 0.5;
    const s = 1 - taper * t * t;
    p.setXYZ(i, p.getX(i) * s, y, p.getZ(i) * s);
  }
  g.scale(Math.max(1e-4, rx), Math.max(1e-4, ry), Math.max(1e-4, rz));
  return smooth(g);
}

/**
 * A segment of a limb: a tapered capsule with hemispherical caps of radius r1 at
 * the FAR end and r2 at the PIVOT end. Two consecutive segments sharing a radius
 * produce two coincident spheres at the joint, which is why the limb can rotate
 * freely with no gap and no bulge.
 */
export function limbSegment(rFar: number, rPivot: number, len: number, radial = 32, capSeg = 8): THREE.BufferGeometry {
  const half = Math.max(1e-3, len * 0.5);
  const a = Math.max(1e-4, rFar);
  const b = Math.max(1e-4, rPivot);
  const cs = Math.max(3, capSeg);
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= cs; i++) {
    const ang = -Math.PI * 0.5 + (Math.PI * 0.5 * i) / cs;
    pts.push(new THREE.Vector2(Math.cos(ang) * a, -half + Math.sin(ang) * a));
  }
  pts.push(new THREE.Vector2((a + b) * 0.5, 0));
  for (let i = 0; i <= cs; i++) {
    const ang = (Math.PI * 0.5 * i) / cs;
    pts.push(new THREE.Vector2(Math.cos(ang) * b, half + Math.sin(ang) * b));
  }
  return smooth(new THREE.LatheGeometry(pts, Math.max(10, radial)));
}

/** Rounded box. `bevel` is an absolute radius, clamped to 49% of the smallest side. */
export function roundedBox(w: number, h: number, d: number, bevel: number, seg = 5): THREE.BufferGeometry {
  const m = Math.min(w, h, d);
  const b = Math.max(0.002, Math.min(bevel, m * 0.49));
  return creased(new RoundedBoxGeometry(Math.max(0.01, w), Math.max(0.01, h), Math.max(0.01, d), Math.max(3, seg), b), Math.PI / 3);
}

/** Rounded cone — ears, horns, sprout tips. */
export function roundCone(rBase: number, rTip: number, h: number, radial = 28): THREE.BufferGeometry {
  const half = Math.max(1e-3, h * 0.5);
  const a = Math.max(1e-4, rBase);
  const b = Math.max(1e-4, rTip);
  const cs = 6;
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= cs; i++) {
    const ang = -Math.PI * 0.5 + (Math.PI * 0.5 * i) / cs;
    pts.push(new THREE.Vector2(Math.cos(ang) * a, -half + Math.sin(ang) * a));
  }
  pts.push(new THREE.Vector2((a + b) * 0.5, 0));
  for (let i = 0; i <= cs; i++) {
    const ang = (Math.PI * 0.5 * i) / cs;
    pts.push(new THREE.Vector2(Math.cos(ang) * b, half + Math.sin(ang) * b));
  }
  return smooth(new THREE.LatheGeometry(pts, Math.max(10, radial)));
}

/** Beveled prism. `sides = 6` gives the bug abdomen. */
export function bevelPrism(radius: number, h: number, sides: number, bevel: number, bevelSeg = 4): THREE.BufferGeometry {
  const b = Math.max(0.002, Math.min(bevel, Math.min(radius, h * 0.5) * 0.49));
  const r = Math.max(0.01, radius - b);
  const hh = Math.max(0.01, h * 0.5 - b);
  const n = Math.max(3, Math.round(sides));
  const pts: THREE.Vector2[] = [];
  pts.push(new THREE.Vector2(0, -hh - b));
  for (let i = 0; i <= bevelSeg; i++) {
    const ang = -Math.PI * 0.5 + (Math.PI * 0.5 * i) / bevelSeg;
    pts.push(new THREE.Vector2(r + Math.cos(ang) * b, -hh + Math.sin(ang) * b));
  }
  for (let i = 0; i <= bevelSeg; i++) {
    const ang = (Math.PI * 0.5 * i) / bevelSeg;
    pts.push(new THREE.Vector2(r + Math.cos(ang) * b, hh + Math.sin(ang) * b));
  }
  pts.push(new THREE.Vector2(0, hh + b));
  return creased(new THREE.LatheGeometry(pts, n), Math.PI / 6);
}

/** Torus arc — mouths, collars. */
export function torusArc(R: number, r: number, arc: number, radial = 24, tubular = 10): THREE.BufferGeometry {
  return smooth(new THREE.TorusGeometry(Math.max(1e-3, R), Math.max(1e-3, r), Math.max(4, tubular), Math.max(6, radial), arc));
}

/** Flattened lens — blush and face patches. */
export function lens(rx: number, ry: number, depth: number, radial = 24, heightSeg = 12): THREE.BufferGeometry {
  return sphere(rx, ry, depth, radial, heightSeg);
}

/** Unit quaternion from one direction to another. */
export function quatFromTo(from: THREE.Vector3, to: THREE.Vector3): THREE.Quaternion {
  return new THREE.Quaternion().setFromUnitVectors(from.clone().normalize(), to.clone().normalize());
}

/**
 * Distance from the centre of an ellipsoid to its surface along a unit
 * direction. Used to plant eyes exactly on a head, never floating off it.
 */
export function ellipsoidSurfaceDist(a: number, b: number, c: number, dx: number, dy: number, dz: number): number {
  const k = (dx / a) ** 2 + (dy / b) ** 2 + (dz / c) ** 2;
  return 1 / Math.sqrt(Math.max(1e-9, k));
}

/** Analytic direction on an ellipsoid: yaw around Y, pitch around X. */
export function dirFromYawPitch(yaw: number, pitch: number): THREE.Vector3 {
  const cp = Math.cos(pitch);
  return new THREE.Vector3(Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp).normalize();
}
