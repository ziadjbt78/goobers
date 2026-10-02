```
# WATCH REPORT
date 2026-10-02T04:49:22.616Z
badge build v11 · 2026-10-01 17:05

## PEDESTAL
  quat 8.88e-16 pos 0.00e+0 -> PASS

## STRAIGHT WALK PROBE (8 s each)
  PIP    slip 0.00 cm | overstretch 80/480 | speed 0.873 | freq 3 Hz
  MOCHI  slip 21.88 cm | overstretch 112/480 | speed 0.875 | freq 3 Hz
  BOP    slip 0.00 cm | overstretch 0/480 | speed 2.758 | freq 2.5 Hz
  ZIK    slip 1.93 cm | overstretch 97/480 | speed 1.128 | freq 3 Hz

## JOINT PROBE (20 s)
  PIP    83.55 rad/s on ankle_l [FORCED STEP]
  MOCHI  117.58 rad/s on ankle_fr [FORCED STEP]
  ZIK    96.12 rad/s on knee_mid_l [FORCED STEP]

## FREE-RUNNING WORLD (30 s, all creatures, real behaviour)
  creatures 8 | overlap frames 87/900 | closest pair 0.29x personal space
  PIP    stances 369 | slip avg 0.62 cm worst 16.05 cm | stances >1cm 37 | max joint 35.0 rad/s on knee_l | frames >20 rad/s 6 | moving 48%
  MOCHI  stances 599 | slip avg 0.89 cm worst 16.96 cm | stances >1cm 92 | max joint 41.7 rad/s on knee_fr | frames >20 rad/s 13 | moving 24%
  BOP    stances 0 | slip avg 0.00 cm worst 0.00 cm | stances >1cm 0 | max joint 13.9 rad/s on head | frames >20 rad/s 0 | moving 48%
  ZIK    stances 837 | slip avg 1.10 cm worst 21.91 cm | stances >1cm 196 | max joint 43.8 rad/s on knee_rear_l | frames >20 rad/s 20 | moving 39%

## VERDICT
  PIP    feet SLIDE (worst 16.1 cm, 10% of steps) | knees SNAP (84 rad/s)
  MOCHI  feet SLIDE (worst 17.0 cm, 15% of steps) | knees SNAP (118 rad/s)
  BOP    feet no steps seen | knees OK
  ZIK    feet SLIDE (worst 21.9 cm, 23% of steps) | knees SNAP (96 rad/s)
  overlap 87 frames
  console errors 0
```
