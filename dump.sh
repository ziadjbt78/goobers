#!/usr/bin/env bash
# splits big source files into small pieces my fetch tool can read in full
set -e
cd "$(dirname "$0")"
rm -rf watch/src && mkdir -p watch/src
for f in src/engine/anim/HeroAnimator.ts src/engine/agent/Agent.ts src/engine/world/Sim.ts \
         src/engine/motion/CreatureMotion.ts src/engine/motion/Rig.ts src/engine/anim/pose.ts; do
  [ -f "$f" ] || continue
  n=$(basename "$f" .ts)
  awk -v n="$n" '{ printf "%5d| %s\n", NR, $0 > sprintf("watch/src/%s_%02d.txt", n, int((NR-1)/250)) }' "$f"
done
ls watch/src | sed 's/^/  /'
git add dump.sh watch/src
git commit -q -m "dump: source pieces for review" || true
git push -q
echo "DUMP SHA: $(git rev-parse HEAD)"
