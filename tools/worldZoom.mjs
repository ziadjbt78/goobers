/**
 * World readability check: the SAME scene shot from far away and up close, plus
 * a tool effect fired from a distance, to prove the island still reads when it
 * is zoomed out.
 *   node tools/worldZoom.mjs http://127.0.0.1:8137 verify
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:8137/';
const OUT = process.argv[3] ?? 'verify';
const b = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--use-gl=angle', '--disable-dev-shm-usage', '--no-sandbox'],
});
const p = await b.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
const errs = [];
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
p.on('pageerror', (e) => errs.push(String(e)));

mkdirSync(OUT, { recursive: true });
await p.goto(BASE, { waitUntil: 'load', timeout: 180000 });
await p.waitForFunction('window.__READY === true && !!window.__lab', null, { timeout: 180000 });

const shot = async (name) => {
  await p.screenshot({ path: `${OUT}/${name}.png` });
  process.stdout.write(`  ${OUT}/${name}.png\n`);
};

// 1. far zoom-out: the whole island. Tags, emotes and props must all read.
await p.evaluate(() => {
  const s = window.__lab;
  s.pause();
  for (let i = 0; i < 240; i++) s.step(1 / 30);
  s.stage.controls.enabled = false;
  s.stage.camera.position.set(0.0, 26.0, 30.0);
  s.stage.camera.lookAt(0, 0.4, 0);
  s.tickUi(s.stage.camera, 0.05);
  s.renderOnce();
});
await shot('10_zoomout');

// 2. same island, one tool effect fired while zoomed out
await p.evaluate(() => {
  const s = window.__lab;
  s.call({ x: 0, y: 0, z: 2.0 });
  for (let i = 0; i < 14; i++) s.step(1 / 30);
  s.stage.camera.position.set(0.0, 22.0, 26.0);
  s.stage.camera.lookAt(0, 0.4, 0);
  s.tickUi(s.stage.camera, 0.05);
  s.renderOnce();
});
await shot('11_zoomout_tool');

// 3. close-up: faces, legs and grass clearance
await p.evaluate(() => {
  const s = window.__lab;
  const a = s.agents[0];
  for (let i = 0; i < 24; i++) s.step(1 / 30);
  const h = a.template.height * a.dna.scale;
  const fx = Math.sin(a.heading), fz = Math.cos(a.heading);
  // stand off far enough that the body is fully in frame — 2.2 x height back
  s.stage.camera.position.set(
    a.pos.x - fx * h * 2.2 + 0.75,
    a.pos.y + h * 1.25,
    a.pos.z - fz * h * 2.2 + 0.75,
  );
  s.stage.camera.lookAt(a.pos.x, a.pos.y + h * 0.42, a.pos.z);
  s.stage.render(0);
});
await shot('12_closeup');

// 4. night, zoomed out — the sea, sky and stars must all be visible
await p.evaluate(() => {
  const s = window.__lab;
  s.world.day = 0.94;
  for (let i = 0; i < 90; i++) s.step(1 / 30);
  s.stage.camera.position.set(0.0, 20.0, 23.0);
  s.stage.camera.lookAt(0, 0.5, 0);
  s.stage.render(0);
});
await shot('13_night_zoomout');

await b.close();
process.stdout.write(`  console errors: ${errs.length}\n`);
for (const e of errs.slice(0, 5)) process.stdout.write('   ' + e.slice(0, 240) + '\n');
