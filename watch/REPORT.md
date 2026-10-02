```
# WATCH REPORT
date 2026-10-02T09:41:10.277Z
badge build v16 · 2026-10-02 13:40

## PEDESTAL
  quat 8.88e-16 pos 0.00e+0 -> PASS

## STRAIGHT WALK PROBE (8 s each)
  PIP    slip 1.30 cm | overstretch 3/480 | speed 0.873 | freq 3 Hz
  MOCHI  slip 9.75 cm | overstretch 37/480 | speed 0.875 | freq 3 Hz
  BOP    slip 0.00 cm | overstretch 0/480 | speed 2.763 | freq 2.5 Hz
  ZIK    slip 0.19 cm | overstretch 1/480 | speed 1.128 | freq 3 Hz

## JOINT PROBE (20 s)
  PIP    40.00 rad/s on knee_r [FORCED STEP]
  MOCHI  40.00 rad/s on knee_bl [FORCED STEP]
  ZIK    40.00 rad/s on knee_front_l [FORCED STEP]

## FREE-RUNNING WORLD (30 s, all creatures, real behaviour)
  creatures 8 | overlap frames 0/900 | closest pair 1.08x personal space
  PIP    lifts: beat 155 reach 13 strain 65 catch-up 15 | max planted IK miss 16.35 cm | crouch 6.1 cm
  MOCHI  lifts: beat 49 reach 53 strain 68 catch-up 103 | max planted IK miss 7.49 cm | crouch 1.6 cm
  BOP    lifts: beat 0 reach 0 strain 0 catch-up 0 | max planted IK miss 0.00 cm | crouch 0.0 cm
  ZIK    lifts: beat 323 reach 32 strain 32 catch-up 58 | max planted IK miss 1.88 cm | crouch 1.9 cm

## SLIP FORENSICS (stances that slid > 1 cm)
  PIP    n 62 | in action 100% | one-frame pop 100% | ended by forced lift 100% | max hip-foot/reach 0.99 | max IK miss 16.3 cm | max post-limiter miss 16.3 cm
  MOCHI  n 55 | in action 100% | one-frame pop 98% | ended by forced lift 100% | max hip-foot/reach 0.93 | max IK miss 7.5 cm | max post-limiter miss 7.5 cm
  ZIK    n 8 | in action 100% | one-frame pop 100% | ended by forced lift 100% | max hip-foot/reach 0.92 | max IK miss 1.5 cm | max post-limiter miss 1.5 cm
    PIP leg 0: slip 15.9 jump 15.9 cm | reach 0.99 | IK 16.3 post 16.3 cm | ACTION | forced
    PIP leg 0: slip 11.7 jump 11.4 cm | reach 0.81 | IK 11.7 post 11.7 cm | ACTION | forced
    PIP leg 0: slip 9.5 jump 9.5 cm | reach 0.91 | IK 9.7 post 9.7 cm | ACTION | forced
    PIP leg 1: slip 9.4 jump 9.4 cm | reach 0.92 | IK 9.7 post 9.7 cm | ACTION | forced
    PIP leg 0: slip 9.0 jump 9.5 cm | reach 0.93 | IK 12.3 post 9.3 cm | ACTION | forced
    MOCHI leg 2: slip 6.8 jump 6.8 cm | reach 0.76 | IK 7.5 post 7.5 cm | ACTION | forced
    MOCHI leg 0: slip 6.6 jump 6.4 cm | reach 0.77 | IK 6.8 post 6.8 cm | ACTION | forced
    PIP leg 0: slip 6.5 jump 6.5 cm | reach 0.96 | IK 6.5 post 6.5 cm | ACTION | forced
  PIP    LEG joint max 40.0 rad/s on knee_l(plant) | leg frames >20: 41
  MOCHI  LEG joint max 38.6 rad/s on knee_br(plant) | leg frames >20: 34
  ZIK    LEG joint max 39.8 rad/s on knee_rear_r(plant) | leg frames >20: 14
  PIP    stances 267 | slip avg 0.84 cm worst 15.94 cm | stances >1cm 62 | max joint 91.2 rad/s on body | frames >20 rad/s 31 | moving 26%
  MOCHI  stances 342 | slip avg 0.45 cm worst 6.77 cm | stances >1cm 55 | max joint 48.9 rad/s on body | frames >20 rad/s 24 | moving 31%
  BOP    stances 0 | slip avg 0.00 cm worst 0.00 cm | stances >1cm 0 | max joint 28.0 rad/s on body | frames >20 rad/s 1 | moving 26%
  ZIK    stances 487 | slip avg 0.12 cm worst 1.41 cm | stances >1cm 8 | max joint 39.8 rad/s on knee_rear_r | frames >20 rad/s 10 | moving 7%

## VERDICT
  PIP    feet SLIDE (worst 15.9 cm, 23% of steps) | knees SNAP (91 rad/s)
  MOCHI  feet SLIDE (worst 6.8 cm, 16% of steps) | knees SNAP (49 rad/s)
  BOP    feet no steps seen | knees SNAP (28 rad/s)
  ZIK    feet SLIDE (worst 1.4 cm, 2% of steps) | knees SNAP (40 rad/s)
  overlap NONE
  console errors 0

## SAVE / LOAD
  creatures 8 | save 4738 bytes | reload identical false

## SIM COST (CPU only, no render)
  8 creatures 4.68 ms/step | 24 creatures 13.29 ms/step | 0.554 ms per creature

## GATES
  FAIL  PIP worst slip <= 2 cm         15.94 cm
  FAIL  PIP steps >1 cm <= 2%          23.2%
  FAIL  PIP leg joint <= 20 rad/s      40.0 on knee_l(plant)
  FAIL  MOCHI worst slip <= 2 cm       6.77 cm
  FAIL  MOCHI steps >1 cm <= 2%        16.1%
  FAIL  MOCHI leg joint <= 20 rad/s    38.6 on knee_br(plant)
  PASS  ZIK worst slip <= 2 cm         1.41 cm
  PASS  ZIK steps >1 cm <= 2%          1.6%
  FAIL  ZIK leg joint <= 20 rad/s      39.8 on knee_rear_r(plant)
  PASS  overlap frames = 0             0
  PASS  console errors = 0             0
  FAIL  save/load identical            no
  FAIL  sim 24 creatures <= 8 ms/step  13.29 ms
```
