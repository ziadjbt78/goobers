```
# WATCH REPORT
date 2026-10-02T10:29:27.569Z
badge build v19 · 2026-10-02 14:28

## PEDESTAL
  quat 8.88e-16 pos 0.00e+0 -> PASS

## STRAIGHT WALK PROBE (8 s each)
  PIP    slip 3.66 cm | overstretch 0/480 | speed 0.873 | freq 3 Hz
  MOCHI  slip 11.15 cm | overstretch 7/480 | speed 0.875 | freq 3 Hz
  BOP    slip 0.00 cm | overstretch 0/480 | speed 2.763 | freq 2.5 Hz
  ZIK    slip 5.45 cm | overstretch 0/480 | speed 1.128 | freq 3 Hz

## JOINT PROBE (20 s)
  PIP    40.00 rad/s on knee_r [FORCED STEP]
  MOCHI  38.76 rad/s on knee_bl [FORCED STEP]
  ZIK    40.00 rad/s on knee_rear_l [FORCED STEP]

## FREE-RUNNING WORLD (30 s, all creatures, real behaviour)
  creatures 8 | overlap frames 0/900 | closest pair 1.08x personal space
  PIP    lifts: beat 140 reach 28 strain 0 catch-up 13 | max planted IK miss 0.04 cm | crouch 6.5 cm
  MOCHI  lifts: beat 31 reach 64 strain 1 catch-up 105 | max planted IK miss 1.23 cm | crouch 2.1 cm
  BOP    lifts: beat 0 reach 0 strain 0 catch-up 0 | max planted IK miss 0.00 cm | crouch 0.0 cm
  ZIK    lifts: beat 324 reach 32 strain 17 catch-up 57 | max planted IK miss 1.96 cm | crouch 1.9 cm

## SLIP FORENSICS (stances that slid > 1 cm)
  PIP    none
  MOCHI  n 8 | in action 0% | one-frame pop 100% | ended by forced lift 13% | max hip-foot/reach 0.82 | max IK miss 0.0 cm | max post-limiter miss 4.9 cm
  ZIK    n 1 | in action 100% | one-frame pop 100% | ended by forced lift 100% | max hip-foot/reach 0.95 | max IK miss 1.8 cm | max post-limiter miss 1.8 cm
    MOCHI leg 2: slip 3.6 jump 3.6 cm | reach 0.49 | IK 0.0 post 4.9 cm | walk | beat
    MOCHI leg 0: slip 3.2 jump 3.2 cm | reach 0.82 | IK 0.0 post 4.3 cm | walk | forced
    MOCHI leg 2: slip 3.0 jump 3.0 cm | reach 0.76 | IK 0.0 post 3.1 cm | walk | beat
    MOCHI leg 1: slip 2.9 jump 3.9 cm | reach 0.74 | IK 0.0 post 4.1 cm | walk | beat
    MOCHI leg 2: slip 1.8 jump 1.9 cm | reach 0.67 | IK 0.0 post 2.2 cm | walk | beat
    MOCHI leg 2: slip 1.7 jump 1.7 cm | reach 0.72 | IK 0.0 post 1.9 cm | walk | beat
    MOCHI leg 0: slip 1.4 jump 1.4 cm | reach 0.78 | IK 0.0 post 2.3 cm | walk | beat
    MOCHI leg 1: slip 1.3 jump 1.3 cm | reach 0.64 | IK 0.0 post 1.4 cm | walk | beat
  PIP    LEG joint max 28.9 rad/s on knee_l(plant) | leg frames >20: 31
  MOCHI  LEG joint max 40.0 rad/s on knee_bl(plant) | leg frames >20: 105
  ZIK    LEG joint max 40.0 rad/s on knee_front_r(plant) | leg frames >20: 18
  PIP    BODY snap max 14.0 rad/s (rendered) during 'eat' | raw target 91.2 rad/s during 'sleep' busy false roll-over 0.00 rad
  MOCHI  BODY snap max 14.0 rad/s (rendered) during 'sleep' | raw target 90.6 rad/s during 'sleep' busy false roll-over 0.00 rad
  BOP    BODY snap max 14.0 rad/s (rendered) during 'none' | raw target 28.0 rad/s during 'none' busy false roll-over 0.00 rad
  ZIK    BODY snap max 14.0 rad/s (rendered) during 'eat' | raw target 14.0 rad/s during 'eat' busy true roll-over 0.00 rad
  PIP    WALK joint peak 28.9 on knee_l(plant) | hip-foot/reach 0.873 | IK miss 0.00 cm | since land 0.23 s | crouch step 0.66 cm | action 'eat' | lifted false | kick false | knee BEND rate 27.8 rad/s (rest of peak = twist) | pole fallback false
  MOCHI  WALK joint peak 40.0 on knee_bl(plant) | hip-foot/reach 0.523 | IK miss 0.00 cm | since land 0.03 s | crouch step 0.98 cm | action 'sleep' | lifted false | kick false | knee BEND rate 4.5 rad/s (rest of peak = twist) | pole fallback false
  ZIK    WALK joint peak 40.0 on knee_front_r(plant) | hip-foot/reach 0.733 | IK miss 0.00 cm | since land 0.03 s | crouch step 0.21 cm | action 'eat' | lifted false | kick false | knee BEND rate 4.7 rad/s (rest of peak = twist) | pole fallback false
  PIP    stances 208 | slip avg 0.00 cm worst 0.14 cm | stances >1cm 0 | max joint 28.9 rad/s on knee_l | frames >20 rad/s 29 | moving 26%
  MOCHI  stances 265 | slip avg 0.08 cm worst 3.62 cm | stances >1cm 8 | max joint 40.0 rad/s on knee_bl | frames >20 rad/s 53 | moving 29%
  BOP    stances 0 | slip avg 0.00 cm worst 0.00 cm | stances >1cm 0 | max joint 14.0 rad/s on body | frames >20 rad/s 0 | moving 25%
  ZIK    stances 473 | slip avg 0.05 cm worst 1.02 cm | stances >1cm 1 | max joint 40.0 rad/s on knee_front_r | frames >20 rad/s 9 | moving 7%

## VERDICT
  PIP    feet STAY PUT | knees SNAP (40 rad/s)
  MOCHI  feet SLIDE (worst 3.6 cm, 3% of steps) | knees SNAP (40 rad/s)
  BOP    feet no steps seen | knees OK
  ZIK    feet SLIDE (worst 1.0 cm, 0% of steps) | knees SNAP (40 rad/s)
  overlap NONE
  console errors 0

## SAVE / LOAD
  creatures 8 | save 4737 bytes | reload identical true

## SIM COST (CPU only, no render)
  8 creatures 3.23 ms/step | 24 creatures 11.25 ms/step | 0.469 ms per creature
  breakdown @24: brain 1.14 | motion+anim 5.34 | leg solve 4.11 | other 0.65 ms/step
  motion+anim split: preAnimate 1.12 | HeroAnimator 0.30 | postAnimate 1.65 | rest of Agent 2.28 ms/step

## RENDER BUDGET (one frame, home camera; counts matter, not ms)
  24 creatures | draw calls 388 | triangles 977100 | geometries 376 | textures 34 | shader programs 17

## GATES
  PASS  PIP WALK worst slip <= 2 cm    0.14 cm (172 walk steps)
  PASS  PIP WALK steps >1 cm <= 2%     0.0%
  FAIL  PIP WALK leg joint <= 20 rad/s 28.9 on knee_l(plant)
  WARN  PIP in actions                 worst 0.1 cm | 0.0% steps | leg joint 28.9 | body 14 rad/s 'eat'
  FAIL  MOCHI WALK worst slip <= 2 cm  3.62 cm (85 walk steps)
  FAIL  MOCHI WALK steps >1 cm <= 2%   9.4%
  FAIL  MOCHI WALK leg joint <= 20 rad/s 40.0 on knee_bl(plant)
  WARN  MOCHI in actions               worst 3.6 cm | 3.0% steps | leg joint 40.0 | body 14 rad/s 'sleep'
  PASS  ZIK WALK worst slip <= 2 cm    0.82 cm (348 walk steps)
  PASS  ZIK WALK steps >1 cm <= 2%     0.0%
  FAIL  ZIK WALK leg joint <= 20 rad/s 40.0 on knee_front_r(plant)
  WARN  ZIK in actions                 worst 1.0 cm | 0.2% steps | leg joint 40.0 | body 14 rad/s 'eat'
  PASS  PIP BODY snap <= 20 rad/s      14.0 during 'eat'
  PASS  MOCHI BODY snap <= 20 rad/s    14.0 during 'sleep'
  PASS  BOP BODY snap <= 20 rad/s      14.0 during 'none'
  PASS  ZIK BODY snap <= 20 rad/s      14.0 during 'eat'
  PASS  overlap frames = 0             0
  PASS  console errors = 0             0
  PASS  save/load identical            yes
  PASS  sim cost scales linearly       3.49x for 3x creatures
```
