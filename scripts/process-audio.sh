#!/usr/bin/env bash
# ==========================================================================
# Turn raw Suno exports into game-ready audio.
#
# Suno hands back long, loud, fade-ended tracks. Three things have to happen
# before they belong in a no-build static site:
#
#   1. LOOPS MUST ACTUALLY LOOP. Every source fades in its final second, so
#      playing it on repeat drops to near-silence and then jumps back to full
#      volume. Fixed by taking a body segment and crossfading the audio that
#      *follows* it over its own head, so the end flows into the start.
#   2. STINGS MUST HIT ON THE FRAME. A sting with 100ms of leading silence
#      lands visibly late against the particle burst. Trimmed to the transient.
#   3. SIZE. The title theme ships at 3.8 MB for 2m41s. There is no streaming
#      here — the whole file is fetched and decoded. Cut to a loop and
#      re-encoded it is roughly a tenth of that.
#
# Also leaves 3 dB of headroom: sources peak at -0.0 dBFS, and the game mixes
# music with SFX through a limiter, so a hot bed eats the transients.
#
# Usage:  bash scripts/process-audio.sh [source-dir]
#         default source-dir is ~/Desktop/trivia
# ==========================================================================
set -euo pipefail

SRC="${1:-$HOME/Desktop/trivia}"
OUT="$(cd "$(dirname "$0")/.." && pwd)/assets/audio"
mkdir -p "$OUT"

[ -d "$SRC" ] || { echo "no such source dir: $SRC" >&2; exit 1; }

# --- seamless loop --------------------------------------------------------
# $1 in  $2 out  $3 start  $4 length  $5 crossfade  $6 bitrate
make_loop() {
  local in="$1" out="$2" S="$3" L="$4" X="$5" BR="$6"
  local body_start end_start
  body_start=$(python3 -c "print($S + $X)")
  end_start=$(python3 -c "print($S + $L)")

  ffmpeg -hide_banner -loglevel error -y -i "$in" -filter_complex "
    [0:a]atrim=start=${S}:end=${body_start},asetpts=PTS-STARTPTS,
         afade=t=in:st=0:d=${X}[head];
    [0:a]atrim=start=${end_start}:end=$(python3 -c "print($end_start + $X)"),
         asetpts=PTS-STARTPTS,afade=t=out:st=0:d=${X}[tail];
    [head][tail]amix=inputs=2:duration=shortest:normalize=0[seam];
    [0:a]atrim=start=${body_start}:end=${end_start},asetpts=PTS-STARTPTS[body];
    [seam][body]concat=n=2:v=0:a=1,
         loudnorm=I=-18:TP=-3:LRA=11,
         aresample=44100[o]" \
    -map "[o]" -c:a libmp3lame -b:a "$BR" -ar 44100 "$out"
}

# --- sting ----------------------------------------------------------------
# $1 in  $2 out  $3 bitrate
make_sting() {
  local in="$1" out="$2" BR="$3" onset dur fade_at

  # Find the true onset and hard-trim to it with -ss.
  #
  # silenceremove alone is not enough: a single stray sample above threshold
  # in the first frames counts as "not silence", so the filter stops trimming
  # and leaves the gap in place. The lockdown sting kept 107ms of dead air
  # that way, which reads as lag against the screen shake. Measuring the
  # first silence region and seeking past it is unambiguous.
  onset=$(python3 - "$in" <<'PYEOF'
import re, subprocess, sys
src = sys.argv[1]
out = subprocess.run(
    ["ffmpeg", "-hide_banner", "-i", src, "-af",
     "silencedetect=noise=-45dB:d=0.02", "-f", "null", "-"],
    capture_output=True, text=True).stderr
starts = [float(m) for m in re.findall(r"silence_start:\s*([0-9.]+)", out)]
ends   = [float(m) for m in re.findall(r"silence_end:\s*([0-9.]+)", out)]
# Only a silence region that begins at the very top of the file is a leading
# gap; a region starting later is just the sting's own decay.
print(ends[0] if starts and ends and starts[0] < 0.05 else 0)
PYEOF
)
  onset="${onset:-0}"

  dur=$(ffprobe -v quiet -show_entries format=duration -of csv=p=0 "$in")
  fade_at=$(python3 -c "print(round(max(0.1, $dur - $onset - 0.25), 3))")

  ffmpeg -hide_banner -loglevel error -y -ss "$onset" -i "$in" \
    -af "afade=t=out:st=${fade_at}:d=0.25,
         loudnorm=I=-16:TP=-1.5:LRA=11,
         aresample=44100" \
    -c:a libmp3lame -b:a "$BR" -ar 44100 "$out"
}

