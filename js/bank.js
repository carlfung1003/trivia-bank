/* ==========================================================================
   Bank loading, filtering and drawing.
   --------------------------------------------------------------------------
   data/questions.json is Carl's file, byte-for-byte as authored. Nothing in
   this project rewrites it — swapping in a new bank is a single file drop,
   provided it keeps the documented shape:

     { meta: {...}, categories: [string], questions: [
         { id, category, difficulty: "easy"|"medium"|"hard",
           question, answer, accept: [string] } ] }
   ========================================================================== */

import { buildIndex, isChoiceViable } from "./distractors.js";
import {
  normalise, sample, shuffle, levenshtein,
  matchKey, demandsExact, fuzzyWordMatch, answerForms,
} from "./util.js";

export class Bank {
  constructor(raw) {
    this.meta = raw.meta || {};
    this.questions = raw.questions || [];
    this.categories = raw.categories || [...new Set(this.questions.map((q) => q.category))].sort();
    this.byId = new Map(this.questions.map((q) => [q.id, q]));
    this.index = buildIndex(this.questions);

    /* Every answer and alias in the bank, as match keys. Used by checkTyped to
       refuse a "typo" that happens to spell a different real answer — see
       there for why the bank has to be the judge of that. */
    this.lexicon = new Set();
    for (const q of this.questions) {
      for (const source of [q.answer, ...(q.accept || [])]) {
        const key = matchKey(source);
        if (key) this.lexicon.add(key);
      }
    }

    /* Bucketed for fast drawing: category -> difficulty -> [question]. */
    this.buckets = new Map();
    for (const q of this.questions) {
      if (!this.buckets.has(q.category)) this.buckets.set(q.category, new Map());
      const byDiff = this.buckets.get(q.category);
      if (!byDiff.has(q.difficulty)) byDiff.set(q.difficulty, []);
      byDiff.get(q.difficulty).push(q);
    }
  }

  static async load(url = "data/questions.json") {
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) throw new Error(`Bank failed to load: ${res.status} ${res.statusText}`);
    const raw = await res.json();
    if (!Array.isArray(raw.questions) || !raw.questions.length) {
      throw new Error("Bank loaded but contains no questions");
    }
    return new Bank(raw);
  }

  get size() {
    return this.questions.length;
  }

  /**
   * Is this question fair to ask in Type-It mode?
   *
   * The mirror of isChoiceViable(). Multiple choice fails on answers with no
   * structural peers; TYPING fails on answers nobody could reasonably produce
   * letter by letter, even knowing the fact. "What does RSVP stand for?" is a
   * fine question — asking someone to type "Répondez s'il vous plaît" is not.
   *
   * A bank entry can override the verdict with `typedOk`, so the judgement is
   * data rather than something baked into code.
   */
  static isTypedViable(q) {
    if (typeof q.typedOk === "boolean") return q.typedOk;

    /* Judge the answer without parentheticals and asides — those are already
       optional at match time. */
    const bare = String(q.answer || "")
      .replace(/\([^)]*\)/g, " ")
      .split(/\s[—–]\s/)[0]
      .replace(/\s+/g, " ")
      .trim();
    if (!bare) return false;

    const words = bare.split(" ").length;

    /* A sentence is not an answer you can type. Five words is the cutoff
       because titles and names sit right at it — "The Silence of the Lambs"
       and "Ludwig Mies van der Rohe" are both five and both perfectly
       typeable, while length catches the genuinely long ones. */
    if (words > 5) return false;
    if (bare.length > 30) return false;

    /* Lists — "Swan Lake, The Sleeping Beauty, and The Nutcracker" — are a
       memory test of enumeration, not of typing. */
    if ((bare.match(/,/g) || []).length >= 2) return false;

    return true;
  }

  /** How many questions match a filter set — drives the setup screen counter. */
  count({ categories, difficulties, choiceOnly = false, typedOnly = false } = {}) {
    return this.pool({ categories, difficulties, choiceOnly, typedOnly }).length;
  }

  /**
   * All questions matching the filters.
   * `choiceOnly` drops the handful that cannot be asked fairly as multiple
   * choice (see distractors.js — structurally unique answers).
   */
  pool({ categories, difficulties, choiceOnly = false, typedOnly = false, exclude } = {}) {
    const cats = categories && categories.length ? new Set(categories) : null;
    const diffs = difficulties && difficulties.length ? new Set(difficulties) : null;
    const out = [];
    for (const q of this.questions) {
      if (cats && !cats.has(q.category)) continue;
      if (diffs && !diffs.has(q.difficulty)) continue;
      if (exclude && exclude.has(q.id)) continue;
      if (choiceOnly && !isChoiceViable(q, this.index)) continue;
      if (typedOnly && !Bank.isTypedViable(q)) continue;
      out.push(q);
    }
    return out;
  }

  /**
   * Draw one question, preferring the requested difficulty but degrading
   * gracefully: a filter set with no 'hard' Music questions should still
   * produce a playable run rather than dead-ending mid-heist.
   */
  draw(rng, { categories, difficulties, difficulty, exclude, choiceOnly = false, typedOnly = false } = {}) {
    const tryDraw = (diffList) => {
      const p = this.pool({ categories, difficulties: diffList, exclude, choiceOnly, typedOnly });
      return p.length ? sample(rng, p, 1)[0] : null;
    };

    if (difficulty) {
      /* Requested tier, then neighbouring tiers, then anything allowed. */
      const order = { easy: ["easy", "medium", "hard"], medium: ["medium", "hard", "easy"], hard: ["hard", "medium", "easy"] };
      for (const d of order[difficulty] || [difficulty]) {
        if (difficulties && difficulties.length && !difficulties.includes(d)) continue;
        const hit = tryDraw([d]);
        if (hit) return hit;
      }
    }
    return tryDraw(difficulties);
  }

  /**
   * Draw a whole run up-front. Used by the Daily Heist so the set is fixed
   * and identical for every player, and by Vault Run so the difficulty ramp
   * is guaranteed rather than hoped for.
   */
  drawRun(rng, { length, ramp, categories, difficulties, choiceOnly = false, typedOnly = false } = {}) {
    const picked = [];
    const used = new Set();
    for (let i = 0; i < length; i++) {
      const difficulty = ramp ? ramp[Math.min(i, ramp.length - 1)] : null;
      const q = this.draw(rng, { categories, difficulties, difficulty, exclude: used, choiceOnly, typedOnly });
      if (!q) break;
      used.add(q.id);
      picked.push(q);
    }
    return picked;
  }

  /**
   * Typed-answer checking.
   *
   * Graded, not exact. A player who has plainly got it right should never be
   * told they are wrong over a plural, a spelling convention, or a slipped
   * key — "beat per minute" against "Beats per minute" was doing exactly
   * that. Four passes, cheapest first:
   *
   *   1. exact, after normalisation
   *   2. match key — spelling variants canonicalised, words stemmed, so
   *      singular/plural and colour/color collapse together
   *   3. same word set in any order, for conjunction answers
   *   4. bounded edit distance, scored WORD BY WORD, for typos
   *
   * Pass 4 is deliberately withheld where a near miss means a different
   * answer rather than a slip: anything containing a digit, and anything four
   * characters or shorter. "1913" is not a typo for 1912, and "K" is not a
   * typo for "C".
   *
   * @returns {boolean|"close"} true when accepted; "close" when it was one
   *   edit outside tolerance, which the UI can use to say so.
   */
  checkTyped(question, input) {
    return checkTypedAgainst(question, input, this.lexicon);
  }
}

