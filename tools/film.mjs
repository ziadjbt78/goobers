/**
 * film.mjs — the mandatory motion + tool verification.
 *
 * The sandbox has no GPU, so nothing can be judged by watching it run in real
 * time. This tool sidesteps that: it drives the REAL simulation at an exact
 * fixed 1/30 s per frame, renders EVERY frame regardless of how long that
 * takes, and writes frame sequences the montage step turns into filmstrips.
 *
 *   node tools/film.mjs http://127.0.0.1:8137/ verify/motion
 */
import { chromium } from 'playwright';
import { mkdirSync, rmSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:8137/';
const OUT = process.argv[3] ?? 'verify/motion';
const ONLY = process.env.FILM_SPECIES ?? '';
const METRICS_ONLY = process.env.FILM_METRICS === '1';
const TOOLS_ONLY = process.env.FILM_TOOLS === '1';

const DT = 1 / 30;
const W = 440;
const H = 290;

const b = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--use-gl=angle', '--disable-dev-shm-usage', '--no-sandbox'],
});
const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const errs = [];
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
p.on('pageerror', (e) => errs.push(String(e)));

if (!METRICS_ONLY) rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

await p.goto(BASE, { waitUntil: 'load', timeout: 180000 });
await p.waitForFunction('window.__READY === true && !!window.__lab', null, { timeout: 180000 });
await p.evaluate(() => {
  document.querySelectorAll('.sh-menu,.w-tools,.w-head,.w-hint,.w-species,.w-card,.w-simlog,.w-tags').forEach((e) => { e.style.display = 'none'; });
  window.__lab.stage.controls.enabled = false;
});

// ---------------------------------------------------------------------------
// 1. THE IDENTITY PROOF — one template, two animators, same base layer
// ---------------------------------------------------------------------------
const identity = await p.evaluate(() => window.__lab.poseIdentity(180, 1 / 60));
const identityPass = identity.maxQuat < 1e-6 && identity.maxPos < 1e-5;
console.log('\n== ANIMATOR IDENTITY (Heroes idle vs World idle) ==');
console.log(`  bones compared : ${identity.bones}`);
console.log(`  max quat delta : ${identity.maxQuat.toExponential(2)}`);
console.log(`  max pos delta  : ${identity.maxPos.toExponential(2)} m`);
console.log(`  verdict        : ${identityPass ? 'PASS - one shared animator' : 'FAIL - the paths differ'}`);

// ---------------------------------------------------------------------------
// 2. AUTOMATED MOTION GATES (warnings; reported, not blocking)
// ---------------------------------------------------------------------------
await p.evaluate(() => window.__lab.pause());
const gates = await p.evaluate((dt) => {
  const s = window.__lab;
  const cmp = s.constructor.compare;
  const worst = {
    maxFootSlip: 0, maxJointRate: 0, maxHeadingRate: 0, maxDriftDeg: 0,
    counts: { footSlip: 0, jointRate: 0, heading: 0, drift: 0 }, samples: 0, spikes: [],
  };
  let prev = s.probe();
  for (let i = 0; i < 1200; i++) {
    s.step(dt);
    const cur = s.probe();
    const v = cmp(prev, cur, dt);
    for (const k of ['maxFootSlip', 'maxJointRate', 'maxHeadingRate', 'maxDriftDeg']) {
      if (v[k] > worst[k]) worst[k] = v[k];
    }
    for (const k of ['footSlip', 'jointRate', 'heading', 'drift']) worst.counts[k] += v.counts[k];
    worst.samples += v.samples;
    if (v.counts.jointRate || v.counts.heading) {
      for (let ai = 0; ai < cur.agents.length; ai++) {
        const a = prev.agents[ai], bb = cur.agents[ai];
        if (!a || bb.id !== a.id) continue;
        let dh = bb.heading - a.heading;
        while (dh > Math.PI) dh -= Math.PI * 2;
        while (dh < -Math.PI) dh += Math.PI * 2;
        const hr = Math.abs(dh) / dt;
        if (hr > 2.61) worst.spikes.push({ what: 'heading', val: +hr.toFixed(1), name: bb.name, bone: '-' });
        let best = 0, bn = '-';
        for (let k = 0; k < Math.min(a.bones.length, bb.bones.length); k++) {
          const qa = a.bones[k].q, qb = bb.bones[k].q;
          const dot = Math.abs(qa[0] * qb[0] + qa[1] * qb[1] + qa[2] * qb[2] + qa[3] * qb[3]);
          const ang = 2 * Math.acos(Math.min(1, dot));
          if (ang > best) { best = ang; bn = bb.bones[k].name; }
        }
        if (best / dt > 20) worst.spikes.push({ what: 'joint', val: +(best / dt).toFixed(1), name: bb.name, bone: bn });
      }
      if (worst.spikes.length > 10) worst.spikes.length = 10;
    }
    prev = cur;
  }
  return worst;
}, DT);

