```
# WATCH REPORT
date 2026-10-02T10:46:45.059Z
badge build v20 · 2026-10-02 14:45

## PEDESTAL
  quat 8.88e-16 pos 0.00e+0 -> PASS

## STRAIGHT WALK PROBE (8 s each)
  PIP    slip 4.67 cm | overstretch 0/480 | speed 0.873 | freq 3 Hz
  MOCHI  slip 9.67 cm | overstretch 11/480 | speed 0.875 | freq 3 Hz
  BOP    slip 0.00 cm | overstretch 0/480 | speed 2.763 | freq 2.5 Hz
  ZIK    slip 1.16 cm | overstretch 18/480 | speed 1.128 | freq 3 Hz

## JOINT PROBE (20 s)
  PIP    60.00 rad/s on ankle_l [FORCED STEP]
  MOCHI  60.00 rad/s on knee_fl [FORCED STEP]
  ZIK    60.00 rad/s on ankle_rear_r [FORCED STEP]

## FREE-RUNNING WORLD (30 s, all creatures, real behaviour)
  creatures 8 | overlap frames 0/900 | closest pair 1.08x personal space
  PIP    lifts: beat 139 reach 34 strain 0 catch-up 20 | max planted IK miss 0.28 cm | crouch 5.6 cm
  MOCHI  lifts: beat 59 reach 64 strain 2 catch-up 108 | max planted IK miss 1.54 cm | crouch 2.5 cm
  BOP    lifts: beat 0 reach 0 strain 0 catch-up 0 | max planted IK miss 0.00 cm | crouch 0.0 cm
  ZIK    lifts: beat 322 reach 33 strain 19 catch-up 57 | max planted IK miss 2.05 cm | crouch 2.0 cm

## SLIP FORENSICS (stances that slid > 1 cm)
  PIP    none
  MOCHI  n 6 | in action 0% | one-frame pop 100% | ended by forced lift 33% | max hip-foot/reach 0.77 | max IK miss 0.0 cm | max post-limiter miss 2.5 cm
  ZIK    n 2 | in action 100% | one-frame pop 100% | ended by forced lift 100% | max hip-foot/reach 0.91 | max IK miss 2.0 cm | max post-limiter miss 2.0 cm
    MOCHI leg 1: slip 2.1 jump 2.1 cm | reach 0.77 | IK 0.0 post 2.5 cm | walk | beat
    MOCHI leg 1: slip 1.8 jump 1.8 cm | reach 0.52 | IK 0.0 post 1.8 cm | walk | beat
    MOCHI leg 0: slip 1.7 jump 1.7 cm | reach 0.59 | IK 0.0 post 2.0 cm | walk | forced
    MOCHI leg 1: slip 1.5 jump 1.5 cm | reach 0.67 | IK 0.0 post 1.5 cm | walk | forced
    MOCHI leg 3: slip 1.3 jump 1.3 cm | reach 0.66 | IK 0.0 post 1.5 cm | walk | beat
    ZIK leg 4: slip 1.1 jump 1.1 cm | reach 0.75 | IK 2.0 post 2.0 cm | ACTION | forced
    MOCHI leg 0: slip 1.0 jump 1.1 cm | reach 0.64 | IK 0.0 post 1.1 cm | walk | beat
    ZIK leg 2: slip 1.0 jump 0.5 cm | reach 0.91 | IK 1.9 post 1.9 cm | ACTION | forced
  PIP    LEG joint max 60.0 rad/s on ankle_l(swing) | leg frames >20: 69
  MOCHI  LEG joint max 60.0 rad/s on knee_fr(plant) | leg frames >20: 600
  ZIK    LEG joint max 60.0 rad/s on knee_front_l(swing) | leg frames >20: 159
  PIP    BODY snap max 14.0 rad/s (rendered) during 'sleep' | raw target 91.1 rad/s during 'sleep' busy false roll-over 0.00 rad
  MOCHI  BODY snap max 14.0 rad/s (rendered) during 'sleep' | raw target 48.9 rad/s during 'sleep' busy false roll-over 0.00 rad
  BOP    BODY snap max 14.0 rad/s (rendered) during 'none' | raw target 28.0 rad/s during 'none' busy false roll-over 0.00 rad
  ZIK    BODY snap max 14.0 rad/s (rendered) during 'eat' | raw target 14.0 rad/s during 'eat' busy true roll-over 0.00 rad
  PIP    WALK joint peak 60.0 on ankle_l(swing) | hip-foot/reach 0.789 | IK miss 0.00 cm | since land 0.33 s | crouch step 0.83 cm | action 'sleep' | lifted false | kick false | knee BEND rate 3.2 rad/s (rest of peak = twist) | pole fallback false | swivel-limited true
  MOCHI  WALK joint peak 60.0 on knee_fr(plant) | hip-foot/reach 0.388 | IK miss 0.00 cm | since land 0.13 s | crouch step 0.32 cm | action 'startle' | lifted false | kick false | knee BEND rate 6.4 rad/s (rest of peak = twist) | pole fallback false | swivel-limited false
  ZIK    WALK joint peak 50.6 on knee_rear_l(swing) | hip-foot/reach 0.780 | IK miss 0.00 cm | since land 0.33 s | crouch step 0.00 cm | action 'eat' | lifted false | kick false | knee BEND rate 13.2 rad/s (rest of peak = twist) | pole fallback false | swivel-limited false
  PIP    stances 216 | slip avg 0.00 cm worst 0.12 cm | stances >1cm 0 | max joint 60.0 rad/s on ankle_l | frames >20 rad/s 54 | moving 27%
  MOCHI  stances 301 | slip avg 0.04 cm worst 2.06 cm | stances >1cm 6 | max joint 60.0 rad/s on knee_fr | frames >20 rad/s 193 | moving 32%
  BOP    stances 0 | slip avg 0.00 cm worst 0.00 cm | stances >1cm 0 | max joint 14.0 rad/s on body | frames >20 rad/s 0 | moving 26%
  ZIK    stances 475 | slip avg 0.05 cm worst 1.08 cm | stances >1cm 2 | max joint 60.0 rad/s on knee_front_l | frames >20 rad/s 53 | moving 7%

## VERDICT
  PIP    feet STAY PUT | knees SNAP (60 rad/s)
  MOCHI  feet SLIDE (worst 2.1 cm, 2% of steps) | knees SNAP (60 rad/s)
  BOP    feet no steps seen | knees OK
  ZIK    feet SLIDE (worst 1.1 cm, 0% of steps) | knees SNAP (60 rad/s)
  overlap NONE
  console errors 0

## SAVE / LOAD
  creatures 8 | save 4736 bytes | reload identical true

## SIM COST (CPU only, no render)
  8 creatures 1.12 ms/step | 24 creatures 8.71 ms/step | 0.363 ms per creature
  breakdown @24: brain 0.70 | motion+anim 4.26 | leg solve 3.34 | other 0.40 ms/step
  motion+anim split: preAnimate 0.87 | HeroAnimator 0.26 | postAnimate 1.20 | rest of Agent 1.94 ms/step

## RENDER BUDGET (one frame, home camera; counts matter, not ms)
  24 creatures | draw calls 388 | triangles 977100 | geometries 376 | textures 34 | shader programs 17

## GATES
  PASS  PIP WALK worst slip <= 2 cm    0.10 cm (169 walk steps)
  PASS  PIP WALK steps >1 cm <= 2%     0.0%
  FAIL  PIP WALK leg joint <= 20 rad/s 60.0 on ankle_l(swing)
  WARN  PIP in actions                 worst 0.1 cm | 0.0% steps | leg joint 60.0 | body 14 rad/s 'sleep'
  FAIL  MOCHI WALK worst slip <= 2 cm  2.06 cm (117 walk steps)
  FAIL  MOCHI WALK steps >1 cm <= 2%   5.1%
  FAIL  MOCHI WALK leg joint <= 20 rad/s 60.0 on knee_fr(plant)
  WARN  MOCHI in actions               worst 2.1 cm | 2.0% steps | leg joint 60.0 | body 14 rad/s 'sleep'
  PASS  ZIK WALK worst slip <= 2 cm    0.52 cm (350 walk steps)
  PASS  ZIK WALK steps >1 cm <= 2%     0.0%
  FAIL  ZIK WALK leg joint <= 20 rad/s 50.6 on knee_rear_l(swing)
  WARN  ZIK in actions                 worst 1.1 cm | 0.4% steps | leg joint 60.0 | body 14 rad/s 'eat'
  PASS  PIP BODY snap <= 20 rad/s      14.0 during 'sleep'
  PASS  MOCHI BODY snap <= 20 rad/s    14.0 during 'sleep'
  PASS  BOP BODY snap <= 20 rad/s      14.0 during 'none'
  PASS  ZIK BODY snap <= 20 rad/s      14.0 during 'eat'
  PASS  overlap frames = 0             0
  PASS  console errors = 0             0
  PASS  save/load identical            yes
  FAIL  sim cost scales linearly       7.81x for 3x creatures
```
