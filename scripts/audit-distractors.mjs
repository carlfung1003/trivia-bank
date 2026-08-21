/* ==========================================================================
   Distractor audit — run over the WHOLE bank, not a sample.
   Usage:  node scripts/audit-distractors.mjs [seed] [--show N] [--cat "Music"]

   Fails loudly on the things that would actually ruin a round:
     - fewer than 4 options (bank too thin for that answer type)
     - a distractor that would ALSO be accepted as correct
     - duplicate options within one question
     - options whose shapes give the answer away (e.g. one year, three names)
   ========================================================================== */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { buildIndex, buildOptions, detectType, isChoiceViable } from "../js/distractors.js";
import { DISTRACTORS } from "../js/config.js";
import { normalise, similarity } from "../js/util.js";

const here = dirname(fileURLToPath(import.meta.url));
const bank = JSON.parse(readFileSync(join(here, "..", "data", "questions.json"), "utf8"));
const questions = bank.questions;

const args = process.argv.slice(2);
const seed = args.find((a) => !a.startsWith("--")) || "audit";
const showN = Number((args.find((a) => a.startsWith("--show")) || "").split("=")[1] || 0);
const catFilter = (args.find((a) => a.startsWith("--cat")) || "").split("=")[1];

const index = buildIndex(questions);

const problems = { short: [], accepted: [], dupe: [], shapeTell: [], lengthTell: [], echo: [] };
const typeCounts = new Map();
const samples = [];

/** Shape signature: year / number / letter / plain text, plus whether the
    option is a conjunction ("Nepal and China"), which is the tell that the
    first version of this engine kept shipping. */
function shape(s) {
  const t = String(s).trim();
  const conj = /\b(and|&)\b/i.test(t) ? "+pair" : "";
  if (/^(c\.?\s*)?\d{3,4}\s*(bc|bce|ad|ce)?$/i.test(t)) return "year" + conj;
  if (/^-?\d[\d,]*(\.\d+)?\s*[a-z%°]*\.?$/i.test(t)) return "number" + conj;
  if (/^[a-z]{1,2}$/i.test(t)) return "letter" + conj;
  return "text" + conj;
}

/** Word count, used for the "one option is wildly longer" tell. */
function wc(s) {
  return normalise(s).split(" ").filter(Boolean).length;
}

let typedOnly = 0;
for (const q of questions) {
  if (catFilter && q.category !== catFilter) continue;
  if (!isChoiceViable(q, index)) { typedOnly++; continue; }

  const type = detectType(q.answer, q.category);
  typeCounts.set(type, (typeCounts.get(type) || 0) + 1);

  const { options, correctIndex } = buildOptions(q, index, seed);

  if (options.length < DISTRACTORS.optionCount) {
    problems.short.push({ id: q.id, cat: q.category, answer: q.answer, got: options.length });
  }

  const seen = new Set();
  for (const o of options) {
    const n = normalise(o);
    if (seen.has(n)) problems.dupe.push({ id: q.id, option: o });
    seen.add(n);
  }

  /* A distractor that the typed-answer checker would ALSO mark correct is
     the worst possible bug: the player picks it, gets told they are wrong,
     and they were right. */
  const accepts = new Set((q.accept || []).map(normalise));
  options.forEach((o, i) => {
    if (i === correctIndex) return;
    const n = normalise(o);
    if (accepts.has(n) || n === normalise(q.answer)) {
      problems.accepted.push({ id: q.id, question: q.question, answer: q.answer, bad: o });
    }
  });

  /* Shape tell: if the correct answer is the ONLY option of its shape, the
     question is answerable without knowledge. */
  const shapes = options.map(shape);
  const mine = shapes[correctIndex];
  if (shapes.filter((s) => s === mine).length === 1 && options.length >= 3) {
    problems.shapeTell.push({
      id: q.id, cat: q.category, answer: q.answer, options: options.slice(),
    });
  }

  /* Length tell: the answer is more than 2x the length of every distractor,
     or less than half of every distractor. Reads as "the odd one out". */
  const counts = options.map(wc);
  const mineWc = counts[correctIndex];
  const others = counts.filter((_, i) => i !== correctIndex);
  if (others.length >= 2) {
    const allMuchShorter = others.every((o) => mineWc >= o * 2 + 1);
    const allMuchLonger = others.every((o) => o >= mineWc * 2 + 1);
    if (allMuchShorter || allMuchLonger) {
      problems.lengthTell.push({
        id: q.id, cat: q.category, answer: q.answer, options: options.slice(),
      });
    }
  }

  /* Echo tell: a distractor that appears verbatim inside the question. */
  const qn = normalise(q.question);
  options.forEach((o, i) => {
    if (i === correctIndex) return;
    const on = normalise(o);
    if (on.length >= 4 && qn.includes(on)) {
      problems.echo.push({ id: q.id, question: q.question, bad: o });
    }
  });

  if (samples.length < showN) {
    samples.push({ q: q.question, a: q.answer, type, options, correctIndex });
  }
}

const total = catFilter ? questions.filter((q) => q.category === catFilter).length : questions.length;

console.log(`\nBank: ${total} questions   seed="${seed}"\n`);
console.log("Detected answer types:");
for (const [t, n] of [...typeCounts].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${t.padEnd(8)} ${String(n).padStart(4)}  ${((n / total) * 100).toFixed(1)}%`);
}

console.log("\nProblems:");
console.log(`  fewer than ${DISTRACTORS.optionCount} options : ${problems.short.length}`);
console.log(`  distractor also accepted   : ${problems.accepted.length}`);
console.log(`  duplicate options          : ${problems.dupe.length}`);
console.log(`  shape tell (answer obvious): ${problems.shapeTell.length}  (${((problems.shapeTell.length / total) * 100).toFixed(1)}%)`);
console.log(`  length tell (odd one out)  : ${problems.lengthTell.length}  (${((problems.lengthTell.length / total) * 100).toFixed(1)}%)`);
console.log(`  echo tell (option in Q)    : ${problems.echo.length}`);
console.log(`\nTyped-only (not viable as multiple choice): ${typedOnly}  (${((typedOnly / total) * 100).toFixed(1)}%)`);

for (const key of ["accepted", "short", "dupe", "echo"]) {
  if (!problems[key].length) continue;
  console.log(`\n--- ${key} (first 12) ---`);
  for (const p of problems[key].slice(0, 12)) console.log("  ", JSON.stringify(p));
}
for (const key of ["shapeTell", "lengthTell"]) {
  if (!problems[key].length) continue;
  console.log(`\n--- ${key} (first 8) ---`);
  for (const p of problems[key].slice(0, 8)) {
    console.log(`   #${p.id} [${p.cat}] answer="${p.answer}"`);
    console.log(`      ${p.options.map((o) => `"${o}"`).join("  |  ")}`);
  }
}

if (samples.length) {
  console.log("\n=== sample rounds ===");
  for (const s of samples) {
    console.log(`\n  ${s.q}   (${s.type})`);
    s.options.forEach((o, i) => {
      console.log(`    ${i === s.correctIndex ? "*" : " "} ${String.fromCharCode(65 + i)}. ${o}`);
    });
  }
}

const fatal = problems.accepted.length + problems.dupe.length + problems.short.length + problems.echo.length;
console.log(`\n${fatal === 0 ? "PASS" : "FAIL"} — ${fatal} fatal issue(s)\n`);
process.exit(fatal === 0 ? 0 : 1);