/**
 * The matcher itself, free of the Bank so a second question set can borrow it.
 *
 * The Board (js/jeopardy.js) runs off its own clue file and would otherwise
 * have had to reimplement four passes of leniency it cannot afford to get
 * subtly different — a clue that accepts what the vault rejects is worse than
 * either rule on its own. It builds its own lexicon from its own clues and
 * passes it in.
 *
 * @param {{answer: string, accept?: string[]}} question
 * @param {string} input
 * @param {Set<string>} lexicon  every answer in the containing set, as match
 *   keys. Pass an empty Set to disable the different-answer guard.
 * @returns {boolean|"close"}
 */
export function checkTypedAgainst(question, input, lexicon = EMPTY_LEXICON) {
  const given = normalise(input);
  if (!given) return false;

  const givenKey = matchKey(input);
  const givenTokens = new Set(givenKey.split(" ").filter(Boolean));

  /* Every form worth accepting, from the answer and from its aliases. */
  const candidates = new Set();
  for (const source of [question.answer, ...(question.accept || [])]) {
    for (const form of answerForms(source)) candidates.add(form);
  }

  let nearMiss = false;

  /* If what was typed is, verbatim, some other question's answer, it is not
     a typo — it is a different answer. Edit distance cannot tell "Entomology"
     from "Etymology" (two slips in ten characters, inside tolerance) or
     "Titian" from "Titan", and both pairs are separately askable questions in
     this very bank. Only the bank knows which strings are real words with
     their own meaning, so only the bank can withhold the benefit of the
     doubt. Reaching this point already means the input did not match THIS
     question exactly or by key, so a hit here is always someone else's. */
  const spellsAnotherAnswer = lexicon.has(givenKey);

  for (const candidate of candidates) {
    const n = normalise(candidate);
    if (!n) continue;

    if (given === n) return true;

    const key = matchKey(candidate);
    if (!key) continue;
    if (givenKey === key) return true;

    /* Word order: "China and Nepal" for "Nepal and China". */
    const keyTokens = new Set(key.split(" ").filter(Boolean));
    if (keyTokens.size > 1 && keyTokens.size === givenTokens.size) {
      let same = true;
      for (const t of keyTokens) if (!givenTokens.has(t)) { same = false; break; }
      if (same) return true;
    }

    if (demandsExact(candidate) || spellsAnotherAnswer) continue;

    const verdict = fuzzyWordMatch(givenKey, key);
    if (verdict === "match") return true;
    if (verdict === "close") nearMiss = true;
  }

  return nearMiss ? "close" : false;
}

const EMPTY_LEXICON = new Set();
