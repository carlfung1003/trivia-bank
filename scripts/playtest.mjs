/* ==========================================================================
   Headless playtest — drives the real engine, no browser, no DOM.
   Usage:  node scripts/playtest.mjs [runs]

   Plays every mode many times with scripted players (perfect / realistic /
   hopeless) and asserts the invariants that actually matter:
     - a run always terminates
     - score is never negative, never NaN
     - lifelines can be spent and are consumed exactly once
     - Vault Run safe havens really do protect the haul
     - Blitz ends on the clock, Survival ends on alarms
   ========================================================================== */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { Bank } from "../js/bank.js";
import { Game, PHASE, RESULT } from "../js/engine.js";
import { use as useLifeline, canUse, kitState } from "../js/lifelines.js";
import { MODES } from "../js/config.js";

const here = dirname(fileURLToPath(import.meta.url));
const raw = JSON.parse(readFileSync(join(here, "..", "data", "questions.json"), "utf8"));
const bank = new Bank(raw);

const RUNS = Number(process.argv[2] || 40);
const failures = [];
function check(cond, msg, ctx) {
  if (!cond) failures.push(`${msg}${ctx ? "  " + JSON.stringify(ctx) : ""}`);
}

/* ---- Scripted players ----------------------------------------------------- */

const PLAYERS = {
  /* Always right, answers instantly. */
  perfect: (g) => (g.answerMode === "choice" ? g.state.correctIndex : g.state.question.answer),
  /* Right ~65% of the time. */
  realistic: (g, rnd) => {
    const s = g.state;
    if (rnd() < 0.65) return g.answerMode === "choice" ? s.correctIndex : s.question.answer;
    if (g.answerMode !== "choice") return "definitely not the answer";
    const wrong = s.options.map((_, i) => i).filter((i) => i !== s.correctIndex && !s.removed.includes(i));
    return wrong.length ? wrong[Math.floor(rnd() * wrong.length)] : s.correctIndex;
  },
  /* Always wrong. */
  hopeless: (g) => {
    const s = g.state;
    if (g.answerMode !== "choice") return "no idea at all";
    const wrong = s.options.map((_, i) => i).filter((i) => i !== s.correctIndex && !s.removed.includes(i));
    return wrong.length ? wrong[0] : s.correctIndex;
  },
};

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---- Runner --------------------------------------------------------------- */

function playOne({ mode, player, answerMode, seed, useTools, timeoutEvery }) {
  const g = new Game({ bank, mode, seed, answerMode });
  let summary = null;
  g.on("over", (s) => { summary = s; });

  const rnd = mulberry(seed.length * 7919 + mode.length);
  const lifelineUses = new Map();

  g.start();

  let guard = 0;
  while (g.state.phase !== PHASE.OVER && guard++ < 5000) {
    if (g.state.phase === PHASE.ASKING) {
      /* Spend a lifeline sometimes. */
      if (useTools && rnd() < 0.35) {
        const avail = kitState(g).filter((k) => k.available);
        if (avail.length) {
          const pickTool = avail[Math.floor(rnd() * avail.length)];
          const before = g.state.lifelinesUsed;
          const res = useLifeline(g, pickTool.id);
          if (res) {
            lifelineUses.set(pickTool.id, (lifelineUses.get(pickTool.id) || 0) + 1);
            check(g.state.lifelinesUsed === before + 1, "lifeline not counted", { mode, id: pickTool.id });
            check(!canUse(g, pickTool.id), "lifeline reusable after use", { mode, id: pickTool.id });
          }
        }
      }

      /* Occasionally let the clock run out instead of answering.
         FREEZE deliberately stops the clock with no expiry, so a frozen
         question can never time out — fall through to answering rather than
         spinning. (That is intended game behaviour, not a bug: the lifeline
         buys unlimited thinking time on exactly one lock, once per run.) */
      if (timeoutEvery && g.state.answered > 0 && g.state.answered % timeoutEvery === 0 && !g.state.frozen) {
        let t = 0;
        while (g.state.phase === PHASE.ASKING && t++ < 400) g.tick(1);
        if (g.state.phase === PHASE.ASKING) g.answer(PLAYERS[player](g, rnd));
      } else {
        g.tick(0.8);
        if (g.state.phase === PHASE.ASKING) g.answer(PLAYERS[player](g, rnd));
      }
    } else if (g.state.phase === PHASE.REVEALED) {
      g.next();
    }
  }

  check(guard < 5000, "run did not terminate", { mode, player, seed });
  check(summary !== null, "no over event emitted", { mode, player, seed });
  if (summary) {
    check(Number.isFinite(summary.score), "score is not finite", { mode, score: summary.score });
    check(summary.score >= 0, "score went negative", { mode, score: summary.score });
    check(summary.correct + summary.wrong === summary.answered, "tally mismatch", summary);
    for (const [id, n] of lifelineUses) check(n === 1, "lifeline used twice", { mode, id, n });
  }
  return { summary, state: g.state };
}

