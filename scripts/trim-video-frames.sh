#!/usr/bin/env bash
# Collect raw videos from test-results, trim the HyPhy loading screen off
# the front of each scene using offsets recorded by the test, and write
# the trimmed videos to video-frames/.
#
# Usage: ./scripts/trim-video-frames.sh
# Requires: ffmpeg, jq

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RAW_DIR="$ROOT/test-results"
OUT_DIR="$ROOT/video-frames"
OFFSET_DIR="$OUT_DIR/offsets"
RAW_OUT_DIR="$OUT_DIR/raw"

mkdir -p "$RAW_OUT_DIR"

# Step 1: copy desktop chromium videos to a clean staging area
for d in "$RAW_DIR"/video-frames-scene-*-chromium; do
	[ -d "$d" ] || continue
	scene=$(basename "$d" | grep -oE 'scene-[0-9]+')
	if [ -f "$d/video.webm" ] && [ -n "$scene" ]; then
		cp "$d/video.webm" "$RAW_OUT_DIR/${scene}.webm"
	fi
done

# Step 2: trim each video using its recorded loading offset.
# Static-HTML scenes (no offset file) are copied through unmodified.
for raw in "$RAW_OUT_DIR"/scene-*.webm; do
	[ -f "$raw" ] || continue
	scene=$(basename "$raw" .webm)
	offset_file="$OFFSET_DIR/${scene}.json"
	out="$OUT_DIR/${scene}.webm"

	# Output directly as H.264 MP4 so iMovie / Final Cut / Premiere import natively.
	out="${out%.webm}.mp4"

	if [ -f "$offset_file" ]; then
		offset=$(jq -r '.offsetSeconds' "$offset_file")
		# Subtract a small grace period so the cut happens just after the
		# app is interactive, not exactly at the frame the loader vanishes.
		trim=$(awk "BEGIN { printf \"%.3f\", $offset - 0.2 }")
		# Clamp to 0
		trim=$(awk "BEGIN { v = $trim; if (v < 0) v = 0; printf \"%.3f\", v }")
		echo "Trimming $scene at ${trim}s (offset ${offset}s)"
		ffmpeg -y -loglevel error \
			-ss "$trim" -i "$raw" \
			-c:v libx264 -crf 18 -preset slow -pix_fmt yuv420p \
			-movflags +faststart -an \
			"$out"
	else
		echo "Transcoding $scene (no offset)"
		ffmpeg -y -loglevel error \
			-i "$raw" \
			-c:v libx264 -crf 18 -preset slow -pix_fmt yuv420p \
			-movflags +faststart -an \
			"$out"
	fi
done

echo
echo "MP4 videos in $OUT_DIR:"
ls -lh "$OUT_DIR"/scene-*.mp4
