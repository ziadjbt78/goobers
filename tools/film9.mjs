/**
 * film9.mjs — the v9 verification film.
 *
 * Everything is captured at NOON with the day clock FROZEN, so lighting never
 * drifts between frames. Covers:
 *   1. the animator identity proof
 *   2. the motion gates, with per-species slip / joint / heading breakdown
 *   3. the G-key sign check — 4 species x 5 poses, side and front
 *   4. a literal side-by-side strip per species: Heroes gait 0.6 | World walk
 *   5. the tool sheet re-filmed close and long (6 s per tool)
 *
 *   node tools/film9.mjs http://127.0.0.1:8137/ verify/v9 http://127.0.0.1:8137/heroes.html
 */
import { chromium } from 'playwright';
import { mkdirSync, rmSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:8137/';
const OUT = process.argv[3] ?? 'verify/v9';
const HEROES = process.argv[4] ?? 'http://127.0.0.1:8137/heroes.html';
const ONLY = process.env.FILM_SPECIES ?? '';

const DT = 1 / 30;
const W = 460, H = 300;
const NOON = 0.5;

const b = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--use-gl=angle', '--disable-dev-shm-usage', '--no-sandbox'],
});
const errs = [];
const mk = (label) => {
  const p = b.newPage?.(null);
  return p;
};
void mk;
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
}, NOON);

// ---------------------------------------------------------------------------
// 1. IDENTITY
// ---------------------------------------------------------------------------
const identity = await p.evaluate(() => window.__lab.poseIdentity(180, 1 / 60));
const identityPass = identity.maxQuat < 1e-6 && identity.maxPos < 1e-5;
console.log('\n== ANIMATOR IDENTITY ==');
console.log(`  bones ${identity.bones} | quat ${identity.maxQuat.toExponential(2)} | pos ${identity.maxPos.toExponential(2)} m | ${identityPass ? 'PASS' : 'FAIL'}`);

// ---------------------------------------------------------------------------
// 2. STRIDE CALIBRATION (measured, not assumed)
// ---------------------------------------------------------------------------
const stride = await p.evaluate(() => window.__lab.strideProbe());
const hop = await p.evaluate(() => window.__lab.hopProbe(12, 1 / 60));
console.log('\n== STRIDE CALIBRATION (external phase, gait 0.6) ==');
for (const [k, v] of Object.entries(stride)) {
  console.log(`  ${k.padEnd(6)} range ${v.range.toFixed(4)}  stanceFrac ${v.stanceFrac.toFixed(3)}  stanceDisp ${v.stanceDisp.toFixed(4)}  ->  stride ${v.stride.toFixed(4)} (= ${v.factor.toFixed(4)} x h)   [range/stanceFrac would give ${v.strideUserFormula.toFixed(4)}]`);
}
console.log('  BOP hop:', JSON.stringify(hop));

// ---------------------------------------------------------------------------
// 3. MOTION GATES
// ---------------------------------------------------------------------------
await p.evaluate(() => window.__lab.pause());
const runGates = (quiet) => p.evaluate((args) => {
  const { dt, quiet } = args;
  const s = window.__lab;
  s.quietPivot = quiet;
  const cmp = s.constructor.compare;
  const worst = {
    maxFootSlip: 0, maxJointRate: 0, maxHeadingRate: 0, maxDriftDeg: 0,
    counts: { footSlip: 0, jointRate: 0, heading: 0, drift: 0 }, samples: 0,
    slipByName: {}, jointByName: {}, jointBoneByName: {}, headByName: {},
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
    for (const k of ['slipByName', 'jointByName', 'headByName']) {
      for (const [n, val] of Object.entries(v[k])) if (val > (worst[k][n] ?? 0)) worst[k][n] = val;
    }
    for (const [n, val] of Object.entries(v.jointBoneByName)) {
      if ((v.jointByName[n] ?? 0) >= (worst.jointByName[n] ?? 0)) worst.jointBoneByName[n] = val;
    }
    worst.samples += v.samples;
    prev = cur;
  }
  s.quietPivot = false;
  return worst;
}, { dt: DT, quiet });

const gates = await runGates(false);
const noJuice = await runGates(true);

