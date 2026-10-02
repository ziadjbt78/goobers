```
# WATCH REPORT
date 2026-10-02T05:10:32.900Z
badge build v12 · 2026-10-02 09:09

## PEDESTAL
  quat 8.88e-16 pos 0.00e+0 -> PASS

## STRAIGHT WALK PROBE (8 s each)
  PIP    slip 7.04 cm | overstretch 207/480 | speed 0.873 | freq 3 Hz
  MOCHI  slip 6.54 cm | overstretch 388/480 | speed 0.875 | freq 3 Hz
  BOP    slip 0.00 cm | overstretch 0/480 | speed 2.762 | freq 2.5 Hz
  ZIK    slip 1.68 cm | overstretch 105/480 | speed 1.128 | freq 3 Hz

## JOINT PROBE (20 s)
  PIP    187.59 rad/s on hip_r [FORCED STEP]
  MOCHI  127.38 rad/s on knee_br [FORCED STEP]
  ZIK    82.18 rad/s on knee_mid_r [FORCED STEP]

## FREE-RUNNING WORLD (30 s, all creatures, real behaviour)
  creatures 8 | overlap frames 0/900 | closest pair 1.20x personal space
  PIP    stances 188 | slip avg 2.57 cm worst 22.08 cm | stances >1cm 106 | max joint 84.1 rad/s on hip_l | frames >20 rad/s 227 | moving 50%
  MOCHI  stances 239 | slip avg 4.10 cm worst 31.89 cm | stances >1cm 133 | max joint 55.2 rad/s on knee_br | frames >20 rad/s 116 | moving 18%
  BOP    stances 0 | slip avg 0.00 cm worst 0.00 cm | stances >1cm 0 | max joint 12.4 rad/s on head | frames >20 rad/s 0 | moving 45%
  ZIK    stances 400 | slip avg 1.67 cm worst 9.51 cm | stances >1cm 141 | max joint 46.2 rad/s on knee_mid_l | frames >20 rad/s 82 | moving 40%

## VERDICT
  PIP    feet SLIDE (worst 22.1 cm, 56% of steps) | knees SNAP (188 rad/s)
  MOCHI  feet SLIDE (worst 31.9 cm, 56% of steps) | knees SNAP (127 rad/s)
  BOP    feet no steps seen | knees OK
  ZIK    feet SLIDE (worst 9.5 cm, 35% of steps) | knees SNAP (82 rad/s)
  overlap NONE
  console errors 0

## GATES
  FAIL  PIP worst slip <= 2 cm         22.08 cm
  FAIL  PIP steps >1 cm <= 2%          56.4%
  FAIL  PIP joint <= 20 rad/s          84.1 on hip_l
  FAIL  MOCHI worst slip <= 2 cm       31.89 cm
  FAIL  MOCHI steps >1 cm <= 2%        55.6%
  FAIL  MOCHI joint <= 20 rad/s        55.2 on knee_br
  FAIL  ZIK worst slip <= 2 cm         9.51 cm
  FAIL  ZIK steps >1 cm <= 2%          35.3%
  FAIL  ZIK joint <= 20 rad/s          46.2 on knee_mid_l
  PASS  overlap frames = 0             0
  PASS  console errors = 0             0
```
