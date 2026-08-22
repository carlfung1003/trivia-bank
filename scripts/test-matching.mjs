/* ==========================================================================
   Typed-answer matching tests.
   Usage:  node scripts/test-matching.mjs

   Leniency is only worth having if it stops at the right place. Every ACCEPT
   case is something a player who knew the answer would plausibly type; every
   REJECT case is a genuinely different answer that must not be waved through.
   The reject list matters more than the accept list — a checker that accepts
   everything is worse than one that is too strict, because it silently stops
   being a quiz.
   ========================================================================== */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Bank } from "../js/bank.js";
import { answerForms, matchKey } from "../js/util.js";

const here = dirname(fileURLToPath(import.meta.url));
const bank = new Bank(JSON.parse(readFileSync(join(here, "..", "data", "questions.json"), "utf8")));
const byId = new Map(bank.questions.map((q) => [q.id, q]));

/* [question id, typed input, expected] — expected is true, false, or "close" */
const CASES = [
  /* ---- the bug that started this -------------------------------------- */
  [452, "beat per minute", true,  "singular/plural"],
  [452, "Beats Per Minute", true, "casing"],
  [452, "beats per min", true,  "abbreviated last word, others intact"],
  [12,  "au", true,           "the answer itself, lowercased"],
  [220, "ski", false,         "prefix rule must not apply to a single-word answer"],

  /* ---- plurals and stems ------------------------------------------------ */
  [61,  "chickpea", true,  "singular for plural"],
  [656, "homophone", true, "singular for plural"],
  [499, "homonym", true,   "singular for plural"],
  [87,  "stone", true,     "singular for plural"],
  [763, "haystack", true,  "singular inside a parenthetical answer"],

  /* ---- spelling conventions --------------------------------------------- */
  [17,  "aluminum", true,  "American spelling of the answer"],
  [17,  "aluminium", true, "British spelling of the answer"],
  [220, "the skin", true,  "definite article is stripped"],

  /* ---- typos ------------------------------------------------------------ */
  [5,   "Ulaanbatar", true,     "one dropped letter in a long word"],
  [5,   "Ulanbatar", true,      "two slips in a long word"],
  [289, "Leonardo da Vinci", true, "exact"],
  [289, "Leonardo da Vinchi", true, "one slip"],
  [66,  "safron", true,        "one dropped letter"],
  [92,  "onomatopeia", true,   "one dropped letter"],
  [522, "anachnophobia", true,  "one substituted letter"],
  [522, "arachnaphobia", true,  "one substituted vowel"],
  [522, "arachnofobia", true,   "phonetic slip"],
  [521, "clausterphobia", true, "two slips in a long word"],

  /* ---- word order and aliases -------------------------------------------- */
  [2,   "China and Nepal", true, "reversed conjunction"],
  [2,   "Nepal and China", true, "as written"],
  [339, "shoal", true,           "the parenthetical alternative alone"],
  [339, "a school", true,        "the main form alone"],
  [559, "etiology", true,        "parenthetical variant spelling"],
  [337, "monotremes", true,      "before the em-dash aside"],
  [337, "the platypus and echidna", true, "after the em-dash aside"],
  [506, "3000", true,            "approximation qualifier dropped"],
  [506, "about 3000", true,      "approximation qualifier kept"],
  [118, "10080", true,           "thousand separator omitted"],
  [377, "ovum", true,            "parenthetical alone"],
  [377, "egg cell", true,        "main form alone"],

  /* ---- same word, different grammar --------------------------------------- */
  [55,  "play louder", true, "comparative for adverb"],
  [55,  "louder", true,      "comparative alone"],
  [55,  "play loud", true,   "the bare adjective"],
  [55,  "play quietly", false, "the opposite instruction, not a form of it"],

  /* ---- a real word is never a typo for another real word ------------------ */
  [95,  "Entomology", false, "insects are not word origins"],
  [980, "Etymology", false,  "and the reverse"],
  [566, "Titian", false,     "a Venetian painter is not a moon of Saturn"],
  [798, "Titan", false,      "and the reverse"],
  [878, "Austria", false,    "a different country, two slips away"],
  [520, "The skin", false,   "a group of geese is not an organ"],
  [927, "A pride", false,    "lions are not prime numbers"],

  /* ---- must NOT be accepted ---------------------------------------------- */
  [21,  "1913", false, "a year one out is a different answer"],
  [21,  "1911", false, "a year one out is a different answer"],
  [382, "C", false,    "single letter must be exact"],
  [382, "Na", false,   "two letters must be exact"],
  [12,  "Ag", false,   "silver is not gold"],
  [5,   "Ulan Bator", true, "a genuine alternate romanisation, within tolerance"],
  [289, "Michelangelo", false, "a different artist entirely"],
  [61,  "lentils", false,      "a different legume"],
  [218, "Saturn", false,       "a different planet"],
  [54,  "Led Zeppelin", false, "a different band"],
  [452, "bytes per minute", false, "wrong word, not a typo"],
  [220, "the liver", false,    "a different organ"],
  [111, "Venus", false,        "a different planet"],
  [326, "the leopard", false,  "a different cat"],
  [2,   "India and China", false, "one of the two is wrong"],
  [522, "claustrophobia", false, "a different phobia entirely"],
  [521, "arachnophobia", false,  "a different phobia entirely"],
  [92,  "", false,             "empty input"],
  [92,  "   ", false,          "whitespace only"],
];

