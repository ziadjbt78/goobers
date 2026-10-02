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
| infra | repo, ship.sh, watch.sh (headless playtest), dump.sh (source pieces + SEND THIS line) | DONE |
| fixes | dust-ring fade, substep cap (38 -> 57 fps @ 12), night outline/rim dimming | DONE |
| 1 (v12) | legs solve LAST (Agent -> HeroAnimator.solveWorldLegs), edge-triggered stepper, crowd hard-resolve | overlap FIXED |
| 2 (v13) | crouch, closed-loop IK, strain lift, planted rate cap 40 | overstretch FIXED, avg slip ~1 cm |
| 3 (v14) | jump-aware free feet, leg-only joint gate, SLIP FORENSICS | walk clean; 97-100% of slips are in ACTIONS |
| 4 (v15) | eased free legs, swing-in relaunch, hop hysteresis, kick=airborne, body-space pole | SHIPPED 2026-10-02 13:29, awaiting report |

## Last results (v14 watch b6e6312)
ZIK straight walk slip 0.18 cm (PASS level). Free-run >1 cm steps PIP 24 / MOCHI 18 / ZIK 4.6 %, ALL during actions,
one-frame pops. Leg joint 63 / 94 / 87 rad/s on hips (planted). Joint probe 185 rad/s = free-mode hip snap.

## Next
1. Read v15 gates. If action slips remain, read the SLIP FORENSICS top-8 list and fix the specific action.
2. FOUNDATION batch (next, regardless of minor outliers): read Sim_00..04 in full, split Sim.ts into systems,
   save/load, seeded world, distance LOD, 60 fps @ 12 gate.
3. Then visual / feel / tools / slice per docs/ROADMAP.md and the NORTH STAR above.
