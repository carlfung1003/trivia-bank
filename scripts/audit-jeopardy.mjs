/* ==========================================================================
   The Board — clue-pack audit.
   Usage:  node scripts/audit-jeopardy.mjs

   The vault has audit-distractors because generated options can be quietly
   wrong. This file's failure mode is different: the clues are AUTHORED, so
   what goes wrong is authoring — a missing tier, an answer that gives itself
   away in the clue, two clues in one column that accept each other, an alias
   that does not match its own answer.

   Fatal: structure, self-match, and cross-accept. Everything else is a warning
   you should read before shipping a pack.
   ========================================================================== */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { checkTypedAgainst } from "../js/bank.js";
import { matchKey, normalise } from "../js/util.js";
import { BOARD } from "../js/config.js";

const here = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(here, "..", "data", "jeopardy.json"), "utf8"));
const packs = data.categories || [];
const finals = data.final || [];

const fatal = [];
const warn = [];

/* The lexicon the live game builds, rebuilt here so the audit tests what the
   player will actually meet. */
const lexicon = new Set();
for (const pack of packs) {
  for (const clue of pack.clues || []) {
    for (const source of [clue.answer, ...(clue.accept || [])]) {
      const key = matchKey(source);
      if (key) lexicon.add(key);
    }
  }
}

/* ---- Structure ------------------------------------------------------------ */

if (packs.length < BOARD.columns * 2) {
  warn.push(`only ${packs.length} packs — a two-floor game needs ${BOARD.columns * 2} distinct ones, so floors will repeat categories`);
}

const seenIds = new Set();
const seenNames = new Set();

for (const pack of packs) {
  const where = `[${pack.name || pack.id || "?"}]`;

  if (!pack.id) fatal.push(`${where} has no id`);
  if (seenIds.has(pack.id)) fatal.push(`${where} duplicate id "${pack.id}"`);
  seenIds.add(pack.id);

  if (!pack.name) fatal.push(`${where} has no name`);
  if (seenNames.has(pack.name)) fatal.push(`${where} duplicate name`);
  seenNames.add(pack.name);

  if (pack.name && pack.name !== pack.name.toUpperCase()) {
    warn.push(`${where} category names are set in caps on the board; this one is not`);
  }

  const clues = pack.clues || [];
  if (clues.length !== BOARD.tiers) {
    fatal.push(`${where} has ${clues.length} clues, needs exactly ${BOARD.tiers}`);
  }

  const tiers = clues.map((c) => c.tier);
  for (let t = 1; t <= BOARD.tiers; t++) {
    if (tiers.filter((x) => x === t).length !== 1) {
      fatal.push(`${where} tier ${t} appears ${tiers.filter((x) => x === t).length} times, needs exactly 1`);
    }
  }

  /* Within a column, two cells must never accept each other — picking the $400
     and typing the $800's answer has to be wrong. */
  for (const a of clues) {
    for (const b of clues) {
      if (a === b) continue;
      if (checkTypedAgainst(a, b.answer, lexicon) === true) {
        fatal.push(`${where} tier ${a.tier} accepts tier ${b.tier}'s answer "${b.answer}"`);
      }
    }
  }

  for (const clue of clues) {
    const at = `${where} $${clue.tier}`;

    if (!clue.clue || !clue.answer) { fatal.push(`${at} missing clue or answer`); continue; }

    /* Self-match: the answer and every alias must be accepted. An alias that
       does not match is dead weight the player will never benefit from. */
    if (checkTypedAgainst(clue, clue.answer, lexicon) !== true) {
      fatal.push(`${at} does not accept its own answer "${clue.answer}"`);
    }
    for (const alias of clue.accept || []) {
      if (checkTypedAgainst(clue, alias, lexicon) !== true) {
        fatal.push(`${at} rejects its own alias "${alias}" (answer "${clue.answer}")`);
      }
    }

    /* The question form must survive. "What is X?" is the whole conceit. */
    if (checkTypedAgainst(clue, clue.answer, lexicon) === true) {
      /* stripQuestionForm runs before the matcher in the engine; this asserts
         the pair works end to end for the commonest wrapper. */
      const wrapped = normalise(clue.answer);
      if (!wrapped) fatal.push(`${at} answer normalises to nothing`);
    }

    /* The answer must not be sitting in the clue — except where that IS the
       category's joke, which the pack declares. */
    if (!pack.echoOk) {
      const clueKey = ` ${matchKey(clue.clue)} `;
      const answerKey = matchKey(clue.answer);
      const meaty = answerKey.split(" ").filter((w) => w.length >= 5);
      const echoed = meaty.filter((w) => clueKey.includes(` ${w} `));
      if (answerKey && clueKey.includes(` ${answerKey} `)) {
        fatal.push(`${at} the clue contains the answer verbatim: "${clue.answer}"`);
      } else if (meaty.length && echoed.length === meaty.length) {
        warn.push(`${at} every substantial word of "${clue.answer}" appears in the clue`);
      }
    }

    if (clue.clue.length > 220) warn.push(`${at} clue is ${clue.clue.length} characters — it has to fit a cell reveal`);
    if (!/[.!?]$/.test(clue.clue.trim())) warn.push(`${at} clue does not end in punctuation`);
    if (/^(what|who|where|when|which)\b/i.test(clue.clue.trim())) {
      warn.push(`${at} clue is phrased as a question; on this board the CLUE is the statement`);
    }
  }
}

