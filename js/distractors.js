/* ==========================================================================
   Distractor engine
   --------------------------------------------------------------------------
   The bank is a TYPED-ANSWER bank: question, one answer, accepted aliases.
   It carries no multiple-choice options — which means no 50/50, no tap-to-
   answer, no crowd poll. Rather than rewrite 735 questions by hand (and
   freeze the bank, so any future drop-in replacement would need the same
   treatment), this module synthesises plausible options at runtime. The bank
   file stays exactly as authored.

   THE HARD PART is that obvious approaches produce giveaway rounds:

     "borrow three other answers from the same category"
        -> "What is the capital of Mongolia?"
           A. The Milwaukee Deep, in the Puerto Rico Trench
           B. Sweden        C. Ulaanbaatar *      D. The Atlantic and the Pacific
        Answerable with zero knowledge: only one option is a city.

   So selection is driven by what the QUESTION ASKS FOR, not by what the
   answer happens to look like. Every entry is tagged with an "ask class"
   parsed from its interrogative ("which country", "what is the capital of",
   "who painted", "in what year"), and distractors are drawn first from other
   questions asking the same thing. Capital-city questions borrow from other
   capital-city questions, so every option is a city.

   Four further filters kill the remaining tells:
     - nothing that appears in the question text  (no "Mount Everest" offered
       as an answer to a question about Mount Everest)
     - word-count band matching                   (no 7-word option beside a
       1-word answer)
     - conjunction matching                       ("Nepal and China" gets
       other pairs, not single countries)
     - alias / similarity / containment collision (never offer something the
       typed-answer checker would also mark correct)

   All decisions run off a seeded RNG, so a question always yields the same
   options for a given seed. The Daily Heist is therefore identical for every
   player, and any bug is reproducible from its seed alone.
   ========================================================================== */

import { DISTRACTORS } from "./config.js";
import { makeRng, sample, shuffle, similarity, sameTokens, normalise } from "./util.js";

/* ---- Answer type detection ---------------------------------------------- */

const RE_YEAR     = /^(c\.?\s*)?\d{3,4}\s*(bc|bce|ad|ce)?$/i;
const RE_PURE_NUM = /^-?\d[\d,]*(\.\d+)?$/;
const RE_NUM_UNIT = /^-?\d[\d,]*(\.\d+)?\s*[a-z%°]+\.?$/i;
const RE_SINGLE   = /^[a-z]{1,2}$/i;

/* Spelled-out numbers are numbers. Without this, "Seven" is classified as a
   TERM and ends up beside "32" and "12" — the answer is then obvious from
   typography alone. Detected here so it routes to numeric synthesis and comes
   back as "Five" / "Nine" / "Eight", matching the answer's own register. */
const NUMBER_WORDS_ORDERED = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight",
  "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen",
  "sixteen", "seventeen", "eighteen", "nineteen", "twenty",
];
const WORD_TO_NUM = new Map(NUMBER_WORDS_ORDERED.map((w, i) => [w, i]));

function parseNumberWord(raw) {
  const t = String(raw).trim().toLowerCase().replace(/[^a-z]/g, "");
  return WORD_TO_NUM.has(t) ? WORD_TO_NUM.get(t) : null;
}

