/* ==========================================================================
   The Street — headless invariants.
   Usage:  node scripts/playtest-survey.mjs [runs]

   The two things a survey board can get wrong that a visual pass will not
   show: the LEDGER (a pot that survives three strikes, or a banked total that
   does not match what the rounds actually kept) and the CURVE (whether
   knowing the obvious answers is worth anything, and whether pushing for the
   long tail is a real decision or a trap with one right answer).

   Player profiles are the point here. A survey board is a risk game, so it is
   tested by risk appetite rather than by accuracy alone.
   ========================================================================== */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { SurveyGame, SPHASE, SEND } from "../js/survey.js";
import { STREET } from "../js/config.js";

const here = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(here, "..", "data", "surveys.json"), "utf8"));

const RUNS = Number(process.argv[2] || 40);
const failures = [];
const fail = (msg) => { if (failures.length < 25) failures.push(msg); };

let rngState = 7;
const rnd = () => {
  rngState = (rngState * 1664525 + 1013904223) >>> 0;
  return rngState / 4294967296;
};

/**
 * @param {object} profile
 * @param {number} profile.knows    chance of knowing any given slot, weighted
 *   by how popular that slot is — a player thinks of "keys" before "pens", and
 *   a uniform guesser would never discover that the tail is where runs die.
 * @param {boolean} profile.banksWhenStuck  what they do on running OUT OF IDEAS:
 *   lock the pot, or guess anyway and risk a strike.
 *
 * The first cut of this file compared players who banked at a fixed fraction of
 * the board against players who never banked, and reported that banking never
 * pays. That was the MODEL being wrong, not the game: a fixed-threshold banker
 * locks a small pot while still holding good answers, which nobody would do.
 * The decision the mode actually poses is the one below — you have run dry, do
 * you take what is on the table or swing at the tail — so that is what is
 * measured, with knowledge held equal across the pair.
 */
function playOne(seed, profile) {
  const game = new SurveyGame({ data, seed });
  let summary = null;
  game.on("over", (s) => { summary = s; });

  /* ---- Live invariants -------------------------------------------------- */
  let liveBanked = 0;
  game.on("roundEnd", ({ reason, kept, lost, banked }) => {
    if (reason === SEND.STRUCK || reason === SEND.TIME) {
      if (kept !== 0) fail(`${seed}: kept ${kept} on a ${reason} round — the pot must be lost`);
    }
    if (reason === SEND.SWEPT || reason === SEND.BANKED) {
      if (lost !== 0) fail(`${seed}: lost ${lost} on a ${reason} round — the pot must be kept`);
    }
    liveBanked += kept;
    if (banked !== liveBanked) fail(`${seed}: banked ${banked}, rounds kept ${liveBanked}`);
  });

  game.on("round", ({ slots, multiplier }) => {
    if (!slots.length) fail(`${seed}: dealt an empty board`);
    if (slots.some((s) => s.text !== null)) fail(`${seed}: a hidden slot leaked its text to the UI`);
    if (!STREET.rounds.some((r) => r.multiplier === multiplier)) {
      fail(`${seed}: multiplier ${multiplier} is not in the ladder`);
    }
  });

  game.start();

  let steps = 0;
  const MAX = 4000;
  while (game.state.phase !== SPHASE.OVER && steps++ < MAX) {
    const s = game.state;

    if (s.phase === SPHASE.ROUND) { game.next(); continue; }
    if (s.phase !== SPHASE.ASKING) { fail(`${seed}: unknown phase "${s.phase}"`); break; }

    game.tick(0.4);
    if (game.state.phase !== SPHASE.ASKING) continue;

    const unfound = s.slots.filter((x) => !x.found);
    if (!unfound.length) { fail(`${seed}: asking with a swept board`); break; }

    /* Do they have an answer in mind? Popular slots come to mind first. */
    const known = unfound.filter((x) => rnd() < profile.knows * (x.share / 30 + 0.25));

    /* Out of ideas — this is the decision the whole mode is built on. */
    if (!known.length && profile.banksWhenStuck && s.pot > 0) {
      if (!game.bank()) fail(`${seed}: bank refused with a live pot of ${s.pot}`);
      continue;
    }

    if (known.length) {
      game.guess(known[0].text);
    } else if (rnd() < 0.12) {
      /* Occasionally repeat something already found — must never be a strike. */
      const found = s.slots.filter((x) => x.found);
      if (found.length) {
        const before = game.state.strikes;
        const r = game.guess(found[0].text);
        if (r?.verdict !== "repeat") fail(`${seed}: repeating a found answer gave "${r?.verdict}"`);
        if (game.state.strikes !== before) fail(`${seed}: a repeat cost a strike`);
      } else {
        game.guess("__nonsense__");
      }
    } else {
      game.guess("__nonsense__");
    }
  }

  if (steps >= MAX) fail(`${seed}: did not terminate in ${MAX} steps`);
  if (!summary) fail(`${seed}: ended without an "over" summary`);
  return summary;
}

/* ---- Profiles -------------------------------------------------------------- */

