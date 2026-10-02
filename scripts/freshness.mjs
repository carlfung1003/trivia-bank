/* ==========================================================================
   Freshness — how soon does a returning player start seeing repeats?
   Usage:  node scripts/freshness.mjs [runs=30] [sessions=20]

   Plays one player's consecutive runs through the real engine, carrying their
   question history from run to run the way the browser does (store.js keeps
   it in localStorage; main.js hands it to the engine). Reports, per run, how
   many of the questions asked had already been seen in an earlier run.

   Measured before building anything: with no history, a player who clears
   Vault Runs met a repeat in most runs by about the tenth, in a 904-question
   bank. The number this prints is the one to hold down.
   ========================================================================== */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Bank } from "../js/bank.js";
import { Game, PHASE } from "../js/engine.js";

const here = dirname(fileURLToPath(import.meta.url));
const bank = new Bank(JSON.parse(readFileSync(join(here, "..", "data", "questions.json"), "utf8")));
const RUNS = Number(process.argv[2] || 30);
const SESSIONS = Number(process.argv[3] || 20);
const noHistory = process.argv.includes("--no-history");

function mulberry(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One run; returns the ids asked, in order. `recent` is the player's history. */
function playRun(mode, seed, accuracy, think, rnd, recent) {
  const g = new Game({ bank, mode, seed, answerMode: "choice", recent });
  const asked = [];
  g.on("question", () => asked.push(g.state.question.id));
  g.start();
  let guard = 0;
  while (g.state.phase !== PHASE.OVER && guard++ < 5000) {
    if (g.state.phase === PHASE.ASKING) {
      g.tick(think);
      if (g.state.phase !== PHASE.ASKING) continue;
      const s = g.state;
      const right = rnd() < accuracy;
      g.answer(right ? s.correctIndex : s.options.findIndex((_, i) => i !== s.correctIndex && !s.removed.includes(i)));
    } else if (g.state.phase === PHASE.REVEALED) {
      g.next();
    }
  }
  return asked;
}

const PROFILES = [
  /* think: seconds a player takes per question. It only matters for Blitz,
     where the run clock is shared: answer instantly and a run never ends. */
  { mode: "vault", accuracy: 1, think: 4, label: "Vault Run, clears every lock" },
  { mode: "vault", accuracy: 0.7, think: 4, label: "Vault Run, 70% right" },
  { mode: "survival", accuracy: 0.8, think: 4, label: "Survival, 80% right" },
  { mode: "blitz", accuracy: 0.8, think: 5, label: "Blitz, 80% right" },
];

console.log(`${RUNS} consecutive runs per player, ${SESSIONS} players per profile, ${noHistory ? "NO history" : "history carried between runs"}\n`);
let worst = 0;
for (const p of PROFILES) {
  const repeatsByRun = Array(RUNS).fill(0);
  const askedByRun = Array(RUNS).fill(0);
  for (let sess = 0; sess < SESSIONS; sess++) {
    const rnd = mulberry(1000 + sess);
    const seen = new Set();
    const recent = [];                         /* oldest first, as store.js keeps it */
    for (let r = 0; r < RUNS; r++) {
      const asked = playRun(p.mode, `${p.mode}::fresh::${sess}::${r}`, p.accuracy, p.think, rnd, noHistory ? undefined : recent.slice());
      askedByRun[r] += asked.length;
      for (const id of asked) {
        if (seen.has(id)) repeatsByRun[r]++;
        seen.add(id);
        const at = recent.indexOf(id);
        if (at >= 0) recent.splice(at, 1);
        recent.push(id);
      }
    }
  }
  const per = (r) => (repeatsByRun[r] / SESSIONS).toFixed(1);
  const total = repeatsByRun.reduce((a, b) => a + b, 0) / SESSIONS;
  const asked = askedByRun.reduce((a, b) => a + b, 0) / SESSIONS;
  const firstRepeatRun = repeatsByRun.findIndex((n) => n > 0) + 1;
  worst = Math.max(worst, total);
  console.log(`${p.label.padEnd(30)} ${asked.toFixed(0).padStart(5)} asked, ${total.toFixed(1).padStart(5)} repeats` +
    `   per run at 5/10/20/${RUNS}: ${per(4)} / ${per(9)} / ${per(19)} / ${per(RUNS - 1)}` +
    `   first repeat: ${firstRepeatRun ? `run ${firstRepeatRun}` : "never"}`);
}
