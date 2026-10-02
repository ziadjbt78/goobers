# NORTH STAR (permanent, never delete)
We are building GOOBERS: a browser (Three.js) procedural creature sim + game + generator.
Target: AAA polish and FEEL at premium stylized indie quality (not console-AAA fidelity).
Method: layers of polish in large atomic batches, never one mega-prompt.

Phases, in order:
1. FOUNDATION: clean ECS-style creature update, perf budget (60 fps @ 12+), save/load,
   automated visual + motion tests (watch.sh gates), consider the Three.js WebGPU renderer.
2. VERTICAL SLICE: one gorgeous biome, 8 species, full faces/expressions, all tools with
   juicy reactions, procedural audio. Must feel FINISHED.
3. BREADTH: 16+ families (flyers, swimmers, crawlers), Studio with real impact,
   gallery-style generator, breeding + genetics.
4. WORLDS: streamed procedural world, multiple islands/biomes, weather, day/night, habitats.
5. GAME LAYER: progression, Creaturedex, goals/quests, unlockable tools/biomes, photo mode, sharing.

# HANDOFF: read this first in every new chat
Repo: https://github.com/ziadjbt78/goobers (public). Owner: Ziad (digital marketer, not a coder).
Goal: premium stylized creature sim/game in the browser (Vite + TS + Three.js + React/Zustand).

## How we work (agreed pipeline)
1. Claude writes ONE large batch as a single bash + python block. It is atomic: every
   patch target is checked first and NO file is written unless all of them match.
2. Ziad pastes it. The block ends with: ./ship.sh "msg" && ./watch.sh && ./dump.sh
3. Ziad sends back ONLY the last printed line: "SEND THIS: Repo ziadjbt78/goobers, read docs/HANDOFF.md, SHA <sha>".
   Same message in a new chat or the same chat. That SHA holds code + REPORT.md + source pieces.
4. Claude reads, at that SHA:
   - watch/REPORT.md : automated headless playtest (slip, joint rate, overlap, errors, GATES)
   - watch/src/*.txt : big source files split into 250-line numbered pieces (full code)
   - watch/*.png     : foot-dot frame sheets (Claude may not be able to open these; ask Ziad to upload one only if needed)
5. Claude cannot watch videos. Do not ask Ziad for recordings, crops or manual tests.
   Only ask for a screenshot or sheet on visual batches, and at most one per batch.

## Reading the repo (fetch-tool limits)
- Use https://cdn.jsdelivr.net/gh/ziadjbt78/goobers@<SHA>/<path>  (raw.githubusercontent often fails on gzip)
- Files over ~10 KB get truncated: read watch/src/<File>_NN.txt pieces instead.
- Commit list: https://api.github.com/repos/ziadjbt78/goobers/commits?per_page=5
- Never write a patch against code you have not read in full at the current SHA.

## Locked rules
- src/engine/motion/* (7 motion files): only LocoConfig values and axes signs may change.
- Pedestal (Heroes) path: zero regression (watch PEDESTAL must PASS).
- Creature style, ZIK look and camera/zoom are locked unless Ziad approves a change.
- Every batch bumps BUILD_NUMBER/BUILD_STAMP in src/engine/core/build.ts and appends to PROGRESS.md.
- Every batch updates THIS file: Status, Last results, Next.

## Targets / gates
Foot slip <= 1 cm per stance (gate: worst <= 2 cm, <= 2% of steps > 1 cm); joint <= 20 rad/s;
walk 1.8-2.4 Hz, run 2.8-3.5 Hz; overlap frames 0; console errors 0; 60 fps with 12 creatures.

## Ziad's preferences
Big batches covering as much ground as possible, not small fixes. Minimal work on his side.
Direct answers, no filler. English only.

## Status
| Batch | Scope | State |
|---|---|---|
| infra | repo, ship.sh, watch.sh, dump.sh (+ SEND THIS line) | DONE |
| fixes | dust-ring fade, substep cap (38 -> 57 fps @ 12), night outline/rim dimming | DONE |
| 1-5 (v12-v16) | locomotion rebuild, crowd, save/load, brain LOD | DONE |
| 6 (v17) | procedural audio, exact save reload, walk-only gates, profiler | DONE |
| 7 (v18) | torso rate limit, soft IK, eased crouch, profiler split, render budget | DONE: BODY gates PASS x4, walk slip PASS x3 |
| 8 (v19) | EXACT parent-space leg IK (pose.ts/ik.ts, World path only), feet face heading, continuous pole fallback, solver perf, bend-vs-twist forensics, dump adds watch.mjs/Stage/World/materials | SHIPPED, awaiting report |

## Last results (v18 watch 3e77c5b)
WALK slip PASS (worst 0.38 cm). BODY snap PASS (14 rad/s; raw 91 'sleep'). WALK leg joint FAIL: PIP 27.5, MOCHI 33.5, ZIK 39.5,
all planted, NOT straight (reach 0.83-0.96), 0.03-0.13 s after landing. Diagnosis: legacy aim used world-frame minimal arcs
(twist pops; ZIK splayed legs flip at some headings) and ignored body squash (IK miss in actions). Also ankles were world-locked
(feet always faced world +Z). Sim @24 13.55 ms, 4.72x for 3x (FAIL). Render @24: 388 draw calls, 977k tris (~40k/creature, eyes ~15k).

## Next
1. Read v19: WALK joint gates + "knee BEND rate" (bend low => remaining peak is twist on round limbs), pole fallback,
   action slip IK miss (should collapse), sim cost scaling. Pedestal must still PASS.
2. Batch 9 = VERTICAL SLICE VISUAL PASS (read Stage/World/materials/watch.mjs pieces from watch/src first): contact shadows,
   grading/tonemap, soft bloom, wind grass, water; per-creature frustum cull + screen-size LOD (eye segments, outline far);
   ask Ziad for ONE screenshot.
3. Then Sim.ts split (tools / probes / save), zero behaviour change; then faces + tool juice.