const PROFILES = [
  { label: "omniscient",        knows: 9,    banksWhenStuck: false },
  { label: "sharp·banks",       knows: 1.0,  banksWhenStuck: true  },
  { label: "sharp·swings",      knows: 1.0,  banksWhenStuck: false },
  { label: "average·banks",     knows: 0.55, banksWhenStuck: true  },
  { label: "average·swings",    knows: 0.55, banksWhenStuck: false },
  { label: "clueless·banks",    knows: 0.05, banksWhenStuck: true  },
  { label: "clueless·swings",   knows: 0.05, banksWhenStuck: false },
];

const rows = [];
for (const profile of PROFILES) {
  const scores = [];
  let sweeps = 0, struck = 0, banked = 0, timeouts = 0, rounds = 0;

  for (let i = 0; i < RUNS; i++) {
    const summary = playOne(`street-${profile.label}-${i}`, profile);
    if (!summary) continue;
    scores.push(summary.score);
    sweeps += summary.sweeps;
    rounds += summary.rounds;
    for (const h of summary.history) {
      if (h.reason === SEND.STRUCK) struck++;
      else if (h.reason === SEND.BANKED) banked++;
      else if (h.reason === SEND.TIME) timeouts++;
    }

    /* The ledger must reconcile: the score is exactly what the rounds kept. */
    const kept = summary.history.reduce((a, h) => a + h.kept, 0);
    if (kept !== summary.score) fail(`${summary.seed}: history kept ${kept}, score ${summary.score}`);

    /* Nothing can ever go negative — there is no penalty, only a pot you fail
       to keep. A negative score would mean a strike had reached the bank. */
    if (summary.score < 0) fail(`${summary.seed}: scored ${summary.score}, below zero`);

    /* Every run plays the full ladder, and never the same board twice. */
    if (summary.rounds !== STREET.rounds.length) {
      fail(`${summary.seed}: played ${summary.rounds} rounds, expected ${STREET.rounds.length}`);
    }
    const prompts = summary.history.map((h) => h.prompt);
    if (new Set(prompts).size !== prompts.length) fail(`${summary.seed}: a survey repeated within one run`);

    /* A player who knows everything and never banks must sweep every board,
       and must therefore outscore one who banks at a third of it. */
    if (profile.knows >= 9 && summary.sweeps !== STREET.rounds.length) {
      fail(`${summary.seed}: omniscient run swept only ${summary.sweeps}/${STREET.rounds.length}`);
    }
  }

  rows.push({
    label: profile.label,
    runs: scores.length,
    avg: Math.round(scores.reduce((a, b) => a + b, 0) / Math.max(1, scores.length)),
    min: Math.min(...scores),
    max: Math.max(...scores),
    sweeps, struck, banked, timeouts, rounds,
  });
}

/* Banking has to be a DECISION, which means neither answer may be right for
   everybody. Holding knowledge equal and varying only what you do when you run
   dry: a player who knows the board can afford to swing, and a player who does
   not is better off taking the money. If either half flips, one of the two
   buttons is decoration. */
const byLabel = (l) => rows.find((r) => r.label === l);
const gap = (a, b) => Math.round(((a - b) / Math.max(1, b)) * 100);

const sharpBanks = byLabel("sharp·banks"), sharpSwings = byLabel("sharp·swings");
const avgBanks = byLabel("average·banks"), avgSwings = byLabel("average·swings");
const cluelessBanks = byLabel("clueless·banks"), cluelessSwings = byLabel("clueless·swings");

if (sharpSwings.avg <= sharpBanks.avg) {
  fail(`swinging does not pay for a sharp player: swings ${sharpSwings.avg} vs banks ${sharpBanks.avg}`);
}
if (cluelessBanks.avg <= cluelessSwings.avg) {
  fail(`banking does not pay for a weak player: banks ${cluelessBanks.avg} vs swings ${cluelessSwings.avg}`);
}
console.log(`\ndecision check — sharp: swinging is ${gap(sharpSwings.avg, sharpBanks.avg)}% better; ` +
            `average: ${gap(avgSwings.avg, avgBanks.avg)}%; ` +
            `clueless: banking is ${gap(cluelessBanks.avg, cluelessSwings.avg)}% better`);

console.log(`\nThe Street — ${RUNS} runs per profile\n`);
for (const r of rows) {
  console.log(
    `${r.label.padEnd(22)} runs=${String(r.runs).padStart(3)}  ` +
    `avg=${String(r.avg).padStart(5)}  min=${String(r.min).padStart(5)}  max=${String(r.max).padStart(5)}  ` +
    `swept=${String(r.sweeps).padStart(3)}  banked=${String(r.banked).padStart(3)}  ` +
    `struck=${String(r.struck).padStart(3)}  timeout=${r.timeouts}`
  );
}

if (failures.length) {
  console.log(`\nFAILURES (${failures.length}):`);
  for (const f of failures) console.log("  -", f);
}
console.log(`\n${failures.length === 0 ? "PASS — all invariants held" : "FAIL"}\n`);
process.exit(failures.length === 0 ? 0 : 1);
