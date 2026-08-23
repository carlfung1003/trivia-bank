/* ==========================================================================
   The Street — survey-board audit.
   Usage:  node scripts/audit-surveys.mjs [--show=8]

   An open-text board fails differently from a trivia question. The failure
   that matters is AMBIGUITY: two slots on the same board that would both
   accept "the dishes", so the player says the right thing and the board
   decides which right thing they meant. That is the fatal check here, and it
   is why the alias lists are long and hand-checked rather than generated.

   Also fatal: a slot that will not accept its own text, an alias that matches
   nothing, and shares that sum past 100 — a board totalling 100 claims the
   list is exhaustive, and it never is.
   ========================================================================== */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { checkTypedAgainst } from "../js/bank.js";
import { matchKey } from "../js/util.js";
import { STREET } from "../js/config.js";
import { recencyRisk } from "./recency.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(here, "..", "data", "surveys.json"), "utf8"));
const surveys = data.surveys || [];

const args = process.argv.slice(2);
const showN = Number((args.find((a) => a.startsWith("--show")) || "").split("=")[1] || 0);

const fatal = [];
const warn = [];

if (surveys.length < STREET.rounds.length) {
  fatal.push(`only ${surveys.length} surveys — a run needs ${STREET.rounds.length} distinct ones`);
}
if (surveys.length < STREET.rounds.length * 3) {
  warn.push(`${surveys.length} surveys gives only ${Math.floor(surveys.length / STREET.rounds.length)} runs before boards start repeating between sessions`);
}

const seenIds = new Set();
const seenPrompts = new Set();
let slotCount = 0;
let ambiguous = 0;
const ambiguousExamples = [];

for (const survey of surveys) {
  const where = `[${survey.id || survey.prompt || "?"}]`;

  if (!survey.id) fatal.push(`${where} has no id`);
  if (seenIds.has(survey.id)) fatal.push(`${where} duplicate id`);
  seenIds.add(survey.id);

  if (!survey.prompt) fatal.push(`${where} has no prompt`);
  if (seenPrompts.has(survey.prompt)) fatal.push(`${where} duplicate prompt`);
  seenPrompts.add(survey.prompt);

  /* A survey prompt rots the same way a clue does — "name the most popular X"
     is fine because the ANSWERS are opinions, but a prompt asserting a live
     record is not. */
  for (const why of recencyRisk(survey.prompt)) {
    if (!/^name the most (popular|famous|recognisable)/i.test(String(survey.prompt).trim())) {
      warn.push(`${where} recency risk: ${why}`);
    }
  }

  if (survey.prompt && !/^name /i.test(survey.prompt.trim()) && !/^besides /i.test(survey.prompt.trim())) {
    warn.push(`${where} prompt does not open with "Name…" — the board reads as an instruction, not a question`);
  }

  const answers = survey.answers || [];
  slotCount += answers.length;

  if (answers.length < STREET.strikes + 1) {
    fatal.push(`${where} has ${answers.length} answers — fewer than strikes+1 makes the board unloseable-or-unwinnable`);
  }
  if (answers.length > 8) {
    warn.push(`${where} has ${answers.length} answers; a board over 8 rows does not fit a phone`);
  }

  /* Shares. */
  const total = answers.reduce((acc, a) => acc + (a.share || 0), 0);
  if (total > 100) fatal.push(`${where} shares total ${total}%, over 100`);
  if (total === 100) warn.push(`${where} shares total exactly 100% — implies nobody said anything else`);
  if (total < 80) warn.push(`${where} shares total only ${total}%; the board is mostly "other"`);

  const shares = answers.map((a) => a.share);
  const sorted = [...shares].sort((a, b) => b - a);
  if (String(shares) !== String(sorted)) {
    warn.push(`${where} answers are not authored in descending share order (the engine sorts them, but the file should read like the board)`);
  }
  for (const a of answers) {
    if (!Number.isInteger(a.share) || a.share <= 0) {
      fatal.push(`${where} "${a.text}" has share ${a.share} — must be a positive integer`);
    }
  }

  /* The board's own lexicon, exactly as the engine builds it. */
  const lexicon = new Set();
  for (const a of answers) {
    for (const source of [a.text, ...(a.accept || [])]) {
      const key = matchKey(source);
      if (key) lexicon.add(key);
    }
  }

  const hits = (guess) => {
    const out = [];
    for (const a of answers) {
      const v = checkTypedAgainst({ answer: a.text, accept: a.accept }, guess, lexicon);
      if (v === true || v === "close") out.push(a.text);
    }
    return out;
  };

  for (const a of answers) {
    const at = `${where} "${a.text}"`;
    if (!a.text) { fatal.push(`${where} an answer has no text`); continue; }

    /* Self-match, and unambiguously so. */
    const selfHits = hits(a.text);
    if (!selfHits.includes(a.text)) fatal.push(`${at} does not accept its own text`);
    if (selfHits.length > 1) {
      ambiguous++;
      if (ambiguousExamples.length < 12) {
        ambiguousExamples.push(`  "${a.text}" ${where} also matches: ${selfHits.filter((x) => x !== a.text).join(", ")}`);
      }
    }

    for (const alias of a.accept || []) {
      const aliasHits = hits(alias);
      if (!aliasHits.includes(a.text)) {
        fatal.push(`${at} rejects its own alias "${alias}"`);
      } else if (aliasHits.length > 1) {
        ambiguous++;
        if (ambiguousExamples.length < 12) {
          ambiguousExamples.push(`  alias "${alias}" ${where} matches ${aliasHits.length} slots: ${aliasHits.join(", ")}`);
        }
      }
    }

    if ((a.accept || []).length < 1) {
      warn.push(`${at} has no aliases — an open-text board with one accepted phrasing is a guessing game about wording`);
    }
  }
}

/* ---- Report ---------------------------------------------------------------- */

console.log(`\nThe Street — ${surveys.length} surveys, ${slotCount} answers`);
console.log(`a run is ${STREET.rounds.length} boards; ${Math.floor(surveys.length / STREET.rounds.length)} runs' worth on file\n`);
console.log(`ambiguity sweep: ${ambiguous} guess(es) matching more than one slot on their own board`);
if (ambiguousExamples.length) console.log(ambiguousExamples.join("\n"));

if (showN) {
  console.log(`\nSample boards:`);
  for (const s of surveys.slice(0, showN)) {
    console.log(`\n  ${s.prompt}`);
    for (const a of s.answers) console.log(`    ${String(a.share).padStart(3)}%  ${a.text}`);
  }
}

if (warn.length) {
  console.log(`\nWARNINGS (${warn.length}):`);
  for (const w of warn.slice(0, 20)) console.log("  -", w);
  if (warn.length > 20) console.log(`  ... and ${warn.length - 20} more`);
}
if (fatal.length) {
  console.log(`\nFATAL (${fatal.length}):`);
  for (const f of fatal.slice(0, 30)) console.log("  -", f);
}

const bad = fatal.length + ambiguous;
console.log(`\n${bad === 0 ? "PASS" : "FAIL"} — ${fatal.length} fatal, ${ambiguous} ambiguous, ${warn.length} warning(s)\n`);
process.exit(bad === 0 ? 0 : 1);
