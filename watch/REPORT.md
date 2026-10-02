```
# WATCH REPORT
date 2026-10-02T09:30:46.164Z
badge build v15 · 2026-10-02 13:29

## PEDESTAL
  quat 8.88e-16 pos 0.00e+0 -> PASS

## STRAIGHT WALK PROBE (8 s each)
  PIP    slip 3.56 cm | overstretch 8/480 | speed 0.873 | freq 3 Hz
  MOCHI  slip 8.84 cm | overstretch 43/480 | speed 0.875 | freq 3 Hz
  BOP    slip 0.00 cm | overstretch 0/480 | speed 2.762 | freq 2.5 Hz
  ZIK    slip 0.20 cm | overstretch 0/480 | speed 1.128 | freq 3 Hz

## JOINT PROBE (20 s)
  PIP    40.00 rad/s on ankle_r [FORCED STEP]
  MOCHI  40.00 rad/s on knee_bl [FORCED STEP]
  ZIK    40.00 rad/s on hip_mid_r [FORCED STEP]

## FREE-RUNNING WORLD (30 s, all creatures, real behaviour)
  creatures 8 | overlap frames 0/900 | closest pair 1.20x personal space
  PIP    lifts: beat 85 reach 26 strain 112 catch-up 32 | max planted IK miss 12.34 cm | crouch 10.2 cm
  MOCHI  lifts: beat 21 reach 34 strain 89 catch-up 80 | max planted IK miss 9.07 cm | crouch 4.8 cm
  BOP    lifts: beat 0 reach 0 strain 0 catch-up 0 | max planted IK miss 0.00 cm | crouch 0.0 cm
  ZIK    lifts: beat 225 reach 54 strain 153 catch-up 66 | max planted IK miss 5.62 cm | crouch 1.5 cm

## SLIP FORENSICS (stances that slid > 1 cm)
  PIP    n 86 | in action 100% | one-frame pop 100% | ended by forced lift 100% | max hip-foot/reach 0.95 | max IK miss 12.3 cm | max post-limiter miss 12.3 cm
  MOCHI  n 58 | in action 100% | one-frame pop 93% | ended by forced lift 100% | max hip-foot/reach 0.95 | max IK miss 9.1 cm | max post-limiter miss 9.1 cm
  ZIK    n 28 | in action 96% | one-frame pop 100% | ended by forced lift 100% | max hip-foot/reach 0.99 | max IK miss 5.6 cm | max post-limiter miss 13.7 cm
    ZIK leg 4: slip 13.5 jump 13.7 cm | reach 0.91 | IK 4.8 post 13.7 cm | ACTION | forced
    PIP leg 1: slip 11.9 jump 11.9 cm | reach 0.93 | IK 12.3 post 12.3 cm | ACTION | forced
    ZIK leg 2: slip 10.8 jump 11.3 cm | reach 0.91 | IK 5.6 post 10.8 cm | ACTION | forced
    PIP leg 0: slip 8.7 jump 8.6 cm | reach 0.82 | IK 8.8 post 8.8 cm | ACTION | forced
    MOCHI leg 3: slip 8.7 jump 7.8 cm | reach 0.92 | IK 9.1 post 9.1 cm | ACTION | forced
    PIP leg 1: slip 6.9 jump 6.9 cm | reach 0.88 | IK 7.2 post 7.2 cm | ACTION | forced
    MOCHI leg 2: slip 6.8 jump 6.3 cm | reach 0.92 | IK 7.0 post 7.0 cm | ACTION | forced
    PIP leg 0: slip 6.5 jump 5.8 cm | reach 0.90 | IK 6.8 post 6.8 cm | ACTION | forced
  PIP    LEG joint max 38.0 rad/s on knee_r(plant) | leg frames >20: 67
  MOCHI  LEG joint max 34.6 rad/s on knee_br(plant) | leg frames >20: 20
  ZIK    LEG joint max 40.0 rad/s on knee_rear_l(plant) | leg frames >20: 21
  PIP    stances 282 | slip avg 0.88 cm worst 11.92 cm | stances >1cm 86 | max joint 83.1 rad/s on body | frames >20 rad/s 61 | moving 50%
  MOCHI  stances 284 | slip avg 0.56 cm worst 8.69 cm | stances >1cm 58 | max joint 34.6 rad/s on knee_br | frames >20 rad/s 15 | moving 18%
  BOP    stances 0 | slip avg 0.00 cm worst 0.00 cm | stances >1cm 0 | max joint 15.6 rad/s on head | frames >20 rad/s 0 | moving 45%
  ZIK    stances 630 | slip avg 0.29 cm worst 13.50 cm | stances >1cm 28 | max joint 40.0 rad/s on knee_rear_l | frames >20 rad/s 10 | moving 40%

## VERDICT
  PIP    feet SLIDE (worst 11.9 cm, 30% of steps) | knees SNAP (83 rad/s)
  MOCHI  feet SLIDE (worst 8.7 cm, 20% of steps) | knees SNAP (40 rad/s)
  BOP    feet no steps seen | knees OK
  ZIK    feet SLIDE (worst 13.5 cm, 4% of steps) | knees SNAP (40 rad/s)
  overlap NONE
  console errors 0

## GATES
  FAIL  PIP worst slip <= 2 cm         11.92 cm
  FAIL  PIP steps >1 cm <= 2%          30.5%
  FAIL  PIP leg joint <= 20 rad/s      38.0 on knee_r(plant)
  FAIL  MOCHI worst slip <= 2 cm       8.69 cm
  FAIL  MOCHI steps >1 cm <= 2%        20.4%
  FAIL  MOCHI leg joint <= 20 rad/s    34.6 on knee_br(plant)
  FAIL  ZIK worst slip <= 2 cm         13.50 cm
  FAIL  ZIK steps >1 cm <= 2%          4.4%
  FAIL  ZIK leg joint <= 20 rad/s      40.0 on knee_rear_l(plant)
  PASS  overlap frames = 0             0
  PASS  console errors = 0             0
```
