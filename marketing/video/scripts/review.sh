#!/usr/bin/env bash
# Review pass (director-owned): render the whole film at half scale and tile it into contact sheets.
# Usage (from marketing/video): bash scripts/review.sh [CompositionId] [fps-for-sheets]
set -euo pipefail
cd "$(dirname "$0")/.."
COMP="${1:-PotDemoCaptioned}"
SHEET_FPS="${2:-4}"
mkdir -p out/review
rm -f out/review/sheet-*.png
npx remotion render "$COMP" "out/review/${COMP}-half.mp4" --scale=0.5 --gl=angle --concurrency=8 --codec=h264 --crf=20
# Each sheet: 8 x 6 tiles at SHEET_FPS frames per second → 48 tiles = 12 s per sheet at 4 fps.
ffmpeg -hide_banner -loglevel error -y -i "out/review/${COMP}-half.mp4" \
  -vf "fps=${SHEET_FPS},scale=320:-1,tile=8x6:padding=4:color=0x2b1b3a" \
  out/review/sheet-%02d.png
ls -1 out/review/
