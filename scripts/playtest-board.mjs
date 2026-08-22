/* ==========================================================================
   The Board — headless invariants.
   Usage:  node scripts/playtest-board.mjs [runs]

   The same discipline that caught Blitz running forever: play complete games
   with no DOM and no wall-clock, at several accuracies, and assert the things
   a visual pass cannot see. A board that LOOKS right proves nothing about
   whether every cell is reachable, whether the wager can exceed the score, or
   whether a played-out grid actually advances a floor.
   ========================================================================== */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { BoardGame, BPHASE, BRESULT, stripQuestionForm } from "../js/jeopardy.js";
import { BOARD } from "../js/config.js";

const here = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(here, "..", "data", "jeopardy.json"), "utf8"));

const RUNS = Number(process.argv[2] || 40);
const failures = [];
const fail = (msg) => { if (failures.length < 25) failures.push(msg); };

/**
 * Play one complete game at a scripted accuracy. Everything advances through
 * real intents — no reaching into state to move things along.
 */
function playOne(seed, accuracy, rng, cautious = false) {
  const game = new BoardGame({ data, seed });
  let summary = null;
  game.on("over", (s) => { summary = s; });

  /* ---- Invariants observed live ---------------------------------------- */
  let seenRounds = new Set();
  let maxSeenWager = 0;
  game.on("round", ({ round, board }) => {
    seenRounds.add(round);
    if (board.length !== BOARD.columns) fail(`${seed}: round ${round} dealt ${board.length} columns`);
    for (const col of board) {
      if (col.cells.length !== BOARD.tiers) fail(`${seed}: "${col.name}" has ${col.cells.length} cells`);
      const values = col.cells.map((c) => c.value);
      const sorted = values.slice().sort((a, b) => a - b);
      if (String(values) !== String(sorted)) fail(`${seed}: "${col.name}" values out of order: ${values}`);
    }
    const names = board.map((c) => c.name);
    if (new Set(names).size !== names.length) fail(`${seed}: duplicate category in one round: ${names}`);
  });
  game.on("wildcard", ({ max }) => { maxSeenWager = max; });

  game.start();

  let steps = 0;
  const MAX_STEPS = 5000;
  while (game.state.phase !== BPHASE.OVER && steps++ < MAX_STEPS) {
    const s = game.state;

    if (s.phase === BPHASE.BOARD) {
      /* Pick any unused cell. */
      const open = [];
      s.board.forEach((col, ci) => col.cells.forEach((cell, ri) => { if (!cell.used) open.push([ci, ri]); }));
      if (!open.length) { fail(`${seed}: BOARD phase with no open cells`); break; }
      const [ci, ri] = open[Math.floor(rng() * open.length)];
      if (!game.pick(ci, ri)) fail(`${seed}: legal pick (${ci},${ri}) refused`);
      continue;
    }

    if (s.phase === BPHASE.WAGER) {
      const max = game.maxWager();
      if (max < BOARD.wagerMin) fail(`${seed}: wildcard max ${max} below the minimum ${BOARD.wagerMin}`);
      /* Deliberately over-wager sometimes: the clamp is the invariant. */
      const want = rng() < 0.3 ? max * 3 : Math.max(BOARD.wagerMin, Math.round(max * rng()));
      game.setWager(want);
      if (game.state.wager > max) fail(`${seed}: wager ${game.state.wager} exceeded max ${max}`);
      if (game.state.wager < BOARD.wagerMin) fail(`${seed}: wager ${game.state.wager} under the floor`);
      continue;
    }

    if (s.phase === BPHASE.FINAL && !s.finalArmed) {
      const want = rng() < 0.3 ? s.score * 2 : Math.round(s.score * rng());
      game.setFinalWager(want);
      if (game.state.finalWager > Math.max(0, s.score)) {
        fail(`${seed}: final wager ${game.state.finalWager} exceeded score ${s.score}`);
      }
      continue;
    }

    if (s.phase === BPHASE.ASKING || (s.phase === BPHASE.FINAL && s.finalArmed)) {
      /* Burn a little clock so timing is exercised, then answer. */
      game.tick(0.5);
      if (game.state.phase !== BPHASE.ASKING && game.state.phase !== BPHASE.FINAL) continue;
      const roll = rng();
      if (roll < accuracy) {
        /* Right, in the question form a third of the time. */
        const bare = game.state.clue.answer;
        game.answer(rng() < 0.34 ? `What is ${bare}?` : bare);
      } else if (cautious && game.state.phase === BPHASE.ASKING && !game.state.onWildcard) {
        /* Does not know it, so does not buzz. */
        if (!game.pass()) fail(`${seed}: pass refused on an open clue`);
      } else if (roll < accuracy + 0.08) {
        /* Let it time out rather than answering. */
        game.tick(BOARD.finalSeconds + BOARD.clueSeconds + BOARD.wildcardExtraSeconds + 1);
      } else {
        game.answer("__deliberately wrong__");
      }
      continue;
    }

    if (s.phase === BPHASE.REVEALED) { game.next(); continue; }

    fail(`${seed}: stuck in unknown phase "${s.phase}"`);
    break;
  }

  if (steps >= MAX_STEPS) fail(`${seed}: did not terminate in ${MAX_STEPS} steps`);
  if (!summary) fail(`${seed}: ended without an "over" summary`);

  return { summary, seenRounds, maxSeenWager, game };
}

/* ---- Sweep ---------------------------------------------------------------- */

