# CLAUDE.md — The Trivia Bank

Guidance for Claude Code working in this repo. Read this before changing anything.

**Live:** trivia.carlfung.dev · **Vercel project:** `trivia-bank` · **Repo:** `carlfung1003/trivia-bank`

---

## What this is

A trivia game built on Carl's 735-question bank (`data/questions.json`), which came from
a claude.ai session on 2026-08-16 and before that a 2023 Google Sheet ("Fox's Quiz
Answer"). Iteration 1 — a plain typed-answer quiz with no lifelines and no juice — is
preserved at `docs/prior-art/iteration-1.html` for reference. Do not resurrect it.

## House rules that apply here

- **No build step.** Plain HTML/CSS/ES modules on Vercel, per the `static-site-vercel-pattern`
  wiki article. Do not add a bundler, a framework, or a root `package.json`.
  (`js/package.json` exists ONLY to mark `js/` as ESM for Node so `scripts/*.mjs` can
  import the game modules. It is deliberately not at the root, so Vercel keeps treating
  this as a zero-build static site.)
- **Balance is data.** Every tunable number lives in `js/config.js`. If you find yourself
  typing a number into `engine.js`, `lifelines.js` or `modes`, it belongs in config.
- **No hex outside `css/tokens.css` and `css/material.css`.** One gray family, one easing
  curve (`--ease`), plus one documented impact curve (`--ease-impact`) for struck things.
- **The UI is a machined object, not a document.** `css/material.css` holds the four
  primitives everything is built from — `.mat-plate`, `.mat-inset`, `.mat-glass`,
  `.mat-key` — plus rivets and lamps. ONE light source, above and slightly front: every
  highlight sits on a top edge, every shadow on a bottom edge. Breaking that lighting
  model is what makes CSS "3D" collapse into stacked rectangles.
- **Use `scripts/serve.py`, not `python3 -m http.server`.** The plain server lets the
  browser reuse cached ES modules without revalidating, and since a module's imports
  carry no `?v=`, a stale `./audio.js` survives a reload of a freshly versioned
  `main.js`. That cost a debugging round mid-build, with the page reporting a method
  missing that was plainly on disk. `serve.py` sends `no-store`.
- **No emoji in the UI.** Sigils are mono glyphs (`✦ ◆ ▲ ⌘ ¶ ⁂`). Marks are `✓` / `✕`.
- **CSS keyframes for entrances, not JS.** No SSR flash, no rAF stalls under an
  automation harness, and `prefers-reduced-motion` disarms everything for free.
- **Cosmetic failures must never strand navigation.** `curtainSwap()` wraps its
  sound cues in try/catch and carries a 2s bail timer, because a throwing cue
  once left the transition door opaque over the entire app. Anything decorative
  attached to a load-bearing flow gets the same treatment.
- **Never `alert()` or `confirm()`.** They freeze the entire renderer — this genuinely
  happened during playtesting and killed the Chrome tab. Use `ui.toast()` and
  `ui.armConfirm()`.
- **Git email must be `carlfung1003@users.noreply.github.com`** or Vercel rejects the
  deploy. It is per-commit, not sticky.

## The load-bearing architectural rule

`engine.js` and `lifelines.js` touch **no DOM and no wall-clock**. The engine advances
only through `tick(dt)` and explicit player intents. `ui.js` owns the DOM and owns no
rules. `main.js` is the only module that knows about both.

Keep it that way. It is what makes `scripts/playtest.mjs` able to play thousands of real
runs headlessly, and what makes `window.__game.fastForward()` work. Both have already
caught bugs that a visual pass would not have:

- Blitz never terminated — `+3s` per correct exceeded answer time, so the clock grew
  without bound (252 questions on a 90-second mode). Fixed with `clockCap`.
- Safe havens were verified by scripting a run that clears haven 1 then deliberately
  misses, and asserting the haul survives.

## Before you say it works

Run both, and read the output:

```bash
node scripts/audit-distractors.mjs seed-1     # option quality over the WHOLE bank
node scripts/playtest.mjs 60                  # engine invariants, all four modes
```

`audit-distractors` must report **0 fatal issues**. Fatal means: fewer than 4 options, a
distractor the typed checker would also accept, a duplicate option, or an option echoed
from the question text. Shape/length tells should stay at or under ~0.5%.

Then **actually play it in a browser**. A correct render proves nothing about gameplay —
that rule is in the memory vault as `verify-by-walking-not-rendering` and it applies here.

## Distractor engine — read before touching

`js/distractors.js` is the least obvious file in the repo. The bank is typed-answer only,
so multiple choice, 50/50 and the crowd poll all depend on generated options.

Selection is driven by **ask class** (what the question asks for, parsed from its
interrogative) rather than answer type, because "what is being asked" constrains far
harder than "what the answer looks like". Full rationale and the filter list are in
README.md and in the file's own header comment.

If you change it, re-run the audit across several seeds — a single seed hides problems:

```bash
for s in alpha beta gamma "$(date +%F)"; do node scripts/audit-distractors.mjs "$s" | tail -3; done
```

**Preferred way to improve option quality** is not more heuristics — it is adding an
`options: [...]` array to awkward questions in `data/questions.json`. Authored options
win over synthesis automatically. A malformed list (fewer than 2 entries, or missing the
real answer) falls back to synthesis rather than shipping a broken round.

## Swapping the bank

`data/questions.json` is a drop-in; nothing here rewrites it. Required fields per entry:
`id`, `category`, `difficulty` (`easy|medium|hard`), `question`, `answer`, `accept[]`.
Optional: `options[]`. After swapping, run the audit — a new bank can reintroduce
giveaway rounds that this one does not have.

## The reveal is deliberately delayed

`LOCK_IN_MS` (main.js) holds the verdict for ~260ms after the player answers.
The ENGINE resolves immediately; only the rendering waits. Revealing on the same
frame as the press reads as a form submit — the hold reads as a mechanism
deciding, which is the whole conceit.

Two things this creates, both handled, both easy to reintroduce:

- A pending reveal must be cancelled on the `question` event, or advancing fast
  paints correct/wrong states onto the options of the question that replaced it.
- Player-driven advance goes through `advanceQuestion()`, which refuses while
  `app.revealPending`. The engine's own `next()` is deliberately NOT gated —
  `window.__game.autoplay()` drives it inside a synchronous loop where real-time
  timers never run, so gating it there would hang the harness.

## Known gaps

- **Never tested on a real phone.** The layout IS verified at 390px and 360px via
  `docs/mobile-preview.html`, which renders the game in narrow iframes — media queries
  key off the iframe width, so this exercises the real breakpoints (the Chrome
  automation cannot resize the window below ~1034px). Confirmed: single-column options,
  kit padding clearing the fixed Bank button, mode label hidden, no horizontal overflow.
  What that does NOT cover is real touch targets, iOS Safari's dynamic viewport and
  address-bar behaviour, or the Web Audio unlock gesture on iOS. Try it on an actual
  handset before promoting the link.
- Semantic distractor quality has a ceiling — see README. `options[]` is the fix, and
  26 questions already carry authored sets (`scripts/author-options.mjs`).
- **Generated media is all optional.** `docs/ASSETS.md` has paste-ready Suno and
  ChatGPT Image 2.0 prompts. Audio files in `assets/audio/` are probed at unlock and
  take over from synthesis; `assets/art/vault-door.png` is a pure-CSS-fallback
  background slot. Nothing breaks when they are absent — that is the design.
- Blitz and Survival scores run ~100× higher than Vault Run's. Intentional (separate
  per-mode leaderboards) but it looks odd if they are ever shown side by side.

## Caching (do not "optimise" this back)

`vercel.json` deliberately serves `.js` and `.css` with
`max-age=0, must-revalidate`, NOT `immutable`.

`index.html` versions its entry points (`js/main.js?v=1`), but an ES module's own
imports carry no query string — `main.js` fetches `./distractors.js` unversioned. Marking
JS immutable therefore pins a returning visitor to stale modules for a year, with a fresh
entry point importing year-old dependencies. This is the `seventh-floor` gotcha and it hit
this project in production: the server was serving an updated `distractors.js` while the
browser kept running the cached one, silently. Revalidation costs a 304; a silent mixed
build costs a debugging session.

Images, fonts and icons stay immutable — they are replaced by filename, never edited.

**`vercel.json` takes no comments.** A `"//"` key inside a `headers` entry is a hard
build error (`headers[1] should NOT have additional property //`) — and it fails the
deployment silently from the CLI's point of view, leaving the domain on the previous
build. Reproduce locally with `vercel pull --yes && vercel build` before pushing config
changes; `vercel ls` showing "● Error" is the only other signal.
