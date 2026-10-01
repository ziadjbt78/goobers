/**
 * HeroRenderer — template → GPU. One merged skinned mesh for the whole body,
 * one shared geometry for the inverted-hull outline (with a darker colour
 * attribute), and one face rig whose parts are children of the head bone.
 *
 * Skinning is rigid: every vertex is welded 1.0 to its own bone. Limbs never
 * deform, never stretch, and never slide out of their socket, because the
 * socket is the bone origin and the rounded end of the limb is a sphere centred
 * exactly there.
 */
import * as THREE from 'three';
import type { HeroTemplate, HeroPartDef } from '../../hero/types';
import { hexToLinear, mixRgb } from '../../hero/palette';
import { sphere, torusArc } from '../../hero/geometry';
import { MAT } from './materials';

export interface EyeHandles {
  root: THREE.Group;
  socket: THREE.Group;
  sclera: THREE.Mesh;
  iris: THREE.Mesh;
  pupil: THREE.Mesh;
  big: THREE.Mesh;
  small: THREE.Mesh;
  lidPivot: THREE.Group;
  lid: THREE.Mesh;
  brow: THREE.Mesh;
  /** v8 Face map: a mirrored lower lid that rises up to 40% of the eye height */
  lidLowerPivot: THREE.Group;
  lidLower: THREE.Mesh;
  /** v8 eyeMode symbols, all code-built, all hidden until an eyeMode asks */
  arcHappy: THREE.Mesh;
  arcClosed: THREE.Mesh;
  heart: THREE.Mesh;
  star: THREE.Mesh;
  spiral: THREE.Mesh;
  radius: number;
  side: number;
}

export interface HeroHandle {
  group: THREE.Group;
  /** v8: ground-contact group between the root and the rig — the motion layer
   *  writes lift, volume-preserving squash, grow and roll-over here. Identity
   *  by default, so every pedestal view renders exactly as it did before. */
  pivot: THREE.Group;
  bones: THREE.Bone[];
  boneByName: Map<string, THREE.Bone>;
  boneIndex: Map<string, number>;
  skeleton: THREE.Skeleton;
  shell: THREE.SkinnedMesh;
  outline: THREE.SkinnedMesh;
  eyes: EyeHandles[];
  mouth: THREE.Mesh;
  mouthOpen: THREE.Mesh;
  blush: THREE.Mesh[];
  /** authored head-local blush centres, so the Face map can puff them outward */
  blushRest: THREE.Vector3[];
  parts: HeroPartDef[];
  height: number;
  radius: number;
  verts: number;
  tris: number;
  colorAt(name: string): [number, number, number];
  dispose(): void;
}

function paint(geo: THREE.BufferGeometry, c: [number, number, number]): void {
  const n = geo.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2]; }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

/** Five-point star, drawn as a Shape so no image file is ever needed. */
function starShape(rr: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI * 0.5;
    const rad = i % 2 === 0 ? rr : rr * 0.46;
    const x = Math.cos(a) * rad;
    const y = Math.sin(a) * rad;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  s.closePath();
  return new THREE.ShapeGeometry(s, 10);
}

/** Two-lobe heart, again pure geometry. */
function heartShape(rr: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(0, -rr * 0.92);
  s.bezierCurveTo(rr * 1.18, -rr * 0.10, rr * 0.64, rr * 1.06, 0, rr * 0.34);
  s.bezierCurveTo(-rr * 0.64, rr * 1.06, -rr * 1.18, -rr * 0.10, 0, -rr * 0.92);
  return new THREE.ShapeGeometry(s, 14);
}

