// watch.mjs: headless "eyes". Plays the world, measures motion, writes watch/REPORT.md
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:8137/';
const OUT = 'watch';
const DT = 1 / 30;
rmSync(OUT, { recursive: true, force: true });
mkdirSync(`${OUT}/frames`, { recursive: true });

const L = [];
const log = (s = '') => { console.log(s); L.push(s); };
const safe = async (name, fn) => { try { await fn(); } catch (e) { log(`  [${name}] SKIPPED: ${String(e).split('\n')[0].slice(0, 200)}`); } };

const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--use-gl=angle', '--disable-dev-shm-usage', '--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 640, height: 400 }, deviceScaleFactor: 1 });
const errs = [];
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
p.on('pageerror', (e) => errs.push(String(e)));

await p.goto(BASE, { waitUntil: 'load', timeout: 180000 });
await p.waitForFunction('window.__READY === true && !!window.__lab', null, { timeout: 180000 });

log('# WATCH REPORT');
log(`date ${new Date().toISOString()}`);
log(`badge ${await p.evaluate(() => document.querySelector('.gs-build-badge')?.textContent ?? 'NO BADGE')}`);

// overview shot (normal camera, noon, after 10 s of life)
await safe('overview', async () => {
  await p.evaluate((dt) => { const s = window.__lab; s.pause(); s.setDay(0.5); for (let i = 0; i < 300; i++) s.step(dt); s.stage.update(0); s.stage.render(0); }, DT);
  await p.screenshot({ path: `${OUT}/overview.png` });
});

log('\n## PEDESTAL');
await safe('pedestal', async () => {
  const id = await p.evaluate(() => window.__lab.poseIdentity(180, 1 / 60));
  log(`  quat ${id.maxQuat.toExponential(2)} pos ${id.maxPos.toExponential(2)} -> ${id.maxQuat < 1e-6 && id.maxPos < 1e-5 ? 'PASS' : 'FAIL'}`);
});

log('\n## STRAIGHT WALK PROBE (8 s each)');
await safe('slipProbe', async () => {
  const slip = await p.evaluate(() => window.__lab.slipProbe(8));
  for (const [sp, v] of Object.entries(slip)) log(`  ${sp.padEnd(6)} slip ${(v.slip * 100).toFixed(2)} cm | overstretch ${v.overstretch}/${v.frames} | speed ${v.speed} | freq ${v.freq} Hz`);
});

log('\n## JOINT PROBE (20 s)');
const joint = {};
await safe('jointProbe', async () => {
  Object.assign(joint, await p.evaluate(() => window.__lab.jointProbe(20, 1 / 60)));
  for (const [sp, j] of Object.entries(joint)) log(`  ${sp.padEnd(6)} ${j.rate.toFixed(2)} rad/s on ${j.bone}${j.wasForced ? ' [FORCED STEP]' : ''}`);
});

log('\n## FREE-RUNNING WORLD (30 s, all creatures, real behaviour)');
let free = null;
await safe('freeRun', async () => {
  free = await p.evaluate(({ dt, steps }) => {
    const s = window.__lab;
    const spOf = (a) => a.template.name.split(' ')[0].toUpperCase();
    const cmp = s.constructor.compare;
    const out = {};
    const st = new Map();
    const prevPos = new Map();
    let overlapFrames = 0, minRatio = Infinity;
    let prev = s.probe ? s.probe() : null;
    for (let i = 0; i < steps; i++) {
      s.step(dt);
      if (cmp && prev) {
        const cur = s.probe(); const v = cmp(prev, cur, dt);
        for (const [n, x] of Object.entries(v.jointByName)) {
          const k = n.toUpperCase(); const o = (out[k] ??= {});
          if (x > (o.joint ?? 0)) { o.joint = x; o.jointBone = v.jointBoneByName[n]; }
          if (x > 20) o.kneeFrames = (o.kneeFrames ?? 0) + 1;
        }
        prev = cur;
      }
      const ag = s.agents;
      for (const a of ag) {
        const o = (out[spOf(a)] ??= {});
        o.stances ??= 0; o.bad ??= 0; o.worst ??= 0; o.sum ??= 0; o.moving ??= 0; o.frames ??= 0;
        o.frames++;
        const pp = prevPos.get(a);
        if (pp && Math.hypot(a.pos.x - pp.x, a.pos.z - pp.z) / dt > 0.05) o.moving++;
        prevPos.set(a, { x: a.pos.x, z: a.pos.z });
        let m = st.get(a); if (!m) { m = []; st.set(a, m); }
        (a.feet || []).forEach((f, fi) => {
          const c = m[fi];
          if (!f.swinging) {
            if (!c) m[fi] = { x: f.pos.x, z: f.pos.z, max: 0 };
            else { const d = Math.hypot(f.pos.x - c.x, f.pos.z - c.z); if (d > c.max) c.max = d; }
          } else if (c) {
            o.stances++; o.sum += c.max; if (c.max > 0.01) o.bad++; if (c.max > o.worst) o.worst = c.max;
            m[fi] = null;
          }
        });
      }
      let hit = false;
      for (let x = 0; x < ag.length; x++) for (let y = x + 1; y < ag.length; y++) {
        const A = ag[x], B = ag[y];
        const r = 0.3 * (A.template.height + B.template.height);
        const d = Math.hypot(A.pos.x - B.pos.x, A.pos.z - B.pos.z);
        if (d / r < minRatio) minRatio = d / r;
        if (d < r * 0.7) hit = true;
      }
      if (hit) overlapFrames++;
    }
    return { out, overlapFrames, minRatio, steps, count: s.agents.length };
  }, { dt: DT, steps: 900 });
  log(`  creatures ${free.count} | overlap frames ${free.overlapFrames}/${free.steps} | closest pair ${free.minRatio.toFixed(2)}x personal space`);
  for (const [sp, o] of Object.entries(free.out)) {
    const avg = o.stances ? (o.sum / o.stances) * 100 : 0;
    log(`  ${sp.padEnd(6)} stances ${o.stances ?? 0} | slip avg ${avg.toFixed(2)} cm worst ${((o.worst ?? 0) * 100).toFixed(2)} cm | stances >1cm ${o.bad ?? 0} | max joint ${(o.joint ?? 0).toFixed(1)} rad/s on ${o.jointBone ?? '-'} | frames >20 rad/s ${o.kneeFrames ?? 0} | moving ${o.frames ? Math.round(100 * o.moving / o.frames) : 0}%`);
  }
});

