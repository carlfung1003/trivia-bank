/* ==========================================================================
   Mark questions that are unfair to ask in Type-It mode.
   Usage:  node scripts/author-typed-flags.mjs [--dry]

   Bank.isTypedViable() catches the STRUCTURAL cases automatically — answers
   that are sentences, lists, or simply too long to type. What it cannot see
   is producibility: "Répondez s'il vous plaît" is only four words and well
   inside every threshold, and nobody is going to type it.

   These are set-phrase answers in another language. The question is fine —
   "What does RSVP stand for?" is a good multiple-choice question — but
   reproducing the phrase letter by letter is a test of French, not of trivia.
   ========================================================================== */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const bankPath = join(here, "..", "data", "questions.json");
const bank = JSON.parse(readFileSync(bankPath, "utf8"));
const dry = process.argv.includes("--dry");

/* id -> why it is choice-only */
const CHOICE_ONLY = {
  96:  "Latin set phrase — 'Exempli gratia'",
  309: "French set phrase — 'Répondez s'il vous plaît'",
  310: "Latin set phrase — 'Ante meridiem'",
  311: "Latin set phrase — 'Et cetera'",
  690: "Latin set phrase — 'Et alii'",
  789: "French painting title — 'Les Demoiselles d'Avignon'",
  99:  "asks for a literal translation; exact wording is unguessable",
};

const byId = new Map(bank.questions.map((q) => [q.id, q]));
let applied = 0;
const missing = [];

for (const [rawId, reason] of Object.entries(CHOICE_ONLY)) {
  const q = byId.get(Number(rawId));
  if (!q) { missing.push(rawId); continue; }
  q.typedOk = false;
  applied++;
  if (dry) console.log(`  #${q.id}  ${q.answer}   (${reason})`);
}

if (missing.length) {
  console.error("not in bank:", missing.join(", "));
  process.exit(1);
}

if (!dry) writeFileSync(bankPath, JSON.stringify(bank, null, 2) + "\n");
console.log(`${dry ? "would mark" : "marked"} ${applied} questions as choice-only`);
