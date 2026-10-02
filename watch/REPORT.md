```
# WATCH REPORT
date 2026-10-02T10:04:29.295Z
badge build v18 · 2026-10-02 14:03

## PEDESTAL
  quat 8.88e-16 pos 0.00e+0 -> PASS

## STRAIGHT WALK PROBE (8 s each)
  PIP    slip 3.52 cm | overstretch 0/480 | speed 0.873 | freq 3 Hz
  MOCHI  slip 8.08 cm | overstretch 10/480 | speed 0.875 | freq 3 Hz
  BOP    slip 0.00 cm | overstretch 0/480 | speed 2.763 | freq 2.5 Hz
  ZIK    slip 0.25 cm | overstretch 0/480 | speed 1.128 | freq 3 Hz

## JOINT PROBE (20 s)
  PIP    40.00 rad/s on knee_r [FORCED STEP]
  MOCHI  40.00 rad/s on knee_bl [FORCED STEP]
  ZIK    40.00 rad/s on knee_mid_l [FORCED STEP]

## FREE-RUNNING WORLD (30 s, all creatures, real behaviour)
  creatures 8 | overlap frames 0/900 | closest pair 1.08x personal space
  PIP    lifts: beat 138 reach 31 strain 43 catch-up 9 | max planted IK miss 13.67 cm | crouch 6.1 cm
  MOCHI  lifts: beat 32 reach 53 strain 78 catch-up 94 | max planted IK miss 4.90 cm | crouch 1.5 cm
  BOP    lifts: beat 0 reach 0 strain 0 catch-up 0 | max planted IK miss 0.00 cm | crouch 0.0 cm
  ZIK    lifts: beat 323 reach 33 strain 36 catch-up 58 | max planted IK miss 4.46 cm | crouch 2.0 cm

## SLIP FORENSICS (stances that slid > 1 cm)
  PIP    n 39 | in action 100% | one-frame pop 100% | ended by forced lift 100% | max hip-foot/reach 0.97 | max IK miss 10.6 cm | max post-limiter miss 11.6 cm
  MOCHI  n 66 | in action 100% | one-frame pop 95% | ended by forced lift 100% | max hip-foot/reach 0.97 | max IK miss 4.9 cm | max post-limiter miss 4.9 cm
  ZIK    n 11 | in action 100% | one-frame pop 100% | ended by forced lift 100% | max hip-foot/reach 0.92 | max IK miss 4.5 cm | max post-limiter miss 9.3 cm
    PIP leg 1: slip 11.5 jump 11.5 cm | reach 0.96 | IK 10.6 post 11.6 cm | ACTION | forced
    ZIK leg 5: slip 9.3 jump 9.5 cm | reach 0.88 | IK 4.5 post 9.3 cm | ACTION | forced
    PIP leg 0: slip 5.8 jump 5.5 cm | reach 0.88 | IK 5.9 post 5.9 cm | ACTION | forced
    PIP leg 0: slip 5.3 jump 5.3 cm | reach 0.90 | IK 5.9 post 5.9 cm | ACTION | forced
    MOCHI leg 1: slip 5.0 jump 4.0 cm | reach 0.97 | IK 4.9 post 4.9 cm | ACTION | forced
    PIP leg 1: slip 4.5 jump 3.9 cm | reach 0.90 | IK 5.8 post 5.8 cm | ACTION | forced
    MOCHI leg 0: slip 4.4 jump 4.3 cm | reach 0.82 | IK 4.5 post 4.5 cm | ACTION | forced
    PIP leg 1: slip 3.5 jump 3.5 cm | reach 0.93 | IK 3.8 post 3.8 cm | ACTION | forced
  PIP    LEG joint max 40.0 rad/s on knee_r(plant) | leg frames >20: 40
  MOCHI  LEG joint max 33.5 rad/s on knee_br(plant) | leg frames >20: 24
  ZIK    LEG joint max 40.0 rad/s on knee_rear_r(plant) | leg frames >20: 16
  PIP    BODY snap max 14.0 rad/s (rendered) during 'sleep' | raw target 91.2 rad/s during 'sleep' busy false roll-over 0.00 rad
  MOCHI  BODY snap max 14.0 rad/s (rendered) during 'sleep' | raw target 90.6 rad/s during 'sleep' busy false roll-over 0.00 rad
  BOP    BODY snap max 14.0 rad/s (rendered) during 'none' | raw target 28.0 rad/s during 'none' busy false roll-over 0.00 rad
  ZIK    BODY snap max 14.0 rad/s (rendered) during 'eat' | raw target 14.0 rad/s during 'eat' busy true roll-over 0.00 rad
  PIP    WALK joint peak 27.5 on knee_l(plant) | hip-foot/reach 0.835 | IK miss 0.06 cm | since land 0.13 s | crouch step 0.71 cm | action 'eat' | lifted false | kick false
  MOCHI  WALK joint peak 33.5 on knee_br(plant) | hip-foot/reach 0.958 | IK miss 0.05 cm | since land 0.13 s | crouch step 0.04 cm | action 'play' | lifted false | kick false
  ZIK    WALK joint peak 39.5 on knee_rear_r(plant) | hip-foot/reach 0.825 | IK miss 0.00 cm | since land 0.03 s | crouch step 0.00 cm | action 'sleep' | lifted false | kick false
  PIP    stances 241 | slip avg 0.44 cm worst 11.49 cm | stances >1cm 39 | max joint 40.0 rad/s on knee_r | frames >20 rad/s 32 | moving 26%
  MOCHI  stances 321 | slip avg 0.53 cm worst 4.99 cm | stances >1cm 66 | max joint 33.5 rad/s on knee_br | frames >20 rad/s 17 | moving 29%
  BOP    stances 0 | slip avg 0.00 cm worst 0.00 cm | stances >1cm 0 | max joint 14.0 rad/s on body | frames >20 rad/s 0 | moving 25%
  ZIK    stances 494 | slip avg 0.14 cm worst 9.34 cm | stances >1cm 11 | max joint 40.0 rad/s on knee_rear_r | frames >20 rad/s 9 | moving 7%

## VERDICT
  PIP    feet SLIDE (worst 11.5 cm, 16% of steps) | knees SNAP (40 rad/s)
  MOCHI  feet SLIDE (worst 5.0 cm, 21% of steps) | knees SNAP (40 rad/s)
  BOP    feet no steps seen | knees OK
  ZIK    feet SLIDE (worst 9.3 cm, 2% of steps) | knees SNAP (40 rad/s)
  overlap NONE
  console errors 0

## SAVE / LOAD
  creatures 8 | save 4737 bytes | reload identical true

## SIM COST (CPU only, no render)
  8 creatures 2.87 ms/step | 24 creatures 13.55 ms/step | 0.565 ms per creature
  breakdown @24: brain 1.28 | motion+anim 5.50 | leg solve 6.14 | other 0.63 ms/step
  motion+anim split: preAnimate 1.02 | HeroAnimator 0.32 | postAnimate 1.64 | rest of Agent 2.51 ms/step

## RENDER BUDGET (one frame, home camera; counts matter, not ms)
  24 creatures | draw calls 388 | triangles 977100 | geometries 376 | textures 34 | shader programs 17

## GATES
  PASS  PIP WALK worst slip <= 2 cm    0.15 cm (179 walk steps)
  PASS  PIP WALK steps >1 cm <= 2%     0.0%
  FAIL  PIP WALK leg joint <= 20 rad/s 27.5 on knee_l(plant)
  WARN  PIP in actions                 worst 11.5 cm | 16.2% steps | leg joint 40.0 | body 14 rad/s 'sleep'
  PASS  MOCHI WALK worst slip <= 2 cm  0.14 cm (93 walk steps)
  PASS  MOCHI WALK steps >1 cm <= 2%   0.0%
  FAIL  MOCHI WALK leg joint <= 20 rad/s 33.5 on knee_br(plant)
  WARN  MOCHI in actions               worst 5.0 cm | 20.6% steps | leg joint 33.5 | body 14 rad/s 'sleep'
  PASS  ZIK WALK worst slip <= 2 cm    0.38 cm (351 walk steps)
  PASS  ZIK WALK steps >1 cm <= 2%     0.0%
  FAIL  ZIK WALK leg joint <= 20 rad/s 39.5 on knee_rear_r(plant)
  WARN  ZIK in actions                 worst 9.3 cm | 2.2% steps | leg joint 40.0 | body 14 rad/s 'eat'
  PASS  PIP BODY snap <= 20 rad/s      14.0 during 'sleep'
  PASS  MOCHI BODY snap <= 20 rad/s    14.0 during 'sleep'
  PASS  BOP BODY snap <= 20 rad/s      14.0 during 'none'
  PASS  ZIK BODY snap <= 20 rad/s      14.0 during 'eat'
  PASS  overlap frames = 0             0
  PASS  console errors = 0             0
  PASS  save/load identical            yes
  FAIL  sim cost scales linearly       4.72x for 3x creatures
```
