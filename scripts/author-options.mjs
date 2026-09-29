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

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Bank } from "../js/bank.js";

const here = dirname(fileURLToPath(import.meta.url));
const bankPath = join(here, "..", "data", "questions.json");
const bank = JSON.parse(readFileSync(bankPath, "utf8"));
const dry = process.argv.includes("--dry");

/* The bulk set: three wrong options for every question, in a plain data file
   so it can be reviewed and diffed as data (scripts/authored-options.json).
   Written in Sep 2026 after a real-phone playtest found synthesis offering
   "343 metres per second" as a candidate for the smallest bone. The WRONG
   table below keeps the hand-annotated originals and wins on any overlap. */
const bulkPath = join(here, "authored-options.json");
const BULK = existsSync(bulkPath) ? JSON.parse(readFileSync(bulkPath, "utf8")) : {};

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
        "Épée, smallsword, and foil",             /* a katana was no fencing weapon at all */
        "Sabre, rapier, and cutlass"],

  701: ["The waltz and the mazurka",
        "The polka and the polonaise",
        "The czardas and the krakowiak"],

  /* --- works: distractors are other real works by the same figure --------- */
  697: ["The Raindrop Prelude", "The Revolutionary Étude", "The Heroic Polonaise"],
  705: ["The Pathétique Sonata", "The Appassionata Sonata", "The Waldstein Sonata"],  /* only the answer said "Sonata" */

  468: ["Confit", "En papillote", "Bain-marie"],

  /* --- people: same field, same era, genuinely tempting ------------------- */
  316: ["Steve Wozniak", "Steve Ballmer", "Gordon Moore"],
  317: ["Paul Allen", "Steve Ballmer", "Andy Grove"],   /* only the answer shared "Steve" with Jobs */

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

  /* --- re-authored after amend-questions.mjs tightened the question -------
     Each of these had its best trap withheld because it was arguably right
     under the OLD wording. The rewording made it plainly wrong, so it can go
     back in as the near-miss it always should have been. */
  273: ["Antonín Dvořák", "Gustav Mahler", "Anton Bruckner"],      /* all wrote Ninths; only one was deaf */
  327: ["Six", "Five", "Eight"],                                     /* six and five are other models */
  269: ["Five", "Three", "Six"],                                     /* five in the Hamburg years */
  984: ["Three", "Four", "One"],
  365: ["China", "Spain", "Germany"],                                /* one site behind in 2024 */
  527: ["California", "Florida", "Texas"],
  499: ["Heteronyms", "Synonyms", "Paronyms"],                       /* homophones was arguable */
  454: ["The cello", "The viola", "The violin"],

  /* --- the classic confusions, restored -----------------------------------
     These are THE wrong answers people actually give, and the typed checker
     used to accept every one as a one-letter slip, so they could not be
     offered. Now that options are in the checker's lexicon (bank.js), typing
     one is correctly wrong, and it can finally be the trap it should be. */
  953: ["Reflection", "Diffraction", "Dispersion"],
  571: ["An ectotherm", "A poikilotherm", "A thermophile"],
  18:  ["Phycology", "Bacteriology", "Pteridology"],
  695: ["A bicentenary (bicentennial)", "A sesquicentenary (sesquicentennial)", "A semicentenary (semicentennial)"],
  389: ["Vitamin D", "Vitamin B1", "Vitamin B12"],
  732: ["Samson and Delilah", "Tristan and Isolde", "Dido and Aeneas"],   /* see amend-questions #732 */

  /* --- Sep 2026 review of every set, read as a player (KAN-248) -----------
     The structural audit cannot see meaning. Read one question at a time,
     these sets had a wrong option that was defensibly right, one that was not
     the same kind of thing as the answer, or a tell that picked the answer
     without the knowledge. Question rewordings are in amend-questions.mjs. */
  798: ["Bellini", "Giorgione", "Carpaccio"],                 /* Tintoretto painted a Bacchus and Ariadne too */
  283: ["Nectar", "Pollen", "Honeydew"],                      /* bee larvae do spin silk */
  842: ["Envy", "Lust", "Wrath"],                             /* greed has its own 'root of all evil' claim */
  420: ["A parody", "A pastiche", "A parable"],               /* Animal Farm is routinely called a satire */
  791: ["Karel Appel", "Bart van der Leck", "Gerrit Rietveld"], /* van Doesburg made black-grid primaries too */
  910: ["Day of the Kings", "Night of the Radishes", "Day of the Holy Cross"], /* Día de los Inocentes is 1 Nov of the same feast */
  383: ["Neptunium", "Plutonium", "Thorium"],                 /* Ti/Te were not radioactive: 'nuclear fuel' alone gave it */
  552: ["Kuwait", "Oman", "United Arab Emirates"],            /* the old three were provinces, not countries */
  598: ["Wings (1927)", "One Flew Over the Cuckoo's Nest (1975)", "The Silence of the Lambs (1991)"], /* 'first' + the earliest year was the tell */
  615: ["A duplet", "A triad", "A trill"],                    /* tri- was the only three-prefix left */
  795: ["Frida and Diego Rivera", "Two Nudes in a Forest", "The Broken Column"], /* only the answer said Two and Frida */
  459: ["F major", "C-sharp major", "G-flat major"],           /* A minor fell to the word 'major' */
  471: ["Bún chả", "Bún thịt nướng", "Bún riêu"],             /* bánh mì is a sandwich, not a noodle soup */
  474: ["Siu mai", "Fun guo", "Wu gok"],                      /* cheung fun is a rice roll, not a dumpling */
  267: ["Munchkinland", "The Haunted Forest", "The Wicked Witch's Castle"], /* two regions under 'what city'; see amend */
};

const byId = new Map(bank.questions.map((q) => [q.id, q]));
const problems = [];
let applied = 0;
const pending = [];

for (const [rawId, wrong] of Object.entries({ ...BULK, ...WRONG })) {
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
    pending.push([q, w]);
  }

  q.options = options;
  applied++;
}

/* Checked AFTER every set is applied, against a bank that includes them:
   the checker's real-word guard reads the options too (bank.js lexicon), so
   the verdict has to come from the bank as it will actually ship. Aliases
   are only the listed spellings; the checker is looser (per-word typo
   tolerance, inflections). A distractor it marks right, or "close", is a
   second answer wearing a disguise. */
const checker = new Bank(bank);
for (const [q, w] of pending) {
  const verdict = checker.checkTyped(q, w);
  if (verdict === true || verdict === "close") {
    problems.push(`#${q.id} distractor "${w}" is ${verdict === true ? "accepted" : "close"} by the typed checker`);
  }
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
