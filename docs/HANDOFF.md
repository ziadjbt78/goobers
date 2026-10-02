# HANDOFF: read this first in every new chat
Repo: https://github.com/ziadjbt78/goobers (public). Owner: Ziad (digital marketer, not a coder).
Goal: premium stylized creature sim/game in the browser (Vite + TS + Three.js + React/Zustand).

## How we work (agreed pipeline)
1. Claude writes ONE large batch as a single bash + python block. It is atomic: every
   patch target is checked first and NO file is written unless all of them match.
2. Ziad pastes it. The block ends with: ./ship.sh "msg" && ./watch.sh && ./dump.sh
3. Ziad sends back ONLY the last line "DUMP SHA: <sha>" (that commit holds report + source pieces).
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
| fixes | dust-ring fade, substep cap (38 -> 57 fps @ 12), night outline/rim dimming | DONE |
| 1 (v12) | legs solve LAST (Agent -> HeroAnimator.solveWorldLegs), edge-triggered stepper, crowd hard-resolve, gates | SHIPPED: overlap fixed (0), slip/joint gates FAIL |
| 2 (v13) | crouch, closed-loop IK, strain lift, planted rate cap, lift-cause diagnostics | SHIPPED 2026-10-02 09:19, awaiting gates |

## Last results (v12 watch e8fa96d)
Overlap 0, errors 0, pedestal PASS. Slip worst PIP 22 / MOCHI 32 / ZIK 9.5 cm (35-56% of steps > 1 cm).
Joint PIP 188 hip_r, MOCHI 127 knee_br, ZIK 82 knee_mid_r rad/s. Overstretch MOCHI 388/480 frames.
Diagnosis: hips sit ~full leg length above ground (plus bob) -> no stance room; squash shears IK aim; straight legs flip branch.

## Next
1. Read v13 gates + lift-cause line. If slip still fails, the lift causes say which guard is wrong.
2. Foundation batch: split Sim.ts (~47 KB) into systems, save/load, seeded world, distance LOD, perf gate 60 fps @ 12.
3. Then visual / feel / tools / slice batches per docs/ROADMAP.md.
