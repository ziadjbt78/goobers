/**
 * Visual verification of the world. Five scenes, each driven through the real
 * Sim API so a shot cannot show something the player cannot reach.
 *   node tools/worldShot.mjs http://127.0.0.1:8137/ verify/world
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const BASE = process.argv[2] ?? 'http://127.0.0.1:8137/';
const OUT = process.argv[3] ?? 'verify/world';
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--use-gl=angle', '--disable-dev-shm-usage', '--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
const errs = [];
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
p.on('pageerror', (e) => errs.push(String(e)));
mkdirSync(OUT, { recursive: true });

async function load() {
  await p.goto(BASE, { waitUntil: 'load', timeout: 180000 });
  await p.waitForFunction('window.__READY === true && !!window.__lab', null, { timeout: 180000 });
  await p.evaluate(() => { document.querySelectorAll('.sh-menu,.w-tools,.w-head,.w-hint,.w-species').forEach((e) => { e.style.display = 'none'; }); });
  await p.waitForTimeout(400);
}
const shot = async (name) => {
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${OUT}/${name}.png` });
  process.stdout.write(`  ${OUT}/${name}.png\n`);
};
const evalSim = (fn, arg) => p.evaluate(fn, arg);

await load();
await shot('01_overview');

// mid-stride: put everyone in motion and photograph the nearest walker
await evalSim(() => {
  const s = window.__lab;
  for (const a of s.agents) a.goTo({ x: a.pos.x + Math.sin(a.heading) * 6, y: 0, z: a.pos.z + Math.cos(a.heading) * 6 }, 1);
  for (let i = 0; i < 48; i++) s.step(1 / 30);
  const a = s.agents[0];
  s.stage.camera.position.set(a.pos.x + 1.5, a.pos.y + 1.05, a.pos.z + 2.1);
  s.stage.controls.target.set(a.pos.x, a.pos.y + 0.45, a.pos.z);
});
await shot('02_midstride');

// petting: the real pet call, plus the emote it emits. Frame from IN FRONT of
// the creature (along its heading) so its face and the heart are unobstructed.
await evalSim(() => {
  const s = window.__lab;
  const a = s.agents[0];
  a.place(1.2, 1.6, -Math.PI * 0.15);
  const fx = Math.sin(a.heading), fz = Math.cos(a.heading);
  s.stage.camera.position.set(a.pos.x + fx * 2.95, a.pos.y + 1.15, a.pos.z + fz * 2.95);
  s.stage.controls.target.set(a.pos.x, a.pos.y + 0.42, a.pos.z);
  s.pet(a);
  for (let i = 0; i < 55; i++) s.step(1 / 30);
});
await shot('03_petted');

// play-chase: force two brains to chase so the shot is deterministic
await evalSim(() => {
  const s = window.__lab;
  const [a, c] = [s.agents[0], s.agents[1]];
  c.place(a.pos.x + 1.4, a.pos.z + 0.4, a.heading + Math.PI);
  const ba = s.brains.get(a.id);
  const bc = s.brains.get(c.id);
  if (ba) { ba.action = 'playChase'; ba.partnerId = c.id; ba.actionAge = 0; }
  if (bc) { bc.action = 'playChase'; bc.partnerId = a.id; bc.actionAge = 0; }
  for (let i = 0; i < 90; i++) s.step(1 / 30);
  s.stage.camera.position.set(a.pos.x + 2.6, 2.1, a.pos.z + 3.4);
  s.stage.controls.target.set((a.pos.x + c.pos.x) / 2, 0.5, (a.pos.z + c.pos.z) / 2);
});
await shot('04_playchase');

// ball push
await evalSim(() => {
  const s = window.__lab;
  const ball = s.world.props.ball;
  const a = s.agents[2];
  a.place(ball.pos.x - 0.9, ball.pos.z + 0.2);
  const b = s.brains.get(a.id);
  if (b) { b.action = 'pushBall'; b.actionAge = 0; }
  for (let i = 0; i < 60; i++) s.step(1 / 30);
  s.stage.camera.position.set(ball.pos.x + 2.4, 1.4, ball.pos.z + 2.8);
  s.stage.controls.target.set(ball.pos.x, 0.45, ball.pos.z);
});
await shot('05_ball');

// night: gather, sleep, dim lights
await evalSim(() => {
  const s = window.__lab;
  s.world.day = 0.92;
  for (const a of s.agents) {
    const b = s.brains.get(a.id);
    if (b) { b.action = 'nap'; b.actionAge = 0.5; b.needs.energy = 0.2; }
    a.goTo({ x: (Math.random() - 0.5) * 2.4, y: 0, z: (Math.random() - 0.5) * 2.4 }, 0.4);
  }
  for (let i = 0; i < 120; i++) s.step(1 / 30);
  s.stage.camera.position.set(3.6, 4.6, 6.2);
  s.stage.controls.target.set(0, 0.5, 0);
});
await shot('06_night');

await b.close();
process.stdout.write(`  console errors: ${errs.length}\n`);
for (const e of errs.slice(0, 6)) process.stdout.write('   ' + e.slice(0, 300) + '\n');
