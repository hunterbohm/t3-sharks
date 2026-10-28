#!/bin/bash
# Rebuilds assets/ocean.js from stackedlol/ascii-sharks at the pinned commit.
set -euo pipefail
commit=a0074c16a106f0abc665fe9712ca445f8f98ad8e
root=$(cd "$(dirname "$0")/.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
git clone -q https://github.com/stackedlol/ascii-sharks "$work/ascii-sharks"
git -C "$work/ascii-sharks" checkout -q "$commit"
printf 'import { OceanEngine } from "./ascii-sharks/src/engine";\n(window as any).__T3SharksOcean = OceanEngine;\n' > "$work/entry.ts"
npx -y esbuild@0.25 "$work/entry.ts" --bundle --format=iife --minify --target=es2022 --log-level=warning --outfile="$work/ocean.js"
{ printf '/* ascii-sharks by stackedlol, https://github.com/stackedlol/ascii-sharks @ %s, MIT License. */\n' "${commit:0:7}"; cat "$work/ocean.js"; } > "$root/assets/ocean.js"
cp "$work/ascii-sharks/LICENSE" "$root/assets/ascii-sharks-LICENSE"
echo "built assets/ocean.js"