const g = [
  ['planted foot slip', `${(gates.maxFootSlip * 100).toFixed(3)} cm`, '<= 0.50 cm', gates.maxFootSlip <= 0.005],
  ['joint angular rate', `${gates.maxJointRate.toFixed(2)} rad/s`, '<= 20 rad/s', gates.maxJointRate <= 20],
  ['heading rate', `${gates.maxHeadingRate.toFixed(2)} rad/s`, '<= 2.61 rad/s', gates.maxHeadingRate <= 2.61],
  ['sideways drift', `${gates.maxDriftDeg.toFixed(2)} deg`, '<= 10 deg', gates.maxDriftDeg <= 10],
];
console.log('\n== MOTION GATES (1200 free-running steps @ 1/30, all creatures) ==');
console.log(`  samples compared: ${gates.samples}`);
for (const [name, val, lim, ok] of g) console.log(`  ${ok ? 'PASS' : 'WARN'}  ${name.padEnd(20)} ${val.padEnd(14)} ${lim}`);
console.log(`  frames over the line: slip ${gates.counts.footSlip} | joint ${gates.counts.jointRate} | heading ${gates.counts.heading} | drift ${gates.counts.drift}`);
for (const s of gates.spikes.slice(0, 6)) console.log(`    t ${s.what} ${String(s.val).padStart(6)} ${s.name} bone=${s.bone}`);

// ---------------------------------------------------------------------------
// 3. SPECIES FILMSTRIPS
// ---------------------------------------------------------------------------
const SPECIES = ['PIP', 'MOCHI', 'BOP', 'ZIK'];
const STRIPS = [
  { id: 'walk', frames: 10, setup: 'walk', every: 3 },
  { id: 'run', frames: 10, setup: 'run', every: 3 },
  { id: 'turn', frames: 12, setup: 'turn', every: 2 },
  { id: 'start', frames: 8, setup: 'start', every: 2 },
  { id: 'stop', frames: 8, setup: 'stop', every: 2 },
  { id: 'slope', frames: 8, setup: 'slope', every: 2 },
];
const CAM = { dist: 2.55, right: 0.95, up: 1.30, aim: 0.44 };

