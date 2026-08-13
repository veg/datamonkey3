#!/usr/bin/env bash
# Compose figure5-results.png from the three panel screenshots.
#
# Layout (2560 x 1600, ~16:10, fits a full-text-width figure*):
#   Panel A (tree)       left half     (0..1280, 0..1600)
#   Panel B (table)      top right     (1280..2560, 0..1000)
#   Panel C (ω detail)   bottom right  (1280..2560, 1000..1600)
#
# Each panel has a small label strip at its top containing a bold
# A/B/C corner label, then the screenshot fitted below. Matches the
# style of Workflow2.png where labels sit above panel content.

set -euo pipefail

DIR="$(cd "$(dirname "$0")"/.. && pwd)"
IMG="$DIR/Datamonkey_2_0/images"

A="$IMG/figure5-panelA-tree.png"
B="$IMG/figure5-panelB-table.png"
C="$IMG/figure5-panelC-detail.png"
OUT="$IMG/figure5-results.png"

for f in "$A" "$B" "$C"; do
	[[ -f "$f" ]] || { echo "missing: $f"; exit 1; }
done

W=2560
H=1600
LEFT_W=1280
RIGHT_W=$((W - LEFT_W))           # 1280
TOP_H=1000
BOTTOM_H=$((H - TOP_H))           # 600
PAD=24                             # outer gutter between tiles
LABEL_STRIP=78                     # top strip inside each tile reserved for label
LBL_INSET=18

CONTENT_W_LEFT=$((LEFT_W - 2*PAD))
CONTENT_H_LEFT=$((H - 2*PAD - LABEL_STRIP))
CONTENT_W_RIGHT=$((RIGHT_W - 2*PAD))
CONTENT_H_TOP=$((TOP_H - 2*PAD - LABEL_STRIP))
CONTENT_H_BOT=$((BOTTOM_H - 2*PAD - LABEL_STRIP))

TMP="$(mktemp -d)"
trap "rm -rf $TMP" EXIT

echo "Resizing panels..."
magick "$A" -resize "${CONTENT_W_LEFT}x${CONTENT_H_LEFT}>" -background white -gravity center -extent "${CONTENT_W_LEFT}x${CONTENT_H_LEFT}" "$TMP/A.png"
magick "$B" -resize "${CONTENT_W_RIGHT}x${CONTENT_H_TOP}>" -background white -gravity center -extent "${CONTENT_W_RIGHT}x${CONTENT_H_TOP}" "$TMP/B.png"
magick "$C" -resize "${CONTENT_W_RIGHT}x${CONTENT_H_BOT}>" -background white -gravity center -extent "${CONTENT_W_RIGHT}x${CONTENT_H_BOT}" "$TMP/C.png"

A_X=${PAD}
A_Y=$((PAD + LABEL_STRIP))
B_X=$((LEFT_W + PAD))
B_Y=$((PAD + LABEL_STRIP))
C_X=$((LEFT_W + PAD))
C_Y=$((TOP_H + PAD + LABEL_STRIP))

echo "Compositing canvas..."
magick -size "${W}x${H}" canvas:white \
	"$TMP/A.png" -geometry "+${A_X}+${A_Y}" -composite \
	"$TMP/B.png" -geometry "+${B_X}+${B_Y}" -composite \
	"$TMP/C.png" -geometry "+${C_X}+${C_Y}" -composite \
	"$TMP/composite.png"

echo "Drawing tile borders..."
A_TILE_X1=${PAD}; A_TILE_Y1=${PAD}; A_TILE_X2=$((LEFT_W - PAD)); A_TILE_Y2=$((H - PAD))
B_TILE_X1=$((LEFT_W + PAD)); B_TILE_Y1=${PAD}; B_TILE_X2=$((W - PAD)); B_TILE_Y2=$((TOP_H - PAD))
C_TILE_X1=$((LEFT_W + PAD)); C_TILE_Y1=$((TOP_H + PAD)); C_TILE_X2=$((W - PAD)); C_TILE_Y2=$((H - PAD))

magick "$TMP/composite.png" \
	-stroke "#d6d6d6" -strokewidth 1 -fill none \
	-draw "rectangle ${A_TILE_X1},${A_TILE_Y1} ${A_TILE_X2},${A_TILE_Y2}" \
	-draw "rectangle ${B_TILE_X1},${B_TILE_Y1} ${B_TILE_X2},${B_TILE_Y2}" \
	-draw "rectangle ${C_TILE_X1},${C_TILE_Y1} ${C_TILE_X2},${C_TILE_Y2}" \
	"$TMP/bordered.png"

echo "Adding panel labels..."
LBL_FONT_SIZE=64
LBL_BASELINE_Y_OFFSET=$((LBL_FONT_SIZE - 6))
A_LBL_X=$((A_TILE_X1 + LBL_INSET))
A_LBL_Y=$((A_TILE_Y1 + LBL_INSET + LBL_BASELINE_Y_OFFSET))
B_LBL_X=$((B_TILE_X1 + LBL_INSET))
B_LBL_Y=$((B_TILE_Y1 + LBL_INSET + LBL_BASELINE_Y_OFFSET))
C_LBL_X=$((C_TILE_X1 + LBL_INSET))
C_LBL_Y=$((C_TILE_Y1 + LBL_INSET + LBL_BASELINE_Y_OFFSET))

magick "$TMP/bordered.png" \
	-pointsize "$LBL_FONT_SIZE" -font "Helvetica-Bold" -fill black \
	-annotate "+${A_LBL_X}+${A_LBL_Y}" "A" \
	-annotate "+${B_LBL_X}+${B_LBL_Y}" "B" \
	-annotate "+${C_LBL_X}+${C_LBL_Y}" "C" \
	"$OUT"

echo "✓ wrote $OUT"
magick identify "$OUT"
