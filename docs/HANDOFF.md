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
| 7 (v18) | torso rate limit, soft IK, eased crouch, profiler split, render budget | DONE |
| 8 (v19) | exact parent-space leg IK, feet face heading, soft pole fallback, solver perf | DONE: IK miss 14 -> 0.04 cm, action slips gone, sim linear PASS |
| 9 (v20) | task-space leg limits: foot target speed 18 reach/s + knee swivel 10 rad/s (pose.ts), bone limiter -> 60 rad/s safety net, swivel forensics, dump adds HeroRenderer/terrain/emotes/props/geometry | SHIPPED, awaiting report |

## Last results (v19 watch 2fb7c42)
PIP walk slip PASS 0.14 cm, ZIK PASS 0.82 cm, MOCHI FAIL 3.62 cm / 9.4% (all 8: IK miss 0.0, post-limiter 4.9 cm => the
bone limiter itself dragged the foot). Walk joint peaks all exactly 40 = PLANT_RATE cap, knee BEND rate only 4.5-4.7 =>
knee-plane swivel about hip->foot right after landing (0.03 s), not bend. BODY gates PASS. Save/load PASS. Sim @24 11.25 ms, 3.49x PASS.
Render @24: 388 draw calls, 977k tris. NOTE: jsDelivr serves HeroRenderer.ts gzipped-garbled -> now read via watch/src pieces.

## Next
1. Read v20: walk slip x3 (MOCHI must PASS), walk joint gates, "swivel-limited" flag, straight-walk probe slip. Pedestal PASS.
   If joint still > 20 with bend low and swivel-limited false: twist from minimal-arc chain -> add hip twist continuity.
   If foot-target clamp causes late landings: raise FOOT_RATE.
2. Batch 10 = VERTICAL SLICE VISUAL PASS (read HeroRenderer/World/terrain/props pieces first): per-creature contact shadow,
   colour grading + soft bloom, wind grass, water shimmer, screen-size LOD (sphere segments, outline/glints far), frustum cull.
   Ask Ziad for ONE screenshot after.
3. Then Sim.ts split (tools / probes / save), zero behaviour change; then faces + tool juice.
