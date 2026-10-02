// watch.mjs: headless "eyes". Plays the world, measures motion, writes watch/REPORT.md
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:8137/';
const OUT = 'watch';
const DT = 1 / 30;
for (const f of ['REPORT.md', 'frames']) rmSync(`${OUT}/${f}`, { recursive: true, force: true });
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
    for (const a of s.agents) a.hero.resetLiftStats?.();
    const st = new Map();
    const legQ = new Map();
    const bodyQ = new Map();
    const events = [];
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
        const legs = a.hero.legs || [];
        { const bb = a.rig.body.quaternion, bq = bodyQ.get(a);
          if (bq) { const r = 2 * Math.acos(Math.min(1, Math.abs(bb.dot(bq)))) / dt; if (r > (o.bodyJ ?? 0)) { o.bodyJ = r; o.bodyAct = a.action; } bq.copy(bb); }
          if ((a.bodyRaw ?? 0) > (o.rawMax ?? 0)) { o.rawMax = a.bodyRaw; o.rawAct = a.action; o.rawPiv = a.pivotAng ?? 0; o.rawBusy = a.motion.busy; }
          else bodyQ.set(a, bb.clone()); }
        let lq = legQ.get(a);
        if (!lq) { lq = legs.map((L) => [L.hip.quaternion.clone(), L.knee.quaternion.clone(), L.ankle.quaternion.clone()]); legQ.set(a, lq); }
        else if (!a.hero.legsFree) legs.forEach((L, li) => { [L.hip, L.knee, L.ankle].forEach((b, bi) => {
          const q = lq[li][bi]; const r = 2 * Math.acos(Math.min(1, Math.abs(b.quaternion.dot(q)))) / dt;
          if (r > (o.legJ ?? 0)) { o.legJ = r; o.legJBone = `${b.name}(${L.mode})`; }
          if (!a.motion.busy && r > (o.wJ ?? 0)) {
            o.wJ = r; o.wJBone = `${b.name}(${L.mode})`;
            const V = a.pos.constructor; const hp = L.hip.getWorldPosition(new V()), ap = L.ankle.getWorldPosition(new V());
            o.wJctx = { rr: hp.distanceTo(ap) / Math.max(1e-4, L.reachW || 1), err: L.err ?? 0, landT: L.landT ?? 0, cd: a.hero.crouchD ?? 0, act: a.action, lifted: !!L.lifted, kick: !!(a.kicking && a.kicking.has && a.kicking.has(L.index)), bendR: L.bendRate ?? 0, fb: !!L.fb, sw: !!L.sw };
          }
          if (r > 20) o.legJFrames = (o.legJFrames ?? 0) + 1;
          q.copy(b.quaternion); }); });
        else legs.forEach((L, li) => { lq[li][0].copy(L.hip.quaternion); lq[li][1].copy(L.knee.quaternion); lq[li][2].copy(L.ankle.quaternion); });
        o.stances ??= 0; o.bad ??= 0; o.worst ??= 0; o.sum ??= 0; o.moving ??= 0; o.frames ??= 0;
        o.frames++;
        const pp = prevPos.get(a);
        if (pp && Math.hypot(a.pos.x - pp.x, a.pos.z - pp.z) / dt > 0.05) o.moving++;
        prevPos.set(a, { x: a.pos.x, z: a.pos.z });
        let m = st.get(a); if (!m) { m = []; st.set(a, m); }
        (a.feet || []).forEach((f, fi) => {
          const c = m[fi];
          if (!f.swinging) {
            if (!c) m[fi] = { x: f.pos.x, z: f.pos.z, px: f.pos.x, pz: f.pos.z, max: 0, jump: 0, err: 0, perr: 0, rr: 0, busy: false };
            else {
              const d = Math.hypot(f.pos.x - c.x, f.pos.z - c.z); if (d > c.max) c.max = d;
              const j = Math.hypot(f.pos.x - c.px, f.pos.z - c.pz); if (j > c.jump) c.jump = j;
              c.px = f.pos.x; c.pz = f.pos.z;
              const L = (a.hero.legs || []).find((l) => l.index === fi);
              if (L) {
                c.err = Math.max(c.err, L.err ?? 0); c.perr = Math.max(c.perr, L.postErr ?? 0);
                const hp = L.hip.getWorldPosition(new f.pos.constructor());
                c.rr = Math.max(c.rr, hp.distanceTo(f.pos) / Math.max(1e-4, L.reachW || 1));
              }
              if (a.motion.busy) c.busy = true;
            }
          } else if (c) {
            o.stances++; o.sum += c.max; if (c.max > 0.01) o.bad++; if (c.max > o.worst) o.worst = c.max;
            if (!c.busy) { o.wSt = (o.wSt ?? 0) + 1; if (c.max > 0.01) o.wBad = (o.wBad ?? 0) + 1; if (c.max > (o.wWorst ?? 0)) o.wWorst = c.max; }
            if (c.max > 0.01) {
              const L = (a.hero.legs || []).find((l) => l.index === fi);
              events.push({ sp: spOf(a), leg: fi, slip: c.max, jump: c.jump, err: c.err, perr: c.perr, rr: c.rr, busy: c.busy, cause: L && L.forced ? 'forced' : 'beat' });
            }
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
    const lifts = {};
    for (const a of s.agents) {
      const L = a.hero.liftStats; if (!L) continue;
      const o = (lifts[spOf(a)] ??= { beat: 0, hard: 0, strain: 0, soft: 0, err: 0, crouch: 0, n: 0 });
      o.beat += L.beat; o.hard += L.hard; o.strain += L.strain; o.soft += L.soft;
      o.err = Math.max(o.err, L.maxErr); o.crouch += a.hero.crouch ?? 0; o.n++;
    }
    return { out, overlapFrames, minRatio, steps, count: s.agents.length, lifts, events };
  }, { dt: DT, steps: 900 });
  log(`  creatures ${free.count} | overlap frames ${free.overlapFrames}/${free.steps} | closest pair ${free.minRatio.toFixed(2)}x personal space`);
  for (const [sp, l] of Object.entries(free.lifts ?? {})) log(`  ${sp.padEnd(6)} lifts: beat ${l.beat} reach ${l.hard} strain ${l.strain} catch-up ${l.soft} | max planted IK miss ${(l.err * 100).toFixed(2)} cm | crouch ${(100 * l.crouch / Math.max(1, l.n)).toFixed(1)} cm`);
  log('\n## SLIP FORENSICS (stances that slid > 1 cm)');
  const ev = free.events ?? [];
  for (const sp of ['PIP', 'MOCHI', 'ZIK']) {
    const e = ev.filter((x) => x.sp === sp);
    if (!e.length) { log(`  ${sp.padEnd(6)} none`); continue; }
    const pct = (f) => Math.round((100 * e.filter(f).length) / e.length);
    log(`  ${sp.padEnd(6)} n ${e.length} | in action ${pct((x) => x.busy)}% | one-frame pop ${pct((x) => x.jump > 0.5 * x.slip)}% | ended by forced lift ${pct((x) => x.cause === 'forced')}% | max hip-foot/reach ${Math.max(...e.map((x) => x.rr)).toFixed(2)} | max IK miss ${(100 * Math.max(...e.map((x) => x.err))).toFixed(1)} cm | max post-limiter miss ${(100 * Math.max(...e.map((x) => x.perr))).toFixed(1)} cm`);
  }
  for (const x of [...ev].sort((p, q) => q.slip - p.slip).slice(0, 8))
    log(`    ${x.sp} leg ${x.leg}: slip ${(x.slip * 100).toFixed(1)} jump ${(x.jump * 100).toFixed(1)} cm | reach ${x.rr.toFixed(2)} | IK ${(x.err * 100).toFixed(1)} post ${(x.perr * 100).toFixed(1)} cm | ${x.busy ? 'ACTION' : 'walk'} | ${x.cause}`);
  for (const [sp, o] of Object.entries(free.out)) if (o.legJ) log(`  ${sp.padEnd(6)} LEG joint max ${o.legJ.toFixed(1)} rad/s on ${o.legJBone} | leg frames >20: ${o.legJFrames ?? 0}`);
  for (const [sp, o] of Object.entries(free.out)) if (o.bodyJ) log(`  ${sp.padEnd(6)} BODY snap max ${o.bodyJ.toFixed(1)} rad/s (rendered) during '${o.bodyAct}' | raw target ${(o.rawMax ?? 0).toFixed(1)} rad/s during '${o.rawAct ?? '-'}' busy ${!!o.rawBusy} roll-over ${(o.rawPiv ?? 0).toFixed(2)} rad`);
  for (const [sp, o] of Object.entries(free.out)) if (o.wJctx) { const c = o.wJctx; log(`  ${sp.padEnd(6)} WALK joint peak ${o.wJ.toFixed(1)} on ${o.wJBone} | hip-foot/reach ${c.rr.toFixed(3)} | IK miss ${(c.err * 100).toFixed(2)} cm | since land ${c.landT.toFixed(2)} s | crouch step ${(c.cd * 100).toFixed(2)} cm | action '${c.act}' | lifted ${c.lifted} | kick ${c.kick} | knee BEND rate ${(c.bendR ?? 0).toFixed(1)} rad/s (rest of peak = twist) | pole fallback ${c.fb} | swivel-limited ${c.sw}`); }
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

log('\n## SAVE / LOAD');
let saveOK = false;
await safe('save', async () => {
  const r = await p.evaluate(() => {
    const s = window.__lab;
    const key = (list) => list.map((a) => `${s.heroIdOf(a)}:${a.pos.x.toFixed(2)},${a.pos.z.toFixed(2)}:${a.dna.scale.toFixed(3)}`).sort().join('|');
    const before = key(s.agents);
    const json = s.saveState();
    const ok = s.loadState(json);
    return { ok, n: s.agents.length, bytes: json.length, same: before === key(s.agents) };
  });
  saveOK = r.ok && r.same;
  log(`  creatures ${r.n} | save ${r.bytes} bytes | reload identical ${r.same}`);
});

log('\n## SIM COST (CPU only, no render)');
const perf = {};
await safe('perf', async () => {
  const r = await p.evaluate((dt) => {
    const s = window.__lab; s.loud();
    let bd = null;
    const AG = s.agents[0] ? s.agents[0].constructor : null;
    const time = () => {
      for (let i = 0; i < 30; i++) s.step(dt);
      s.prof.brain = 0; s.prof.agent = 0; if (AG) { AG.legMs = 0; AG.preMs = 0; AG.animMs = 0; AG.postMs = 0; }
      const t0 = performance.now();
      for (let i = 0; i < 120; i++) s.step(dt);
      const tot = performance.now() - t0;
      const legs = AG ? AG.legMs : 0;
      bd = { brain: s.prof.brain / 120, motion: (s.prof.agent - legs) / 120, legs: legs / 120, other: (tot - s.prof.brain - s.prof.agent) / 120,
        pre: AG ? AG.preMs / 120 : 0, anim: AG ? AG.animMs / 120 : 0, post: AG ? AG.postMs / 120 : 0 };
      return tot / 120;
    };
    const n0 = s.agents.length; const m0 = time();
    const base = [...s.agents];
    for (let i = 0; i < 16; i++) s.spawn(s.heroIdOf(base[i % base.length]), null, true);
    const n1 = s.agents.length; const m1 = time();
    return { n0, m0, n1, m1, bd };
  }, DT);
  Object.assign(perf, r);
  log(`  ${r.n0} creatures ${r.m0.toFixed(2)} ms/step | ${r.n1} creatures ${r.m1.toFixed(2)} ms/step | ${(r.m1 / r.n1).toFixed(3)} ms per creature`);
  if (r.bd) log(`  breakdown @${r.n1}: brain ${r.bd.brain.toFixed(2)} | motion+anim ${r.bd.motion.toFixed(2)} | leg solve ${r.bd.legs.toFixed(2)} | other ${r.bd.other.toFixed(2)} ms/step`);
  if (r.bd) log(`  motion+anim split: preAnimate ${r.bd.pre.toFixed(2)} | HeroAnimator ${r.bd.anim.toFixed(2)} | postAnimate ${r.bd.post.toFixed(2)} | rest of Agent ${(r.bd.motion - r.bd.pre - r.bd.anim - r.bd.post).toFixed(2)} ms/step`);
});

log('\n## RENDER BUDGET (one frame, home camera; counts matter, not ms)');
await safe('render', async () => {
  const ri = await p.evaluate(() => {
    const s = window.__lab, r = s.stage.renderer, inf = r.info;
    for (const a of s.agents) a.handle.group.visible = true;
    s.stage.camera.position.set(0.4, 8.4, 14.2); s.stage.camera.lookAt(0, 0.6, 0);
    const ar = inf.autoReset; inf.autoReset = false; inf.reset();
    s.renderOnce();
    const out = { n: s.agents.length, calls: inf.render.calls, tris: inf.render.triangles, geos: inf.memory.geometries, tex: inf.memory.textures, progs: (inf.programs || []).length };
    inf.autoReset = ar;
    return out;
  });
  log(`  ${ri.n} creatures | draw calls ${ri.calls} | triangles ${ri.tris} | geometries ${ri.geos} | textures ${ri.tex} | shader programs ${ri.progs}`);
});

log('\n## GATES');
const gate = (name, ok, val) => log(`  ${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(30)} ${val}`);
for (const sp of ['PIP', 'MOCHI', 'ZIK']) {
  const o = free?.out?.[sp]; if (!o) continue;
  const pct = o.stances ? (100 * o.bad) / o.stances : 0;
  const wpct = o.wSt ? (100 * (o.wBad ?? 0)) / o.wSt : 0;
  gate(`${sp} WALK worst slip <= 2 cm`, (o.wWorst ?? 0) <= 0.02, `${((o.wWorst ?? 0) * 100).toFixed(2)} cm (${o.wSt ?? 0} walk steps)`);
  gate(`${sp} WALK steps >1 cm <= 2%`, wpct <= 2, `${wpct.toFixed(1)}%`);
  gate(`${sp} WALK leg joint <= 20 rad/s`, (o.wJ ?? 0) <= 20, `${(o.wJ ?? 0).toFixed(1)} on ${o.wJBone ?? '-'}`);
  log(`  WARN  ${(sp + ' in actions').padEnd(30)} worst ${((o.worst ?? 0) * 100).toFixed(1)} cm | ${pct.toFixed(1)}% steps | leg joint ${(o.legJ ?? 0).toFixed(1)} | body ${(o.bodyJ ?? 0).toFixed(0)} rad/s '${o.bodyAct ?? '-'}'`);
}
for (const sp of ['PIP', 'MOCHI', 'BOP', 'ZIK']) { const o = free?.out?.[sp]; if (o) gate(`${sp} BODY snap <= 20 rad/s`, (o.bodyJ ?? 0) <= 20, `${(o.bodyJ ?? 0).toFixed(1)} during '${o.bodyAct ?? '-'}'`); }
gate('overlap frames = 0', !!free && free.overlapFrames === 0, free ? free.overlapFrames : '-');
gate('console errors = 0', errs.length === 0, errs.length);
gate('save/load identical', saveOK, saveOK ? 'yes' : 'no');
gate('sim cost scales linearly', perf.m1 !== undefined && perf.m1 <= 3.6 * perf.m0, perf.m1 !== undefined ? `${(perf.m1 / perf.m0).toFixed(2)}x for 3x creatures` : '-');
writeFileSync(`${OUT}/REPORT.md`, '```\n' + L.join('\n') + '\n```\n');
await b.close();
