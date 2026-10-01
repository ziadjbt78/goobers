import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--use-gl=angle','--disable-dev-shm-usage','--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 640, height: 400 } });
await p.goto('http://127.0.0.1:8137/', { waitUntil: 'load', timeout: 180000 });
await p.waitForFunction('window.__READY === true && !!window.__lab', null, { timeout: 180000 });
console.log('BADGE TEXT:', await p.evaluate(() => document.querySelector('.gs-build-badge')?.textContent ?? 'NO BADGE'));
await p.screenshot({ path: 'verify/v9/badge.png' });
await b.close();