function renderNumberWord(n, sample) {
  if (n < 0 || n >= NUMBER_WORDS_ORDERED.length) return null;
  const w = NUMBER_WORDS_ORDERED[n];
  /* Match the capitalisation of the real answer. */
  return /^[A-Z]/.test(String(sample).trim()) ? w[0].toUpperCase() + w.slice(1) : w;
}
const RE_PERSON   = /^[A-ZÀ-Ý][\w'’.-]*(\s+(van|von|de|del|della|di|da|du|la|le|of|the|bin|ibn)\s+|\s+)[A-ZÀ-Ý][\w'’.-]*(\s+[A-ZÀ-Ý][\w'’.-]*)?$/;
const RE_TITLED   = /^(the|a|an)\s+/i;

export const TYPES = {
  YEAR: "year", NUMBER: "number", LETTER: "letter",
  PERSON: "person", PLACE: "place", WORK: "work", TERM: "term",
};

const PLACE_CATEGORIES = new Set(["Geography"]);
const WORK_CATEGORIES  = new Set(["Literature", "Film & TV", "Music", "Art & Architecture"]);

export function detectType(answer, category) {
  const raw = String(answer ?? "").trim();
  if (!raw) return TYPES.TERM;
  if (RE_YEAR.test(raw)) return TYPES.YEAR;
  if (RE_PURE_NUM.test(raw) || RE_NUM_UNIT.test(raw)) return TYPES.NUMBER;
  if (parseNumberWord(raw) !== null) return TYPES.NUMBER;
  if (RE_SINGLE.test(raw)) return TYPES.LETTER;
  if (/^["'“].+["'”]$/.test(raw)) return TYPES.WORK;
  if (RE_PERSON.test(raw)) {
    if (PLACE_CATEGORIES.has(category)) return TYPES.PLACE;
    if (WORK_CATEGORIES.has(category) && RE_TITLED.test(raw)) return TYPES.WORK;
    return TYPES.PERSON;
  }
  if (PLACE_CATEGORIES.has(category)) return TYPES.PLACE;
  if (WORK_CATEGORIES.has(category) && (RE_TITLED.test(raw) || raw.split(/\s+/).length >= 3)) {
    return TYPES.WORK;
  }
  return TYPES.TERM;
}

/* ---- Ask-class parsing ---------------------------------------------------
   The single highest-leverage signal available. Two questions that ask the
   same kind of thing have interchangeable answers; two that don't, don't.   */

const ASK_STOPWORDS = new Set([
  "is", "are", "was", "were", "do", "does", "did", "the", "a", "an",
  "of", "in", "on", "at", "to", "for", "this", "these", "that", "his",
  "her", "its", "their", "your", "you", "we", "it", "he", "she", "they",
  "has", "have", "had", "been", "be", "will", "would", "can", "could",
  "other", "same", "first", "last", "only", "most", "more", "much",
]);

const NUMBER_WORDS = new Set(["two", "three", "four", "five", "six", "2", "3", "4", "5", "6", "both", "pair"]);

/** Crude singulariser — good enough to merge "countries"/"country". */
function singular(w) {
  if (w.length <= 3) return w;
  if (w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.endsWith("ses") || w.endsWith("xes") || w.endsWith("zes") || w.endsWith("ches") || w.endsWith("shes")) {
    return w.slice(0, -2);
  }
  if (w.endsWith("s") && !w.endsWith("ss") && !w.endsWith("us")) return w.slice(0, -1);
  return w;
}

/**
 * A short tag describing what the question is asking for.
 * Examples:
 *   "What is the capital of Mongolia?"                   -> "capital"
 *   "Which two countries share the longest border?"       -> "country+multi"
 *   "In what year did the Berlin Wall fall?"              -> "year"
 *   "How many strings does a standard violin have?"       -> "count"
 *   "Who painted 'The Card Players'?"                     -> "who:painted"
 */
export function askClass(question) {
  const q = String(question ?? "").toLowerCase().replace(/[“”"'’]/g, "");

  if (/\b(?:in\s+)?(?:what|which)\s+year\b/.test(q) || /\bwhat\s+year\b/.test(q)) return "year";
  if (/\bhow\s+many\b/.test(q)) return "count";
  if (/\bhow\s+much\b/.test(q)) return "amount";
  if (/\bhow\s+(long|tall|deep|far|old|fast|heavy|wide|high)\b/.test(q)) return "measure";

  /* "Who wrote/painted/directed/composed..." — the verb keeps novelists apart
     from painters apart from directors, all of which are bare person names. */
  const who = q.match(/\bwho\s+(?:is|was|are|were)?\s*(?:the\s+)?([a-z]+)/);
  if (/\bwho\b/.test(q)) {
    const verb = who && !ASK_STOPWORDS.has(who[1]) ? who[1] : "";
    return verb ? `who:${singular(verb)}` : "who";
  }

  /* "Which two countries", "what three elements" -> plural/pair variants. */
  const multi = q.match(/\b(?:what|which)\s+([a-z0-9]+)\s+([a-z]+)/);
  if (multi && NUMBER_WORDS.has(multi[1]) && !ASK_STOPWORDS.has(multi[2])) {
    return `${singular(multi[2])}+multi`;
  }

  /* "What is the capital of...", "Which element is..." */
  const m = q.match(/\b(?:what|which|whose)\s+((?:[a-z]+\s+){0,3}?[a-z]+)/);
  if (m) {
    const words = m[1].split(/\s+/).filter((w) => w && !ASK_STOPWORDS.has(w));
    if (words.length) return singular(words[0]);
  }

  const where = /\bwhere\b/.test(q);
  if (where) return "where";
  return "other";
}

/* ---- Numeric synthesis ---------------------------------------------------
   Numbers and years are GENERATED, never borrowed. Dropping "1969" into a
   "how many hectares" question is the most obvious tell in an auto quiz.    */

function parseNumeric(raw) {
  const m = String(raw).match(/-?\d[\d,]*(\.\d+)?/);
  if (!m) return null;
  const value = parseFloat(m[0].replace(/,/g, ""));
  if (!Number.isFinite(value)) return null;
  return {
    value,
    prefix: String(raw).slice(0, m.index),
    suffix: String(raw).slice(m.index + m[0].length),
    decimals: (m[0].split(".")[1] || "").length,
    grouped: m[0].includes(","),
  };
}

function renderNumeric(parsed, value) {
  let body;
  if (parsed.decimals > 0) body = value.toFixed(parsed.decimals);
  else {
    const r = Math.round(value);
    body = parsed.grouped ? r.toLocaleString("en-US") : String(r);
  }
  return `${parsed.prefix}${body}${parsed.suffix}`;
}

function synthesiseYear(rng, raw, count) {
  const parsed = parseNumeric(raw);
  if (!parsed) return [];
  const era = /bc|bce/i.test(raw);
  const thisYear = new Date().getFullYear();
  const out = [];
  const seen = new Set([Math.round(parsed.value)]);
  for (const off of shuffle(rng, DISTRACTORS.yearJitter.slice())) {
    for (const sign of shuffle(rng, [1, -1])) {
      if (out.length >= count) break;
      const c = parsed.value + off * sign;
      if (!era && (c < 1 || c > thisYear)) continue;
      if (era && c < 1) continue;
      if (seen.has(c)) continue;
      seen.add(c);
      out.push(renderNumeric(parsed, c));
    }
    if (out.length >= count) break;
  }
  return out;
}

function synthesiseNumber(rng, raw, count) {
  /* Spelled-out numbers stay spelled out. */
  const word = parseNumberWord(raw);
  if (word !== null) {
    const out = [];
    const seen = new Set([word]);
    for (const off of shuffle(rng, [1, 2, 3, 4, 5, 6])) {
      for (const sign of shuffle(rng, [1, -1])) {
        if (out.length >= count) break;
        const c = word + off * sign;
        if (c < 0 || c >= NUMBER_WORDS_ORDERED.length || seen.has(c)) continue;
        const rendered = renderNumberWord(c, raw);
        if (!rendered) continue;
        seen.add(c);
        out.push(rendered);
      }
      if (out.length >= count) break;
    }
    return out;
  }

  const parsed = parseNumeric(raw);
  if (!parsed) return [];
  const out = [];
  const seen = new Set([parsed.value]);
  for (const j of shuffle(rng, DISTRACTORS.numericJitter.slice())) {
    for (const sign of shuffle(rng, [1, -1])) {
      if (out.length >= count) break;
      let c = parsed.value * (1 + j * sign);
      /* Small integers need integer separation: 3 * 1.08 rounds back to 3. */
      if (parsed.decimals === 0 && Math.abs(parsed.value) < 40) {
        const step = Math.max(1, Math.round(Math.abs(parsed.value) * j) || 1);
        c = parsed.value + step * sign;
      }
      if (parsed.decimals === 0) c = Math.round(c);
      if (c < 0 && parsed.value >= 0) continue;
      if (seen.has(c)) continue;
      seen.add(c);
      out.push(renderNumeric(parsed, c));
    }
    if (out.length >= count) break;
  }
  return out;
}

function synthesiseLetter(rng, raw, count) {
  const upper = raw === raw.toUpperCase();
  const pool = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").filter((c) => c.toLowerCase() !== raw.toLowerCase());
  return sample(rng, pool, count).map((c) => (upper ? c : c.toLowerCase()));
}

/* ---- Index ---------------------------------------------------------------- */

function wordCount(s) {
  return normalise(s).split(" ").filter(Boolean).length;
}

/* Relational answers only mean anything as a reply to their own question.
   "The other way around" is a fine answer to "what does vice versa mean" and
   a nonsense option beside three islands — a playtest turned one up sitting
   next to the Great Barrier Reef.

   Matched as whole strings, not prefixes: a `^it\b` rule would also blocklist
   "It Happened One Night (1934)", which is a perfectly good film title. These
   entries stay in the bank and are still asked; they are only barred from
   being borrowed as distractors for other questions. */
const RELATIONAL = new Set([
  "other way around", "vice versa", "same", "opposite", "reverse",
  "both", "neither", "either", "all of them", "none of them", "all above",
  "none above", "yes", "no", "true", "false", "it depends", "nothing",
  "everything", "no one", "nobody", "former", "latter",
]);

function isBorrowable(answer) {
  return !RELATIONAL.has(normalise(answer));
}

function hasConjunction(s) {
  return /\b(and|&|\+)\b/i.test(String(s));
}

export function buildIndex(questions) {
  const byAsk = new Map();       /* ask class            -> entries */
  const byAskCat = new Map();    /* ask class + category -> entries */
  const byType = new Map();
  const byTypeCat = new Map();
  const byCat = new Map();
  const all = [];

  for (const q of questions) {
    const type = detectType(q.answer, q.category);
    const ask = askClass(q.question);
    const entry = {
      id: q.id, answer: q.answer, type, ask,
      category: q.category, difficulty: q.difficulty,
      words: wordCount(q.answer), conj: hasConjunction(q.answer),
      borrowable: isBorrowable(q.answer),
    };
    all.push(entry);

    /* Unborrowable answers are indexed nowhere, so they can never be drawn
       as a distractor for anything. */
    if (!entry.borrowable) continue;

    const push = (map, key) => {
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(entry);
    };
    push(byAsk, ask);
    push(byAskCat, `${ask}::${q.category}`);
    push(byType, type);
    push(byTypeCat, `${type}::${q.category}`);
    push(byCat, q.category);
  }

  /* ---- Choice viability -------------------------------------------------
     A handful of answers are structurally unique in the bank — long
     definitional sentences like "Its source code is publicly available to
     view, modify, and share". Nothing else is remotely that shape, so any
     three distractors leave the answer as the visible odd one out and the
     question is free.

     Rather than ship a giveaway, those questions are marked not-viable for
     multiple choice. They still appear in Type-It mode, where length is not
     a tell at all — the constraint is a property of the FORMAT, not of the
     question, so the question stays in the bank. */
  const choiceViable = new Set();
  for (const e of all) {
    let peers = 0;
    for (const other of all) {
      if (other.id === e.id) continue;
      if (other.conj !== e.conj) continue;
      if (Math.abs((other.words || 1) - (e.words || 1)) > 1) continue;
      if (++peers >= 3) break;
    }
    if (peers >= 3) choiceViable.add(e.id);
  }

  return { byAsk, byAskCat, byType, byTypeCat, byCat, all, choiceViable };
}

/** True when a question can fairly be asked as multiple choice. */
export function isChoiceViable(question, index) {
  return index.choiceViable.has(question.id);
}

/* ---- Collision & plausibility filters ------------------------------------ */

/** Anything already named in the question is not a candidate answer to it. */
function inQuestion(candidate, questionNorm) {
  const c = normalise(candidate);
  if (!c) return true;
  if (c.length >= 4 && questionNorm.includes(c)) return true;
  /* Single distinctive words too — "Everest" inside "Mount Everest sits...". */
  const toks = c.split(" ").filter((t) => t.length >= 5);
  return toks.some((t) => questionNorm.includes(t));
}

/**
 * Collision test for SYNTHESISED options only.
 *
 * Generated numbers are different from the answer by construction, so they
 * must skip the fuzzy filters that collides() applies. Those filters were
 * silently discarding every numeric distractor: similarity("19 inches",
 * "18 inches") is 0.89, above the 0.82 threshold, so "18 inches" fell all the
 * way through to borrowed text and ended up beside "Stalemate" and "A turkey".
 * Only exact answer/alias identity matters here.
 */
function collidesSynthetic(candidate, question, chosen) {
  const cand = normalise(candidate);
  if (!cand) return true;
  if (cand === normalise(question.answer)) return true;
  for (const alias of question.accept || []) {
    if (cand === normalise(alias)) return true;
  }
  for (const c of chosen) {
    if (normalise(c) === cand) return true;
  }
  return false;
}

function collides(candidate, question, chosen) {
  const cand = normalise(candidate);
  if (!cand) return true;

  const answerNorm = normalise(question.answer);
  if (cand === answerNorm) return true;
  if (sameTokens(candidate, question.answer)) return true;
  if (cand.includes(answerNorm) || answerNorm.includes(cand)) return true;
  if (similarity(candidate, question.answer) > DISTRACTORS.maxSimilarity) return true;

  for (const alias of question.accept || []) {
    const a = normalise(alias);
    if (!a) continue;
    if (cand === a || cand.includes(a) || a.includes(cand)) return true;
  }
  for (const c of chosen) {
    const n = normalise(c);
    if (n === cand || sameTokens(c, candidate)) return true;
    if (similarity(c, candidate) > DISTRACTORS.maxSimilarity) return true;
  }
  return false;
}

/**
 * Shape plausibility: an option must not stand out structurally.
 *
 * Three levels, walked outward as pools run dry, so a thin bank still fills
 * four options rather than shipping two:
 *   0 STRICT  — within one word of the answer, conjunction must match
 *   1 LOOSE   — within three words, conjunction still matters if present
 *   2 ANY     — accept anything, purely to guarantee a full option set
 *
 * The band is absolute, not proportional. A ratio band lets "Bern" (1 word)
 * sit beside "The Strait of Gibraltar" (3 words), which reads as the odd one
 * out even though 1 is within 50-200% of 3.
 */
const FIT = { STRICT: 0, LOOSE: 1, ANY: 2 };

function plausible(entry, target, level) {
  if (level === FIT.ANY) return true;
  const w = entry.words || 1;
  const t = target.words || 1;
  if (level === FIT.STRICT) {
    if (entry.conj !== target.conj) return false;
    return Math.abs(w - t) <= 1;
  }
  /* LOOSE: a pair answer still only takes pair distractors — mixing
     "Nepal and China" with "Italy" gives the answer away on structure. */
  if (target.conj && !entry.conj) return false;
  return Math.abs(w - t) <= 3;
}

/* ---- Selection ------------------------------------------------------------ */

export function makeDistractors(question, index, rng, n) {
  const type = detectType(question.answer, question.category);
  const ask = askClass(question.question);
  const questionNorm = normalise(question.question);
  const target = { words: wordCount(question.answer), conj: hasConjunction(question.answer) };
  const chosen = [];

  /* 1. Synthesised shapes first — always same-shape by construction. */
  let synthetic = [];
  if (type === TYPES.YEAR)        synthetic = synthesiseYear(rng, question.answer, n);
  else if (type === TYPES.NUMBER) synthetic = synthesiseNumber(rng, question.answer, n);
  else if (type === TYPES.LETTER) synthetic = synthesiseLetter(rng, question.answer, n);
  for (const s of synthetic) {
    if (chosen.length >= n) break;
    if (!collidesSynthetic(s, question, chosen)) chosen.push(s);
  }

  /* 2. Borrowed, tightest pool outward. Ask-class beats answer-type beats
        category, because "what is being asked" constrains far harder than
        "what the answer looks like". The final ANY tier exists only to
        guarantee a full option set on a thin or homogeneous bank. */
  const tiers = [
    { pool: index.byAskCat.get(`${ask}::${question.category}`),   fit: FIT.STRICT },
    { pool: index.byAsk.get(ask),                                 fit: FIT.STRICT },
    { pool: index.byTypeCat.get(`${type}::${question.category}`), fit: FIT.STRICT },
    { pool: index.byAsk.get(ask),                                 fit: FIT.LOOSE  },
    { pool: index.byTypeCat.get(`${type}::${question.category}`), fit: FIT.LOOSE  },
    { pool: index.byType.get(type),                               fit: FIT.LOOSE  },
    { pool: index.byCat.get(question.category),                   fit: FIT.LOOSE  },
    { pool: index.all,                                            fit: FIT.LOOSE  },
    { pool: index.all,                                            fit: FIT.ANY    },
  ];

  for (const { pool, fit } of tiers) {
    if (chosen.length >= n) break;
    if (!pool || !pool.length) continue;
    const candidates = sample(rng, pool, Math.min(pool.length, n * 20));
    for (const c of candidates) {
      if (chosen.length >= n) break;
      if (c.id === question.id) continue;
      /* index.all is the untiered fallback and still carries them. */
      if (c.borrowable === false) continue;
      if (!plausible(c, target, fit)) continue;
      if (inQuestion(c.answer, questionNorm)) continue;
      if (collides(c.answer, question, chosen)) continue;
      chosen.push(c.answer);
    }
  }

  return chosen.slice(0, n);
}

export function buildOptions(question, index, seed) {
  const rng = makeRng(`${seed}::${question.id}`);

  /* AUTHORED OPTIONS WIN.
     If a bank entry carries its own `options` array, use it verbatim (only
     shuffled). Synthesis is a fallback for banks that do not have them, not
     a preference.

     This matters because borrowing has a semantic ceiling. Length and
     ask-class matching stop "Ulaanbaatar" appearing beside an ocean trench,
     but nothing in the bank can tell it that "Répondez s'il vous plaît" is a
     silly answer to "what are the five vowels" — both are five tokens of
     text. Hand-written or LLM-written distractors for the awkward questions
     can be dropped into data/questions.json with no code change at all. */
  const authored = Array.isArray(question.options) ? question.options.filter(Boolean) : null;
  if (authored && authored.length >= 2 && authored.includes(question.answer)) {
    const options = shuffle(rng, [...new Set(authored)]);
    return {
      options,
      correctIndex: options.indexOf(question.answer),
      type: detectType(question.answer, question.category),
      ask: askClass(question.question),
      authored: true,
    };
  }

  const wrong = makeDistractors(question, index, rng, DISTRACTORS.optionCount - 1);
  const options = shuffle(rng, [question.answer, ...wrong]);
  const correctIndex = options.findIndex((o) => o === question.answer);
  return {
    options,
    correctIndex,
    type: detectType(question.answer, question.category),
    ask: askClass(question.question),
    authored: false,
  };
}
