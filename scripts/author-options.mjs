/* ==========================================================================
   Author multiple-choice options for questions the synthesiser cannot serve.
   Usage:  node scripts/author-options.mjs [--dry]

   Synthesis borrows distractors from other answers in the bank. That works for
   the large, homogeneous pools (people, capitals, years) and fails for answers
   whose *shape* is common but whose *meaning* is unique — "Fat and flour" and
   "Blue and yellow" are both two-word conjunctions, so a roux question happily
   borrows a colour-mixing answer.

   These are written by hand and stored in the bank itself, so they survive any
   future change to the engine. Every entry is checked at the bottom of this
   file: the array must contain the exact answer string, contain no duplicates,
   and offer four options.
   ========================================================================== */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const bankPath = join(here, "..", "data", "questions.json");
const bank = JSON.parse(readFileSync(bankPath, "utf8"));
const dry = process.argv.includes("--dry");

/* id -> the three wrong options. The real answer is spliced in automatically,
   so it can never be omitted or misspelt here. */
const WRONG = {
  /* --- unique-meaning answers that borrowed by shape alone ---------------- */
  515: ["Systems programming and operating systems",
        "Web front-end development",
        "Embedded device firmware"],

  516: ["It is distributed free of charge, but the source code stays private",
        "It runs only on open hardware standards",
        "It is released with no warranty and no support"],

  589: ["War and Peace", "Anna Karenina", "The Brothers Karamazov"],

  472: ["Butter and cream", "Eggs and sugar", "Stock and wine"],

  633: ["Almonds and honey", "Gelatin and rosewater", "Semolina and butter"],

  807: ["Gilbert and George",
        "Jake and Dinos Chapman",
        "Marina Abramovic and Ulay"],

  662: ["Four (five if the neutral tone is counted)",
        "Three (five in formal registers)",
        "Eight (ten in some older dialects)"],

  337: ["Marsupials — the kangaroo and koala",
        "Cetaceans — the dolphin and porpoise",
        "Chiropterans — the fruit bat and vampire bat"],

  533: ["Wind speed and direction",
        "Atmospheric pressure changes",
        "Ocean salinity and depth"],

  541: ["Red and yellow", "Blue and red", "Red and white"],

  645: ["Foil, rapier, and sabre",
        "Épée, katana, and foil",
        "Sabre, rapier, and cutlass"],

  701: ["The waltz and the mazurka",
        "The polka and the polonaise",
        "The czardas and the krakowiak"],

  /* --- works: distractors are other real works by the same figure --------- */
  732: ["Of Thee I Sing", "Girl Crazy", "Funny Face"],
  697: ["The Raindrop Prelude", "The Revolutionary Étude", "The Heroic Polonaise"],
  705: ["The Pathétique", "The Appassionata", "The Waldstein"],

  468: ["Confit", "En papillote", "Bain-marie"],

  /* --- people: same field, same era, genuinely tempting ------------------- */
  316: ["Steve Wozniak", "Steve Ballmer", "Gordon Moore"],
  317: ["Paul Allen", "Bill Gates", "Andy Grove"],

  /* --- numbers where the culturally meaningful neighbours beat arithmetic - */
  120: ["Six", "Nine", "Four"],
  535: ["Seven", "Eight", "Thirteen"],
  524: ["Six", "Eight", "Nine"],
  13:  ["Two", "Three", "Six"],
  649: ["Six", "Five", "Eleven"],

  230: ["About 30,000 km per second",
        "About 3 million km per second",
        "About 300 km per second"],

  /* --- places where the near-misses are the real ones --------------------- */
  64:  ["Colombia", "Vietnam", "Ethiopia"],
  464: ["France", "Hungary", "Germany"],
};

const byId = new Map(bank.questions.map((q) => [q.id, q]));
const problems = [];
let applied = 0;

for (const [rawId, wrong] of Object.entries(WRONG)) {
  const id = Number(rawId);
  const q = byId.get(id);
  if (!q) { problems.push(`#${id} not found in bank`); continue; }

  const options = [q.answer, ...wrong];

  const norm = (s) => String(s).trim().toLowerCase();
  const seen = new Set();
  for (const o of options) {
    if (seen.has(norm(o))) problems.push(`#${id} duplicate option: "${o}"`);
    seen.add(norm(o));
  }
  if (options.length !== 4) problems.push(`#${id} has ${options.length} options, expected 4`);

  /* A hand-written distractor that the typed checker would also accept is the
     one mistake that actively punishes a correct player. */
  for (const w of wrong) {
    if (norm(w) === norm(q.answer)) problems.push(`#${id} distractor equals answer`);
    for (const alias of q.accept || []) {
      if (norm(w) === norm(alias)) problems.push(`#${id} distractor "${w}" is an accepted alias`);
    }
  }

  q.options = options;
  applied++;
}

if (problems.length) {
  console.error("FAILED — not written:");
  for (const p of problems) console.error("  -", p);
  process.exit(1);
}

if (!dry) {
  writeFileSync(bankPath, JSON.stringify(bank, null, 2) + "\n");
}
console.log(`${dry ? "would apply" : "applied"} authored options to ${applied} questions`);
console.log(`bank now: ${bank.questions.filter((q) => q.options).length} of ${bank.questions.length} with authored options`);
