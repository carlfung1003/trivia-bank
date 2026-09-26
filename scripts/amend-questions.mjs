/* ==========================================================================
   Content corrections to the bank, each with its reason.
   Usage:  node scripts/amend-questions.mjs [--dry]

   Written in Sep 2026 while hand-authoring multiple-choice options for every
   question. Writing three wrong answers forces you to ask whether the right
   one is the ONLY right one, and ~35 questions failed that: a second valid
   answer, a stale fact, a clue that contains its own answer, or an alias that
   accepts a different thing.

   Rules this file follows:
   - Answers are left alone wherever the question can be fixed instead, so the
     authored options (scripts/authored-options.json) still fit their answer.
   - Removing an alias is a correctness fix: an alias that names a different
     thing pays out for a wrong answer in Type-It.
   - Idempotent: running it twice changes nothing the second time.
   Run BEFORE scripts/author-options.mjs, then the audits.
   ========================================================================== */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const bankPath = join(here, "..", "data", "questions.json");
const bank = JSON.parse(readFileSync(bankPath, "utf8"));
const dry = process.argv.includes("--dry");

/* id -> { field: new value } plus `why`. `dropAccept` removes aliases. */
const AMEND = {
  /* ---- a second valid answer ------------------------------------------- */
  652: { why: "A free ball makes 155 possible; 147 is the maximum WITHOUT one.",
         question: "What is the maximum break in snooker, the highest score possible without a free ball?" },
  510: { why: "The word 'bug' predates Hopper; she popularised the moth story, her team logged it.",
         question: "Which computer scientist popularised the story of the first computer 'bug', a moth found in a Harvard relay?" },
  327: { why: "Continent count depends on the model (5, 6 or 7).",
         question: "By the convention most English-speaking schools teach, how many continents are there?" },
  499: { why: "'Spelled the same, different meanings' is the definition of a homograph.",
         question: "What is the term for words that are spelled AND pronounced the same but have different meanings?" },
  609: { why: "Metropolis is not the earliest surviving sci-fi feature (Himmelskibet 1918, Aelita 1924 survive).",
         question: "Which 1927 German silent film features the robot Maria and the city's underground workers?" },
  288: { why: "Sushi's fermented-fish precursor came from Southeast Asia / southern China.",
         question: "In which country did sushi, as it is eaten today, develop?" },
  631: { why: "Ecuador also claims ceviche as its own.",
         question: "Ceviche is the national dish of which South American country?" },
  471: { why: "Several Vietnamese noodle soups are breakfast staples.",
         question: "What is the name of Vietnam's best-known national noodle soup, made with rice noodles in a clear beef broth?" },
  214: { why: "Liberia is also often described as never colonised.",
         question: "Which African country, apart from a brief Italian occupation, was never colonised by a European power?" },
  368: { why: "Sucre is Bolivia's constitutional capital; La Paz is the seat of government.",
         question: "Which South American city is the highest seat of national government in the world?" },
  273: { why: "Smetana also composed after going deaf.",
         question: "Which composer wrote his Ninth Symphony while almost completely deaf?" },
  454: { why: "The orchestral harp reaches lower than the double bass.",
         question: "Which is the lowest-pitched instrument in the orchestra's bowed string section?" },
  423: { why: "Senryu also follows 5-7-5; haiku is the one about nature and the seasons.",
         question: "Which Japanese 5-7-5 poetic form traditionally centres on nature and the seasons?" },
  269: { why: "The Beatles had five members in their early Hamburg years.",
         question: "How many members were in The Beatles' famous line-up?" },
  811: { why: "Verrocchio also cast a celebrated bronze David before Michelangelo.",
         question: "Whose bronze 'David', cast around 1440, was the first free-standing male nude since antiquity?" },
  45:  { why: "Walt also uses the alias 'Lambert' as a fugitive in the final season.",
         question: "In Breaking Bad, what alias does Walter White take as a methamphetamine manufacturer?" },
  375: { why: "Skin also regrows lost tissue; the liver's regeneration is the notable internal one.",
         question: "Which internal organ can regrow to full size after up to two-thirds of it is removed?" },
  376: { why: "Earthworms have five PAIRS of arches, and it varies by species.",
         question: "How many pairs of aortic arches, often called 'hearts', does the common earthworm have?" },
  984: { why: "Fish hearts are also described as having three or four chambers (sinus venosus, bulbus).",
         question: "How many main pumping chambers (atria plus ventricles) does a fish heart have?" },
  506: { why: "Basic-literacy standards are ~1,500-2,000; ~3,000 is the newspaper figure.",
         question: "Roughly how many Chinese characters does a reader need to follow a newspaper?" },
  365: { why: "Italy leads China by one site; a live count needs a date (recency rule).",
         question: "As of 2024, which country had the most UNESCO World Heritage Sites?" },
  527: { why: "California has grown coffee commercially since the 2010s.",
         question: "Which US state has the longest history of growing coffee commercially?" },

  /* ---- the clue contains its own answer --------------------------------- */
  842: { why: "'Excessive pride' in the clue gave away Pride.",
         question: "Which of the seven deadly sins is traditionally held to be the root of all the others?" },
  747: { why: "'His second' in the clue gave away No. 2.",
         question: "Which Rachmaninoff piano concerto became a concert-hall staple after his recovery from depression?" },
  773: { why: "The popular title 'Whistler's Mother' named the painter.",
         question: "'Arrangement in Grey and Black No. 1' is a portrait of the artist's own mother. Who painted it?" },
  458: { why: "'Often fish-shaped' in the clue pointed straight at 'wooden fish'.",
         question: "What is the name of the hollow wooden percussion block struck to keep time in Buddhist temple chanting?" },
  383: { why: "Uranus -> Uranium is guessable from the clue.",
         question: "Which radioactive element, used as nuclear fuel, takes its name from the planet discovered in 1781?" },

  732: { why: "Porgy and Bess was the only 'X and Y' title among Gershwin's shows (a shape tell); without 'Gershwin' the options can all be paired-title operas.",
         question: "The aria 'Summertime' comes from which opera?" },

  /* ---- wording ---------------------------------------------------------- */
  943: { why: "Asked for faces but meant total pips.",
         question: "How many pips are there in total on a standard six-sided die?" },
  344: { why: "The question was garbled.",
         question: "How many pieces does each player start a game of chess with?" },
  557: { why: "'more than any elsewhere' did not parse.",
         question: "Which two US states each border eight other states, the most of any state?" },
  30:  { why: "British spelling, to match the rest of the bank.",
         question: "The Meiji Restoration, which rapidly modernised the country, took place in which nation?" },
  79:  { why: "The Venus de Milo being in the Louvre is common knowledge.", difficulty: "easy" },

  /* ---- an alias that accepts a different thing -------------------------- */
  473: { why: "Mezcal is made from many agaves; only tequila is specifically blue agave.", dropAccept: ["mezcal"] },
  699: { why: "The Warsaw Uprising is the 1944 event, not the 1831 fall of Warsaw.", dropAccept: ["warsaw uprising"] },
};

