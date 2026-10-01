import { chromium } from 'playwright';
const BASE = process.argv[2] ?? 'http://127.0.0.1:8137/';
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--use-gl=angle', '--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
p.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 400)));
p.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 400)); });
await p.goto(BASE + '?freeze=1&t=1.4&gait=0.5', { waitUntil: 'load', timeout: 60000 });
await p.waitForFunction('window.__READY === true', null, { timeout: 60000 });
const out = await p.evaluate(() => {
  const r = { heroes: [], scene: [], cam: {} };
  const lab = window.__lab;
  const s = lab.stage;
  r.cam = { pos: s.camera.position.toArray(), target: s.controls.target.toArray(), fov: s.camera.fov, aspect: s.camera.aspect };
  const boxOf = (mesh) => {
    if (!mesh.geometry) return null;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const bb = mesh.geometry.boundingBox;
    const e = mesh.matrixWorld.elements;
    let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    for (const x of [bb.min.x, bb.max.x]) for (const y of [bb.min.y, bb.max.y]) for (const z of [bb.min.z, bb.max.z]) {
      const wx = e[0] * x + e[4] * y + e[8] * z + e[12];
      const wy = e[1] * x + e[5] * y + e[9] * z + e[13];
      const wz = e[2] * x + e[6] * y + e[10] * z + e[14];
      mn = [Math.min(mn[0], wx), Math.min(mn[1], wy), Math.min(mn[2], wz)];
      mx = [Math.max(mx[0], wx), Math.max(mx[1], wy), Math.max(mx[2], wz)];
    }
    return { min: mn.map((v) => +v.toFixed(3)), max: mx.map((v) => +v.toFixed(3)), size: mx.map((v, i) => +(v - mn[i]).toFixed(3)), verts: mesh.geometry.getAttribute('position').count };
  };
  for (const slot of lab.heroes) {
    const g = slot.hero.handle.group;
    g.updateMatrixWorld(true);
    const meshes = [];
    g.traverse((o) => { if (o.isMesh) meshes.push({ name: o.name || o.type, mat: o.material?.type, ...boxOf(o) }); });
    const body = g.getObjectByName('body');
    r.heroes.push({
      id: slot.id, slotX: slot.x, groupPos: g.position.toArray().map((v) => +v.toFixed(3)),
      groupScale: g.scale.toArray(), bones: g.children.filter((c) => c.isBone || c.type === 'Group' || c.isObject3D && !c.isMesh).length,
      meshes,
      boneScales: (slot.hero.handle.bones || []).slice(0, 4).map((bn) => ({ n: bn.name, s: bn.scale.toArray().map((v) => +v.toFixed(3)), q: bn.quaternion.toArray().map((v) => +v.toFixed(3)) })),
      verts: slot.hero.handle.verts, tris: slot.hero.handle.tris, height: slot.hero.handle.height,
    });
  }
  const walk = (o, d) => {
    r.scene.push({ d, name: o.name || o.type, type: o.type, pos: o.position.toArray().map((v) => +v.toFixed(3)), scl: o.scale.toArray().map((v) => +v.toFixed(3)) });
    for (const c of o.children) if (d < 2) walk(c, d + 1);
  };
  walk(s.scene, 0);
  r.pedestals = s.pedestals.length;
  return r;
});
console.log(JSON.stringify(out, null, 1));
await b.close();