echo "source: $SRC"
echo "output: $OUT"
echo

# ---- Title theme ---------------------------------------------------------
# 8s in (past the intro) for 72s. The body sits at a steady -13 to -15 dB
# throughout, so any window works; this one avoids both the cold open and the
# louder final third.
for pair in "Title Theme.mp3:theme-title.mp3" "Title Theme version 2.mp3:theme-title-alt.mp3"; do
  f="${pair%%:*}"; o="${pair##*:}"
  [ -f "$SRC/$f" ] || { echo "skip (missing): $f"; continue; }
  echo "loop  $f  ->  $o"
  make_loop "$SRC/$f" "$OUT/$o" 8 72 3 128k
done

# ---- Tension bed ---------------------------------------------------------
# v1 is the better loop by measurement: its head and tail RMS differ by 0.9 dB
# against 14 dB for v2, so the seam is nearly inaudible before crossfading.
for pair in "Tension bed.mp3:bed-tension.mp3" "Tension bed ver 2.mp3:bed-tension-alt.mp3"; do
  f="${pair%%:*}"; o="${pair##*:}"
  [ -f "$SRC/$f" ] || { echo "skip (missing): $f"; continue; }
  dur=$(ffprobe -v quiet -show_entries format=duration -of csv=p=0 "$SRC/$f")
  len=$(python3 -c "print(round(float('$dur') - 3.5, 2))")
  echo "loop  $f  ->  $o  (${len}s)"
  make_loop "$SRC/$f" "$OUT/$o" 0 "$len" 2.5 96k
done

# ---- Stings --------------------------------------------------------------
# Vault-open: the 3.6s take has no leading silence at all; the 4.9s take has
# 164ms, which reads as lag against the coin burst.
# Pick the take with the least leading silence, measured rather than guessed.
pick_tightest() {
  # $1 is a filename glob, matched with find rather than shell expansion:
  # the source paths contain spaces, so `for f in $pattern` word-splits
  # "Short Triumphant*.mp3" into two useless tokens and matches nothing.
  local namepat="$1" best="" best_lead="" f lead
  while IFS= read -r f; do
    [ -f "$f" ] || continue
    lead=$(ffmpeg -hide_banner -i "$f" -af silencedetect=noise=-45dB:d=0.03 -f null - 2>&1 \
           | grep -m1 -oE "silence_end: [0-9.]+" | awk '{print $2}')
    lead="${lead:-0}"
    if [ -z "$best" ] || python3 -c "import sys; sys.exit(0 if $lead < $best_lead else 1)"; then
      best="$f"; best_lead="$lead"
    fi
  done < <(find "$SRC" -maxdepth 1 -name "$namepat" -print | sort)
  printf '%s' "$best"
}

VAULT_SRC=$(pick_tightest "Short Triumphant*.mp3")
if [ -n "$VAULT_SRC" ]; then
  echo "sting $(basename "$VAULT_SRC")  ->  sting-vault-open.mp3"
  make_sting "$VAULT_SRC" "$OUT/sting-vault-open.mp3" 128k
else
  echo "skip (missing): Short Triumphant*.mp3"
fi

LOCK_SRC=$(pick_tightest "Short Dark*.mp3")
if [ -n "$LOCK_SRC" ]; then
  echo "sting $(basename "$LOCK_SRC")  ->  sting-lockdown.mp3"
  make_sting "$LOCK_SRC" "$OUT/sting-lockdown.mp3" 128k
else
  echo "skip (missing): Short Dark*.mp3"
fi

echo
echo "--- result ---"
for f in "$OUT"/*.mp3; do
  [ -f "$f" ] || continue
  d=$(ffprobe -v quiet -show_entries format=duration -of csv=p=0 "$f")
  s=$(du -h "$f" | cut -f1 | tr -d ' ')
  printf "  %-26s %6.1fs  %6s\n" "$(basename "$f")" "$d" "$s"
done
