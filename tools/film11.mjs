/**
 * film11.mjs — v10 verification film. Day clock frozen at noon for everything.
 *
 *   node tools/film11.mjs http://127.0.0.1:8137/ verify/v11 http://127.0.0.1:8137/heroes.html
 */
import { chromium } from 'playwright';
import { mkdirSync, rmSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:8137/';
const OUT = process.argv[3] ?? 'verify/v11';
const HEROES = process.argv[4] ?? 'http://127.0.0.1:8137/heroes.html';
const ONLY = process.env.FILM_SPECIES ?? '';

const DT = 1 / 30;
const W = 460, H = 300;
const NOON = 0.5;
const LEGGED = ['PIP', 'MOCHI', 'ZIK'];

const b = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--use-gl=angle', '--disable-dev-shm-usage', '--no-sandbox'],
});
const errs = [];
const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
p.on('pageerror', (e) => errs.push(String(e)));

if (!ONLY) rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

await p.goto(BASE, { waitUntil: 'load', timeout: 180000 });
await p.waitForFunction('window.__READY === true && !!window.__lab', null, { timeout: 180000 });
await p.evaluate((noon) => {
  document.querySelectorAll('.sh-menu,.w-tools,.w-head,.w-hint,.w-species,.w-card,.w-simlog,.w-tags,.gs-build-badge').forEach((e) => { e.style.display = 'none'; });
  const s = window.__lab;
  s.stage.controls.enabled = false;
  s.setDay(noon);
  // a foot-dot overlay: the dots must sit STILL while a foot is planted
  const c = document.createElement('canvas');
  c.id = '__dots';
  c.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9';
  document.body.appendChild(c);
}, NOON);

const errsNow = () => errs.length;
console.log('BADGE:', await p.evaluate(() => document.querySelector('.gs-build-badge')?.textContent ?? 'NO BADGE'));
mkdirSync(OUT, { recursive: true });
await p.screenshot({ path: `${OUT}/badge.png` });

// ---------------------------------------------------------------------------
// 1. NUMERIC PROBES
// ---------------------------------------------------------------------------
const identity = await p.evaluate(() => window.__lab.poseIdentity(180, 1 / 60));
const identityPass = identity.maxQuat < 1e-6 && identity.maxPos < 1e-5;
console.log('\n== PEDESTAL REGRESSION (identity proof) ==');
console.log(`  bones ${identity.bones} | max quat delta ${identity.maxQuat.toExponential(2)} | max pos delta ${identity.maxPos.toExponential(2)} m | ${identityPass ? 'PASS - pedestal unchanged' : 'FAIL'}`);

await p.evaluate(() => window.__lab.pause());
const stride = await p.evaluate(() => window.__lab.strideProbe());
const hop = await p.evaluate(() => window.__lab.hopProbe(12, 1 / 60));
const joint = await p.evaluate(() => window.__lab.jointProbe(20, 1 / 60));
console.log('\n== JOINT RATE PROBE (shipped build, 20 s free-running) ==');
for (const sp of ['PIP', 'MOCHI', 'BOP', 'ZIK']) {
  const j = joint[sp];
  if (!j) continue;
  console.log(`  ${sp.padEnd(6)} ${j.rate.toFixed(2)} rad/s on ${j.bone.padEnd(16)} across ${j.frameType}${j.wasForced ? ' [FORCED]' : ''}`);
}
const ramp = await p.evaluate(() => window.__lab.freqRampProbe('PIP'));
console.log('\n== CADENCE RAMP walk -> run -> walk (PIP) ==');
for (const r of ramp) console.log(`  t ${String(r.t).padStart(4)} s  speed ${r.speed.toFixed(3)} u/s  stride ${r.stride.toFixed(4)}  freq ${r.freq.toFixed(3)} Hz`);
for (const sp of ['MOCHI', 'ZIK']) {
  const rr = await p.evaluate((x) => window.__lab.freqRampProbe(x), sp);
  const f = rr.map((x) => x.freq);
  console.log(`  ${sp} ramp freq min ${Math.min(...f).toFixed(2)} max ${Math.max(...f).toFixed(2)} Hz, monotonic up ${f.slice(0, 8).every((v, i, arr) => i === 0 || v >= arr[i - 1] - 0.05)}`);
}