// filmed strips with foot dots (red = planted, yellow = swinging)
await p.evaluate(() => {
  document.querySelectorAll('.sh-menu,.w-tools,.w-head,.w-hint,.w-species,.w-card,.w-simlog,.w-tags,.gs-build-badge').forEach((e) => { e.style.display = 'none'; });
  const c = document.createElement('canvas'); c.id = '__dots';
  c.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9';
  document.body.appendChild(c);
  window.__lab.stage.controls.enabled = false;
});
const drawDots = () => p.evaluate(() => {
  const s = window.__lab, c = document.getElementById('__dots'), r = s.stage.renderer.domElement;
  c.width = r.clientWidth; c.height = r.clientHeight;
  const ctx = c.getContext('2d'); ctx.clearRect(0, 0, c.width, c.height);
  for (const a of s.agents) {
    if (!a.handle.group.visible) continue;
    for (const f of a.feet) {
      const v = f.pos.clone().project(s.stage.camera); if (v.z > 1) continue;
      ctx.beginPath(); ctx.arc((v.x * 0.5 + 0.5) * c.width, (-v.y * 0.5 + 0.5) * c.height, 6, 0, 7);
      ctx.fillStyle = f.swinging ? '#ffd23f' : '#ff3b6b'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#101418'; ctx.stroke();
    }
  }
});
for (const sp of ['MOCHI', 'ZIK']) for (const mode of ['walk', 'turn', 'stop']) {
  await safe(`strip ${sp} ${mode}`, async () => {
    for (let f = 0; f < 12; f++) {
      await p.evaluate(({ sp, mode, f, dt }) => {
        const s = window.__lab; s.quiet(); s.testPose = 0;
        const a = s.agents.find((x) => x.template.name.toUpperCase().startsWith(sp)); if (!a) throw new Error('no ' + sp);
        for (const o of s.agents) o.handle.group.visible = (o === a);
        if (f === 0) {
          a.place(0, -6, 0); a.goTo({ x: 0, y: 0, z: 40 }, 0.7);
          for (let i = 0; i < 120; i++) s.step(dt);
          if (mode === 'turn') { a.stop(); a.faceTarget = { x: -40, z: -6 }; }
        }
        if (mode === 'stop' && f === 3) a.stop();
        for (let i = 0; i < 3; i++) s.step(dt);
        s.stage.update(0);
        const h = a.template.height;
        if (mode === 'walk') { s.stage.camera.position.set(a.pos.x + 2.3, a.pos.y + h * 0.5, a.pos.z + 0.2); s.stage.camera.lookAt(a.pos.x, a.pos.y + h * 0.45, a.pos.z); }
        else { s.stage.camera.position.set(a.pos.x + 2.1, a.pos.y + h * 0.62, a.pos.z + 2.1); s.stage.camera.lookAt(a.pos.x, a.pos.y + 0.3, a.pos.z); }
        s.stage.render(0);
      }, { sp, mode, f, dt: DT });
      await drawDots();
      await p.screenshot({ path: `${OUT}/frames/${sp}_${mode}_${String(f).padStart(2, '0')}.png` });
    }
  });
}

log('\n## VERDICT');
for (const sp of ['PIP', 'MOCHI', 'BOP', 'ZIK']) {
  const o = free?.out?.[sp]; if (!o) { log(`  ${sp}: no data`); continue; }
  const feet = (o.stances ?? 0) === 0 ? 'no steps seen' : (o.worst ?? 0) <= 0.01 ? 'STAY PUT' : `SLIDE (worst ${(o.worst * 100).toFixed(1)} cm, ${Math.round(100 * o.bad / o.stances)}% of steps)`;
  const kr = Math.max(o.joint ?? 0, joint[sp]?.rate ?? 0);
  const knees = kr <= 20 ? 'OK' : `SNAP (${kr.toFixed(0)} rad/s)`;
  log(`  ${sp.padEnd(6)} feet ${feet} | knees ${knees}`);
}
if (free) log(`  overlap ${free.overlapFrames === 0 ? 'NONE' : `${free.overlapFrames} frames`}`);
log(`  console errors ${errs.length}`);
for (const e of errs.slice(0, 8)) log('    ' + e.slice(0, 240));

writeFileSync(`${OUT}/REPORT.md`, '```\n' + L.join('\n') + '\n```\n');
await b.close();
