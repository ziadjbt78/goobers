```
# WATCH REPORT
date 2026-10-02T09:50:16.304Z
badge build v17 · 2026-10-02 13:49

## PEDESTAL
  quat 8.88e-16 pos 0.00e+0 -> PASS

## STRAIGHT WALK PROBE (8 s each)
  PIP    slip 1.36 cm | overstretch 7/480 | speed 0.873 | freq 3 Hz
  MOCHI  slip 8.84 cm | overstretch 24/480 | speed 0.875 | freq 3 Hz
  BOP    slip 0.00 cm | overstretch 0/480 | speed 2.763 | freq 2.5 Hz
  ZIK    slip 0.23 cm | overstretch 0/480 | speed 1.128 | freq 3 Hz

## JOINT PROBE (20 s)
  PIP    40.00 rad/s on hip_r [FORCED STEP]
  MOCHI  40.00 rad/s on knee_bl [FORCED STEP]
  ZIK    40.00 rad/s on knee_mid_l [FORCED STEP]

## FREE-RUNNING WORLD (30 s, all creatures, real behaviour)
  creatures 8 | overlap frames 0/900 | closest pair 1.08x personal space
  PIP    lifts: beat 155 reach 17 strain 64 catch-up 12 | max planted IK miss 14.48 cm | crouch 6.5 cm
  MOCHI  lifts: beat 68 reach 49 strain 70 catch-up 98 | max planted IK miss 9.25 cm | crouch 2.6 cm
  BOP    lifts: beat 0 reach 0 strain 0 catch-up 0 | max planted IK miss 0.00 cm | crouch 0.0 cm
  ZIK    lifts: beat 324 reach 30 strain 39 catch-up 56 | max planted IK miss 2.39 cm | crouch 2.0 cm

## SLIP FORENSICS (stances that slid > 1 cm)
  PIP    n 56 | in action 100% | one-frame pop 100% | ended by forced lift 100% | max hip-foot/reach 1.00 | max IK miss 14.5 cm | max post-limiter miss 14.5 cm
  MOCHI  n 53 | in action 100% | one-frame pop 96% | ended by forced lift 100% | max hip-foot/reach 0.96 | max IK miss 9.3 cm | max post-limiter miss 9.3 cm
  ZIK    n 8 | in action 100% | one-frame pop 88% | ended by forced lift 100% | max hip-foot/reach 0.94 | max IK miss 1.8 cm | max post-limiter miss 1.8 cm
    PIP leg 0: slip 14.3 jump 14.3 cm | reach 1.00 | IK 14.5 post 14.5 cm | ACTION | forced
    PIP leg 1: slip 12.1 jump 12.1 cm | reach 0.93 | IK 12.5 post 12.5 cm | ACTION | forced
    PIP leg 0: slip 11.8 jump 11.8 cm | reach 0.86 | IK 12.2 post 12.2 cm | ACTION | forced
    MOCHI leg 0: slip 8.9 jump 8.9 cm | reach 0.95 | IK 9.3 post 9.3 cm | ACTION | forced
    PIP leg 1: slip 8.8 jump 8.8 cm | reach 0.90 | IK 8.8 post 8.8 cm | ACTION | forced
    PIP leg 1: slip 8.0 jump 8.0 cm | reach 0.90 | IK 8.1 post 8.1 cm | ACTION | forced
    MOCHI leg 3: slip 7.3 jump 7.3 cm | reach 0.76 | IK 7.8 post 7.8 cm | ACTION | forced
    PIP leg 0: slip 5.8 jump 5.8 cm | reach 0.83 | IK 7.6 post 7.6 cm | ACTION | forced
  PIP    LEG joint max 36.1 rad/s on knee_l(plant) | leg frames >20: 40
  MOCHI  LEG joint max 36.2 rad/s on knee_br(plant) | leg frames >20: 50
  ZIK    LEG joint max 29.1 rad/s on knee_front_l(plant) | leg frames >20: 11
  PIP    BODY snap max 91.1 rad/s during action 'sleep'
  MOCHI  BODY snap max 48.9 rad/s during action 'sleep'
  BOP    BODY snap max 28.0 rad/s during action 'none'
  ZIK    BODY snap max 14.0 rad/s during action 'eat'
  PIP    stances 266 | slip avg 0.71 cm worst 14.28 cm | stances >1cm 56 | max joint 91.1 rad/s on body | frames >20 rad/s 37 | moving 27%
  MOCHI  stances 347 | slip avg 0.46 cm worst 8.85 cm | stances >1cm 53 | max joint 48.9 rad/s on body | frames >20 rad/s 34 | moving 32%
  BOP    stances 0 | slip avg 0.00 cm worst 0.00 cm | stances >1cm 0 | max joint 28.0 rad/s on body | frames >20 rad/s 1 | moving 26%
  ZIK    stances 492 | slip avg 0.12 cm worst 1.79 cm | stances >1cm 8 | max joint 29.1 rad/s on knee_front_l | frames >20 rad/s 7 | moving 7%

## VERDICT
  PIP    feet SLIDE (worst 14.3 cm, 21% of steps) | knees SNAP (91 rad/s)
  MOCHI  feet SLIDE (worst 8.9 cm, 15% of steps) | knees SNAP (49 rad/s)
  BOP    feet no steps seen | knees SNAP (28 rad/s)
  ZIK    feet SLIDE (worst 1.8 cm, 2% of steps) | knees SNAP (40 rad/s)
  overlap NONE
  console errors 0

## SAVE / LOAD
  creatures 8 | save 4736 bytes | reload identical true

## SIM COST (CPU only, no render)
  8 creatures 4.41 ms/step | 24 creatures 14.06 ms/step | 0.586 ms per creature
  breakdown @24: brain 1.20 | motion+anim 6.01 | leg solve 6.16 | other 0.69 ms/step

## GATES
  PASS  PIP WALK worst slip <= 2 cm    0.15 cm (175 walk steps)
  PASS  PIP WALK steps >1 cm <= 2%     0.0%
  FAIL  PIP WALK leg joint <= 20 rad/s 36.1 on knee_l(plant)
  WARN  PIP in actions                 worst 14.3 cm | 21.1% steps | leg joint 36.1 | body 91 rad/s 'sleep'
  PASS  MOCHI WALK worst slip <= 2 cm  0.15 cm (125 walk steps)
  PASS  MOCHI WALK steps >1 cm <= 2%   0.0%
  FAIL  MOCHI WALK leg joint <= 20 rad/s 36.2 on knee_br(plant)
  WARN  MOCHI in actions               worst 8.9 cm | 15.3% steps | leg joint 36.2 | body 49 rad/s 'sleep'
  PASS  ZIK WALK worst slip <= 2 cm    0.15 cm (351 walk steps)
  PASS  ZIK WALK steps >1 cm <= 2%     0.0%
  FAIL  ZIK WALK leg joint <= 20 rad/s 25.3 on knee_rear_r(plant)
  WARN  ZIK in actions                 worst 1.8 cm | 1.6% steps | leg joint 29.1 | body 14 rad/s 'eat'
  PASS  overlap frames = 0             0
  PASS  console errors = 0             0
  PASS  save/load identical            yes
  PASS  sim cost scales linearly       3.18x for 3x creatures
```