console.log('\n== MOTION GATES (1200 steps @ 1/30) ==');
const report = (label, g) => {
  console.log(`  --- ${label} ---`);
  console.log(`  samples ${g.samples}`);
  console.log(`  max planted foot slip  ${(g.maxFootSlip * 100).toFixed(3)} cm   (target <= 1.00 cm)`);
  console.log(`  max joint angular rate ${g.maxJointRate.toFixed(2)} rad/s (WARNING gate 20)`);
  console.log(`  max heading rate       ${g.maxHeadingRate.toFixed(2)} rad/s (per species: turnRate x 1.05)`);
  console.log(`  max sideways drift     ${g.maxDriftDeg.toFixed(2)} deg   (<= 10)`);
  console.log(`  frames over the line: slip ${g.counts.footSlip} | joint ${g.counts.jointRate} | heading ${g.counts.heading} | drift ${g.counts.drift}`);
  for (const sp of ['PIP', 'MOCHI', 'BOP', 'ZIK']) {
    const sl = (g.slipByName[sp] ?? 0) * 100;
    const jr = g.jointByName[sp] ?? 0;
    const hr = g.headByName[sp] ?? 0;
    console.log(`  ${sp.padEnd(6)} slip ${sl.toFixed(3)} cm | joint ${jr.toFixed(2)} rad/s on ${(g.jointBoneByName[sp] ?? '-').padEnd(16)} | heading ${hr.toFixed(2)} rad/s`);
  }
};
report('pivot juice ON (shipping behaviour)', gates);
report('pivot juice OFF (isolates the stride term)', noJuice);


const slipStraight = await p.evaluate(() => window.__lab.slipProbe(true, 8));
const slipStraightClean = await p.evaluate(() => window.__lab.slipProbe(false, 8));
console.log('\n== STRAIGHT-LINE SLIP (one creature, no turning, 8 s, per frame cm) ==');
for (const sp of ['PIP', 'MOCHI', 'BOP', 'ZIK']) {
  console.log(`  ${sp.padEnd(6)} gait+juice ${((slipStraight[sp] ?? 0) * 100).toFixed(3)} cm   |   gait only ${((slipStraightClean[sp] ?? 0) * 100).toFixed(3)} cm`);
}

// ---------------------------------------------------------------------------
// 4. G-KEY SIGN CHECK — 4 species x 5 poses, side + front
// ---------------------------------------------------------------------------
const POSES = ['none', 'pitch+', 'roll+', 'limbFwd', 'wave+'];
const GDIR = `${OUT}/gposes`;
mkdirSync(GDIR, { recursive: true });
if (!ONLY || ONLY === 'GPOSE') {
  await p.evaluate(() => window.__lab.pause());
  for (const sp of ['PIP', 'MOCHI', 'BOP', 'ZIK']) {
    for (let pose = 0; pose < POSES.length; pose++) {
      for (const view of ['side', 'front']) {
        await p.evaluate(({ sp, pose, view }) => {
          const s = window.__lab;
          s.quiet();
          s.testPose = pose;
          const a = s.agents.find((x) => x.template.name.toUpperCase().startsWith(sp));
          if (!a) return;
          for (const o of s.agents) o.handle.group.visible = (o === a);
          a.debugPose = pose;
          a.place(0, 0, 0);
          for (let i = 0; i < 60; i++) s.step(1 / 60);
          s.stage.update(0);
          const hgt = a.template.height;
          if (view === 'side') s.stage.camera.position.set(a.pos.x + 2.30, a.pos.y + hgt * 0.50, a.pos.z + 0.18);
          else s.stage.camera.position.set(a.pos.x, a.pos.y + hgt * 0.50, a.pos.z + 2.30);
          s.stage.camera.lookAt(a.pos.x, a.pos.y + hgt * 0.46, a.pos.z);
          s.stage.render(0);
        }, { sp, pose, view });
        await p.screenshot({ path: `${GDIR}/${sp}_${pose}_${view}.png` });
      }
      process.stdout.write(`  G ${sp} ${POSES[pose].padEnd(8)} side+front\n`);
    }
  }
  await p.evaluate(() => { window.__lab.testPose = 0; for (const o of window.__lab.agents) o.handle.group.visible = true; });
}

