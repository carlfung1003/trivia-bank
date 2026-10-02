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

## Visual system (v2, Sep 2026) — read before restyling

The first build read as generated UI: every surface the same gray plate, every label
tiny letter-spaced mono, the vault art dimmed to nothing, text-only mode cards. v2 kept
the machined-brass identity and executed it like a game. The rules that came out of it:

- **Four faces, one job each** (`tokens.css`). Bodoni = the bank (wordmark, questions,
  answers, headlines). Big Shoulders (`--font-hud`) = every label, button, gauge and
  chip. Big Shoulders **Stencil** (`--font-stencil`) = only things that are *struck*:
  verdict stamps, mode names, rank. Plex Mono = digits only (flaps, dials, readouts).
  Do not bring back mono caps at 0.26em tracking for labels — that was the loudest tell.
- **Key art is the backdrop.** `.vault-scene` (fx.css) shows `assets/art/scene-vault.jpg`
  vivid on the title and blurred and dimmed behind play (`body[data-screen]`). The
  procedural rings and door disc are hidden where the painting is on show and come
  forward only behind play, where the disc turning on each hit still works.
  Dust and light shafts are CSS layers, no canvas. Prompts are in `docs/ASSETS.md` Part C.
- **Mode cards carry art** from `assets/art/modes/<id>.jpg`, set as `--art` inline.
  The URL is **root-absolute on purpose**: a relative `url()` inside a custom property
  resolves against the stylesheet that uses `var()` (css/), not the page, and 404s.
- **Verdicts are stamped.** `ui.strikeStamp()` puts CRACKED / ALARM / TIME'S UP / SO
  CLOSE / ALIBI across the display glass, and the question dims under it (`:has`).
  The Alibi is announced by the stamp and verdict line only. A banner used to fire as
  well and swept straight across the question.
- **Banners live at the top of the screen**, over the HUD, never over the question.
  Tier banners fire the instant a question lands with its clock running.
- **Buttons are keys** (`base.css .btn`): face gradient, a lip that shrinks as it
  travels, brass for primary, steel otherwise. `.btn--xl` is for the one CTA per screen.
- **The kit has icons** (`TOOL_ICONS` in ui.js, 24px strokes). On phones the tools a
  mode can never use (`kitState().inapplicable`) are hidden; desktop keeps them dimmed.
- **Rank** (`RANKS` in config.js) is presentation only, from lifetime credits. Nothing
  is gated on it.
- `scripts/serve.py` crashed its own log hook on every 404 and dropped the connection,
  so a missing asset showed as `ERR_EMPTY_RESPONSE`. Fixed. If you see that error
  locally again, suspect the server before the page.

- **Play screens fit one screen** (the "FIT TO SCREEN" block at the end of game.css).
  The console is capped at `100dvh`; the display is the row that gives, down to
  `--glass-floor` **at every width** (150px, 128px on phones, less on short tiers); short
  phones (≤700px tall) pay with 2×2 keys and a one-row Type-It form; the verdict takes
  the kit's slot during a reveal **at every width**; the Bank button docks under the
  console (in landscape it sits at the right end of the kit rail); The Street's board
  scrolls in its own well.
- **Short screens are keyed on HEIGHT, not width.** Sep 2026: the floor existed on
  phones only, so a 1000×581 laptop window with Bank docked squeezed the glass to 32px
  and cut the question off mid-line — while the previous check reported "0px overflow".
  Tiers at `max-height: 820 / 660px` (width >720) and `orientation: landscape` +
  `max-height: 480px` take the room out of the crown, keys and kit, never the question.
- **`ui.fitQuestion()` is the guarantee.** CSS cannot know a question is 118 characters.
  On overflow it widens the measure, then binary-searches the size down (floor 13px); a
  ResizeObserver on the glass refits on any resize (Bank docking, reveals, viewport).
  It measures with transitions OFF: reduced motion puts a 1ms `all` transition on every
  element, and the trial sizes read stale. Never give `.display__head` `min-height: 0`:
  that lets its grid row collapse, the stamps spill above the glass, and the fitter
  shrinks the question to the floor chasing an overflow it did not cause.