console.log('\n== LEG REACH + STRIDE CALIBRATION ==');
for (const [k, v] of Object.entries(stride)) {
  console.log(`  ${k.padEnd(6)} legReach ${v.legReach.toFixed(4)}  range ${v.range.toFixed(4)}  stanceFrac ${v.stanceFrac.toFixed(3)}  stanceDisp ${v.stanceDisp.toFixed(4)}  -> stride ${v.stride.toFixed(4)}`);
}
console.log('  BOP hop:', JSON.stringify(hop));

const signs = await p.evaluate(() => window.__lab.signProbe());
console.log('\n== AXES SIGN PROBE (0.02 m + opposite-sign rule) ==');
for (const sp of ['PIP', 'MOCHI', 'BOP', 'ZIK']) {
  const v = signs[sp];
  if (!v) continue;
  const f = (x) => (x === null ? 'UNVERIFIED' : x > 0 ? '+1' : '-1');
  console.log(`  ${sp.padEnd(6)} pitch ${f(v.pitch).padEnd(10)} roll ${f(v.roll).padEnd(10)} limb ${f(v.limb).padEnd(10)} wave ${f(v.wave)}`);
  for (const [k, e] of Object.entries(v.evidence)) console.log(`      ${k.padEnd(6)} ${e}`);
}

const slip = await p.evaluate(() => window.__lab.slipProbe(8));
console.log('\n== STRAIGHT-LINE SLIP + CADENCE (one creature, 8 s, no turning) ==');
const cfgOf = await p.evaluate(() => {
  const o = {};
  for (const a of window.__lab.agents) {
    const sp = a.template.name.split(' ')[0];
    if (o[sp]) continue;
    const c = a.motion.loco.cfg;
    o[sp] = { walkSpeed: c.walkSpeed, runSpeed: c.runSpeed, stride: c.stride, turnRate: c.turnRate, height: a.template.height };
  }
  return o;
});
for (const sp of ['PIP', 'MOCHI', 'BOP', 'ZIK']) {
  const v = slip[sp], c = cfgOf[sp];
  if (!v || !c) continue;
  console.log(`  ${sp.padEnd(6)} slip ${(v.slip * 100).toFixed(3)} cm | overstretch ${v.overstretch}/${v.frames} | avg speed ${v.speed} u/s | measured freq ${v.freq} Hz | cfg walk ${c.walkSpeed.toFixed(3)} run ${c.runSpeed.toFixed(3)} stride ${c.stride.toFixed(4)} (${(c.walkSpeed / c.stride).toFixed(2)} Hz walk / ${(c.runSpeed / (c.stride * 1.4)).toFixed(2)} Hz run)`);
}