const written = [];
if (!METRICS_ONLY && !TOOLS_ONLY) {
  for (const sp of SPECIES) {
    if (ONLY && sp !== ONLY) continue;
    for (const strip of STRIPS) {
      const dir = `${OUT}/${sp.toLowerCase()}/${strip.id}`;
      mkdirSync(dir, { recursive: true });
      const info = await p.evaluate(({ sp, setup, dt }) => {
        const s = window.__lab;
        s.quiet();
        const a = s.agents.find((x) => x.template.name.toUpperCase().startsWith(sp));
        if (!a) return null;
        for (const other of s.agents) if (other !== a) other.handle.group.visible = false;
        a.handle.group.visible = true;
        const F = (n) => ({ x: a.pos.x + Math.sin(a.heading) * n, y: 0, z: a.pos.z + Math.cos(a.heading) * n });
        if (setup === 'walk') { a.place(2.0, 4.0, Math.PI * 0.5); a.goTo(F(9), 0.45); }
        else if (setup === 'run') { a.place(2.0, 5.0, Math.PI * 0.5); a.goTo(F(9), 1.0); }
        else if (setup === 'turn') { a.place(0.0, 3.0, 0); a.goTo({ x: a.pos.x + 5, y: 0, z: a.pos.z }, 0.75); }
        else if (setup === 'start') { a.place(1.0, 4.0, Math.PI * 0.5); a.stop(); }
        else if (setup === 'stop') { a.place(1.0, 4.0, Math.PI * 0.5); a.goTo(F(9), 1.0); }
        else { a.place(6.6, 5.6, Math.PI); a.goTo({ x: 5.2, y: 0, z: 4.4 }, 0.6); }
        const settle = setup === 'stop' ? 66 : 150;
        for (let i = 0; i < settle; i++) s.step(dt);
        return { top: +a.topSpeed.toFixed(2) };
      }, { sp, setup: strip.setup, dt: DT });
      if (!info) continue;
      for (let f = 0; f < strip.frames; f++) {
        await p.evaluate(({ sp, setup, dt, f, every, cam }) => {
          const s = window.__lab;
          const a = s.agents.find((x) => x.template.name.toUpperCase().startsWith(sp));
          if (!a) return;
          if (setup === 'start' && f === 0) a.goTo({ x: a.pos.x + Math.sin(a.heading) * 9, y: 0, z: a.pos.z + Math.cos(a.heading) * 9 }, 0.85);
          if (setup === 'stop' && f === 2) a.stop();
          for (let i = 0; i < every; i++) s.step(dt);
          s.stage.update(0);
          const fx = Math.sin(a.heading), fz = Math.cos(a.heading);
          const rx = Math.cos(a.heading), rz = -Math.sin(a.heading);
          s.stage.camera.position.set(a.pos.x - fx * cam.dist + rx * cam.right, a.pos.y + cam.up, a.pos.z - fz * cam.dist + rz * cam.right);
          s.stage.camera.lookAt(a.pos.x, a.pos.y + cam.aim, a.pos.z);
          s.stage.render(0);
        }, { sp, setup: strip.setup, dt: DT, f, every: strip.every, cam: CAM });
        const file = `${dir}/f${String(f).padStart(2, '0')}.png`;
        await p.screenshot({ path: file });
        written.push(file);
      }
      process.stdout.write(`  ${sp} ${strip.id.padEnd(6)} ${strip.frames} frames (1/${strip.every} steps)\n`);
    }
  }
}

// ---------------------------------------------------------------------------
// 4. TOOL FILMSTRIPS — one per tool. Each frame IS a real tool invocation.
// ---------------------------------------------------------------------------
const TOOLS = [
  { id: 'call', frames: 14, every: 6 },
  { id: 'feed', frames: 18, every: 8 },
  { id: 'pet', frames: 12, every: 6 },
  { id: 'petroll', frames: 14, every: 8 },
  { id: 'carry', frames: 16, every: 6 },
  { id: 'ball', frames: 12, every: 6 },
  { id: 'spawn', frames: 18, every: 6 },
  { id: 'inspect', frames: 12, every: 8 },
];

