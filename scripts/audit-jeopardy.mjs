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
import { recencyRisk } from "./recency.mjs";

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

const headingCount = new Set(packs.map((p) => p.name)).size;
if (headingCount < BOARD.columns * 2) {
  fatal.push(`only ${headingCount} distinct categories — a two-floor game needs ${BOARD.columns * 2}`);
}

const seenIds = new Set();
/* Names may repeat — a heading can carry several packs of different clues, and
   the dealer picks one variant per game. What must be unique is the id, and
   what must never repeat is a CLUE. */
const variantsByName = new Map();

for (const pack of packs) {
  const where = `[${pack.name || pack.id || "?"}]`;

  if (!pack.id) fatal.push(`${where} has no id`);
  if (seenIds.has(pack.id)) fatal.push(`${where} duplicate id "${pack.id}"`);
  seenIds.add(pack.id);

  if (!pack.name) fatal.push(`${where} has no name`);
  if (!variantsByName.has(pack.name)) variantsByName.set(pack.name, []);
  variantsByName.get(pack.name).push(pack);

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

    /* Facts rot. See scripts/recency.mjs — this flags the SHAPE of a claim
       that stops being true, not the claim itself. */
    for (const why of recencyRisk(clue.clue)) warn.push(`${at} recency risk: ${why} — "${clue.clue.slice(0, 70)}…"`);

    if (clue.clue.length > 220) warn.push(`${at} clue is ${clue.clue.length} characters — it has to fit a cell reveal`);
    /* A closing quote counts: a FIRST LINES pack is nothing but quotations. */
    if (!/[.!?]["'\u2019\u201d]?$/.test(clue.clue.trim())) warn.push(`${at} clue does not end in punctuation`);
    if (/^(what|who|where|when|which)\b/i.test(clue.clue.trim())) {
      warn.push(`${at} clue is phrased as a question; on this board the CLUE is the statement`);
    }
  }
}

/* ---- Variants: same heading, genuinely different questions ------------------ */

let variantClash = 0;
const variantExamples = [];
for (const [name, variants] of variantsByName) {
  if (variants.length < 2) continue;
  for (let i = 0; i < variants.length; i++) {
    for (let j = i + 1; j < variants.length; j++) {
      const a = variants[i], b = variants[j];
      for (const ca of a.clues || []) {
        for (const cb of b.clues || []) {
          const sameAnswer = matchKey(ca.answer) === matchKey(cb.answer);
          const sameClue = normalise(ca.clue) === normalise(cb.clue);
          if (sameAnswer || sameClue) {
            variantClash++;
            if (variantExamples.length < 10) {
              variantExamples.push(`  "${name}" ${a.id} and ${b.id} both use "${ca.answer}"`);
            }
          }
        }
      }
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
  for (const why of recencyRisk(f.clue)) warn.push(`${at} recency risk: ${why}`);
  for (const alias of f.accept || []) {
    if (checkTypedAgainst(f, alias, lexicon) !== true) {
      fatal.push(`${at} rejects its own alias "${alias}"`);
    }
  }
}

/* ---- Report ---------------------------------------------------------------- */

const clueCount = allClues.length;
const multi = [...variantsByName.entries()].filter(([, v]) => v.length > 1);
console.log(`\nThe Board — ${packs.length} packs under ${headingCount} headings, ${clueCount} clues, ${finals.length} finals`);
console.log(`${multi.length} headings carry more than one pack: ${multi.map(([n, v]) => `${n} ×${v.length}`).join(", ") || "none"}`);
console.log(`a game deals ${BOARD.columns * 2} headings; ${headingCount} available\n`);
console.log(`variant sweep: ${variantClash} clue(s) shared between packs under the same heading`);
if (variantExamples.length) console.log(variantExamples.join("\n"));
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

const bad = fatal.length + crossFail + variantClash;
console.log(`\n${bad === 0 ? "PASS" : "FAIL"} — ${bad} fatal issue(s), ${warn.length} warning(s)\n`);
process.exit(bad === 0 ? 0 : 1);
