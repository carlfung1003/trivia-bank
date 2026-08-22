# Audio slots

Drop generated files here and the game uses them automatically — `js/audio.js`
probes each path at unlock and falls back to synthesis when a file is absent.
No code changes needed.

| File | Used for |
|---|---|
| `theme-title.mp3` | Title screen bed (loops) |
| `bed-tension.mp3` | Optional in-run bed (loops) |
| `sting-vault-open.mp3` | Run cleared / banked |
| `sting-lockdown.mp3` | Run busted |

Generation prompts: `docs/ASSETS.md`.

Keep them small — this is a no-build static site with no streaming. Target
≤1.5 MB per loop, mono is fine for the stings.