// ---------------------------------------------------------------------------
// 5. SIDE-BY-SIDE: Heroes gait 0.6 (left) | World walk (right), same camera
// ---------------------------------------------------------------------------
const SBS = `${OUT}/sbs`;
mkdirSync(SBS, { recursive: true });
const SBS_FRAMES = 12;
if (!ONLY || ONLY === 'SBS') {
  const ph = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  ph.on('pageerror', (e) => errs.push('heroes: ' + String(e)));
  for (const sp of ['pip', 'mochi', 'bop', 'zik']) {
    // ---- right: the World walk, on exactly the Heroes 'side' camera ---------
    await ph.goto(`${HEROES}?freeze=1&t=1.4&gait=0.6&view=${sp}&cam=side`, { waitUntil: 'load', timeout: 180000 });
    await ph.waitForFunction('window.__READY === true', null, { timeout: 180000 });
    await ph.evaluate(() => {
      document.querySelectorAll('.hp-title,.hp-status,.hp-fps,.hp-bar,.gs-build-badge').forEach((e) => { e.style.display = 'none'; });
    });
    await ph.screenshot({ path: `${SBS}/${sp}_heroes.png` });
    process.stdout.write(`  SBS ${sp} heroes\n`);
  }
  await ph.close();

  for (const sp of ['PIP', 'MOCHI', 'BOP', 'ZIK']) {
    for (let f = 0; f < SBS_FRAMES; f++) {
      await p.evaluate(({ sp, f, dt }) => {
        const s = window.__lab;
        s.quiet();
        s.testPose = 0;
        const a = s.agents.find((x) => x.template.name.toUpperCase().startsWith(sp));
        if (!a) return;
        for (const o of s.agents) o.handle.group.visible = (o === a);
        if (f === 0) {
          a.place(0, -6.0, 0);
          // throttle 0.5 gives roughly the pedestal's own gait-0.6 cadence
          a.goTo({ x: 0, y: 0, z: 30 }, 0.62);
          for (let i = 0; i < 90; i++) s.step(dt);
        }
        for (let i = 0; i < 2; i++) s.step(dt);
        s.stage.update(0);
        const hgt = a.template.height;
        // identical camera to the Heroes 'side' preset: +x 2.30, y = H*0.50
        s.stage.camera.position.set(a.pos.x + 2.30, a.pos.y + hgt * 0.50, a.pos.z + 0.18);
        s.stage.camera.lookAt(a.pos.x, a.pos.y + hgt * 0.46, a.pos.z);
        s.stage.render(0);
      }, { sp, f, dt: DT });
      await p.screenshot({ path: `${SBS}/${sp.toLowerCase()}_world_${String(f).padStart(2, '0')}.png` });
    }
    process.stdout.write(`  SBS ${sp} world ${SBS_FRAMES} frames\n`);
  }
  await p.evaluate(() => { for (const o of window.__lab.agents) o.handle.group.visible = true; });
}

// ---------------------------------------------------------------------------
// 6. TOOL SHEET — noon, close camera, 6 s per tool
// ---------------------------------------------------------------------------
const TOOLS = [
  { id: 'call', frames: 30, every: 6 },
  { id: 'feed', frames: 30, every: 6 },
  { id: 'pet', frames: 30, every: 6 },
  { id: 'petroll', frames: 34, every: 6 },
  { id: 'carry', frames: 30, every: 6 },
  { id: 'ball', frames: 30, every: 6 },
  { id: 'spawn', frames: 30, every: 6 },
  { id: 'inspect', frames: 30, every: 6 },
];
const TDIR = `${OUT}/tools`;
mkdirSync(TDIR, { recursive: true });
if (!ONLY || ONLY === 'TOOLS') {
  for (const tool of TOOLS) {
    await p.evaluate(({ id, dt }) => {
      const s = window.__lab;
      s.loud();
      s.testPose = 0;
      s.stage.controls.enabled = false;
      for (const a of s.agents) a.handle.group.visible = true;
      const rings = [[1.4, 3.0], [3.0, 3.4], [-1.2, 3.6], [0.4, 5.0], [-2.6, 4.2], [2.2, 5.4], [4.6, 4.0], [-4.0, 5.2]];
      s.agents.forEach((a, i) => {
        const r = rings[i % rings.length];
        a.place(r[0], r[1], Math.atan2(r[0], r[1]) + Math.PI);
        a.stop();
        a.begin('none');
        a.mood = 'neutral';
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
        if (id === 'feed') sub = s.agents[0].pos;
        // CLOSE camera: the reaction has to fill the frame
        s.stage.camera.position.set(sub.x + 1.95, sub.y + 1.20, sub.z + 2.25);
        s.stage.camera.lookAt(sub.x, sub.y + 0.42, sub.z);
        s.stage.render(0);
      }, { id: tool.id, dt: DT, f, every: tool.every });
      await p.screenshot({ path: `${TDIR}/${tool.id}_${String(f).padStart(2, '0')}.png` });
    }
    process.stdout.write(`  TOOL ${tool.id.padEnd(8)} ${tool.frames} frames = ${((tool.frames * tool.every) / 30).toFixed(1)} s\n`);
  }
}

await b.close();
console.log(`\n  console errors : ${errs.length}`);
for (const e of errs.slice(0, 6)) console.log('   ' + e.slice(0, 240));
process.exit(identityPass && errs.length === 0 ? 0 : 1);
