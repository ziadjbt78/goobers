#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
echo "== BUILD =="
npm run build > build.log 2>&1 || { echo "BUILD FAILED, nothing committed:"; tail -30 build.log; exit 1; }
git add -A
if git diff --cached --quiet; then echo "Nothing changed, nothing to commit."; exit 0; fi
git commit -q -m "${1:-update}"
git push -q
echo "SHIPPED: $(git rev-parse HEAD)"
