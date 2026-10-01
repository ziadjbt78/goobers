/**
 * Headless verification of the hero rigs. No GPU, no DOM.
 *
 *   npx esbuild tools/syncTest.ts --bundle --platform=node --format=esm \
 *     --outfile=/tmp/syncTest.mjs && node /tmp/syncTest.mjs
 *
 * Fails the build (exit 1) if any limb drifts out of its socket, if any limb
 * root is buried less than 40% inside its parent, or if a part floats free.
 */
import * as THREE from 'three';
import { buildHeroTemplate } from '../src/engine/hero/heroes';
import { paletteAt, hexToLinear } from '../src/engine/hero/palette';
import { HERO_IDS } from '../src/engine/hero/types';
import type { HeroTemplate, HeroPartDef } from '../src/engine/hero/types';
import { solveLeg } from '../src/engine/anim/pose';

let pass = 0;
let fail = 0;
const failures: string[] = [];

function ok(name: string, cond: boolean, detail = ''): void {
  if (cond) pass++;
  else { fail++; failures.push(`${name}${detail ? ' — ' + detail : ''}`); }
}

/** Creature-space rest transform of every bone in a template. */
function boneWorld(t: HeroTemplate): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < t.bones.length; i++) {
    const b = t.bones[i];
    const p = b.parent >= 0 ? out[b.parent] : new THREE.Vector3();
    out.push(b.pos.clone().add(p));
  }
  return out;
}

/** Signed distance to a part's proxy surface at a creature-space point. <0 is inside. */
function proxyDepth(part: HeroPartDef, bonePos: THREE.Vector3[], p: THREE.Vector3): number {
  const centre = new THREE.Vector3().setFromMatrixPosition(part.matrix).add(bonePos[part.bone]);
  const q = new THREE.Quaternion().setFromRotationMatrix(part.matrix).invert();
  const rel = p.clone().sub(centre).applyQuaternion(q);
  const [a, b, c] = part.proxy.half;
  if (part.proxy.kind === 'capsule') {
    const r = Math.min(a, c);
    const span = Math.max(1e-6, b - r);
    const y = Math.max(-span, Math.min(span, rel.y));
    return Math.hypot(rel.x, rel.y - y, rel.z) - r;
  }
  const rr = Math.sqrt((rel.x / a) ** 2 + (rel.y / b) ** 2 + (rel.z / c) ** 2);
  return (rr - 1) * Math.min(a, Math.min(b, c));
}

/**
 * The head part a face is judged against. Falls back to the nearest ancestor
 * bone that actually owns geometry (BOP's gumdrop body IS its head).
 */
