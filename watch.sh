#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
echo "building..."; npm run build >/dev/null
lsof -ti:8137 | xargs -r kill -9 2>/dev/null || true
python3 -m http.server 8137 --directory dist >/dev/null 2>&1 &
SRV=$!; trap 'kill $SRV 2>/dev/null || true' EXIT
sleep 1
node tools/watch.mjs http://127.0.0.1:8137/ || echo "watcher hit an error (report still written)"
for g in $(ls watch/frames 2>/dev/null | sed 's/_[0-9][0-9]\.png$//' | sort -u); do
  ffmpeg -loglevel error -y -i "watch/frames/${g}_%02d.png" -vf "scale=320:-1,tile=4x3" -frames:v 1 "watch/${g}.png"
done
rm -rf watch/frames
git add watch tools/watch.mjs watch.sh
git commit -q -m "watch: $(date '+%F %T')" || true
git push -q
echo "WATCH SHA: $(git rev-parse HEAD)"
