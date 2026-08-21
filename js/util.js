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