// ---------------------------------------------------------------------------
// 2. FREE-RUNNING GATES
// ---------------------------------------------------------------------------
const runGates = () => p.evaluate((dt) => {
  const s = window.__lab;
  const cmp = s.constructor.compare;
  const worst = {
    maxFootSlip: 0, maxJointRate: 0, maxHeadingRate: 0, maxDriftDeg: 0,
    counts: { footSlip: 0, jointRate: 0, heading: 0, drift: 0 }, samples: 0,
    slipByName: {}, jointByName: {}, jointBoneByName: {}, headByName: {}, over: 0,
  };
  let prev = s.probe();
  for (let i = 0; i < 1200; i++) {
    s.step(dt);
    const cur = s.probe();
    const v = cmp(prev, cur, dt);
    for (const k of ['maxFootSlip', 'maxJointRate', 'maxHeadingRate', 'maxDriftDeg']) if (v[k] > worst[k]) worst[k] = v[k];
    for (const k of ['footSlip', 'jointRate', 'heading', 'drift']) worst.counts[k] += v.counts[k];
    for (const k of ['slipByName', 'jointByName', 'headByName']) for (const [n, x] of Object.entries(v[k])) if (x > (worst[k][n] ?? 0)) worst[k][n] = x;
    for (const [n, x] of Object.entries(v.jointBoneByName)) if ((v.jointByName[n] ?? 0) >= (worst.jointByName[n] ?? 0)) worst.jointBoneByName[n] = x;
    for (let ai = 0; ai < cur.agents.length; ai++) {
      const a0 = prev.agents[ai], c0 = cur.agents[ai];
      if (a0 && c0 && c0.id === a0.id) worst.over += Math.max(0, c0.over - a0.over);
    }
    worst.samples += v.samples;
    prev = cur;
  }
  return worst;
}, DT);
const gates = await runGates();
console.log('\n== GATES (1200 steps @ 1/30, all creatures free-running) ==');
console.log(`  target: slip <= 1.00 cm | joint <= 20 rad/s (WARN) | heading per species | overstretch 0`);
console.log(`  max planted foot slip  ${(gates.maxFootSlip * 100).toFixed(3)} cm`);
console.log(`  max joint angular rate ${gates.maxJointRate.toFixed(2)} rad/s`);
console.log(`  max heading rate       ${gates.maxHeadingRate.toFixed(2)} rad/s`);
console.log(`  max sideways drift     ${gates.maxDriftDeg.toFixed(2)} deg`);
console.log(`  overstretch frames     ${gates.over}`);
console.log(`  frames over the line: slip ${gates.counts.footSlip} | joint ${gates.counts.jointRate} | heading ${gates.counts.heading} | drift ${gates.counts.drift}`);
for (const sp of ['PIP', 'MOCHI', 'BOP', 'ZIK']) {
  console.log(`  ${sp.padEnd(6)} slip ${((gates.slipByName[sp] ?? 0) * 100).toFixed(3)} cm | joint ${(gates.jointByName[sp] ?? 0).toFixed(2)} rad/s on ${(gates.jointBoneByName[sp] ?? '-').padEnd(14)} | heading ${(gates.headByName[sp] ?? 0).toFixed(2)} rad/s (cap ${((cfgOf[sp]?.turnRate ?? 0) * 1.05).toFixed(2)})`);
}

// ---------------------------------------------------------------------------
// 3. FOOT-DOT CAMERA HELPER
// ---------------------------------------------------------------------------
const drawDots = () => p.evaluate(() => {
  const s = window.__lab;
  const c = document.getElementById('__dots');
  const r = s.stage.renderer.domElement;
  c.width = r.clientWidth; c.height = r.clientHeight;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  for (const a of s.agents) {
    if (!a.handle.group.visible) continue;
    for (const f of a.feet) {
      const v = f.pos.clone().project(s.stage.camera);
      if (v.z > 1) continue;
      const x = (v.x * 0.5 + 0.5) * c.width, y = (-v.y * 0.5 + 0.5) * c.height;
      ctx.beginPath(); ctx.arc(x, y, 5.5, 0, 7);
      ctx.fillStyle = f.swinging ? '#ffd23f' : '#ff3b6b';
      ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#101418'; ctx.stroke();
    }
  }
});