let pass = 0;
const failures = [];

for (const [id, input, expected, why] of CASES) {
  const q = byId.get(id);
  if (!q) { failures.push(`#${id} missing from bank`); continue; }

  const got = bank.checkTyped(q, input);
  const ok = got === expected;
  if (ok) pass++;
  else {
    failures.push(
      `#${id} "${q.answer}"  typed "${input}"\n      expected ${JSON.stringify(expected)}, got ${JSON.stringify(got)}   (${why})`
    );
  }
}

/* ---- Sweep: the real answer must always match itself ---------------------- */
let selfFail = 0;
for (const q of bank.questions) {
  if (bank.checkTyped(q, q.answer) !== true) {
    selfFail++;
    if (selfFail <= 5) failures.push(`#${q.id} does not accept its own answer "${q.answer}"`);
  }
  for (const alias of q.accept || []) {
    if (bank.checkTyped(q, alias) !== true) {
      selfFail++;
      if (selfFail <= 8) failures.push(`#${q.id} rejects its own alias "${alias}" (answer "${q.answer}")`);
    }
  }
}

/* ---- Sweep: another question's answer must not match this one -------------
   Every ordered pair, not a sample. This used to walk a 129-pair diagonal and
   reported a clean bill of health while the bank quietly accepted "Entomology"
   for "Etymology", "Titian" for "Titan" and "Austria" for "Australia" — all
   inside edit-distance tolerance, all separately askable questions here. The
   full 800k-pair sweep costs a few seconds and would have caught every one.

   Answers that legitimately overlap are excluded rather than counted: #303
   "Greece" lists "athens" as an alias and #864's answer IS Athens, which is
   the bank agreeing with itself, not the checker being loose. The test is
   whether FUZZY matching let a different answer through, so a pair only counts
   when the other answer is nowhere in this question's own accepted forms. */
const formsOf = (q) => {
  const keys = new Set();
  for (const source of [q.answer, ...(q.accept || [])]) {
    for (const form of answerForms(source)) {
      const k = matchKey(form);
      if (k) keys.add(k);
    }
  }
  return keys;
};

let crossFail = 0;
let crossPairs = 0;
const crossExamples = [];
for (const q of bank.questions) {
  const own = formsOf(q);
  for (const other of bank.questions) {
    if (other.id === q.id) continue;
    crossPairs++;
    if (own.has(matchKey(other.answer))) continue;   /* deliberate alias overlap */
    if (bank.checkTyped(q, other.answer) === true) {
      crossFail++;
      if (crossExamples.length < 10) {
        crossExamples.push(`  "${other.answer}" (#${other.id}) accepted for "${q.answer}" (#${q.id})`);
      }
    }
  }
}

console.log(`explicit cases: ${pass}/${CASES.length} passed`);
console.log(`self-match sweep: ${selfFail} failures across ${bank.questions.length} questions and their aliases`);
console.log(`cross-match sweep: ${crossFail} false accepts across ${crossPairs} answer pairs`);
if (crossExamples.length) console.log(crossExamples.join("\n"));

if (failures.length) {
  console.log(`\nFAILURES (${failures.length}):`);
  for (const f of failures.slice(0, 25)) console.log("  -", f);
}

const bad = failures.length + crossFail;
console.log(`\n${bad === 0 ? "PASS" : "FAIL"} — ${bad} problem(s)\n`);
process.exit(bad === 0 ? 0 : 1);
