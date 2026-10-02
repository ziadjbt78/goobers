```
# WATCH REPORT
date 2026-10-02T05:21:00.158Z
badge build v13 · 2026-10-02 09:19

## PEDESTAL
  quat 8.88e-16 pos 0.00e+0 -> PASS

## STRAIGHT WALK PROBE (8 s each)
  PIP    slip 3.57 cm | overstretch 5/480 | speed 0.873 | freq 3 Hz
  MOCHI  slip 8.54 cm | overstretch 46/480 | speed 0.875 | freq 3 Hz
  BOP    slip 0.00 cm | overstretch 0/480 | speed 2.762 | freq 2.5 Hz
  ZIK    slip 1.17 cm | overstretch 1/480 | speed 1.128 | freq 3 Hz

## JOINT PROBE (20 s)
  PIP    40.00 rad/s on knee_r [FORCED STEP]
  MOCHI  40.00 rad/s on knee_fr [FORCED STEP]
  ZIK    40.00 rad/s on knee_front_r [FORCED STEP]

## FREE-RUNNING WORLD (30 s, all creatures, real behaviour)
  creatures 8 | overlap frames 0/900 | closest pair 1.20x personal space
  PIP    lifts: beat 83 reach 41 strain 143 catch-up 33 | max planted IK miss 32.94 cm | crouch 12.7 cm
  MOCHI  lifts: beat 25 reach 42 strain 201 catch-up 102 | max planted IK miss 28.08 cm | crouch 4.0 cm
  BOP    lifts: beat 0 reach 0 strain 0 catch-up 0 | max planted IK miss 0.00 cm | crouch 0.0 cm
  ZIK    lifts: beat 225 reach 71 strain 176 catch-up 87 | max planted IK miss 3.85 cm | crouch 3.6 cm
  PIP    stances 300 | slip avg 1.05 cm worst 18.17 cm | stances >1cm 87 | max joint 83.8 rad/s on body | frames >20 rad/s 101 | moving 50%
  MOCHI  stances 370 | slip avg 1.27 cm worst 20.74 cm | stances >1cm 117 | max joint 40.0 rad/s on ankle_fl | frames >20 rad/s 80 | moving 18%
  BOP    stances 0 | slip avg 0.00 cm worst 0.00 cm | stances >1cm 0 | max joint 12.4 rad/s on head | frames >20 rad/s 0 | moving 45%
  ZIK    stances 559 | slip avg 0.31 cm worst 5.77 cm | stances >1cm 23 | max joint 40.0 rad/s on knee_mid_r | frames >20 rad/s 34 | moving 40%

## VERDICT
  PIP    feet SLIDE (worst 18.2 cm, 29% of steps) | knees SNAP (84 rad/s)
  MOCHI  feet SLIDE (worst 20.7 cm, 32% of steps) | knees SNAP (40 rad/s)
  BOP    feet no steps seen | knees OK
  ZIK    feet SLIDE (worst 5.8 cm, 4% of steps) | knees SNAP (40 rad/s)
  overlap NONE
  console errors 0

## GATES
  FAIL  PIP worst slip <= 2 cm         18.17 cm
  FAIL  PIP steps >1 cm <= 2%          29.0%
  FAIL  PIP joint <= 20 rad/s          83.8 on body
  FAIL  MOCHI worst slip <= 2 cm       20.74 cm
  FAIL  MOCHI steps >1 cm <= 2%        31.6%
  FAIL  MOCHI joint <= 20 rad/s        40.0 on ankle_fl
  FAIL  ZIK worst slip <= 2 cm         5.77 cm
  FAIL  ZIK steps >1 cm <= 2%          4.1%
  FAIL  ZIK joint <= 20 rad/s          40.0 on knee_mid_r
  PASS  overlap frames = 0             0
  PASS  console errors = 0             0
```
