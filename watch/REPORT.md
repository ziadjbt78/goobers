```
# WATCH REPORT
date 2026-10-02T05:27:36.301Z
badge build v14 · 2026-10-02 09:26

## PEDESTAL
  quat 8.88e-16 pos 0.00e+0 -> PASS

## STRAIGHT WALK PROBE (8 s each)
  PIP    slip 3.23 cm | overstretch 5/480 | speed 0.873 | freq 3 Hz
  MOCHI  slip 7.98 cm | overstretch 48/480 | speed 0.875 | freq 3 Hz
  BOP    slip 0.00 cm | overstretch 0/480 | speed 2.762 | freq 2.5 Hz
  ZIK    slip 0.18 cm | overstretch 1/480 | speed 1.128 | freq 3 Hz

## JOINT PROBE (20 s)
  PIP    185.20 rad/s on hip_r [FORCED STEP]
  MOCHI  187.12 rad/s on hip_bl [FORCED STEP]
  ZIK    186.94 rad/s on hip_rear_l [FORCED STEP]

## FREE-RUNNING WORLD (30 s, all creatures, real behaviour)
  creatures 8 | overlap frames 0/900 | closest pair 1.20x personal space
  PIP    lifts: beat 79 reach 34 strain 92 catch-up 38 | max planted IK miss 10.27 cm | crouch 4.6 cm
  MOCHI  lifts: beat 22 reach 41 strain 84 catch-up 92 | max planted IK miss 5.94 cm | crouch 4.1 cm
  BOP    lifts: beat 0 reach 0 strain 0 catch-up 0 | max planted IK miss 0.00 cm | crouch 0.0 cm
  ZIK    lifts: beat 226 reach 63 strain 157 catch-up 86 | max planted IK miss 5.94 cm | crouch 1.4 cm

## SLIP FORENSICS (stances that slid > 1 cm)
  PIP    n 70 | in action 100% | one-frame pop 100% | ended by forced lift 100% | max hip-foot/reach 0.96 | max IK miss 10.3 cm | max post-limiter miss 10.3 cm
  MOCHI  n 61 | in action 100% | one-frame pop 92% | ended by forced lift 97% | max hip-foot/reach 0.94 | max IK miss 5.9 cm | max post-limiter miss 5.9 cm
  ZIK    n 30 | in action 97% | one-frame pop 100% | ended by forced lift 97% | max hip-foot/reach 0.98 | max IK miss 5.9 cm | max post-limiter miss 14.1 cm
    ZIK leg 5: slip 21.6 jump 21.5 cm | reach 0.91 | IK 0.8 post 0.8 cm | ACTION | beat
    ZIK leg 3: slip 14.0 jump 14.6 cm | reach 0.95 | IK 5.9 post 14.1 cm | ACTION | forced
    ZIK leg 0: slip 12.2 jump 11.8 cm | reach 0.86 | IK 0.6 post 0.6 cm | ACTION | forced
    PIP leg 1: slip 10.1 jump 10.1 cm | reach 0.91 | IK 10.3 post 10.3 cm | ACTION | forced
    ZIK leg 3: slip 9.9 jump 9.9 cm | reach 0.79 | IK 5.6 post 9.9 cm | ACTION | forced
    ZIK leg 5: slip 8.7 jump 8.7 cm | reach 0.72 | IK 0.2 post 0.2 cm | ACTION | forced
    PIP leg 0: slip 8.3 jump 8.1 cm | reach 0.79 | IK 8.7 post 8.7 cm | ACTION | forced
    PIP leg 0: slip 8.3 jump 8.1 cm | reach 0.79 | IK 8.7 post 8.7 cm | ACTION | forced
  PIP    LEG joint max 62.6 rad/s on hip_l(plant) | leg frames >20: 110
  MOCHI  LEG joint max 93.6 rad/s on hip_br(plant) | leg frames >20: 170
  ZIK    LEG joint max 87.4 rad/s on hip_mid_l(plant) | leg frames >20: 169
  PIP    stances 291 | slip avg 0.72 cm worst 10.09 cm | stances >1cm 70 | max joint 90.8 rad/s on body | frames >20 rad/s 103 | moving 48%
  MOCHI  stances 348 | slip avg 0.47 cm worst 7.82 cm | stances >1cm 61 | max joint 94.2 rad/s on hip_br | frames >20 rad/s 91 | moving 18%
  BOP    stances 0 | slip avg 0.00 cm worst 0.00 cm | stances >1cm 0 | max joint 13.5 rad/s on head | frames >20 rad/s 0 | moving 41%
  ZIK    stances 659 | slip avg 0.35 cm worst 21.62 cm | stances >1cm 30 | max joint 93.6 rad/s on hip_rear_r | frames >20 rad/s 63 | moving 40%

## VERDICT
  PIP    feet SLIDE (worst 10.1 cm, 24% of steps) | knees SNAP (185 rad/s)
  MOCHI  feet SLIDE (worst 7.8 cm, 18% of steps) | knees SNAP (187 rad/s)
  BOP    feet no steps seen | knees OK
  ZIK    feet SLIDE (worst 21.6 cm, 5% of steps) | knees SNAP (187 rad/s)
  overlap NONE
  console errors 0

## GATES
  FAIL  PIP worst slip <= 2 cm         10.09 cm
  FAIL  PIP steps >1 cm <= 2%          24.1%
  FAIL  PIP leg joint <= 20 rad/s      62.6 on hip_l(plant)
  FAIL  MOCHI worst slip <= 2 cm       7.82 cm
  FAIL  MOCHI steps >1 cm <= 2%        17.5%
  FAIL  MOCHI leg joint <= 20 rad/s    93.6 on hip_br(plant)
  FAIL  ZIK worst slip <= 2 cm         21.62 cm
  FAIL  ZIK steps >1 cm <= 2%          4.6%
  FAIL  ZIK leg joint <= 20 rad/s      87.4 on hip_mid_l(plant)
  PASS  overlap frames = 0             0
  PASS  console errors = 0             0
```
