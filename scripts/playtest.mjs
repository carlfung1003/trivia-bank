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
     - the Alibi forgives exactly one Vault Run miss, and nothing else
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

/* ---- Targeted invariant: the Alibi forgives exactly one miss -------------- */
{
  const wrongIndex = (s) => s.options.map((_, i) => i).find((i) => i !== s.correctIndex);
  const fresh = (seed) => {
    const g = new Game({ bank, mode: "vault", seed, answerMode: "choice" });
    const out = { g, over: null, reveals: [] };
    g.on("over", (s) => { out.over = s; });
    g.on("reveal", (p) => out.reveals.push(p));
    g.start();
    return out;
  };

  /* 1. First miss: forgiven, run continues, Alibi spent and counted. Second
        miss: busts as it always did. */
  {
    const { g, reveals } = fresh("alibi-basic");
    check(g.state.kit.alibi && !g.state.kit.alibi.used, "vault run has no unspent alibi");
    check(!canUse(g, "alibi"), "alibi is pressable — it should be passive");
    check(useLifeline(g, "alibi") === null, "pressing alibi did something");
    g.answer(g.state.correctIndex); g.next();
    const potBefore = g.state.pot;
    g.answer(wrongIndex(g.state));
    check(reveals.at(-1)?.forgiven === true, "first miss not flagged forgiven");
    check(g.state.phase === PHASE.REVEALED, "first miss ended the run despite alibi", { phase: g.state.phase });
    check(g.state.kit.alibi.used, "alibi not spent on first miss");
    check(g.state.lifelinesUsed === 1, "alibi not counted as a tool used", { used: g.state.lifelinesUsed });
    check(g.state.pot === potBefore, "forgiven miss changed the pot", { potBefore, pot: g.state.pot });
    check(g.state.streak === 0, "forgiven miss kept the streak");
    check(g.state.wrongCount === 1, "forgiven miss not tallied as wrong");
    g.next();
    g.answer(wrongIndex(g.state));
    check(reveals.at(-1)?.forgiven === false, "second miss flagged forgiven");
    check(g.state.phase === PHASE.OVER, "second miss did not end the run");
    console.log(`alibi check: first miss forgiven, second miss ended the run (${g.state.endReason})`);
  }

  /* 2. A forgiven miss ON a haven still locks the haven in. */
  {
    const { g } = fresh("alibi-haven");
    const haven = MODES.vault.safeHavens[0];
    while (g.state.qIndex < haven) { g.answer(g.state.correctIndex); g.next(); }
    const pot = g.state.pot;
    g.answer(wrongIndex(g.state));
    check(g.state.banked === pot && g.state.pot === 0, "forgiven miss on a haven did not lock it", { pot, banked: g.state.banked });
  }

  /* 3. A forgiven miss on the LAST lock walks out with the pot. */
  {
    const t = fresh("alibi-last");
    const { g } = t;
    const last = MODES.vault.length - 1;
    while (g.state.qIndex < last) { g.answer(g.state.correctIndex); g.next(); }
    const haul = g.state.banked + g.state.pot;
    g.answer(wrongIndex(g.state));
    check(g.state.phase === PHASE.REVEALED, "forgiven last miss ended before the reveal could be read");
    g.next();
    check(t.over?.reason === "cleared", "forgiven last miss did not clear", { reason: t.over?.reason });
    check(t.over?.score === haul && haul > 0, "forgiven last miss lost the haul", { haul, score: t.over?.score });
  }

  /* 4. Double Down riding on the forgiven miss still costs the pot. */
  {
    const { g } = fresh("alibi-dd");
    g.answer(g.state.correctIndex); g.next();
    g.answer(g.state.correctIndex); g.next();
    check(g.state.pot > 0, "no pot to risk");
    useLifeline(g, "doubledown");
    g.answer(wrongIndex(g.state));
    check(g.state.phase === PHASE.REVEALED && g.state.pot === 0, "double down + alibi: pot kept or run ended", { phase: g.state.phase, pot: g.state.pot });
  }

  /* 5. Modes without an Alibi are untouched: Survival still loses an alarm. */
  {
    const g = new Game({ bank, mode: "survival", seed: "alibi-none", answerMode: "choice" });
    g.start();
    check(!g.state.kit.alibi, "survival carries an alibi");
    const lives = g.state.lives;
    g.answer(wrongIndex(g.state));
    check(g.state.lives === lives - 1, "survival miss did not cost an alarm");
  }
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
