# GOOBERS — Project Rules (read every session)

## Stack
Vite + TypeScript + Three.js + React. Single WebGL canvas. No external 3D assets,
textures or animation clips: everything is procedural code.

## Locked (do not change unless the user explicitly says so)
- Creature visual style: shapes, faces, palettes, materials, outlines.
- Heroes PIP / MOCHI / BOP / ZIK, and ZIK's look, size, legs and animation.
- Camera and zoom defaults.
- Heroes pedestal animation path: poseIdentity regression must stay at 0 diff.
- src/engine/motion/{util,Locomotion,Juice,Face,Choreo,Dangle,CreatureMotion}.ts:
  only LocoConfig values and axes signs may change.
- Do not resurrect deleted code: render/sdf/, render/bakedSkinned/, toy/,
  engine/anatomy/, ui/debug/, core/Creature.ts, core/rng.ts, anim/springs.ts.

## Architecture
- Per fixed step: brain -> desired velocity -> motion.preAnimate ->
  HeroAnimator.update -> motion.postAnimate.
- HeroAnimator is the only code that writes bones.
- Juice goes on the body bone (above leg roots), never the pivot.
- Agent only computes desired velocity; it owns no position, heading or bone.

## Gates
- Foot slip <= 1 cm per stance. Overstretch frames = 0.
- Joint rate <= 20 rad/s (WARNING, always report the number and bone).
- Heading rate per species <= turnRate x 1.05.
- Walk 1.8-2.4 Hz, run 2.8-3.5 Hz.
- 0 console errors. Target 60 fps desktop with 12 creatures.

## Workflow
- Every change ends with ./ship.sh "message" (builds, commits, pushes).
- Bump the badge "build vN · <date time>" in src/engine/core/build.ts and add
  "What's new" on each delivery. Keep PROGRESS.md current.
- Motion must read instantly: anticipation, 15-30% squash and stretch,
  overshoot, follow-through.
