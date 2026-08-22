# Audio slots

Drop generated files here and the game uses them automatically — `js/audio.js`
probes each path at unlock and falls back to synthesis when a file is absent.
No code changes needed.

| File | Used for | Status |
|---|---|---|
| `theme-title.mp3` | Title screen bed (loops) | shipped, 72s |
| `bed-tension.mp3` | In-run bed (loops, 0.18 gain) | shipped, 34.8s |
| `sting-vault-open.mp3` | Run cleared / banked | shipped, 3.6s |
| `sting-lockdown.mp3` | Run busted | shipped, 4.7s |
| `theme-title-alt.mp3` | Unused alternate take | swap by renaming |
| `bed-tension-alt.mp3` | Unused alternate take | swap by renaming |

These came from Suno and were processed by `scripts/process-audio.sh`, which
does three things the raw exports need:

- **Makes the loops loop.** Every source faded out in its final second, so on
  repeat it dropped to silence and jumped back to full volume. The script
  takes a body segment and crossfades the audio that *follows* it over its own
  head. Measured seam mismatch went from 53 dB to 2.6 dB on the title theme
  and 14 dB to 0.3 dB on the alternate bed.
- **Makes the stings hit on the frame.** The lockdown take had 107ms of dead
  air, which reads as lag against the screen shake. Trimmed to the transient.
- **Cuts the weight.** The title theme was 3.8 MB for 2m41s; it is now 1.1 MB
  for a 72s loop. There is no streaming here — the whole file is fetched and
  decoded before it can play.

Levels are normalised with 3 dB of headroom, because the game mixes music and
SFX through a limiter and a hot bed eats the transients.

To reprocess after generating new takes:

```bash
bash scripts/process-audio.sh ~/Desktop/trivia
```

Generation prompts: `docs/ASSETS.md`.

Keep them small — this is a no-build static site with no streaming. Target
≤1.5 MB per loop, mono is fine for the stings.