/** Dizzy spiral: a two-and-a-half turn band with a tapered tail. */
function spiralShape(rr: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  const turns = 2.5;
  const N = 96;
  const inner = rr * 0.14;
  for (let i = 0; i <= N; i++) {
    const k = i / N;
    const a = k * turns * Math.PI * 2;
    const rad = inner + (rr - inner) * k;
    const x = Math.cos(a) * rad;
    const y = Math.sin(a) * rad;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  for (let i = N; i >= 0; i--) {
    const k = i / N;
    const a = k * turns * Math.PI * 2;
    const rad = inner + (rr - inner) * k - rr * 0.12 * (0.35 + 0.65 * k);
    s.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
  }
  s.closePath();
  return new THREE.ShapeGeometry(s, 8);
}

const _p = new THREE.Vector3();
const _n = new THREE.Vector3();
const _nm = new THREE.Matrix3();
const _id = new THREE.Matrix4();
const _partM = new THREE.Matrix4();

export function buildHero(t: HeroTemplate, palette: { base: string; belly: string; limb: string; accent: string; deep: string }): HeroHandle {
  const accent = hexToLinear(palette.accent);
  const deep = hexToLinear(palette.deep);

  // ---- bones ---------------------------------------------------------------
  const bones: THREE.Bone[] = [];
  for (const b of t.bones) {
    const bone = new THREE.Bone();
    bone.name = b.name;
    bone.position.copy(b.pos);
    bone.quaternion.copy(b.quat);
    bones.push(bone);
  }
  for (let i = 0; i < t.bones.length; i++) {
    const p = t.bones[i].parent;
    if (p >= 0) bones[p].add(bones[i]);
  }
  const boneByName = new Map<string, THREE.Bone>();
  const boneIndex = new Map<string, number>();
  for (let i = 0; i < bones.length; i++) { boneByName.set(bones[i].name, bones[i]); boneIndex.set(bones[i].name, i); }

  const group = new THREE.Group();
  // v8: group -> pivot -> bones[0]. The pivot sits at ground-contact height and
  // carries lift / squash / grow / roll-over; `root` keeps its authored offsets.
  const pivot = new THREE.Group();
  pivot.name = 'pivot';
  group.add(pivot);
  pivot.add(bones[0]);
  group.updateMatrixWorld(true);

  // Creature-space rest position of every bone. Face parts are authored in
  // creature space (the template says where the eyes sit on the body), so they
  // must be re-expressed in the HEAD BONE's local space before parenting, or
  // every eye and mouth floats up by the head's own offset.
  const boneAt: THREE.Vector3[] = [];
  for (let i = 0; i < t.bones.length; i++) {
    const p = t.bones[i].parent >= 0 ? boneAt[t.bones[i].parent] : new THREE.Vector3();
    boneAt.push(t.bones[i].pos.clone().add(p));
  }
  const headAt = boneAt[t.headBone];

  // ---- merge every part into one rigidly-skinned buffer --------------------
  let vTotal = 0;
  for (const part of t.parts) vTotal += part.geo.getAttribute('position').count;

  const positions = new Float32Array(vTotal * 3);
  const normals = new Float32Array(vTotal * 3);
  const colors = new Float32Array(vTotal * 3);
  const ocolors = new Float32Array(vTotal * 3);
  const skinIndex = new Uint16Array(vTotal * 4);
  const skinWeight = new Float32Array(vTotal * 4);
  const indices: number[] = [];
  const colorMap = new Map<string, [number, number, number]>();

  let vo = 0;
  for (const part of t.parts) {
    const pos = part.geo.getAttribute('position');
    const nrm = part.geo.getAttribute('normal');
    const idx = part.geo.getIndex();
    // Skinning treats a vertex as a REST-WORLD (creature-space) point: the
    // shader computes boneMatrix * boneInverse * vertex, and boneInverse maps
    // world -> bone-local. Template part matrices are bone-local, so push each
    // part into creature space here or every part lands one bone-height low.
    const bone = boneAt[part.bone];
    _partM.makeTranslation(bone.x, bone.y, bone.z).multiply(part.matrix);
    _nm.getNormalMatrix(_partM);
    const base0 = vo;
    colorMap.set(part.name, part.color);
    const oc = mixRgb(part.color, deep, part.outlineDark);
    for (let i = 0; i < pos.count; i++) {
      _p.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(_partM);
      _n.set(nrm.getX(i), nrm.getY(i), nrm.getZ(i)).applyMatrix3(_nm).normalize();
      positions[vo * 3] = _p.x; positions[vo * 3 + 1] = _p.y; positions[vo * 3 + 2] = _p.z;
      normals[vo * 3] = _n.x; normals[vo * 3 + 1] = _n.y; normals[vo * 3 + 2] = _n.z;
      // subtle top-light lift so the flat authored colours still read as volume
      const lift = Math.max(0, _n.y) * 0.06;
      colors[vo * 3] = Math.min(1, part.color[0] + lift);
      colors[vo * 3 + 1] = Math.min(1, part.color[1] + lift);
      colors[vo * 3 + 2] = Math.min(1, part.color[2] + lift);
      ocolors[vo * 3] = oc[0]; ocolors[vo * 3 + 1] = oc[1]; ocolors[vo * 3 + 2] = oc[2];
      skinIndex[vo * 4] = part.bone;
      skinIndex[vo * 4 + 1] = 0;
      skinIndex[vo * 4 + 2] = 0;
      skinIndex[vo * 4 + 3] = 0;
      skinWeight[vo * 4] = 1;
      skinWeight[vo * 4 + 1] = 0;
      skinWeight[vo * 4 + 2] = 0;
      skinWeight[vo * 4 + 3] = 0;
      vo++;
    }
    if (idx) for (let i = 0; i < idx.count; i++) indices.push(base0 + idx.getX(i));
    else for (let i = 0; i < pos.count; i++) indices.push(base0 + i);
    part.geo.dispose();
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndex, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
  geo.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
  geo.computeBoundingSphere();
  geo.computeBoundingBox();

  const ogeo = new THREE.BufferGeometry();
  ogeo.setAttribute('position', geo.getAttribute('position'));
  ogeo.setAttribute('normal', geo.getAttribute('normal'));
  ogeo.setAttribute('skinIndex', geo.getAttribute('skinIndex'));
  ogeo.setAttribute('skinWeight', geo.getAttribute('skinWeight'));
  ogeo.setAttribute('color', new THREE.BufferAttribute(ocolors, 3));
  ogeo.setIndex(geo.getIndex());
  ogeo.boundingSphere = geo.boundingSphere;
  ogeo.boundingBox = geo.boundingBox;

  // Bind against the REST pose explicitly. Skeleton() reads whatever
  // matrixWorld the bones happen to carry at construction time, and a stale
  // matrix there makes every skinned vertex land at the wrong height while the
  // face meshes (plain children of the bones) still look right. No bone has a
  // rest rotation, so the rest world matrix is exactly T(boneAt[i]).
  const skeleton = new THREE.Skeleton(bones);
  for (let i = 0; i < bones.length; i++) {
    skeleton.boneInverses[i].makeTranslation(boneAt[i].x, boneAt[i].y, boneAt[i].z).invert();
  }

  const shell = new THREE.SkinnedMesh(geo, MAT.toon);
  shell.name = 'shell';
  shell.frustumCulled = false;
  shell.bind(skeleton, _id);
  group.add(shell);

  const outline = new THREE.SkinnedMesh(ogeo, MAT.outline);
  outline.name = 'outline';
  outline.frustumCulled = false;
  outline.renderOrder = -1;
  outline.bind(skeleton, _id);
  group.add(outline);

  // ---- face ---------------------------------------------------------------
  const headBone = bones[t.headBone];
  const eyeWhite = hexToLinear('#fdfcf8');
  const pupilCol: [number, number, number] = [0.012, 0.012, 0.020];
  const skinLinear = hexToLinear(palette.base);
  const lidLinear = mixRgb(skinLinear, [0, 0, 0], 0.10);
  const browLinear = mixRgb(skinLinear, deep, 0.85);

  const eyes: EyeHandles[] = [];
  for (const e of t.eyes) {
    const r = e.radius;
    const root = new THREE.Group();
    root.position.copy(e.anchor).sub(headAt);
    root.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), e.dir.clone().normalize());
    headBone.add(root);

    const socket = new THREE.Group();
    root.add(socket);

    const scleraGeo = sphere(r, r, r * 0.62, 40, 26);
    paint(scleraGeo, eyeWhite);
    const sclera = new THREE.Mesh(scleraGeo, MAT.glossy);
    sclera.frustumCulled = false;
    socket.add(sclera);

    const irisGeo = sphere(r * 0.75, r * 0.75, r * 0.34, 34, 22);
    paint(irisGeo, mixRgb(accent, [0, 0, 0], 0.25));
    const iris = new THREE.Mesh(irisGeo, MAT.glossy);
    iris.position.z = r * 0.50;
    iris.frustumCulled = false;
    socket.add(iris);

    const pupilGeo = sphere(r * 0.4125, r * 0.4125, r * 0.32, 28, 18);
    paint(pupilGeo, pupilCol);
    const pupil = new THREE.Mesh(pupilGeo, MAT.glossy);
    pupil.position.z = r * 0.66;
    pupil.frustumCulled = false;
    socket.add(pupil);

    // fixed glints: parented to the eye ROOT, so gaze never drags them around
    const bigGeo = sphere(r * 0.30, r * 0.30, r * 0.24, 18, 12);
    paint(bigGeo, [1, 1, 1]);
    const big = new THREE.Mesh(bigGeo, MAT.flat);
    big.position.set(-r * 0.30, r * 0.30, r * 0.92);
    big.frustumCulled = false;
    root.add(big);

    const smallGeo = sphere(r * 0.14, r * 0.14, r * 0.12, 14, 10);
    paint(smallGeo, [1, 1, 1]);
    const small = new THREE.Mesh(smallGeo, MAT.flat);
    small.position.set(r * 0.30, -r * 0.26, r * 0.95);
    small.frustumCulled = false;
    root.add(small);

    // eyelid: a solid skin dome that swings from behind the eye to over the eye
    const lidPivot = new THREE.Group();
    root.add(lidPivot);
    const lidGeo = sphere(r * 1.07, r * 1.07, r * 1.07, 30, 20);
    paint(lidGeo, lidLinear);
    const lid = new THREE.Mesh(lidGeo, MAT.toon);
    lid.position.set(0, r * 1.03, 0);
    lid.scale.set(0.99, 0.94, 0.99);
    lid.frustumCulled = false;
    lidPivot.add(lid);
    lidPivot.rotation.x = -Math.PI * 0.5;

    const browGeo = sphere(r * 0.62, r * 0.16, r * 0.14, 22, 12);
    paint(browGeo, browLinear);
    const brow = new THREE.Mesh(browGeo, MAT.toon);
    brow.position.set(e.side * r * 0.10, r * 0.98, r * 0.52);
    brow.visible = false;
    brow.frustumCulled = false;
    root.add(brow);

    // lower lid: the same dome, mirrored below the eye, parked outside the
    // socket until the Face map lifts it
    const lidLowerPivot = new THREE.Group();
    root.add(lidLowerPivot);
    const lowGeo = sphere(r * 1.07, r * 1.07, r * 1.07, 30, 20);
    paint(lowGeo, lidLinear);
    const lidLower = new THREE.Mesh(lowGeo, MAT.toon);
    lidLower.position.set(0, -r * 1.03, 0);
    lidLower.scale.set(0.99, 0.94, 0.99);
    lidLower.frustumCulled = false;
    lidLowerPivot.add(lidLower);
    lidLowerPivot.rotation.x = -Math.PI * 0.5;

    // ---- v8 eyeMode symbols: built from primitives, no image files ---------
    const arcColor = mixRgb(pupilCol, [0.05, 0.045, 0.085], 0.45);
    const sym = (geo: THREE.BufferGeometry, col: [number, number, number], z: number): THREE.Mesh => {
      paint(geo, col);
      const m = new THREE.Mesh(geo, MAT.flat);
      m.position.z = z;
      m.visible = false;
      m.frustumCulled = false;
      root.add(m);
      return m;
    };
    const arcHappy = sym(torusArc(r * 0.98, r * 0.17, 2.3, 30, 10), arcColor, r * 0.84);
    arcHappy.rotation.z = Math.PI * 0.5 - 1.15;          // peak up: the "^" happy eye
    const arcClosed = sym(torusArc(r * 1.04, r * 0.055, 1.9, 26, 8), arcColor, r * 0.86);
    arcClosed.rotation.z = Math.PI * 0.5 - 0.95;
    const heart = sym(heartShape(r * 0.62), hexToLinear('#ff5f86'), r * 0.80);
    const star = sym(starShape(r * 0.60), pupilCol, r * 0.82);
    const spiral = sym(spiralShape(r * 0.74), arcColor, r * 0.84);

    eyes.push({
      root, socket, sclera, iris, pupil, big, small, lidPivot, lid, brow,
      lidLowerPivot, lidLower, arcHappy, arcClosed, heart, star, spiral,
      radius: r, side: e.side,
    });
  }

  // ---- mouth, blush, brows ------------------------------------------------
  const headWorld = t.expression.mouthCenter;
  const darkMouth = mixRgb(deep, [0, 0, 0], 0.35);
  const mw = t.expression.mouthWidth;
  const mouthGeo = torusArc(mw, mw * 0.20, 1.55, 26, 10);
  paint(mouthGeo, darkMouth);
  const mouth = new THREE.Mesh(mouthGeo, MAT.toon);
  mouth.position.copy(headWorld).sub(headAt);
  mouth.rotation.z = -Math.PI * 0.5 - 1.55 * 0.5;
  mouth.frustumCulled = false;
  headBone.add(mouth);

  const openGeo = sphere(mw * 0.42, mw * 0.60, mw * 0.22, 22, 14);
  paint(openGeo, darkMouth);
  const mouthOpen = new THREE.Mesh(openGeo, MAT.toon);
  mouthOpen.position.copy(headWorld).add(new THREE.Vector3(0, -mw * 0.18, 0.008)).sub(headAt);
  mouthOpen.visible = false;
  mouthOpen.frustumCulled = false;
  headBone.add(mouthOpen);

  const blushCol = mixRgb(hexToLinear('#ff7a95'), skinLinear, 0.42);
  const blush: THREE.Mesh[] = [];
  const blushRest: THREE.Vector3[] = [];
  for (const b of t.expression.blush) {
    const g = sphere(0.062, 0.040, 0.020, 24, 14);
    paint(g, blushCol);
    const m = new THREE.Mesh(g, MAT.toon);
    m.position.copy(b).sub(headAt);
    blushRest.push(m.position.clone());
    m.rotation.y = Math.sign(b.x) * 0.42;
    m.frustumCulled = false;
    headBone.add(m);
    blush.push(m);
  }

  return {
    group, pivot, bones, boneByName, boneIndex, skeleton, shell, outline, eyes, mouth, mouthOpen, blush, blushRest,
    parts: t.parts,
    height: t.height,
    radius: t.radius,
    verts: vTotal,
    tris: indices.length / 3,
    colorAt: (name) => colorMap.get(name) ?? [0.5, 0.5, 0.5],
    dispose(): void {
      geo.dispose();
      ogeo.dispose();
      mouth.geometry.dispose();
      mouthOpen.geometry.dispose();
      for (const m of blush) m.geometry.dispose();
      for (const e of eyes) {
        e.sclera.geometry.dispose(); e.iris.geometry.dispose(); e.pupil.geometry.dispose();
        e.big.geometry.dispose(); e.small.geometry.dispose(); e.lid.geometry.dispose(); e.brow.geometry.dispose();
        e.lidLower.geometry.dispose(); e.arcHappy.geometry.dispose(); e.arcClosed.geometry.dispose();
        e.heart.geometry.dispose(); e.star.geometry.dispose(); e.spiral.geometry.dispose();
      }
    },
  };
}

