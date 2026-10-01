/**
 * HEREDITY SWEEP — the zoo's gate, headless.
 *
 *   npx esbuild tools/zooTest.ts --bundle --platform=node --format=esm \
 *     --outfile=/tmp/zooTest.mjs && node /tmp/zooTest.mjs [count]
 *
 * Every genome the breeder can produce must build a rig that passes the
 * art-direction rules. If one seed in a thousand violates a rule, the rules
 * are wrong or the gene range is too wide, and this fails the build.
 */
import { buildHeroTemplate } from '../src/engine/hero/heroes';
import { applyDNA } from '../src/engine/hero/reshape';
import { validateTemplate } from '../src/engine/hero/validate';
import { scoreAppeal } from '../src/engine/hero/appeal';
import { mulberry32, randomDNA, mutate, litter, dnaKey } from '../src/engine/hero/dna';
import { hexToLinear, paletteAt } from '../src/engine/hero/palette';
import { HERO_IDS } from '../src/engine/hero/types';

const perHero = Number(process.argv[2] ?? 250);
// builders take LINEAR triples; the palettes are hex
const toColors = (i: number) => {
  const p = paletteAt(i);
  return {
    base: hexToLinear(p.base), belly: hexToLinear(p.belly), limb: hexToLinear(p.limb),
    accent: hexToLinear(p.accent), deep: hexToLinear(p.deep),
  };
};

let built = 0;
let invalid = 0;
const scores: number[] = [];
const failureCounts = new Map<string, number>();
const failureParts = new Map<string, Set<string>>();
const perHeroScore = new Map<string, number[]>();
let worst: { key: string; failures: string[] } | null = null;

function rule(canonical: string): string {
  return canonical.replace(/^\S+ /, '').replace(/\(.*\)$/, '').replace(/\s+$/, '');
}

function run(heroIndex: number, dna: ReturnType<typeof randomDNA>): void {
  const t = applyDNA(buildHeroTemplate(dna.hero, toColors(dna.palette)), dna);
  const v = validateTemplate(t);
  const a = scoreAppeal(t, v, paletteAt(dna.palette));
  built++;
  scores.push(a.score);
  const arr = perHeroScore.get(dna.hero) ?? [];
  arr.push(a.score);
  perHeroScore.set(dna.hero, arr);
  if (!v.ok) {
    invalid++;
    for (const f of v.failures) {
      const r = rule(f);
      failureCounts.set(r, (failureCounts.get(r) ?? 0) + 1);
      const set = failureParts.get(r) ?? new Set<string>();
      set.add(`${dna.hero}:${f.split(' ')[0]}`);
      failureParts.set(r, set);
    }
    if (!worst || v.failures.length > worst.failures.length) worst = { key: dnaKey(dna), failures: v.failures };
  }
  void heroIndex;
}

// random genomes
for (const hero of HERO_IDS) {
  const rng = mulberry32(0xbeef ^ hero.length * 7919);
  const idx = HERO_IDS.indexOf(hero);
  for (let i = 0; i < perHero; i++) run(idx, randomDNA(rng, hero));
}
// bred genomes: three generations of drift, to prove the path stays legal
{
  const rng = mulberry32(0x51ee);
  let pop = litter(0x51ee);
  for (let gen = 0; gen < 3; gen++) {
    pop = pop.map((d) => mutate(d, rng, 1));
    for (const d of pop) run(HERO_IDS.indexOf(d.hero), d);
  }
}
// corners of the gene space: every gene pinned to both extremes
{
  const rng = mulberry32(0xc0de);
  for (const hero of HERO_IDS) {
    for (let mask = 0; mask < 32; mask++) {
      const base = randomDNA(rng, hero);
      const lo = [0.86, 0.90, 0.92, 1.0, 0.95];
      const hi = [1.18, 1.14, 1.10, 1.12, 1.07];
      const v = [base.scale, base.headSize, base.eyeSize, base.legLen, base.girth];
      const keys = ['scale', 'headSize', 'eyeSize', 'legLen', 'girth'] as const;
      keys.forEach((k, i) => { v[i] = (mask >> i) & 1 ? hi[i] : lo[i]; });
      run(HERO_IDS.indexOf(hero), {
        ...base, scale: v[0], headSize: v[1], eyeSize: v[2], legLen: v[3], girth: v[4],
        earStyle: mask % 3, tailStyle: (mask >> 1) % 3, antStyle: (mask >> 2) % 3,
      });
    }
  }
}

const mean = scores.reduce((a, b) => a + b, 0) / Math.max(1, scores.length);
const sorted = [...scores].sort((a, b) => a - b);
const pct = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];

console.log(`\n  genomes built: ${built}`);
console.log(`  invalid rigs : ${invalid}`);
console.log(`  appeal       : mean ${mean.toFixed(1)}  p10 ${pct(0.1).toFixed(1)}  p50 ${pct(0.5).toFixed(1)}  p90 ${pct(0.9).toFixed(1)}  max ${pct(1).toFixed(1)}`);
for (const hero of HERO_IDS) {
  const arr = perHeroScore.get(hero) ?? [];
  const m = arr.reduce((a, b) => a + b, 0) / Math.max(1, arr.length);
  console.log(`    ${hero.padEnd(6)} n=${String(arr.length).padStart(4)}  mean appeal ${m.toFixed(1)}`);
}
if (failureCounts.size) {
  console.log('\n  rule violations:');
  for (const [k, n] of [...failureCounts.entries()].sort((a, b) => b[1] - a[1])) {
    const who = [...(failureParts.get(k) ?? [])].slice(0, 8).join(' ');
    console.log(`    ${String(n).padStart(5)}x  ${k}\n            ${who}`);
  }
  if (worst) console.log(`\n  worst genome: ${worst.key}\n    ` + worst.failures.slice(0, 6).join('\n    '));
}
console.log(invalid === 0 ? '\n  PASS — every genome in the space is a valid creature\n' : '\n  FAIL\n');
process.exit(invalid === 0 ? 0 : 1);
