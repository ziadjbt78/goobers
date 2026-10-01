/**
 * Visual verification loop. Headless Chromium under SwiftShader, frozen time,
 * UI hidden, one PNG per view per hero plus a combined contact sheet.
 *
 *   node tools/shoot.mjs http://127.0.0.1:8123/ verify
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const BASE = process.argv[2] ?? 'http://127.0.0.1:8137/';
const OUT = process.argv[3] ?? 'verify';
const HEROES = ['pip', 'mochi', 'bop', 'zik'];

interface Shot { hero: string; view: string; file: string }
const shots: Shot[] = [];

function url(params: Record<string, string | number>): string {
  const q = new URLSearchParams(
    Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
  );
  return `${BASE}?${q.toString()}`;
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    args: [
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
      '--use-gl=angle',
      '--disable-dev-shm-usage',
      '--no-sandbox',
    ],
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });

  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));

  async function shoot(name: string, hero: string, params: Record<string, string | number>): Promise<void> {
    await page.goto(url({ heroes: 1, freeze: 1, t: 1.4, gait: 0.5, ...params }), { waitUntil: 'load', timeout: Number(process.env.NAV_MS ?? 90000) });
    await page.waitForFunction('window.__READY === true', null, { timeout: Number(process.env.WAIT_MS ?? 90000) });
    // the shell menu is chrome, not creature: hide it so these shots stay
    // comparable with the locked baseline
    await page.evaluate(() => { document.querySelectorAll('.sh-menu').forEach(function (el) { el.style.display = 'none'; }); });
    await page.waitForTimeout(250);
    const file = `${OUT}/${hero}/${name}.png`;
    mkdirSync(`${OUT}/${hero}`, { recursive: true });
    await page.screenshot({ path: file, animations: 'disabled' });
    shots.push({ hero, view: name, file });
    const info = await page.evaluate('window.__lab ? { programs: window.__lab.stage.renderer.info.programs.length, ms: window.__lab.setupMs } : null');
    process.stdout.write(`  ${file}  ${JSON.stringify(info)}\n`);
  }

  for (const h of HEROES) {
    await shoot('01_three', h, { view: h, cam: 'three' });
    await shoot('02_front', h, { view: h, cam: 'front' });
    await shoot('03_side', h, { view: h, cam: 'side' });
    await shoot('04_face', h, { view: h, cam: 'face' });
    for (let i = 0; i < 4; i++) {
      await shoot(`0${5 + i}_gait${i}`, h, { view: h, cam: 'three', t: 1.35 + i * 0.25 });
    }
  }
  await shoot('00_group', 'all', {});

  await browser.close();
  writeFileSync(`${OUT}/shots.json`, JSON.stringify({ shots, errors }, null, 2));

  // ---- contact sheet -------------------------------------------------------
  try {
    execSync(
      `montage ${shots.filter((s) => !s.view.includes('gait')).map((s) => s.file).join(' ')} -tile 4x -geometry 640x360+4+4 -background '#101423' ${OUT}/sheet.png`,
      { stdio: 'inherit' },
    );
  } catch {
    try {
      execSync(`ffmpeg -y -pattern_type glob -i '${OUT}/*.png' -vf "scale=480:-1,tile=3x4" ${OUT}/sheet.png`, { stdio: 'inherit' });
    } catch { process.stdout.write('  (no montage/ffmpeg: contact sheet skipped)\n'); }
  }

  process.stdout.write(`\n  console errors: ${errors.length}\n`);
  for (const e of errors.slice(0, 6)) process.stdout.write('   ' + e.slice(0, 300) + '\n');
}

void main();
