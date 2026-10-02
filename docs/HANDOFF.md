# HANDOFF: read this first in every new chat
Repo: https://github.com/ziadjbt78/goobers (public). Owner: Ziad (digital marketer, not a coder).
Goal: premium stylized creature sim/game in the browser (Vite + TS + Three.js + React/Zustand).

## How we work (agreed pipeline)
1. Claude writes ONE large batch as a single bash + python block. It is atomic: every
   patch target is checked first and NO file is written unless all of them match.
2. Ziad pastes it. The block ends with: ./ship.sh "msg" && ./dump.sh && ./watch.sh
3. Ziad sends back ONLY the line "WATCH SHA: <sha>".
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
| infra | GitHub repo, ship.sh, watch.sh (headless playtest), dump.sh (source pieces) | DONE |
| fixes | dust-ring fade, sim substep cap (38 -> 57 fps @ 12), night outline/rim dimming | DONE |
| 1 | World locomotion: legs solve LAST (Agent -> HeroAnimator.solveWorldLegs), edge-triggered stepper, live world reach, lock-where-landed, crowd hard-resolve, watch GATES, docs/ROADMAP.md, build v12 | SHIPPED, waiting for watch gates |

## Last results (watch f749997, before Batch 1)
Feet slide on PIP/MOCHI/ZIK (worst 16-22 cm), knees snap (84-118 rad/s), overlap 87/900 frames, 0 errors, pedestal PASS.
Root cause: World IK solved BEFORE postAnimate moved the root and Agent applied body juice.

## Next
1. Confirm Batch 1 gates. Fold any remaining failures into Batch 2.
2. Batch 2 (Foundation): split Sim.ts (~47 KB) into systems, save/load, seeded world,
   distance LOD (far creatures tick slower, no IK), perf gate 60 fps @ 12.
3. Then Batches 3-6 per docs/ROADMAP.md, ending at the vertical slice.