if (!METRICS_ONLY && (!ONLY || ONLY === 'TOOLS')) {
  for (const tool of TOOLS) {
    const dir = `${OUT}/tools/${tool.id}`;
    mkdirSync(dir, { recursive: true });
    await p.evaluate(({ id, dt }) => {
      const s = window.__lab;
      s.loud();
      s.stage.controls.enabled = false;
      for (const a of s.agents) a.handle.group.visible = true;
      // reset everyone to a clean state near the middle of the meadow
      const rings = [[1.4, 3.0], [3.0, 3.4], [-1.2, 3.6], [0.4, 5.0], [-2.6, 4.2], [2.2, 5.4], [4.6, 4.0], [-4.0, 5.2]];
      s.agents.forEach((a, i) => {
        const r = rings[i % rings.length];
        a.place(r[0], r[1], Math.atan2(r[0], r[1]) + Math.PI);
        a.stop();
        a.begin('none');
        a.mood = 'neutral';
        a.hero.petted = false;
        a.hero.held = false;
      });
      // settle, then run the tool
      for (let i = 0; i < 40; i++) s.step(dt);
      // AIM THE CALL AND THE FEED FAR FROM THE CREATURES: if the target is at
      // their feet the reaction is over before frame 2 and the strip looks
      // static. The whole point is to film the sprint.
      const P = (x, z) => ({ x, y: 0, z });
      const FAR = P(-5.2, -6.4);
      if (id === 'call') s.call(FAR);
      else if (id === 'feed') s.dropBerry(FAR);
      else if (id === 'pet') { s.pet(s.agents[0]); s.aimPet(P(s.agents[0].pos.x + 0.9, s.agents[0].pos.z - 0.7)); }
      else if (id === 'petroll') { s.pet(s.agents[0]); s.aimPet(P(s.agents[0].pos.x, s.agents[0].pos.z + 1)); for (let i = 0; i < 130; i++) s.step(dt); }
      else if (id === 'carry') { const v = s.world.props.ball.vel.clone(); v.set(1.6, 0, 1.2); s.setCarryVelocity(v); s.pickUp(s.agents[0]); }
      else if (id === 'ball') s.throwBall(P(2.0, 1.0));
      else if (id === 'spawn') s.spawn('PIP', P(0.2, 3.2));
      else if (id === 'inspect') s.inspect(s.agents[0]);
    }, { id: tool.id, dt: DT });

    for (let f = 0; f < tool.frames; f++) {
      await p.evaluate(({ id, dt, f, every }) => {
        const s = window.__lab;
        if (id === 'carry' && f === 4) s.drop();
        for (let i = 0; i < every; i++) s.step(dt);
        s.stage.update(0);
        // frame the action on the creature that IS acting
        let sub = s.agents[0].pos;
        if (id === 'ball') sub = s.world.props.ball.pos;
        if (id === 'feed') sub = s.agents[0].pos;
        if (id === 'petroll' || id === 'pet') sub = s.petting ? s.petting.pos : s.agents[0].pos;
        if (id === 'carry') sub = s.carried ? s.carried.pos : s.agents[0].pos;
        if (id === 'spawn') sub = s.agents[s.agents.length - 1].pos;
        if (id === 'inspect') sub = s.follow ? s.follow.pos : s.agents[0].pos;
        const sp = sub;
        if (id === 'ball') {
          s.stage.camera.position.set(sp.x + 3.2, sp.y + 2.4, sp.z + 4.0);
          s.stage.camera.lookAt(sp.x, sp.y, sp.z);
        } else {
          s.stage.camera.position.set(sp.x + 2.9, sp.y + 1.5, sp.z + 3.4);
          s.stage.camera.lookAt(sp.x, sp.y + 0.45, sp.z);
        }
        s.stage.render(0);
        void f;
      }, { id: tool.id, dt: DT, f, every: tool.every });
      const file = `${dir}/f${String(f).padStart(2, '0')}.png`;
      await p.screenshot({ path: file });
      written.push(file);
    }
    process.stdout.write(`  TOOL ${tool.id.padEnd(8)} ${tool.frames} frames\n`);
  }
}

await b.close();

console.log(`\n  frames written : ${written.length}`);
console.log(`  console errors : ${errs.length}`);
for (const e of errs.slice(0, 6)) console.log('   ' + e.slice(0, 260));

const ok = identityPass && errs.length === 0;
console.log(ok
  ? '\n  MOTION + TOOL FILM COMPLETE (joint-rate is a warning, see the gate table)\n'
  : '\n  FILM RUN FAILED\n');
process.exit(ok ? 0 : 1);
