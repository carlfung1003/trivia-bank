#!/usr/bin/env bash
# ==========================================================================
# Turn raw ChatGPT Image 2.0 exports into game-ready art.
#
# The generations are 1254-1729px PNGs at 1-2.6 MB each. That is fine as a
# master and far too heavy for a no-build static site where every byte is
# fetched on first paint. Each asset gets sized to what it is actually
# displayed at and encoded for what it actually contains:
#
#   vault door    -> JPEG. It is composited with `screen` over near-black, so
#                    the background is discarded at render time and JPEG's
#                    flat-black blocking never shows. PNG here costs ~8x for
#                    no visible gain.
#   OG card       -> JPEG at exactly 1200x630, the size every scraper wants.
#   app icon      -> PNG. Flat brass on flat black, so PNG's palette
#                    compression beats JPEG and avoids ringing on the edges.
#   panel texture -> a CENTRE CROP at native resolution, never a downscale.
#                    Downscaling a fine brush grain averages it into flat
#                    grey, which is the entire point of the texture gone.
#
# Usage:  bash scripts/process-images.sh [source-dir]
# ==========================================================================
set -euo pipefail

SRC="${1:-$HOME/Desktop/trivia}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ART="$ROOT/assets/art"
ASSETS="$ROOT/assets"
mkdir -p "$ART"

[ -d "$SRC" ] || { echo "no such source dir: $SRC" >&2; exit 1; }

have() { [ -f "$1" ]; }
report() { printf "  %-26s %-12s %s\n" "$1" "$2" "$3"; }

echo "source: $SRC"
echo

# ---- Vault door -----------------------------------------------------------
if have "$SRC/vault door.png"; then
  cp "$SRC/vault door.png" /tmp/_vd.png
  sips -z 1024 1024 /tmp/_vd.png --out /tmp/_vd2.png >/dev/null
  sips -s format jpeg -s formatOptions 82 /tmp/_vd2.png --out "$ART/vault-door.jpg" >/dev/null
  report "vault-door.jpg" "1024x1024" "$(du -h "$ART/vault-door.jpg" | cut -f1)"
else
  echo "  skip: vault door.png"
fi

# ---- Open-graph card ------------------------------------------------------
# v2 is the pick: the wordmark is larger relative to the frame, which is what
# matters when the card renders as a thumbnail in a chat client.
OG_SRC=""
have "$SRC/open-graph card ver 2.png" && OG_SRC="$SRC/open-graph card ver 2.png"
[ -z "$OG_SRC" ] && have "$SRC/Open-graph card.png" && OG_SRC="$SRC/Open-graph card.png"
if [ -n "$OG_SRC" ]; then
  cp "$OG_SRC" /tmp/_og.png
  # Fit to width, then centre-crop to the exact 1200x630 every scraper expects.
  sips -z 633 1200 /tmp/_og.png --out /tmp/_og2.png >/dev/null
  sips -c 630 1200 /tmp/_og2.png --out /tmp/_og3.png >/dev/null
  sips -s format jpeg -s formatOptions 86 /tmp/_og3.png --out "$ASSETS/og.jpg" >/dev/null
  report "og.jpg" "1200x630" "$(du -h "$ASSETS/og.jpg" | cut -f1)"
else
  echo "  skip: open-graph card"
fi

# ---- App icons ------------------------------------------------------------
if have "$SRC/app icon.png"; then
  cp "$SRC/app icon.png" /tmp/_icon.png
  for size in 512 192 180; do
    sips -z "$size" "$size" /tmp/_icon.png --out "$ASSETS/icon-${size}.png" >/dev/null
    report "icon-${size}.png" "${size}x${size}" "$(du -h "$ASSETS/icon-${size}.png" | cut -f1)"
  done
  cp "$ASSETS/icon-180.png" "$ASSETS/apple-touch-icon.png"
  report "apple-touch-icon.png" "180x180" "$(du -h "$ASSETS/apple-touch-icon.png" | cut -f1)"
else
  echo "  skip: app icon.png"
fi

# ---- Panel texture --------------------------------------------------------
# Cropped, not resized. The grain is roughly one pixel wide; any downscale
# averages adjacent light and dark lines into flat grey and the texture stops
# existing. 512px of native-resolution grain tiles fine at the opacity it is
# used at.
if have "$SRC/brushed steel texture.png"; then
  cp "$SRC/brushed steel texture.png" /tmp/_tex.png
  sips -c 512 512 /tmp/_tex.png --out /tmp/_tex2.png >/dev/null
  sips -s format jpeg -s formatOptions 70 /tmp/_tex2.png --out "$ART/panel-texture.jpg" >/dev/null
  report "panel-texture.jpg" "512x512" "$(du -h "$ART/panel-texture.jpg" | cut -f1)"
else
  echo "  skip: brushed steel texture.png"
fi

# ---- Category sigils ------------------------------------------------------
# Emitted as a white-on-transparent ALPHA MASK, not as coloured artwork.
#
# Two reasons. First, size: the brass strokes are anti-aliased over near-black,
# which PNG compresses badly — the coloured sheet was 124 KB, the mask is 18.
# Second, and more importantly, a mask takes its colour from CSS. The sigils
# then inherit currentColor and track the palette for free: brass on a
# category stamp, muted grey on a disabled chip, bright on hover. Baked-in
# colour would have needed a separate sheet per state.
if have "$SRC/Category sigils.png"; then
  cp "$SRC/Category sigils.png" /tmp/_sig.png
  ffmpeg -hide_banner -loglevel error -y -i /tmp/_sig.png \
    -vf "crop=1448:1086:0:0,scale=384:288:flags=lanczos,format=rgba,\
geq=r=255:g=255:b=255:a='clip((max(max(r(X,Y),g(X,Y)),b(X,Y))-20)*2.6,0,255)'" \
    "$ART/sigils.png"
  report "sigils.png" "384x288 mask" "$(du -h "$ART/sigils.png" | cut -f1)"
  rm -f /tmp/_sig.png
else
  echo "  skip: Category sigils.png"
fi

rm -f /tmp/_vd.png /tmp/_vd2.png /tmp/_og.png /tmp/_og2.png /tmp/_og3.png /tmp/_icon.png /tmp/_tex.png /tmp/_tex2.png

echo
echo "total art payload: $(du -ch "$ART"/* "$ASSETS"/og.jpg "$ASSETS"/icon-*.png "$ASSETS"/apple-touch-icon.png 2>/dev/null | tail -1 | cut -f1)"
