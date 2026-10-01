/**
 * Acceptance run. Loads the real world page in headless Chromium, fast-forwards
 * 60 seconds of simulation without rendering, and prints the event log.
 *   node tools/worldSim.mjs http://127.0.0.1:8137/ 60
 */
import { chromium } from 'playwright';
const BASE = process.argv[2] ?? 'http://127.0.0.1:8137/';
const SECONDS = process.argv[3] ?? '60';
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--use-gl=angle', '--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
p.on('pageerror', (e) => errs.push(String(e)));
await p.goto(`${BASE}?sim=1&seconds=${SECONDS}`, { waitUntil: 'load', timeout: 180000 });
await p.waitForFunction('window.__READY === true', null, { timeout: 180000 });
const res = await p.evaluate('window.__sim');
console.log('\n== 60 s ACCEPTANCE RUN ==');
console.log('creatures      :', res.creatures);
console.log('logged events  :', res.events);
console.log('summary        :', JSON.stringify(res.summary));
const need = ['eat', 'playChase', 'greet', 'nap', 'ball'];
console.log('\nrequired behaviours:');
for (const k of need) console.log(`  ${res.summary[k] ? 'PASS' : 'FAIL'}  ${k.padEnd(10)} x${res.summary[k] ?? 0}`);
console.log('\nfirst 24 events:');
for (const e of res.log.slice(0, 24)) console.log(`  t=${String(e.t).padStart(6)}s  ${e.kind.padEnd(12)} ${e.name}`);
console.log('\nfinal state:');
for (const c of res.creatures_state) console.log(`  ${c.name.padEnd(12)} ${String(c.action).padEnd(12)} mood=${String(c.mood).padEnd(10)} pos=${c.pos.join(',')}`);
console.log(`\nconsole errors: ${errs.length}`);
for (const e of errs.slice(0, 6)) console.log('   ' + e.slice(0, 300));
const missing = need.filter((k) => !res.summary[k]);
console.log(missing.length ? `\n  MISSING: ${missing.join(', ')}\n` : '\n  ALL REQUIRED BEHAVIOURS PRESENT\n');
await b.close();
process.exit(missing.length || errs.length ? 1 : 0);
