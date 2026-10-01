import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--use-gl=angle','--disable-dev-shm-usage','--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 400, height: 300 } });
const errs = [];
p.on('pageerror', (e) => errs.push(String(e)));
await p.goto('http://127.0.0.1:8137/', { waitUntil: 'load', timeout: 180000 });
await p.waitForFunction('window.__READY === true && !!window.__lab', null, { timeout: 180000 });
await p.evaluate(() => { window.__lab.pause(); window.__lab.setDay(0.5); });
console.log('BADGE:', await p.evaluate(() => document.querySelector('.gs-build-badge')?.textContent ?? 'NO BADGE'));
const id = await p.evaluate(() => window.__lab.poseIdentity(180, 1/60));
console.log('PEDESTAL: quat', id.maxQuat.toExponential(2), 'pos', id.maxPos.toExponential(2), id.maxQuat < 1e-6 && id.maxPos < 1e-5 ? 'PASS' : 'FAIL');
const signs = await p.evaluate(() => window.__lab.signProbe());
console.log('\nSIGNS');
for (const [sp, v] of Object.entries(signs)) {
  const f = (x) => (x === null ? 'UNVERIFIED' : x === 2 ? "axis'z'" : x > 0 ? '+1' : '-1');
  console.log(` ${sp.padEnd(6)} pitch ${f(v.pitch).padEnd(11)} roll ${f(v.roll).padEnd(11)} limb ${f(v.limb).padEnd(11)} wave ${f(v.wave)}`);
  for (const [k, e] of Object.entries(v.evidence)) console.log(`    ${k.padEnd(6)} ${e}`);
}
const slip = await p.evaluate(() => window.__lab.slipProbe(8));
console.log('\nSLIP + CADENCE');
for (const [sp, v] of Object.entries(slip)) console.log(` ${sp.padEnd(6)} slip ${(v.slip*100).toFixed(3)} cm | overstretch ${v.overstretch}/${v.frames} | speed ${v.speed} u/s | freq ${v.freq} Hz`);
const cfg = await p.evaluate(() => { const o={}; for (const a of window.__lab.agents){ const sp=a.template.name.split(' ')[0]; if(o[sp])continue; const c=a.motion.loco.cfg; o[sp]={walk:c.walkSpeed,run:c.runSpeed,stride:c.stride,turn:c.turnRate,h:a.template.height}; } return o; });
console.log('\nLOCOCONFIG'); for (const [sp,c] of Object.entries(cfg)) console.log(` ${sp.padEnd(6)} height ${c.h.toFixed(2)} walk ${c.walk.toFixed(3)} run ${c.run.toFixed(3)} stride ${c.stride.toFixed(4)} | walkFreq ${(c.walk/c.stride).toFixed(2)} Hz runFreq ${(c.run/(c.stride*1.4)).toFixed(2)} Hz turn ${c.turn}`);
console.log('console errors:', errs.length);
await b.close();
