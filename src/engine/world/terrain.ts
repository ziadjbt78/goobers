/**
 * The island. One analytic height field drives everything: the mesh you see,
 * where the feet plant, where the grass grows and how high the water sits.
 * There is no heightmap to load and no collision mesh to keep in sync.
 *
 * The shoreline is a smoothstep shelf rather than a quadratic cliff, so the
 * island reads as a rounded toon landmass with a gently curving beach instead
 * of a blocky stepped rim.
 */
import * as THREE from 'three';
import { MAT } from '../render/hero/materials';

export const ISLAND_R = 12.5;
export const POND = { x: 4.6, z: -3.8, r: 3.1 };
/** Water plane. Anything below it is the pond and the sea. */
export const WATER_Y = 0.17;
/** Creatures stay on the meadow and out of the sea. */
export const WALK_R = 10.2;

const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Ground height at a world point. Pure, cheap, called thousands of times a frame. */
export function heightAt(x: number, z: number): number {
  const r = Math.hypot(x, z);
  const dome = 0.62 * (1 - (r / ISLAND_R) ** 2);
  const hills = 0.30 * Math.sin(x * 0.44 + 0.7) * Math.cos(z * 0.39 - 0.3)
    + 0.14 * Math.sin(x * 0.97 - 1.1) * Math.cos(z * 0.86 + 0.5);
  const inland = smoothstep(ISLAND_R, ISLAND_R * 0.55, r);
  let h = dome + hills * inland - 0.16;
  const dp = Math.hypot(x - POND.x, z - POND.z);
  h -= smoothstep(POND.r, 0, dp) * 0.62;
  // smooth, C1 shoreline: one eased shelf out to the sea floor
  const edge = smoothstep(ISLAND_R * 0.78, ISLAND_R * 1.34, r);
  h -= edge * 5.4;
  return h;
}

export function normalAt(x: number, z: number, out = new THREE.Vector3()): THREE.Vector3 {
  const e = 0.08;
  const hx = heightAt(x + e, z) - heightAt(x - e, z);
  const hz = heightAt(x, z + e) - heightAt(x, z - e);
  return out.set(-hx, 2 * e, -hz).normalize();
}

export function isDry(x: number, z: number): boolean {
  return Math.hypot(x, z) < WALK_R && heightAt(x, z) > WATER_Y + 0.04;
}

/** The island mesh: one displaced plane with graded vertex colours. */
export function buildTerrain(): THREE.Mesh {
  const SIZE = 46;
  const SEG = 160;
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();

  const grass = new THREE.Color('#8ed05a');
  const grassDark = new THREE.Color('#5aa53f');
  const sand = new THREE.Color('#f2e3b0');
  const mud = new THREE.Color('#c9b078');
  const reef = new THREE.Color('#79c6c0');
  const underwater = new THREE.Color('#4f9fb0');
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = pos.getY(i);
    const r = Math.hypot(x, z);
    if (y < WATER_Y - 0.55) c.copy(underwater).lerp(reef, smoothstep(-2.4, WATER_Y - 0.55, y));
    else if (y < WATER_Y - 0.02) c.copy(reef).lerp(mud, smoothstep(WATER_Y - 0.55, WATER_Y, y));
    else c.copy(sand).lerp(grass, smoothstep(WATER_Y, WATER_Y + 0.26, y));
    if (y > WATER_Y + 0.24) c.lerp(grassDark, smoothstep(WATER_Y + 0.24, 1.05, y) * 0.40);
    const n = 0.5 + 0.5 * Math.sin(x * 3.1 + z * 2.7) * Math.sin(x * 1.7 - z * 3.3);
    c.offsetHSL(0, 0, (n - 0.5) * 0.038);
    c.offsetHSL(0, 0, -smoothstep(WALK_R * 0.8, ISLAND_R, r) * 0.04);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mesh = new THREE.Mesh(geo, MAT.lit);
  mesh.name = 'terrain';
  mesh.frustumCulled = false;
  return mesh;
}

/**
 * The sea: one big instanced-free disc at the waterline, toon-graded from a
 * pale turquoise lagoon to a deep blue horizon, with a slow vertex ripple so it
 * never looks like a painted plane. It replaces the old flat brown outer ring.
 */
export function buildSea(): THREE.Mesh {
  const R = 260;
  const geo = new THREE.CircleGeometry(R, 128, 1);
  geo.rotateX(-Math.PI / 2);
  const p = geo.getAttribute('position') as THREE.BufferAttribute;
  const near = new THREE.Color('#8fdccb');
  const mid = new THREE.Color('#4fb0d8');
  const far = new THREE.Color('#2f6fb0');
  const col = new Float32Array(p.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const r = Math.hypot(p.getX(i), p.getZ(i));
    if (r < ISLAND_R * 1.15) c.copy(near);
    else if (r < 60) c.copy(near).lerp(mid, smoothstep(ISLAND_R * 1.1, 60, r));
    else c.copy(mid).lerp(far, smoothstep(60, 200, r));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mesh = new THREE.Mesh(geo, MAT.lit);
  mesh.name = 'sea';
  mesh.position.y = WATER_Y - 0.005;
  mesh.frustumCulled = false;
  mesh.renderOrder = -2;
  return mesh;
}

/** A soft foam ring hugging the island where the land meets the waterline. */
export function buildFoam(): THREE.Mesh {
  let waterR = ISLAND_R;
  for (let i = 0; i <= 200; i++) {
    const r = ISLAND_R * 0.6 + (i / 200) * ISLAND_R * 0.8;
    if (heightAt(r, 0) > WATER_Y) waterR = r;
  }
  const inner = Math.max(ISLAND_R * 0.7, waterR - 0.40);
  const geo = new THREE.RingGeometry(inner, waterR + 0.26, 96, 1);
  geo.rotateX(-Math.PI / 2);
  const p = geo.getAttribute('position') as THREE.BufferAttribute;
  const col = new Float32Array(p.count * 3);
  const white = new THREE.Color('#ffffff');
  const soft = new THREE.Color('#cdeef0');
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const r = Math.hypot(p.getX(i), p.getZ(i));
    c.copy(soft).lerp(white, smoothstep(inner, waterR, r));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mesh = new THREE.Mesh(geo, MAT.lit);
  mesh.name = 'foam';
  mesh.position.y = WATER_Y + 0.012;
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return mesh;
}