- **Prove it with `scripts/fit-audit.cjs`**, not by eye and not by page overflow. It pins
  the longest question (#108) and the longest-options question (#516) onto the glass,
  in live / reveal / Bank-docked / Type-It+intel, across 14 viewports (laptops with the
  browser chrome up, landscape phones, the four iPhones) in Chromium and WebKit, and
  fails on any clipped pixel, a question at the type floor, page overflow, or the Bank
  button covering a key. Run it both ways; production before this fix failed 85 of 147:

  ```bash
  PLAYWRIGHT_MODULE=~/ai-journey/node_modules/playwright node scripts/fit-audit.cjs
  PLAYWRIGHT_MODULE=~/ai-journey/node_modules/playwright node scripts/fit-audit.cjs --motion
  ```

  Then still look at the screenshots (`--shots <dir>`) with the `mobile-web-hardening`
  skill's eye: the audit measures fit, not whether it looks right.

Judge changes with the screenshot rig, never from code: desktop 1440×900 and a
390×844 phone, every screen (title, play, reveal, busted hold, results, board, street).

```bash
python3 scripts/serve.py 8765 &
PLAYWRIGHT_MODULE=~/ai-journey/node_modules/playwright node scripts/shots.cjs /tmp/tb-shots
```

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
distractor the typed checker would also accept, a duplicate option, an option echoed
from the question text, or a **cue tell** — the right answer is the only option repeating
a word from the question ("a lion cub named Simba" -> The Lion King, "headed by a shogun"
-> the shogunate). Shape/length tells should stay at or under ~0.5%.

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

**Every question now carries hand-written options** (Sep 2026, all 904). A real-phone
playtest found synthesis offering "343 metres per second" and "White blood cells" for the
smallest bone, and "b"/"q" for a chemical symbol. Synthesis borrows other answers by
shape and cannot know meaning, so it is now only the fallback for a swapped-in bank.

**Then every set was read as a player** (Sep 2026, KAN-248): eight independent reviewers,
113 questions each, looking only for what the audit cannot see — a wrong option that is
defensibly right (Tintoretto also painted a *Bacchus and Ariadne*; bee larvae do spin
silk), one that is not the same kind of thing (a katana among fencing weapons, bánh mì
among noodle soups), and giveaways (three provinces offered against the only country
starting with Q; the one option that repeats the clue's word). 52 questions changed: 36
reworded in `amend-questions.mjs`, 18 option sets in the `WRONG` table and one alias list
tightened, each with its reason; 5 proposals were rejected because the "arguably right" option was the
best near-miss and the wording already ruled it out (Johann Strauss II, Brâncuși). The
cue tell went into the audit so the commonest kind cannot come back. When a rewording
lengthens a question, keep it under ~118 characters — `fit-audit.cjs` probes the longest.

The data pipeline, in this order:

```bash
node scripts/amend-questions.mjs    # content fixes, each with a reason (idempotent)
node scripts/author-options.mjs     # scripts/authored-options.json + WRONG table -> bank
node scripts/test-matching.mjs      # includes the own-option sweep
node scripts/audit-distractors.mjs seed-1
```

`scripts/authored-options.json` is the bulk set (three wrong options per id). The
`WRONG` table in `author-options.mjs` is for annotated overrides and wins on overlap. The
bar the options were written to: same kind of thing as the answer, genuinely tempting
(the near-miss people actually give), parallel form (article, qualifier, units, length),
and *definitely* wrong. Writing wrong answers is how ~35 bad questions were found: a
second valid answer, a stale fact, a clue containing its answer. Those fixes live in
`amend-questions.mjs`. Change a question's wording there, never by hand in the JSON,
so the reason travels with it.

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

## A run that ends on a miss holds on the answer

Busted (Vault Run), alarms (Survival) and time (Blitz) all end on a lock the player
did not get. The engine emits `reveal` and then `over` in the same synchronous call, so
`onOver` used to swap straight to the results and put the door down over the verdict.
The player learned they were wrong and never saw what was right.

Now `onOver` records the run immediately (closing the tab must not lose it), then for
those three reasons parks `showResults` in `app.pendingResults` and relabels the verdict
button "See the damage". `advanceQuestion()` and Enter/Space call it. Blitz has no
reveal of its own when the clock dies mid-question, so `onOver` paints one for the
unanswered lock. Banked, cleared and exhausted runs still go straight to the results.
If you add an ending, decide which list it belongs in (`ENDS_ON_A_MISS`, main.js).

## The Alibi — the one passive tool

Vault Run carries `alibi` (config `passive: true`): the run's first miss is forgiven.
Nothing presses it. Nobody knows in advance which lock they are about to miss, so an
armed version would only pay out for players who guessed right about being wrong.

- It is spent in `engine._forgive()`, during resolution, not in lifelines.js.
  `canUse()` always returns false for it, and the kit renders it enabled (not dimmed)
  with an `AUTO` key label and a jade lamp. Clicking it explains itself in a toast.
- A forgiven miss is still a miss: streak resets, `wrongCount` goes up, Clean Sweep is
  lost, and it counts as a tool used (so Bare Hands keeps its meaning). Only the bust is
  waived.
- A haven reached on a forgiven miss still locks in. The ladder shows the haven behind
  you, and a later miss dropping you below it would contradict the ladder.
- A forgiven miss on lock 12 does not end the run in the same call. It stays REVEALED
  so the answer can be read, and `next()` banks the pot and ends `cleared`.
- A Double Down riding on the forgiven miss still loses the pot. The two compose.

`scripts/playtest.mjs` asserts all of the above. Disabling `_forgive()` fails ten checks.

## Typed-answer matching is deliberately graded

`bank.checkTyped()` returns `true | "close" | false`. **"close" is truthy** — compare it
explicitly or near misses score points. `engine.js` does; anything new must too.

Leniency stops where a near miss stops being a slip:

- **Per word, never per string.** A whole-string tolerance loose enough to accept
  "Ulanbatar" for "Ulaanbaatar" also accepts "bytes per minute" for "beats per minute" —
  identical edit distance, completely different answer. Scoring word by word gives long
  words room and short words none.
- **Exact required** for anything containing a digit, and anything four characters or
  shorter. "1913" is not a typo for 1912; "K" is not a typo for "C".
- **Prefix abbreviations only in multi-word answers**, where the other words anchor it.
  On a single-word answer "sil" would sail through as "silver".

Two rules do work edit distance cannot, and each exists because the other one alone got
a real verdict wrong:

- **Inflection is not a typo** (`sameWordFamily`, util.js). "Play louder" for "Play
  loudly" is two slips on a six-letter word — one past tolerance, so the checker called
  a right answer *close* and scored it wrong. Both words must reduce to the SAME stem of
  four characters or more, which is why this is safe where the prefix rule is not: "sil"
  does not reduce to "silver", but "louder" and "loudly" both reduce to "loud". The
  four-character floor is what stops "water", "forest" and "Italy" being shredded into
  "wat", "for" and "Ita" — it costs a few genuine cases ("bigger" stops at "bigg") and
  that is the right trade, because over-stripping fails silently.
- **A real word is never a typo for another real word** (`bank.lexicon`, which holds
  every answer, alias AND authored option: with answers alone, "Reflection" passed for
  Refraction and "Phycology" for Mycology, since neither answers anything). Edit distance
  cannot tell "Entomology" from "Etymology", or "Titian" from "Titan", or "Austria" from
  "Australia" — every pair is inside tolerance, and every pair is two separately askable
  questions in this bank. Only the bank knows which strings are real answers with their
  own meaning, so `checkTyped` withholds the fuzzy pass entirely when the input spells
  some other question's answer verbatim. Exact and alias matching run first, so this can
  never reject a question's own answer.

`node scripts/test-matching.mjs` guards all of it: 65 explicit cases, plus two sweeps —
every answer and alias must match itself, and no other question's answer may match. The
REJECT cases matter more than the accepts; a checker that accepts everything has quietly
stopped being a quiz. Run it after any change to matching, normalisation, or the bank.

The cross sweep is **every ordered pair** (~816k, a few seconds), not a sample. It used
to walk a 129-pair diagonal and report a clean bill of health while all three word pairs
above were being accepted. Do not thin it back out to save runtime; a sampled sweep of a
matching table is a sweep that passes.

## Two viability filters, one per answer mode

- `isChoiceViable()` (distractors.js) — can this be asked as MULTIPLE CHOICE?
  Fails when an answer has no structural peers, so any three distractors leave it
  the visible odd one out.
- `Bank.isTypedViable()` (bank.js) — can this be asked as TYPE-IT? Fails when
  nobody could reasonably produce the answer letter by letter.

They are not symmetric, and neither is decoration. "What does RSVP stand for?" is a
good multiple-choice question and a terrible typing question: reproducing "Répondez
s'il vous plaît" tests French, not trivia.

Structural cases are automatic — over five words, over 30 characters, or two or more
commas (lists are an enumeration test). The five-word cutoff is deliberate: titles and
names sit right at it, and both "The Silence of the Lambs" and "Ludwig Mies van der
Rohe" are five words and perfectly typeable.

What the rules cannot see is producibility, so a bank entry may carry `typedOk: false`
to override — `scripts/author-typed-flags.mjs` holds those seven, all set-phrase
answers in another language. The judgement lives in the data, so a swapped bank can
carry its own.

Both filters thread through `pool` / `count` / `draw` / `drawRun`, and BYPASS must pass
them too or it can swap in a question the mode just excluded.

## Type-It shows the answer's shape, and that is the point

`renderShape()` puts one slot per letter, grouped into words, under every typed
question. It is free — not a lifeline — and it is why the mode is playable.

The diagnosis matters more than the feature. Typed mode felt brutal, and the obvious
read was that the answers were too long, so the first instinct was to tighten
`isTypedViable` to three words. Modelling it showed that would have cut 46 perfectly
typeable answers — "Central Processing Unit", "The Silence of the Lambs", "Wolfgang
Amadeus Mozart" — while keeping the actual offenders. Length was never the problem.
Typing BLIND was. Do not re-tighten the thresholds; add shape affordances instead.

## Freshness — a returning player sees new questions first

Each run used to forget every run before it. Measured with `scripts/freshness.mjs`
(30 consecutive runs, 20 simulated players): a player who cleared Vault Runs met a repeat
from the **second run**, and by the thirtieth ~4 of every 12 locks were ones they had
seen. Survival and Blitz were worse.

Now `store.js` keeps `recent` — question ids, least recently seen first, written the
moment a question reaches the glass (`markSeen`, from main.js on `question` and on a
Bypass swap; a run quit halfway still saw its locks). `main.js` hands it to the engine as
`recent`, and `bank.draw` prefers an unseen question **within the requested tier**; once
a tier is all seen it draws from that tier's least recently seen share
(`FRESHNESS.staleShare`). Result: zero repeats in 30 runs for every profile, and the
first repeat for a lock-clearing Vault player moves from run 2 to run 64.

Three rules, all asserted by `playtest.mjs` (switching history off fails 16 checks):

- **Freshness never overrides the tier.** The Vault ramp is identical lock for lock.
- **The Daily Heist ignores history** (`oneAttemptPerDay` in the engine constructor). It
  is the same ten locks for everyone on a date; a personal history would break that.
- **A fully seen bank still draws.** Survival with every id in `recent` starts normally.

The Board and The Street are separate engines and do not use this yet.

## The Board — the second engine

`js/jeopardy.js` is a **separate rules engine** from `engine.js`, running off a **separate
data file** (`data/jeopardy.json`) onto a **separate screen**. That is deliberate and worth
defending: `engine.js` models a queue of questions and this models a grid you pick from.
Grafting thirty cells, two floors, hidden wagers and a final round onto the queue would
have put four working modes at risk to save one file. They share the matcher and
`config.js` — the two things that genuinely want to agree — and nothing else.

The house rules still apply in full: no DOM in `jeopardy.js`, no rules in `board-ui.js`,
`main.js` the only module that knows both, every number in `config.js` (`BOARD`).

**Shape.** Six columns × five rows, values `tier × 200` on the first floor and `× 400` on
the second, then one final clue. Tiers are difficulty, not money, so any pack can be dealt
into either floor.

**Deviations from television, all deliberate:**

- **Solo.** No rivals to buzz against, so a clue is yours the moment you pick it.
- **The question form is optional and rewarded.** `stripQuestionForm()` removes a leading
  "What is…" before matching, and `BOARD.formBonus` pays 20% for having supplied one.
  Requiring it would test typing, not knowing; ignoring it would throw away the format.
- **You can pass.** This is the single most important rule in the mode and it was
  discovered by the headless sweep, not by playing. Without it, picking a cell is a forced
  bet, and a player who knows a third of the board finishes at **minus eleven thousand** —
  the sweep's `cautious` profiles exist to hold that line. A pass spends the cell and costs
  nothing, which is exactly what not buzzing does on the show. It is tracked as `passed`,
  never as `wrong`.
- **A committed wager cannot be passed out of.** Escape and the Pass button are both
  refused once a wildcard or the final is live.

**Before you say it works:**

```bash
node scripts/audit-jeopardy.mjs        # pack structure, self-match, cross-accept
node scripts/playtest-board.mjs 60     # seven player profiles, full games
```

**Facts rot, so the audit checks for the shape of a rotting fact.** `scripts/recency.mjs`
flags claims that stop being true without anyone editing them — live counts, uncontested
superlatives, "still the only", "the current". Two had already shipped:

- *"Nineteen EU countries share this currency"* — twenty-one since January 2026.
- *"Spirited Away is still the only hand-drawn feature to take the animation Oscar"* —
  The Boy and the Heron, 2024.

Note what both also contained: a year. The linter's first cut treated any date as proof
the author had pinned the claim down and waved both straight through. That was backwards.
"In 2002" dates the euro's launch and says nothing about how many countries use it now.
So a date only excuses patterns a date can genuinely fix (`anchorable: true`); a live
count and a "still the only" are never excused. **When authoring, prefer a fact that
cannot move** — an etymology, a definition, a date, a physical constant — over one that
merely happens to be true today.

The audit's most useful check is the **echo test** — an answer sitting in its own clue.
It caught four on the first run. `STUPID ANSWERS` declares `"echoOk": true` because giving
the answer away IS that category's joke; nothing else may.

**Adding a pack:** append to `categories` in `data/jeopardy.json` with an `id`, a CAPS
`name`, an optional `blurb`, and exactly five clues at tiers 1–5. Run the audit.

**Variants — several packs under one heading.** `name` may repeat; `id` may not. The
dealer collapses variants to one pack per heading BEFORE sampling, then dedupes by name
across floors, so "DIM SUM" can turn up in a later game with five clues you have not seen
and can never appear twice in the same game. Sampling first and filtering after would have
quietly dealt five-column floors whenever two variants collided — that ordering is the
whole of `dealRound`.

The audit enforces the pair: ids unique, and no two packs under one heading sharing a clue
or an answer. A variant that recycles questions is not a variant.

Current file: **107 packs under 72 headings, 535 clues, 32 finals** —
6 full games with no heading repeated, and 19 headings carrying more than
one set of questions.

**Shared state, separately kept.** `store.record()` branches on `mode === "board"`: its
categories go to `boardCategories`, never to the vault's twelve, or a board run would put
"DIM SUM" in the ledger and hand out Polymath. Every numeric add there is coerced through
`num()`, because one `undefined` reaching a `+=` writes NaN into localStorage permanently.

## The Street — the third engine

`js/survey.js` on `data/surveys.json`. Family Feud's shape: one open prompt, a ranked
board of hidden answers, each worth its share of the room. Three strikes ends the round.
Third engine, third data file, third screen, same three rules — no DOM in `survey.js`, no
rules in `street-ui.js`, every number in `config.js` (`STREET`).

**⚠️ The percentages are AUTHORED, not collected.** Nobody was surveyed. They are balance
numbers picked to feel like a real spread. This is why the UI says *"the street reckons"*
and never *"we asked 100 people"* — the mechanic is the fun, and a made-up statistic
should not be dressed as research. The `meta.honesty` field in the data file says the same
thing; keep it accurate if the bank is ever swapped for real data.

**What changed from television, and why:**

- **Banking replaces the steal.** Solo, there is no rival family, and three strikes with
  nothing at stake is a shrug. So the pot is live until you lock it and a third strike
  takes all of it — the show's "do we risk one more?" rebuilt out of the mechanic this
  site already had.
- **A repeat is not a strike.** `guess()` matches against found slots too, precisely so
  saying something twice comes back as `"repeat"`. Burning a strike on a memory slip reads
  as a bug.
- **"close" counts as a hit here**, unlike everywhere else in the codebase. On an
  open-text board the alias lists cannot anticipate every phrasing, and being strict
  punishes the exact thing the mode is for. It is still compared explicitly — never let
  the truthiness of `"close"` decide anything by accident.

**Before you say it works:**

```bash
node scripts/audit-surveys.mjs [--show=6]   # structure, shares, AMBIGUITY
node scripts/playtest-survey.mjs 60         # ledger + the decision curve
```

The audit's headline check is **ambiguity**: no guess may match two slots on the same
board. That is the failure that ruins an open-text game — you say the right thing and the
board picks which right thing you meant. Zero is the only acceptable number.

Current file: **153 survey boards, 956 answers** — 30 runs before a
board could repeat.

The playtest asserts something a balance pass cannot eyeball: **banking must be a real
decision.** Holding knowledge fixed and varying only what a player does on running dry,
swinging has to pay for a player who knows the board and banking has to pay for one who
does not. Current numbers: sharp +13% for swinging, clueless +11000% for banking, average
+14% for banking. If either half flips, one of the two buttons is decoration.

That invariant also caught a bad *test*, which is worth remembering: the first version
compared fixed-threshold bankers against never-bankers and reported that banking never
pays. The model was wrong, not the game — nobody locks a small pot while still holding
good answers. Fix the player before tuning the balance.

## Known gaps

- **iOS, from the first real-iPhone session (Sep 2026):** pull-to-refresh reloaded the
  page mid-run and double-tap zoomed the console. Both are off in `base.css`
  (`overscroll-behavior-y: none`, `touch-action: manipulation`); pinch zoom still works.
  `node` + Playwright's `webkit` (installed under the ai-journey copy) renders the real
  Safari engine at iPhone size — use it before claiming anything about iOS.
- **Played on a real phone (Oct 2026):** Carl's verdict was "smooth and fun". That is
  the feel check the automated rigs cannot give; it says nothing specific about audio or
  which browser, so keep the WebKit checks as the gate for layout changes.
- **Earlier, only lightly tested on a real phone.** The layout IS verified at 390px and 360px via
  `docs/mobile-preview.html`, which renders the game in narrow iframes — media queries
  key off the iframe width, so this exercises the real breakpoints (the Chrome
  automation cannot resize the window below ~1034px). Confirmed: single-column options,
  kit padding clearing the fixed Bank button, mode label hidden, no horizontal overflow.
  What that does NOT cover is real touch targets, iOS Safari's dynamic viewport and
  address-bar behaviour, or the Web Audio unlock gesture on iOS. Try it on an actual
  handset before promoting the link.
- All 904 questions carry authored options; synthesis only runs for a swapped-in bank.
  Two shape tells remain by necessity (#655 "Ko", #894 "It": no peers of that length).
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
