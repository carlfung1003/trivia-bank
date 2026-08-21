# The Trivia Bank

A trivia heist. Twelve locks, two safe havens, five tools in the kit — bank your haul or push your luck.

**Live:** [trivia.carlfung.dev](https://trivia.carlfung.dev)

Built on a 735-question bank that started life as a 2023 Google Sheet of quiz answers.

---

## Modes

| Mode | Shape | Tools |
|---|---|---|
| **Vault Run** | 12 locks, difficulty ramps easy → hard, safe havens at 4 and 8. A miss ends the run and drops you to the last haven. Bank out at any time. | all 5 |
| **Blitz** | 90 seconds. Correct buys +3s (capped at 90), a miss costs 5s. Pure speed. | none |
| **Survival** | Three alarms, endless vault, difficulty escalates every 5 locks. | Drill, Freeze |
| **Daily Heist** | 10 locks, seeded by the date — the same ten for everyone, everywhere. One attempt, spoiler-free share card. | Drill, Wiretap |

## The kit

- **Drill** — burn away two wrong answers (50/50)
- **Wiretap** — poll the room. Deliberately honest: on Federal locks the crowd is genuinely split, so spending it is a decision rather than a free answer
- **Freeze** — jam the clock on one lock, for as long as you like
- **Bypass** — swap the lock for a fresh one, no penalty
- **Double Down** — declared *before* answering: double the payout, or lose your entire unbanked haul

## Scoring

```
base(difficulty) × speed bonus × streak multiplier × mode modifiers
```

Petty 100 · Grand 250 · Federal 500. Speed bonus up to ×1.5 for answering fast, streak
multiplier climbs 1 → 1.2 → 1.5 → 2 → 2.5 → 3, and typing the answer instead of
picking it pays ×1.5. Every one of those numbers lives in `js/config.js`.

---

## Running it

No build step. It is plain HTML, CSS and ES modules.

```bash
python3 -m http.server 8791
open http://127.0.0.1:8791/
```

ES modules and `fetch` do not work over `file://` — it has to be served over HTTP.

### Checks

```bash
node scripts/audit-distractors.mjs [seed] [--show=8] [--cat="Music"]
node scripts/playtest.mjs [runs]
```

`audit-distractors` runs the option generator over the whole bank and fails on
anything that would ruin a round. `playtest` drives the real engine headlessly
across every mode with scripted players and asserts the game's invariants.
Both are plain Node, no dependencies.

---

## Swapping the question bank

`data/questions.json` is a drop-in. Nothing in the codebase rewrites it. Keep this shape:

```jsonc
{
  "meta": { "name": "...", "version": "1.0.0", "count": 735 },
  "categories": ["Geography", "History", "..."],
  "questions": [
    {
      "id": 1,
      "category": "Geography",
      "difficulty": "easy",          // easy | medium | hard
      "question": "What is the largest country in the world by land area?",
      "answer": "Russia",
      "accept": ["russia", "russian federation"],   // for Type-It mode
      "options": ["Russia", "Canada", "China", "Brazil"]   // OPTIONAL
    }
  ]
}
```

`options` is optional. When present it is used verbatim (shuffled); when absent
the game synthesises four options at runtime — see below.

---

## How multiple choice works on a typed-answer bank

The bank has no multiple-choice options. Rather than rewrite 735 questions by hand
(which would freeze the bank), `js/distractors.js` generates them at runtime.

The naive version gives the game away:

> **What is the capital of Mongolia?**
> A. The Milwaukee Deep, in the Puerto Rico Trench  B. Sweden
> C. **Ulaanbaatar**  D. The Atlantic and the Pacific

Only one option is a city, so no knowledge is required. Selection is therefore driven
by what the question **asks for**, not by what the answer looks like. Every entry is
tagged with an *ask class* parsed from its interrogative — `capital`, `country+multi`,
`who:painted`, `year`, `count` — and distractors come first from other questions asking
the same thing. Capital-city questions borrow from other capital-city questions.

On top of that:

- **numbers and years are generated, not borrowed** — including spelled-out ones, so
  "Seven" gets "Five"/"Nine", never "32"
- **nothing that appears in the question text** — no "Mount Everest" offered as an
  answer to a question about Mount Everest
- **word-count band and conjunction matching** — "Nepal and China" draws other country
  pairs, not single countries
- **alias-collision rejection** — a distractor the typed-answer checker would also mark
  correct is the worst possible bug, and is checked for explicitly
- **relational answers are never borrowed** — "The other way around" is a fine answer to
  *what does vice versa mean* and nonsense beside three islands

Three questions in the bank are structurally unique (long definitional answers with no
peers). They are marked not-viable for multiple choice and only appear in Type-It mode,
where length is not a tell.

Measured over the whole bank across six seeds: **0 fatal issues, ≤0.5% giveaway rounds.**

The remaining ceiling is semantic — nothing in the bank knows that *"Répondez s'il vous
plaît"* is a silly answer to *"what are the five vowels in English"*, since both are five
tokens of text. The `options` field exists for exactly that: hand- or LLM-written
distractors for the awkward questions, droppable into the JSON with no code change.

---

## Architecture

```
index.html
css/    tokens · base · game · fx          design tokens; no hex outside tokens.css
js/
  config.js       ALL balance numbers. No magic numbers anywhere else.
  util.js         seeded RNG, normalisation, similarity — pure
  distractors.js  ask-class tagging + option synthesis — pure
  bank.js         load, filter, draw, typed-answer checking
  engine.js       game rules. Zero DOM, zero wall-clock. Driven by tick(dt).
  lifelines.js    the kit. Pure state transitions on a Game.
  store.js        localStorage: records, achievements, prefs
  ui.js           owns the DOM, owns no rules
  fx.js           particles, shake, hit-pause, counter roll-up
  audio.js        Web Audio synthesis — no asset files
  share.js        spoiler-free text + canvas result card
  main.js         the only module that knows about both engine and DOM
data/questions.json
```

The engine takes no wall-clock time and touches no DOM, so the whole game can be
played headlessly at any speed. That is what makes `scripts/playtest.mjs` and the
debug API below possible.

### Debug API

```js
__game.start('vault')            // or blitz | survival | daily
__game.answer('correct')         // 'correct' | 'wrong' | index | text
__game.next()
__game.lifeline('drill')
__game.fastForward(30)           // advance the clock without waiting
__game.autoplay({ accuracy: 0.7 })  // play a whole run, returns the summary
__game.state
```

---

## Accessibility

- `1`–`4` or `A`–`D` to answer, `D`/`W`/`F`/`B`/`X` for tools, `Enter` to advance, `Esc` to leave
- Correct and wrong never rely on colour alone — a ✓/✕ mark, a border weight and a
  position change carry the same information
- `prefers-reduced-motion` disarms shake, particles, grain and the heartbeat, and
  collapses every duration token
- Verdicts are announced through an `aria-live` region
- No `alert()` or `confirm()` anywhere — they block the renderer and look wrong

## Licence

Code MIT. The question bank is personal content, not licensed for reuse.