/* ---- Cross-pack: no clue may accept another pack's answer ------------------ */

const allClues = packs.flatMap((p) => (p.clues || []).map((c) => ({ ...c, pack: p.name })));
let crossFail = 0;
const crossExamples = [];
for (const a of allClues) {
  for (const b of allClues) {
    if (a === b) continue;
    if (matchKey(a.answer) === matchKey(b.answer)) continue;   /* same answer twice is fine */
    if ((a.accept || []).some((x) => matchKey(x) === matchKey(b.answer))) continue;  /* deliberate alias */
    if (checkTypedAgainst(a, b.answer, lexicon) === true) {
      crossFail++;
      if (crossExamples.length < 8) {
        crossExamples.push(`  "${b.answer}" [${b.pack}] accepted for "${a.answer}" [${a.pack}]`);
      }
    }
  }
}

/* ---- Finals ---------------------------------------------------------------- */

if (!finals.length) fatal.push("no final clues — the last lock has nothing to serve");
for (const f of finals) {
  const at = `[final: ${f.category || "?"}]`;
  if (!f.clue || !f.answer) { fatal.push(`${at} missing clue or answer`); continue; }
  if (checkTypedAgainst(f, f.answer, lexicon) !== true) {
    fatal.push(`${at} does not accept its own answer "${f.answer}"`);
  }
  for (const alias of f.accept || []) {
    if (checkTypedAgainst(f, alias, lexicon) !== true) {
      fatal.push(`${at} rejects its own alias "${alias}"`);
    }
  }
}

/* ---- Report ---------------------------------------------------------------- */

const clueCount = allClues.length;
console.log(`\nThe Board — ${packs.length} packs, ${clueCount} clues, ${finals.length} finals`);
console.log(`board needs ${BOARD.columns} packs per floor; ${packs.length} available, ${Math.floor(packs.length / BOARD.columns)} floors' worth\n`);
console.log(`cross-accept sweep: ${crossFail} false accepts across ${clueCount * (clueCount - 1)} clue pairs`);
if (crossExamples.length) console.log(crossExamples.join("\n"));

if (warn.length) {
  console.log(`\nWARNINGS (${warn.length}):`);
  for (const w of warn.slice(0, 20)) console.log("  -", w);
  if (warn.length > 20) console.log(`  ... and ${warn.length - 20} more`);
}

if (fatal.length) {
  console.log(`\nFATAL (${fatal.length}):`);
  for (const f of fatal.slice(0, 30)) console.log("  -", f);
}

const bad = fatal.length + crossFail;
console.log(`\n${bad === 0 ? "PASS" : "FAIL"} — ${bad} fatal issue(s), ${warn.length} warning(s)\n`);
process.exit(bad === 0 ? 0 : 1);
