/**
 * tools/stride.mjs — integration step 4, stride calibration.
 *
 * Drives each species' pedestal animator with an EXTERNAL gait cycle at 0.6 and
 * measures how far the real ankle bones travel forward in body space over one
 * full cycle. The gait cycle advances `stride` per cycle, so `stride = range/0.5`.
 * Prints the calibrated values and the height-relative factors to paste into
 * src/engine/motion/Rig.ts (SPECIES[*].strideFactor).
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://127.0.0.1:8137/';

const b = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--use-gl=angle', '--disable-dev-shm-usage', '--no-sandbox'],
});
const p = await b.newPage({ viewport: { width: 640, height: 400 }, deviceScaleFactor: 1 });
const errs = [];
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
p.on('pageerror', (e) => errs.push(String(e)));

await p.goto(BASE, { waitUntil: 'domcontentloaded' });
await p.waitForFunction('window.__READY === true && !!window.__lab', null, { timeout: 180000 });
await p.evaluate(() => window.__lab.pause());

const probe = await p.evaluate(() => (window.__lab && window.__lab.strideProbe ? window.__lab.strideProbe() : null));
if (!probe) { console.log('strideProbe missing — __lab is not the Sim instance'); process.exit(2); }

console.log(JSON.stringify(probe, null, 2));
console.log('--- paste into SPECIES[*].strideFactor ---');
for (const [k, v] of Object.entries(probe)) {
  console.log(`${k.padEnd(6)} stride ${v.stride.toFixed(3)} u  = ${v.factor.toFixed(4)} x height ${v.height}`);
}
console.log('console errors:', errs.length, errs.slice(0, 5));
await b.close();
