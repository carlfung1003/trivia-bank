/* ==========================================================================
   Shared primitives: seeded RNG, text normalisation, similarity.
   Pure functions only — no DOM, no config. Safe to unit-test in isolation.
   ========================================================================== */

/* ---- Seeded RNG ---------------------------------------------------------
   Every random decision in the game routes through a seeded stream so a run
   is reproducible: the Daily Heist is identical for everyone on a given date,
   and a bug report that names a seed can be replayed exactly.               */

export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32 — small, fast, good enough for gameplay. */
export function makeRng(seed) {
  let a = typeof seed === "string" ? hashString(seed) : seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

/** Fisher–Yates against a seeded stream. Returns a new array. */
export function shuffle(rng, arr) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Sample n distinct items without mutating the source. */
export function sample(rng, arr, n) {
  if (n >= arr.length) return shuffle(rng, arr);
  const taken = new Set();
  const out = [];
  let guard = 0;
  while (out.length < n && guard++ < n * 40) {
    const i = Math.floor(rng() * arr.length);
    if (taken.has(i)) continue;
    taken.add(i);
    out.push(arr[i]);
  }
  return out;
}

/* ---- Text ---------------------------------------------------------------- */

/** Aggressive normalisation for answer comparison: strips accents, articles,
    punctuation and case so "The Strait of Gibraltar" ≈ "strait of gibraltar". */
export function normalise(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(the|a|an)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Light normalisation that keeps word identity — used for display dedupe. */
export function slug(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Levenshtein distance, capped for speed on long strings. */
export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = new Array(b.length + 1);
  let curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/** 0..1 similarity. 1 means identical after normalisation. */
export function similarity(a, b) {
  const x = normalise(a);
  const y = normalise(b);
  if (!x && !y) return 1;
  if (!x || !y) return 0;
  if (x === y) return 1;
  const maxLen = Math.max(x.length, y.length);
  return 1 - levenshtein(x, y) / maxLen;
}

/** Token-overlap check — catches "Nepal and China" vs "China and Nepal". */
export function sameTokens(a, b) {
  const ta = new Set(normalise(a).split(" ").filter(Boolean));
  const tb = new Set(normalise(b).split(" ").filter(Boolean));
  if (!ta.size || ta.size !== tb.size) return false;
  for (const t of ta) if (!tb.has(t)) return false;
  return true;
}

/* ---- Numbers ------------------------------------------------------------- */

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Group a number with thin separators for the split-flap board. */
export function formatCredits(n) {
  return Math.round(n).toLocaleString("en-US");
}

/** Local calendar date as YYYY-MM-DD — the Daily Heist seed.
    Deliberately local, not UTC: the heist should roll over at the player's
    midnight, matching the America/Los_Angeles house rule for schedules. */
export function localDateKey(d) {
  const dt = d ?? new Date();
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/* ==========================================================================
   Answer matching
   --------------------------------------------------------------------------
   Type-It originally compared normalised strings for exact equality, which
   rejected "beat per minute" against "Beats per minute". A player who has
   plainly got it right should never be told they are wrong over a plural, a
   spelling convention, or a slipped key.

   The leniency is graded, and deliberately does NOT apply everywhere:
   numbers and very short answers still demand an exact match, because there
   "1913" for 1912 and "K" for "C" are wrong answers, not near misses.
   ========================================================================== */

/* British and American conventions, plus a few stable variants. Applied as
   whole words so "four" never becomes "for" via the -our rule. */
const SPELLING_VARIANTS = new Map(Object.entries({
  aluminium: "aluminum", defence: "defense", offence: "offense",
  licence: "license", practise: "practice", grey: "gray", plough: "plow",
  sulphur: "sulfur", tyre: "tire", pyjamas: "pajamas", aeroplane: "airplane",
  moustache: "mustache", storey: "story", cheque: "check", draught: "draft",
  kerb: "curb", mould: "mold", jewellery: "jewelry", programme: "program",
  catalogue: "catalog", dialogue: "dialog", axe: "ax", omelette: "omelet",
  yoghurt: "yogurt", whisky: "whiskey", doughnut: "donut",
  archaeology: "archeology", encyclopaedia: "encyclopedia", anaemia: "anemia",
  foetus: "fetus", oesophagus: "esophagus", diarrhoea: "diarrhea",
}));

/* -our -> -or, but only for words where that is actually the convention. */
const OUR_WORDS = new Set([
  "colour", "honour", "favour", "flavour", "harbour", "labour", "neighbour",
  "behaviour", "armour", "rumour", "vapour", "endeavour", "splendour",
  "savour", "valour", "odour", "humour", "parlour", "tumour", "vigour",
  "candour", "clamour", "ardour", "fervour", "rigour", "saviour",
]);

/* -re -> -er, likewise restricted. */
const RE_WORDS = new Set([
  "centre", "theatre", "metre", "litre", "fibre", "calibre", "sabre",
  "spectre", "sombre", "lustre", "manoeuvre", "meagre", "sceptre", "ochre",
]);

function canonicalWord(w) {
  if (SPELLING_VARIANTS.has(w)) return SPELLING_VARIANTS.get(w);
  if (OUR_WORDS.has(w)) return w.slice(0, -3) + "or";
  if (RE_WORDS.has(w)) return w.slice(0, -2) + "er";
  /* -ise/-isation are the same word as -ize/-ization. */
  if (/isation$/.test(w) && w.length > 8) return w.replace(/isation$/, "ization");
  if (/ise$/.test(w) && w.length > 5) return w.replace(/ise$/, "ize");
  return w;
}

/** Crude stem: enough to collapse singular and plural, and nothing more. */
export function stemWord(w) {
  if (w.length <= 3) return w;
  if (w.endsWith("ies") && w.length > 4) return w.slice(0, -3) + "y";
  if (/(ch|sh|ss|x|z)es$/.test(w)) return w.slice(0, -2);
  if (w.endsWith("s") && !w.endsWith("ss") && !w.endsWith("us") && !w.endsWith("is")) {
    return w.slice(0, -1);
  }
  return w;
}

/**
 * The form two answers are compared in: normalised, spelling-canonicalised,
 * and stemmed word by word.
 */
export function matchKey(s) {
  return normalise(s)
    .split(" ")
    .filter(Boolean)
    .map((w) => stemWord(canonicalWord(w)))
    .join(" ");
}

/** Answers where a near miss is a different answer, not a typo. */
export function demandsExact(s) {
  const n = normalise(s);
  return /\d/.test(n) || n.replace(/\s/g, "").length <= 4;
}

/**
 * How many single-character slips to forgive in ONE WORD.
 *
 * Per word, not per string, and that distinction is load-bearing. A tolerance
 * generous enough across a whole phrase to accept "Ulanbatar" for
 * "Ulaanbaatar" (two slips in eleven characters) would also accept "bytes per
 * minute" for "beats per minute" — same edit distance, completely different
 * answer. Scoring word by word gives long words room and short words none,
 * so "byte" can never pass as "beat".
 */
export function typoTolerance(word) {
  const len = word.length;
  if (len <= 4) return 0;
  if (len <= 7) return 1;
  if (len <= 12) return 2;
  return 3;
}

/**
 * Compare two match keys word by word.
 * @returns {"match"|"close"|"no"} — "close" is one slip beyond tolerance on a
 *   single word, which the UI can surface rather than a flat rejection.
 */
export function fuzzyWordMatch(givenKey, targetKey) {
  const a = givenKey.split(" ").filter(Boolean);
  const b = targetKey.split(" ").filter(Boolean);
  /* Different word counts mean a different shape of answer, not a typo. */
  if (a.length !== b.length || !a.length) return "no";

  let overBy = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue;

    /* A clear abbreviation of one word, when every other word is intact:
       "beats per min" is someone who knows the answer, not someone guessing.
       Only in multi-word answers, where the surrounding words anchor it —
       on a single-word answer "sil" would sail through as "silver". */
    if (a.length > 1 && a[i].length >= 3 && b[i].startsWith(a[i]) && a[i].length * 2 >= b[i].length) {
      continue;
    }

    const tolerance = typoTolerance(b[i]);
    const distance = levenshtein(a[i], b[i]);
    if (distance <= tolerance) continue;
    if (distance <= tolerance + 1) { overBy += 1; continue; }
    return "no";
  }
  return overBy === 0 ? "match" : overBy === 1 ? "close" : "no";
}

/**
 * Expand an answer into every form worth accepting: the whole string, the
 * version with parentheticals removed, and the parenthetical on its own.
 * "A school (or shoal)" should accept "a school" and "shoal" alike.
 */
export function answerForms(s) {
  const raw = String(s ?? "").trim();
  if (!raw) return [];
  const forms = new Set([raw]);

  const withoutParens = raw.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  if (withoutParens) forms.add(withoutParens);

  for (const m of raw.matchAll(/\(([^)]*)\)/g)) {
    const inner = m[1].replace(/^\s*(or|aka|also)\s+/i, "").trim();
    if (inner) forms.add(inner);
  }

  /* "Aetiology (etiology)" and "K'gari (Fraser Island), Australia" also want
     the part before the first comma on its own. */
  const beforeComma = withoutParens.split(",")[0].trim();
  if (beforeComma && beforeComma !== withoutParens) forms.add(beforeComma);

  /* Em-dash asides: "Monotremes — the platypus and echidna". */
  const beforeDash = raw.split(/\s[—–-]\s/)[0].trim();
  if (beforeDash && beforeDash !== raw) forms.add(beforeDash);

  return [...forms];
}