// ---------------------------------------------------------------------------
// 4. SIDE-BY-SIDE : Heroes gait 0.6 (left) | World walk (right)
// ---------------------------------------------------------------------------
const SBS = `${OUT}/sbs`;
mkdirSync(SBS, { recursive: true });
if (!ONLY || ONLY === 'SBS') {
  const ph = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  ph.on('pageerror', (e) => errs.push('heroes: ' + String(e)));
  for (const sp of ['pip', 'mochi', 'bop', 'zik']) {
    await ph.goto(`${HEROES}?freeze=1&t=1.4&gait=0.6&view=${sp}&cam=side`, { waitUntil: 'load', timeout: 180000 });
    await ph.waitForFunction('window.__READY === true', null, { timeout: 180000 });
    await ph.evaluate(() => document.querySelectorAll('.hp-title,.hp-status,.hp-fps,.hp-bar,.gs-build-badge').forEach((e) => { e.style.display = 'none'; }));
    await ph.screenshot({ path: `${SBS}/${sp}_heroes.png` });
  }
  await ph.close();

  for (const sp of ['PIP', 'MOCHI', 'BOP', 'ZIK']) {
    for (let f = 0; f < 12; f++) {
      await p.evaluate(({ sp, f, dt }) => {
        const s = window.__lab;
        s.quiet(); s.testPose = 0;
        const a = s.agents.find((x) => x.template.name.toUpperCase().startsWith(sp));
        if (!a) return;
        for (const o of s.agents) o.handle.group.visible = (o === a);
        if (f === 0) { a.place(0, -6.0, 0); a.goTo({ x: 0, y: 0, z: 40 }, 0.7); for (let i = 0; i < 150; i++) s.step(dt); }
        for (let i = 0; i < 2; i++) s.step(dt);
        s.stage.update(0);
        const hgt = a.template.height;
        s.stage.camera.position.set(a.pos.x + 2.30, a.pos.y + hgt * 0.50, a.pos.z + 0.18);
        s.stage.camera.lookAt(a.pos.x, a.pos.y + hgt * 0.46, a.pos.z);
        s.stage.render(0);
      }, { sp, f, dt: DT });
      await p.screenshot({ path: `${SBS}/${sp.toLowerCase()}_world_${String(f).padStart(2, '0')}.png` });
    }
    console.log(`  SBS ${sp}`);
  }
}

// ---------------------------------------------------------------------------
// 5. TURN-IN-PLACE 90 deg  +  WALK -> STOP, with foot world-position dots
// ---------------------------------------------------------------------------
if (!ONLY || ONLY === 'TURNSTOP') {
  for (const sp of LEGGED) {
    for (const mode of ['turn', 'stop']) {
      const dir = `${OUT}/${mode}`;
      mkdirSync(dir, { recursive: true });
      for (let f = 0; f < 14; f++) {
        await p.evaluate(({ sp, mode, f, dt }) => {
          const s = window.__lab;
          s.quiet(); s.testPose = 0;
          const a = s.agents.find((x) => x.template.name.toUpperCase().startsWith(sp));
          if (!a) return;
          for (const o of s.agents) o.handle.group.visible = (o === a);
          if (f === 0) {
            a.place(0, -6, 0);
            if (mode === 'turn') {
              // walk a moment, then ask it to face 90 degrees to its left
              a.goTo({ x: 0, y: 0, z: 40 }, 0.7);
              for (let i = 0; i < 120; i++) s.step(dt);
              a.stop();
              a.faceTarget = { x: -40, z: -6 };
            } else {
              a.goTo({ x: 0, y: 0, z: 40 }, 0.85);
              for (let i = 0; i < 170; i++) s.step(dt);
            }
          }
          if (mode === 'stop' && f === 2) a.stop();
          for (let i = 0; i < 4; i++) s.step(dt);
          s.stage.update(0);
          const hgt = a.template.height;
          s.stage.camera.position.set(a.pos.x + 2.10, a.pos.y + hgt * 0.62, a.pos.z + 2.10);
          s.stage.camera.lookAt(a.pos.x, a.pos.y + 0.30, a.pos.z);
          s.stage.render(0);
        }, { sp, mode, f, dt: DT });
        await drawDots();
        await p.screenshot({ path: `${dir}/${sp}_${String(f).padStart(2, '0')}.png` });
      }
      console.log(`  ${mode.toUpperCase()} ${sp} 14 frames`);
    }
  }
}

