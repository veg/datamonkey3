#!/usr/bin/env bash
# Convert all video-frames/scene-*.webm into H.264 MP4 files that iMovie / Final
# Cut / Premiere / DaVinci will import natively.
#
# Encoding choices:
#   - libx264, crf 18, preset slow  -> near-visually-lossless; large but suitable
#                                      for further editing
#   - yuv420p pixel format          -> QuickTime / iMovie compatibility
#   - -movflags +faststart          -> moov atom at the front for quick seek
#   - -an                           -> these scenes have no audio
#
# Usage:  ./scripts/webm-to-mp4.sh            # converts all scenes
#         ./scripts/webm-to-mp4.sh scene-11   # converts a single scene

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT/video-frames"

if [ $# -gt 0 ]; then
	targets=()
	for t in "$@"; do targets+=("$OUT_DIR/${t%.webm}.webm"); done
else
	targets=("$OUT_DIR"/scene-*.webm)
fi

for src in "${targets[@]}"; do
	[ -f "$src" ] || { echo "skip (missing): $src"; continue; }
	dst="${src%.webm}.mp4"
	echo "Encoding $(basename "$src") -> $(basename "$dst")"
	ffmpeg -y -loglevel error \
		-i "$src" \
		-c:v libx264 -crf 18 -preset slow -pix_fmt yuv420p \
		-movflags +faststart -an \
		"$dst"
done

echo
echo "MP4 files in $OUT_DIR:"
ls -lh "$OUT_DIR"/scene-*.mp4 2>/dev/null || echo "(none yet)"
