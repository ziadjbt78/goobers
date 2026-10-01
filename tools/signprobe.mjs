import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
const b = await chromium.launch({ args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--use-gl=angle','--disable-dev-shm-usage','--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 400, height: 300 } });
const errs = [];
p.on('pageerror', (e) => errs.push(String(e)));
await p.goto('http://127.0.0.1:8137/', { waitUntil: 'load', timeout: 180000 });
await p.waitForFunction('window.__READY === true && !!window.__lab', null, { timeout: 180000 });
await p.evaluate(() => window.__lab.pause());
const signs = await p.evaluate(() => window.__lab.signProbe());
console.log('\n== AXES SIGN PROBE (numeric, creature facing +Z) ==');
for (const [sp, v] of Object.entries(signs)) {
  console.log(`  ${sp.padEnd(6)} pitch ${v.pitch > 0 ? "+1" : "-1"}  roll ${v.roll > 0 ? "+1" : "-1"}  limb ${v.limb > 0 ? "+1" : "-1"}  wave ${v.wave > 0 ? "+1" : "-1"}`);
  for (const [k, e] of Object.entries(v.evidence)) console.log(`      ${k.padEnd(6)} ${e}`);
}
writeFileSync('verify/v9/signs.json', JSON.stringify(signs, null, 2));
console.log('  console errors:', errs.length);
await b.close();