let rngState = 1;
const rng = () => {
  rngState = (rngState * 1664525 + 1013904223) >>> 0;
  return rngState / 4294967296;
};

/* Two player shapes, because they exercise opposite ends of the payout curve:
   a RECKLESS player answers everything and can finish deep in the red, while a
   CAUTIOUS one only answers what they know and never should. The second profile
   is the one that found the missing pass() — without it, knowing a third of the
   board scored minus eleven thousand, which is not a game. */
const PROFILES = [
  { accuracy: 1,    cautious: false, label: "perfect" },
  { accuracy: 0.7,  cautious: false, label: "reckless" },
  { accuracy: 0.35, cautious: false, label: "reckless" },
  { accuracy: 0,    cautious: false, label: "hopeless" },
  { accuracy: 0.7,  cautious: true,  label: "cautious" },
  { accuracy: 0.35, cautious: true,  label: "cautious" },
  { accuracy: 0.1,  cautious: true,  label: "cautious" },
];

const rows = [];
for (const { accuracy, cautious, label } of PROFILES) {
  const scores = [];
  let playedOut = 0, short = 0, finals = 0, wildcards = 0, formBonuses = 0, passes = 0;

  for (let i = 0; i < RUNS; i++) {
    const { summary } = playOne(`board-${label}-${accuracy}-${i}`, accuracy, rng, cautious);
    if (!summary) continue;
    passes += summary.passed;
    scores.push(summary.score);
    if (summary.reason === "played-out") playedOut++;
    if (summary.reason === "short") short++;
    wildcards += summary.wildcardsFound;
    if (summary.history.some((h) => h.final)) finals++;
    formBonuses += summary.history.filter((h) => h.inForm && h.result === "correct").length;

    /* Every clue answered must appear once and only once. */
    const keys = summary.history.map((h) => `${h.round}|${h.clue}`);
    if (new Set(keys).size !== keys.length) fail(`${summary.seed}: a clue was served twice`);

    /* The ledger must reconcile: the score is the sum of the deltas. */
    const sum = summary.history.reduce((acc, h) => acc + h.delta, 0);
    if (sum !== summary.score) fail(`${summary.seed}: deltas sum to ${sum}, score is ${summary.score}`);

    /* A perfect run must never finish negative, and a hopeless one must never
       finish positive. These are the two ends of the payout curve. */
    if (accuracy === 1 && summary.score <= 0) fail(`${summary.seed}: perfect run scored ${summary.score}`);
    if (accuracy === 0 && summary.score > 0) fail(`${summary.seed}: hopeless run scored ${summary.score}`);

    /* Caution must be safe. A player who only answers what they know can still
       lose a committed wager, so the floor is the largest wager they made, not
       zero — but they must never be dragged down by clues they declined. */
    if (cautious) {
      const staked = summary.history.filter((h) => h.wildcard || h.final);
      const worst = staked.reduce((acc, h) => acc + Math.min(0, h.delta), 0);
      if (summary.score < worst) {
        fail(`${summary.seed}: cautious run scored ${summary.score}, below its staked floor ${worst}`);
      }
      const paidForAPass = summary.history.some((h) => h.result === "timeout" && !h.wildcard && !h.final && h.delta !== 0);
      if (paidForAPass) fail(`${summary.seed}: a declined clue cost money`);
    }
  }

  rows.push({
    label, accuracy, cautious,
    runs: scores.length,
    avg: Math.round(scores.reduce((a, b) => a + b, 0) / Math.max(1, scores.length)),
    max: Math.max(...scores),
    min: Math.min(...scores),
    playedOut, short, finals, wildcards, formBonuses, passes,
  });
}

/* ---- The question-form parser, on its own ---------------------------------- */
const FORM_CASES = [
  ["What is a martini?", "a martini", true],
  ["what's the nose", "the nose", true],
  ["Who was Grover Cleveland?", "Grover Cleveland", true],
  ["Where is Nepal", "Nepal", true],
  ["a martini", "a martini", false],
  ["What is?", "What is", false],         /* nothing survives the wrapper */
  ["Whatsapp", "Whatsapp", false],        /* not the wrapper, just a word */
  ["", "", false],
];
for (const [input, expectText, expectForm] of FORM_CASES) {
  const got = stripQuestionForm(input);
  if (got.text !== expectText || got.inForm !== expectForm) {
    fail(`question form: "${input}" -> ${JSON.stringify(got)}, expected {text:"${expectText}",inForm:${expectForm}}`);
  }
}

/* ---- Report ---------------------------------------------------------------- */

console.log(`\nThe Board — ${RUNS} runs per profile\n`);
for (const r of rows) {
  console.log(
    `${r.label.padEnd(9)} acc=${String(r.accuracy).padEnd(5)} runs=${String(r.runs).padStart(3)}  ` +
    `avg=${String(r.avg).padStart(7)}  min=${String(r.min).padStart(7)}  max=${String(r.max).padStart(7)}  ` +
    `finals=${String(r.finals).padStart(3)}  short=${String(r.short).padStart(3)}  ` +
    `passed=${String(r.passes).padStart(4)}  in-form=${r.formBonuses}`
  );
}

if (failures.length) {
  console.log(`\nFAILURES (${failures.length}):`);
  for (const f of failures) console.log("  -", f);
}
console.log(`\n${failures.length === 0 ? "PASS — all invariants held" : "FAIL"}\n`);
process.exit(failures.length === 0 ? 0 : 1);
