# The Trivia Bank

A trivia heist. Twelve locks, two safe havens, five tools in the kit — bank your haul or push your luck.

**Live:** [trivia.carlfung.dev](https://trivia.carlfung.dev)

Built on a 904-question bank that started life as a 2023 Google Sheet of quiz answers,
plus 133 authored clues for The Board and 189 survey answers for The Street.

---

## Modes

| Mode | Shape | Tools |
|---|---|---|
| **Vault Run** | 12 locks, difficulty ramps easy → hard, safe havens at 4 and 8. A miss ends the run and drops you to the last haven. Bank out at any time. | all 5 |
| **Blitz** | 90 seconds. Correct buys +3s (capped at 90), a miss costs 5s. Pure speed. | none |
| **Survival** | Three alarms, endless vault, difficulty escalates every 5 locks. | Drill, Freeze |
| **Daily Heist** | 10 locks, seeded by the date — the same ten for everyone, everywhere. One attempt, spoiler-free share card. | Drill, Wiretap |
| **The Board** | A Jeopardy-shaped grid: 6 categories × 5 clues, two floors, hidden wagers, one final clue. Its own engine and its own clue file. | pass |
| **The Street** | A Family Feud–shaped survey board: one prompt, a ranked set of hidden answers, each worth its share of the room. Three strikes and the pot is gone. | bank |

### The Street

*"Name the most popular wizard."* — and the board holds Harry Potter at 30%, Gandalf at
21%, Merlin at 14%, down to Saruman at 4%. Say what you reckon; every answer you name adds
its share to the pot.

- **Three strikes takes everything on the table.** There is no rival family to steal it, so
  the tension is a decision instead: bank the pot and move on, or swing at the tail.
  Sweeping a whole board pays a 50% bonus, which is what makes swinging tempting.
- **Open text, not options.** Long authored alias lists do the matching — "dr strange",
  "professor dumbledore" and "Gandalf the Grey" all land — and the audit refuses to ship a
  board where one guess could match two slots.
- **Saying the same thing twice is free.** A repeat is a memory slip, not a wrong answer.
- **Five surveys per run**, the last three at double and triple value.

**The percentages are authored, not collected.** Nobody was surveyed — they are balance
numbers chosen to feel like a real spread. That is why the screen says "the street
reckons" rather than "we asked 100 people".

Boards cover the everyday (kitchen drawers, the chore nobody wants, dim sum, what you do
the moment you get home from work, things you always lose) and the pop-culture "most
popular X" shape (wizards, superheroes, detectives, pet names).

### The Board

A clue is a statement; the response is a question. `What is a martini?` and `a martini`
are both accepted — requiring the wrapper would test typing rather than knowing — but
supplying one pays a 20% bonus, because the format is the point.

- **Two floors.** Values are `tier × 200`, then `tier × 400`. Tiers are difficulty, not
  money, so a pack can be dealt into either floor. Twenty-five packs means four floors'
  worth and no repeats within a game.
- **Wildcards.** One hidden cell on the first floor, two on the second, never in the top
  row. You name a stake before the clue is shown, and only you can answer it.
- **The Last Lock.** One clue, one wager up to everything you have. It is the last thing
  that happens.
- **Pass.** A clue you decline spends the cell and costs nothing — the solo equivalent of
  not buzzing. Without it the mode is a forced bet on every pick, and the headless sweep
  showed what that does: a player who knows a third of the board finishes eleven thousand
  dollars down.

Categories mix the recurring staples the show actually runs — Before & After, Potpourri,
Rhyme Time, Potent Potables, Word Origins, State Capitals, Stupid Answers, Anagrams —
with everyday ones: Dim Sum, On The Menu, Around The House, Household Chores, Holidays,
Name That Country, At The Movies.

## The kit

- **Drill** — burn away two wrong answers (50/50)
- **Wiretap** — poll the room. Deliberately honest: on Federal locks the crowd is genuinely split, so spending it is a decision rather than a free answer
- **Freeze** — jam the clock on one lock, for as long as you like
- **Bypass** — swap the lock for a fresh one, no penalty
- **Double Down** — declared *before* answering: double the payout, or lose your entire unbanked haul

**Type-It only** (Drill and Wiretap both need options on screen, so typing gets its own pair):

- **Etch** — scrape out the answer's opening letter. Skips leading articles, so
  "The Strait of Gibraltar" gives **S**, not T
- **Informant** — a real authored clue. All 735 questions carry one

Type-It also shows the answer's **shape** for free — one slot per letter, grouped into
words — because the mode's difficulty was never the length of the answers, it was not
being able to see what you were aiming at.

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
python3 scripts/serve.py 8791
open http://127.0.0.1:8791/
```

Use `serve.py` rather than `python3 -m http.server` — it sends `no-store`, which is the
only reliable way to avoid the browser reusing a cached ES module during development.

ES modules and `fetch` do not work over `file://` — it has to be served over HTTP.

### Checks

```bash
node scripts/audit-distractors.mjs [seed] [--show=8] [--cat="Music"]
node scripts/playtest.mjs [runs]
node scripts/test-matching.mjs
node scripts/audit-jeopardy.mjs
node scripts/playtest-board.mjs [runs]
node scripts/audit-surveys.mjs [--show=6]
node scripts/playtest-survey.mjs [runs]
```

`audit-distractors` runs the option generator over the whole bank and fails on
anything that would ruin a round. `playtest` drives the real engine headlessly
across every mode with scripted players and asserts the game's invariants.
`test-matching` checks typed-answer leniency against 65 explicit cases and sweeps
every one of the 816,312 ordered answer pairs for false accepts. The last two do
the same jobs for The Board: pack structure and cross-accepts, then seven scripted
player profiles playing complete games. All plain Node, no dependencies.

---

## Swapping the question bank

`data/questions.json` is a drop-in. Nothing in the codebase rewrites it. Keep this shape:

```jsonc
{
  "meta": { "name": "...", "version": "1.0.0", "count": 904 },
  "categories": ["Geography", "History", "..."],
  "questions": [
    {
      "id": 1,
      "category": "Geography",
      "difficulty": "easy",          // easy | medium | hard
      "question": "What is the largest country in the world by land area?",
      "answer": "Russia",
      "accept": ["russia", "russian federation"],   // for Type-It mode
      "hint": "It alone covers about an eighth of the world's inhabited land.",
      "options": ["Russia", "Canada", "China", "Brazil"]   // OPTIONAL
    }
  ]
}
```

`options` is optional. When present it is used verbatim (shuffled); when absent
the game synthesises four options at runtime — see below.

`hint` powers the Informant lifeline. `scripts/author-hints.mjs` holds all 735 and
refuses to write any hint containing its own answer or an accepted alias — a hint that
gives away the answer is the answer with extra steps, and it costs a lifeline to see.
Informant is disabled on any question without one.

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

The reverse filter also exists: 24 questions are not viable for **Type-It**, because
nobody could reasonably produce the answer letter by letter. "What does RSVP stand for?"
is a fine multiple-choice question and a terrible typing one — reproducing "Répondez
s'il vous plaît" tests French, not trivia. Sentences, lists and over-long answers are
caught by rule; set phrases in another language carry an explicit `typedOk: false`.

Measured over the whole bank across six seeds: **0 fatal issues, ≤0.5% giveaway rounds.**

The remaining ceiling is semantic — nothing in the bank knows that *"Répondez s'il vous
plaît"* is a silly answer to *"what are the five vowels in English"*, since both are five
tokens of text. The `options` field exists for exactly that: hand- or LLM-written
distractors for the awkward questions, droppable into the JSON with no code change.

---

## Look

The interface is built as a machined object rather than a styled document. `css/material.css`
provides four primitives — a brushed steel plate, a milled recess, backlit display glass, and
a key that physically travels — composed into a vault console: rivets at the panel corners,
a split-flap haul meter in its own housing, a dial gauge set into the display, answer keys
that depress, and lifelines as switches with status lamps. One light source, always above.

No image assets are required for any of it. `docs/ASSETS.md` has Suno and ChatGPT Image 2.0
prompts if you want generated music and artwork; every slot is additive and falls back
cleanly when empty.

## Architecture

```
index.html
css/    tokens · base · material · game · fx   design tokens; material primitives
js/
  config.js       ALL balance numbers. No magic numbers anywhere else.
  util.js         seeded RNG, normalisation, similarity — pure
  distractors.js  ask-class tagging + option synthesis — pure
  bank.js         load, filter, draw, typed-answer checking
  engine.js       game rules. Zero DOM, zero wall-clock. Driven by tick(dt).
  jeopardy.js     The Board's rules. Same contract, different game shape.
  survey.js       The Street's rules. Likewise.
  lifelines.js    the kit. Pure state transitions on a Game.
  store.js        localStorage: records, achievements, prefs
  ui.js           owns the DOM, owns no rules
  board-ui.js     the same, for The Board's grid, slab and wager pad
  street-ui.js    the same, for The Street's survey board and round card
  fx.js           particles, shake, hit-pause, counter roll-up
  audio.js        Web Audio synthesis — no asset files
  share.js        spoiler-free text + canvas result card
  main.js         the only module that knows about both engine and DOM
data/questions.json    904 typed-answer questions
data/jeopardy.json     25 clue packs + finals, for The Board
data/surveys.json      28 survey boards, for The Street
```

Three engines, one contract. `jeopardy.js` is separate from `engine.js` because
`engine.js` walks a queue and The Board walks a grid — folding thirty cells, two
floors and hidden wagers into the queue would have put four working modes at risk
to save a file. They share the matcher and the balance file, which are the parts
that want to agree.

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

__board.start()                  // The Board
__board.pick(col, row)
__board.wager(500)               // wildcard stake, or the final
__board.answer('form')           // 'correct' | 'form' | 'wrong' | text
__board.pass()
__board.next()
__board.autoplay({ accuracy: 0.8, cautious: true })
__board.state

__street.start()                 // The Street
__street.guess('next')           // 'next' names the best unfound answer
__street.bank()
__street.next()
__street.fastForward(60)
__street.autoplay({ knows: 0.8, banksWhenStuck: true })
__street.state
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