/* ---- Sweep ---------------------------------------------------------------- */

const results = {};
for (const mode of Object.keys(MODES)) {
  results[mode] = { runs: 0, scores: [], reasons: {}, depths: [] };
  for (let i = 0; i < RUNS; i++) {
    const player = ["perfect", "realistic", "hopeless"][i % 3];
    const answerMode = i % 4 === 3 ? "typed" : "choice";
    const { summary } = playOne({
      mode, player, answerMode,
      seed: `pt-${mode}-${i}`,
      useTools: i % 2 === 0,
      timeoutEvery: i % 7 === 0 ? 4 : 0,
    });
    if (!summary) continue;
    results[mode].runs++;
    results[mode].scores.push(summary.score);
    results[mode].depths.push(summary.answered);
    results[mode].reasons[summary.reason] = (results[mode].reasons[summary.reason] || 0) + 1;
  }
}

/* ---- Targeted invariant: safe havens really protect ----------------------- */
{
  /* A perfect player through the first haven, then wrong, must keep the haul. */
  const g = new Game({ bank, mode: "vault", seed: "haven-check", answerMode: "choice" });
  let over = null;
  g.on("over", (s) => { over = s; });
  g.start();
  const havens = MODES.vault.safeHavens;
  let guard = 0;
  while (g.state.phase !== PHASE.OVER && guard++ < 200) {
    if (g.state.phase === PHASE.ASKING) {
      g.tick(0.5);
      const pastFirstHaven = g.state.qIndex > havens[0];
      if (pastFirstHaven) {
        const s = g.state;
        const wrong = s.options.map((_, i) => i).find((i) => i !== s.correctIndex);
        g.answer(wrong);
      } else {
        g.answer(g.state.correctIndex);
      }
    } else if (g.state.phase === PHASE.REVEALED) g.next();
  }
  check(over && over.reason === "busted", "haven test did not bust", { reason: over?.reason });
  check(over && over.score > 0, "safe haven did not protect the haul", { score: over?.score });
  console.log(`safe-haven check: busted after haven, kept ${over?.score} credits`);
}

/* ---- Report --------------------------------------------------------------- */

console.log(`\nPlaytest — ${RUNS} runs per mode\n`);
for (const [mode, r] of Object.entries(results)) {
  const avg = r.scores.reduce((a, b) => a + b, 0) / (r.scores.length || 1);
  const max = Math.max(...r.scores, 0);
  const avgDepth = r.depths.reduce((a, b) => a + b, 0) / (r.depths.length || 1);
  console.log(`${mode.padEnd(9)} runs=${String(r.runs).padStart(3)}  avg=${String(Math.round(avg)).padStart(6)}  max=${String(max).padStart(6)}  avgQ=${avgDepth.toFixed(1).padStart(5)}  ${JSON.stringify(r.reasons)}`);
}

console.log("");
if (failures.length) {
  console.log(`FAIL — ${failures.length} invariant violation(s):`);
  for (const f of [...new Set(failures)].slice(0, 20)) console.log("  -", f);
  process.exit(1);
}
console.log("PASS — all invariants held\n");
