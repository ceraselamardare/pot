#!/usr/bin/env bash
# Final render of the Pot demo film (director-owned).
# Renders the clean cut (PotDemo) and the captioned X cut (PotDemoCaptioned) at 1080p60, then loudness-normalises
# the audio with scripts/audio-master.py (fixes the uniform 25 ms MP3 decoder delay, -14 LUFS / -1 dBTP) without
# re-encoding the video.
# Usage (from marketing/video): bash scripts/render-final.sh [--only PotDemo|PotDemoCaptioned] [--scale 0.5] [--repo github.com/org/repo]
set -euo pipefail
cd "$(dirname "$0")/.."

ONLY=""
SCALE="1"
REPO=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --only) ONLY="$2"; shift 2 ;;
    --scale) SCALE="$2"; shift 2 ;;
    --repo) REPO="$2"; shift 2 ;;
    *) echo "unknown arg $1"; exit 1 ;;
  esac
done

mkdir -p out/final
COMPS=(PotDemo PotDemoCaptioned)
[[ -n "$ONLY" ]] && COMPS=("$ONLY")

for COMP in "${COMPS[@]}"; do
  RAW="out/final/${COMP}.raw.mp4"
  OUT="out/final/${COMP}.mp4"
  echo "== Rendering $COMP (scale $SCALE)"
  npx remotion render "$COMP" "$RAW" \
    --codec=h264 --crf=16 --pixel-format=yuv420p \
    --audio-codec=aac --audio-bitrate=320k \
    --scale="$SCALE" --gl=angle --concurrency=8 \
    --props="{\"repoUrl\":\"${REPO}\"}"

  echo "== Mastering: shift MP3 decoder delay back 25.06 ms, -14 LUFS / -1 dBTP (scripts/audio-master.py)"
  python3 scripts/audio-master.py "$RAW" "$OUT" --lufs -14 --tp -1.0

  echo "== Verifying"
  ffmpeg -hide_banner -nostats -i "$OUT" -af ebur128=peak=true -f null - 2>&1 | grep -E "^\s+(I:|True peak:|Peak:)" | head -4 || true
  ffprobe -v error -show_entries format=duration:stream=codec_name,width,height,r_frame_rate -of compact "$OUT"
  rm -f "$RAW"
  echo "== Done: $OUT"
done
