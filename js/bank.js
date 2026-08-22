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

  /** How many questions match a filter set — drives the setup screen counter. */
  count({ categories, difficulties, choiceOnly = false } = {}) {
    return this.pool({ categories, difficulties, choiceOnly }).length;
  }

  /**
   * All questions matching the filters.
   * `choiceOnly` drops the handful that cannot be asked fairly as multiple
   * choice (see distractors.js — structurally unique answers).
   */
  pool({ categories, difficulties, choiceOnly = false, exclude } = {}) {
    const cats = categories && categories.length ? new Set(categories) : null;
    const diffs = difficulties && difficulties.length ? new Set(difficulties) : null;
    const out = [];
    for (const q of this.questions) {
      if (cats && !cats.has(q.category)) continue;
      if (diffs && !diffs.has(q.difficulty)) continue;
      if (exclude && exclude.has(q.id)) continue;
      if (choiceOnly && !isChoiceViable(q, this.index)) continue;
      out.push(q);
    }
    return out;
  }

  /**
   * Draw one question, preferring the requested difficulty but degrading
   * gracefully: a filter set with no 'hard' Music questions should still
   * produce a playable run rather than dead-ending mid-heist.
   */
  draw(rng, { categories, difficulties, difficulty, exclude, choiceOnly = false } = {}) {
    const tryDraw = (diffList) => {
      const p = this.pool({ categories, difficulties: diffList, exclude, choiceOnly });
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
  drawRun(rng, { length, ramp, categories, difficulties, choiceOnly = false } = {}) {
    const picked = [];
    const used = new Set();
    for (let i = 0; i < length; i++) {
      const difficulty = ramp ? ramp[Math.min(i, ramp.length - 1)] : null;
      const q = this.draw(rng, { categories, difficulties, difficulty, exclude: used, choiceOnly });
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

      if (demandsExact(candidate)) continue;

      const verdict = fuzzyWordMatch(givenKey, key);
      if (verdict === "match") return true;
      if (verdict === "close") nearMiss = true;
    }

    return nearMiss ? "close" : false;
  }
}
