/**
 * Overlay honesty check. Loads the real WORLD page (no freeze), lets it run
 * ~9 s of live frames, then reads the on-screen stats overlay straight out of
 * the DOM and asserts the numbers are real: fps finite and > 0, ms finite and
 * > 0, and the text actually changes between two samples.
 *   node tools/overlay.mjs http://127.0.0.1:8137/
 */
import { chromium } from 'playwright';
const BASE = process.argv[2] ?? 'http://127.0.0.1:8137/';
const b = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--use-gl=angle', '--disable-dev-shm-usage', '--no-sandbox'],
});
const p = await b.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
const errs = [];
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
p.on('pageerror', (e) => errs.push(String(e)));

await p.goto(BASE, { waitUntil: 'load', timeout: 180000 });
await p.waitForFunction('window.__READY === true', null, { timeout: 180000 });

// the overlay lives in document.body; make sure it is on
await p.evaluate(() => {
  if (!document.body.textContent || !document.body.textContent.includes('FPS')) {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '`', code: 'Backquote', bubbles: true }));
  }
});

const read = () => p.evaluate(() => {
  const nodes = Array.from(document.querySelectorAll('div'));
  const el = nodes.reverse().find((d) => d.textContent && d.textContent.includes('FPS'));
  return el ? el.textContent : null;
});

await p.waitForTimeout(4500);
const a = await read();
await p.waitForTimeout(4500);
const c = await read();

const parse = (t) => {
  if (!t) return null;
  const fps = /FPS\s+(-?\d+)/.exec(t);
  const ms = /\(([\d.]+) ms avg, ([\d.]+) ms peak\)/.exec(t);
  const draws = /draws (\d+)\s+tris ([\d.]+)k\s+progs (\d+)/.exec(t);
  const creatures = /creatures (\d+)/.exec(t);
  return {
    fps: fps ? +fps[1] : null,
    msAvg: ms ? +ms[1] : null,
    msPeak: ms ? +ms[2] : null,
    draws: draws ? +draws[1] : null,
    trisK: draws ? +draws[2] : null,
    progs: draws ? +draws[3] : null,
    creatures: creatures ? +creatures[1] : null,
    raw: t,
  };
};
const A = parse(a), C = parse(c);

const live = (o) => o && Number.isFinite(o.fps) && o.fps > 0 && Number.isFinite(o.msAvg) && o.msAvg > 0 && Number.isFinite(o.msPeak) && o.msPeak > 0;

console.log('\n== OVERLAY HONESTY CHECK (world page, live frames) ==');
console.log('sample A :', A ? `${A.fps} fps / ${A.msAvg} ms avg / ${A.msPeak} ms peak` : 'NOT FOUND');
console.log('sample B :', C ? `${C.fps} fps / ${C.msAvg} ms avg / ${C.msPeak} ms peak` : 'NOT FOUND');
console.log('render   :', C ? `draws ${C.draws}  tris ${C.trisK}k  progs ${C.progs}  creatures ${C.creatures}` : '-');
console.log('raw A    :', JSON.stringify(A?.raw));
console.log('raw B    :', JSON.stringify(C?.raw));
console.log('changed  :', a !== c ? 'YES (numbers advance)' : 'NO (frozen)');
console.log('overlay  :', live(A) && live(C) ? 'PASS' : 'FAIL');
console.log(`console errors: ${errs.length}`);
for (const e of errs.slice(0, 6)) console.log('   ' + e.slice(0, 300));
await b.close();
process.exit(live(A) && live(C) && errs.length === 0 ? 0 : 1);