const byId = new Map(bank.questions.map((q) => [q.id, q]));
const problems = [];
let changed = 0;

for (const [rawId, patch] of Object.entries(AMEND)) {
  const q = byId.get(Number(rawId));
  if (!q) { problems.push(`#${rawId} not found`); continue; }
  if (!patch.why) problems.push(`#${rawId} has no reason`);
  let touched = false;
  for (const field of ["question", "answer", "difficulty"]) {
    if (patch[field] !== undefined && q[field] !== patch[field]) { q[field] = patch[field]; touched = true; }
  }
  if (patch.dropAccept) {
    const drop = new Set(patch.dropAccept.map((s) => s.toLowerCase()));
    const kept = (q.accept || []).filter((a) => !drop.has(a.toLowerCase()));
    if (kept.length !== (q.accept || []).length) { q.accept = kept; touched = true; }
  }
  if (!["easy", "medium", "hard"].includes(q.difficulty)) problems.push(`#${q.id} bad difficulty`);
  if (touched) changed++;
}

if (problems.length) {
  console.error("FAILED — not written:");
  for (const p of problems) console.error("  -", p);
  process.exit(1);
}
if (!dry) writeFileSync(bankPath, JSON.stringify(bank, null, 2) + "\n");
console.log(`${dry ? "would amend" : "amended"} ${changed} of ${Object.keys(AMEND).length} listed questions`);