function headPartOf(t: HeroTemplate): HeroPartDef | undefined {
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

for (const id of HERO_IDS) {
  const pal = paletteAt(1);
  const template = buildHeroTemplate(id, {
    base: hexToLinear(pal.base),
    belly: hexToLinear(pal.belly),
    limb: hexToLinear(pal.limb),
    accent: hexToLinear(pal.accent),
    deep: hexToLinear(pal.deep),
  });
  const bw = boneWorld(template);
  const label = `${id}`;

  // ---- part budget: a big/medium/small hierarchy, never a 43-part pile -----
  ok(`${label}: part count 5..22`, template.parts.length >= 5 && template.parts.length <= 22, `${template.parts.length} parts`);

  // ---- nothing floats: every part hangs off a valid bone -------------------
  const badBone = template.parts.filter((p) => p.bone < 0 || p.bone >= template.bones.length);
  ok(`${label}: every part has a valid bone`, badBone.length === 0, badBone.map((p) => p.name).join(','));

  // ---- every part's real geometry matches its declared proxy size ---------
  // A typo in a factory call (radii swapped for segment counts) makes a part
  // 500x too big and it swallows the whole scene. Catch it headless.
  for (const part of template.parts) {
    const bb = new THREE.Box3().setFromBufferAttribute(
      part.geo.getAttribute('position') as THREE.BufferAttribute,
    );
    const size = bb.getSize(new THREE.Vector3());
    const want = Math.max(part.proxy.half[0], part.proxy.half[1], part.proxy.half[2]) * 2.5 + 0.05;
    const worst = Math.max(size.x, size.y, size.z);
    ok(`${label}: ${part.name} geometry size sane`, worst <= want, `${worst.toFixed(3)} > ${want.toFixed(3)}`);
  }

  // ---- dominant / secondary / detail hierarchy ----------------------------
  const volumes = template.parts.map((p) => p.proxy.half[0] * p.proxy.half[1] * p.proxy.half[2]);
  const biggest = Math.max(...volumes);
  const smallest = Math.min(...volumes);
  ok(`${label}: big-medium-small spread >= 20x`, biggest / Math.max(1e-9, smallest) >= 20, `spread ${(biggest / smallest).toFixed(1)}x`);

  // ---- limb roots buried >= 40% -------------------------------------------
  for (const part of template.parts) {
    if (part.role !== 'limb') continue;
    const parentBone = template.bones[part.bone].parent;
    if (parentBone < 0) continue;
    const parents = template.parts.filter((q) => q.bone === parentBone);
    if (parents.length === 0) { ok(`${label}: ${part.name} parent part exists`, false, 'no part on parent bone'); continue; }
    const socket = bw[part.bone];
    const depth = Math.min(...parents.map((q) => proxyDepth(q, bw, socket)));
    const ratio = depth / Math.max(1e-6, part.rootRadius);
    ok(`${label}: ${part.name} buried >= 40%`, ratio <= -0.40, `depth ${depth.toFixed(4)} / r ${part.rootRadius.toFixed(3)} = ${(ratio * 100).toFixed(0)}%`);
  }

  // ---- eye placement rules ------------------------------------------------
  const head = headPartOf(template);
  ok(`${label}: head mass found`, !!head);
  if (head) {
    const centre = new THREE.Vector3().setFromMatrixPosition(head.matrix).add(bw[head.bone]);
    const headW = head.proxy.half[0] * 2;
    for (const e of template.eyes) {
      const eyeFrac = (e.radius * 2) / headW;
      ok(`${label}: eye diameter 0.24-0.32 of head width`, eyeFrac >= 0.23 && eyeFrac <= 0.34, `${eyeFrac.toFixed(3)}`);
      ok(`${label}: eye at or below midline`, e.anchor.y <= centre.y + 0.02, `${e.anchor.y.toFixed(3)} vs ${centre.y.toFixed(3)}`);
    }
    const l = template.eyes.find((e) => e.side < 0);
    const r = template.eyes.find((e) => e.side > 0);
    if (l && r) {
      const gap = Math.abs(r.anchor.x - l.anchor.x) - l.radius - r.radius;
      const gapFrac = gap / (l.radius * 2);
      ok(`${label}: eye gap 0.6-1.0 widths`, gapFrac >= 0.55 && gapFrac <= 1.05, `${gapFrac.toFixed(2)}`);
    }
  }

  // ---- gait sync: feet never slide out of their sockets --------------------
  if (template.feet.length > 0) {
    const bones: THREE.Bone[] = [];
    for (const b of template.bones) {
      const bone = new THREE.Bone();
      bone.name = b.name;
      bone.position.copy(b.pos);
      bones.push(bone);
    }
    for (let i = 0; i < template.bones.length; i++) {
      const p = template.bones[i].parent;
      if (p >= 0) bones[p].add(bones[i]);
    }
    const group = new THREE.Group();
    group.add(bones[0]);
    group.updateMatrixWorld(true);

    let worstDrift = 0;
    let worstErr = 0;
    for (const phase of [0, 0.25, 0.5, 0.75]) {
      for (const f of template.feet) {
        const hip = bones[f.chain[0]];
        const knee = bones[f.chain[1]];
        const ankle = bones[f.chain[2]];
        const restHip = hip.position.clone();
        const target = new THREE.Vector3(f.plant.x, f.plant.y + Math.max(0, Math.sin(phase * Math.PI * 2)) * f.lift, f.plant.z + (0.5 - phase) * f.step);
        solveLeg({
          hip, knee, ankle,
          targetWorld: target,
          poleWorld: new THREE.Vector3(0, 0, 1),
        });
        group.updateMatrixWorld(true);
        const drift = hip.position.distanceTo(restHip);
        worstDrift = Math.max(worstDrift, drift);
        const foot = new THREE.Vector3().setFromMatrixPosition(ankle.matrixWorld);
        const err = foot.distanceTo(new THREE.Vector3().copy(target).applyMatrix4(group.matrixWorld));
        worstErr = Math.max(worstErr, err);
      }
    }
    ok(`${label}: socket drift <= 0.001 over gait`, worstDrift <= 0.001, `worst ${worstDrift.toFixed(5)}`);
    ok(`${label}: foot reaches plant <= 0.02 over gait`, worstErr <= 0.02, `worst ${worstErr.toFixed(4)}`);
  }
}

console.log('');
for (const f of failures) console.log('  FAIL  ' + f);
console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail > 0 ? 1 : 0);