// ---------------------------------------------------------------------------
// 5b. RUN SHEET: walk -> run -> walk with foot dots
// ---------------------------------------------------------------------------
if (!ONLY || ONLY === 'RUN') {
  for (const sp of LEGGED) {
    const dir = `${OUT}/run`;
    mkdirSync(dir, { recursive: true });
    for (let f = 0; f < 16; f++) {
      await p.evaluate(({ sp, f, dt }) => {
        const s = window.__lab;
        s.quiet(); s.testPose = 0;
        const a = s.agents.find((x) => x.template.name.toUpperCase().startsWith(sp));
        if (!a) return;
        for (const o of s.agents) o.handle.group.visible = (o === a);
        if (f === 0) { a.place(0, -6, 0); a.goTo({ x: 0, y: 0, z: 60 }, 0.42); for (let i = 0; i < 120; i++) s.step(dt); }
        if (f === 3) a.goTo({ x: 0, y: 0, z: 60 }, 1.0);   // walk -> run
        if (f === 8) a.goTo({ x: 0, y: 0, z: 60 }, 0.42);   // run -> walk
        for (let i = 0; i < 5; i++) s.step(dt);
        s.stage.update(0);
        const hgt = a.template.height;
        s.stage.camera.position.set(a.pos.x + 2.10, a.pos.y + hgt * 0.62, a.pos.z + 2.10);
        s.stage.camera.lookAt(a.pos.x, a.pos.y + 0.30, a.pos.z);
        s.stage.render(0);
      }, { sp, f, dt: DT });
      await drawDots();
      await p.screenshot({ path: `${dir}/${sp}_${String(f).padStart(2, '0')}.png` });
    }
    console.log(`  RUN ${sp} 16 frames`);
  }
}

// ---------------------------------------------------------------------------
// 6. TOOLS — noon, close camera, 6 s each
// ---------------------------------------------------------------------------
const TOOLS = [
  { id: 'call', frames: 24, every: 8 },
  { id: 'feed', frames: 24, every: 8 },
  { id: 'pet', frames: 22, every: 8 },
  { id: 'petroll', frames: 24, every: 8 },
  { id: 'carry', frames: 22, every: 8 },
  { id: 'ball', frames: 22, every: 8 },
  { id: 'spawn', frames: 24, every: 8 },
  { id: 'inspect', frames: 22, every: 8 },
];
const TDIR = `${OUT}/tools`;
mkdirSync(TDIR, { recursive: true });
if (!ONLY || ONLY === 'TOOLS') {
  for (const tool of TOOLS) {
    await p.evaluate(({ id, dt }) => {
      const s = window.__lab;
      s.loud(); s.testPose = 0;
      for (const a of s.agents) a.handle.group.visible = true;
      const rings = [[1.4, 3.0], [3.0, 3.4], [-1.2, 3.6], [0.4, 5.0], [-2.6, 4.2], [2.2, 5.4], [4.6, 4.0], [-4.0, 5.2]];
      s.agents.forEach((a, i) => {
        const r = rings[i % rings.length];
        a.place(r[0], r[1], Math.atan2(r[0], r[1]) + Math.PI);
        a.stop(); a.begin('none'); a.mood = 'neutral'; a.debugPose = 0;
      });
      for (let i = 0; i < 40; i++) s.step(dt);
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
        let sub = s.agents[0].pos;
        if (id === 'ball') sub = s.world.props.ball.pos;
        if (id === 'petroll' || id === 'pet') sub = s.petting ? s.petting.pos : s.agents[0].pos;
        if (id === 'carry') sub = s.carried ? s.carried.pos : s.agents[0].pos;
        if (id === 'spawn') sub = s.agents[s.agents.length - 1].pos;
        if (id === 'inspect') sub = s.follow ? s.follow.pos : s.agents[0].pos;
        s.stage.camera.position.set(sub.x + 1.95, sub.y + 1.20, sub.z + 2.25);
        s.stage.camera.lookAt(sub.x, sub.y + 0.42, sub.z);
        s.stage.render(0);
      }, { id: tool.id, dt: DT, f, every: tool.every });
      await p.screenshot({ path: `${TDIR}/${tool.id}_${String(f).padStart(2, '0')}.png` });
    }
    console.log(`  TOOL ${tool.id.padEnd(8)} ${tool.frames} frames = ${((tool.frames * tool.every) / 30).toFixed(1)} s`);
  }
}

await b.close();
console.log(`\n  console errors : ${errs.length}`);
for (const e of errs.slice(0, 6)) console.log('   ' + e.slice(0, 240));
console.log(`identity ${identityPass ? 'PASS' : 'FAIL'} | errors ${errs.length}`);
process.exit(identityPass && errs.length === 0 ? 0 : 1);
