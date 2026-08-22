/* ==========================================================================
   Lifelines — "the kit"
   --------------------------------------------------------------------------
   Each is a pure state transition on a Game, plus an event the UI can dress
   up. They never touch the DOM; the vault-drill animation and the poll bars
   are the UI layer's reaction to `lifeline` events, not this file's job.

   Availability rules live in config.js (MODES[x].lifelines), so giving Blitz
   a Freeze is a data edit, not a code change.
   ========================================================================== */

import { LIFELINES, DIFFICULTY } from "./config.js";
import { PHASE } from "./engine.js";
import { makeRng, shuffle, clamp } from "./util.js";

/** Can this lifeline be used right now? Drives the disabled state in the UI. */
export function canUse(game, id) {
  const s = game.state;
  const slot = s.kit[id];
  if (!slot || slot.used) return false;
  if (s.phase !== PHASE.ASKING) return false;

  const def = LIFELINES[id];
  /* 50/50 and the crowd poll are meaningless without options on screen. */
  if (def.requiresChoice && game.answerMode !== "choice") return false;
  /* Etch and Informant are the mirror image: nothing to reveal when the
     answer is already one of four things you can read. */
  if (def.requiresTyped && game.answerMode !== "typed") return false;
  /* An Informant with nothing to say should read as unavailable, not as a
     tool that fires and does nothing. */
  if (def.requiresHint && !s.question?.hint) return false;

  if (id === "drill") {
    const remaining = s.options.length - s.removed.length;
    return remaining > 2;
  }
  if (id === "etch") {
    /* Nothing left to give once the whole answer is showing. */
    return (s.revealed?.length || 0) < String(s.question?.answer || "").length;
  }
  if (id === "doubledown") {
    /* Nothing to double if there is nothing at risk. */
    return true;
  }
  return true;
}

function consume(game, id) {
  const s = game.state;
  s.kit[id].used = true;
  s.lifelinesUsed += 1;
}

/* ---- DRILL — 50/50 -------------------------------------------------------- */

function drill(game) {
  const s = game.state;
  const def = LIFELINES.drill;
  const rng = makeRng(`${game.seed}::drill::${s.qIndex}`);

  const wrongIndices = s.options
    .map((_, i) => i)
    .filter((i) => i !== s.correctIndex && !s.removed.includes(i));

  const burn = shuffle(rng, wrongIndices).slice(0, def.removes);
  s.removed = [...s.removed, ...burn];

  return { removed: burn, remaining: s.options.length - s.removed.length };
}

/* ---- WIRETAP — ask the crowd ---------------------------------------------
   Deliberately honest rather than flattering. On a Federal (hard) lock the
   room genuinely does not know, and the poll shows a real split — which is
   what makes spending the lifeline a decision instead of a free answer.     */

function wiretap(game) {
  const s = game.state;
  const def = LIFELINES.wiretap;
  const rng = makeRng(`${game.seed}::wiretap::${s.qIndex}`);

  const live = s.options.map((_, i) => i).filter((i) => !s.removed.includes(i));
  const accuracy = DIFFICULTY.crowdAccuracy[s.question.difficulty] ?? 0.6;
  const crowdIsRight = rng() < accuracy;

  /* Who the room converges on. */
  const wrongLive = live.filter((i) => i !== s.correctIndex);
  const favourite = crowdIsRight
    ? s.correctIndex
    : wrongLive.length ? wrongLive[Math.floor(rng() * wrongLive.length)] : s.correctIndex;

  /* Plurality share: confident when the crowd is right and the question is
     easy, muddy when it is hard. */
  const confidence = crowdIsRight ? 0.42 + accuracy * 0.34 : 0.3 + rng() * 0.14;

  const weights = new Array(s.options.length).fill(0);
  let remainder = 1 - confidence;
  weights[favourite] = confidence;

  const others = live.filter((i) => i !== favourite);
  /* Split the remainder unevenly so the bars never look synthetic. */
  const cuts = shuffle(rng, others).map(() => def.noiseFloor + rng());
  const cutTotal = cuts.reduce((a, b) => a + b, 0) || 1;
  others.forEach((idx, k) => {
    weights[idx] = remainder * (cuts[k] / cutTotal);
  });

  /* Normalise to exactly 1 across live options. */
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const poll = weights.map((w, i) => (s.removed.includes(i) ? null : clamp(w / total, 0, 1)));

  s.poll = poll;
  return { poll, crowdIsRight, favourite };
}

/* ---- FREEZE — jam the clock ---------------------------------------------- */

function freeze(game) {
  game.state.frozen = true;
  return { frozen: true };
}

/* ---- BYPASS — swap the lock ---------------------------------------------- */

function bypass(game) {
  const s = game.state;
  const previous = s.question;

  const replacement = game.bank.draw(game.rng, {
    categories: game.categories,
    difficulties: game.difficulties,
    difficulty: previous.difficulty,
    exclude: game.usedIds,
    choiceOnly: game.answerMode === "choice",
    typedOnly: game.answerMode === "typed",
  });

  /* If the filtered pool is exhausted there is nothing to swap to; refund the
     lifeline rather than silently doing nothing. */
  if (!replacement) return null;

  game.usedIds.add(replacement.id);
  s.question = replacement;
  s.removed = [];
  s.poll = null;
  /* A swapped-in lock is a different lock: anything already bought about the
     old one would be actively misleading. */
  s.revealed = "";
  s.intel = "";

  if (game.answerMode === "choice") {
    /* Fresh seed slot so the swapped question does not reuse the burned
       option layout of the one it replaced. */
    const built = game.buildOptionsFor(replacement, `${game.seed}#${s.qIndex}~bypass`);
    s.options = built.options;
    s.correctIndex = built.correctIndex;
  }

  const base = DIFFICULTY.time[replacement.difficulty] ?? 25;
  s.questionTime = game.mode.timeScale > 0 ? base * game.mode.timeScale : base;
  s.questionLeft = s.questionTime;
  s.frozen = false;

  return { from: previous, to: replacement };
}

/* ---- ETCH — the opening letter --------------------------------------------
   Derived, not authored: the first character of the answer, skipping leading
   articles so "The Strait of Gibraltar" gives S rather than T. Giving away
   "the" would be a wasted lifeline.                                          */

function etch(game) {
  const s = game.state;
  const raw = String(s.question.answer || "").trim();
  const stripped = raw.replace(/^(the|a|an)\s+/i, "");
  const target = stripped || raw;
  const letter = (target.match(/[\p{L}\p{N}]/u) || [""])[0];
  if (!letter) return null;

  s.revealed = letter.toUpperCase();
  s.etchedFrom = stripped !== raw ? raw.slice(0, raw.length - stripped.length).trim() : "";
  return { letter: s.revealed, droppedArticle: s.etchedFrom };
}

/* ---- INFORMANT — an authored clue ------------------------------------------ */

function informant(game) {
  const s = game.state;
  const hint = s.question?.hint;
  if (!hint) return null;
  s.intel = hint;
  return { hint };
}

/* ---- DOUBLE DOWN — declared before answering ------------------------------ */

function doubledown(game) {
  game.state.doubledDown = true;
  return { armed: true, atRisk: game.state.pot };
}

const HANDLERS = { drill, wiretap, freeze, bypass, doubledown, etch, informant };

/**
 * Use a lifeline. Returns the handler's detail object, or null if it could
 * not be used (in which case nothing is consumed).
 */
export function use(game, id) {
  if (!canUse(game, id)) return null;

  const handler = HANDLERS[id];
  if (!handler) return null;

  const detail = handler(game);
  if (detail === null) return null;   /* handler declined — do not consume */

  consume(game, id);
  game.emit("lifeline", { id, detail, kit: game.state.kit });
  return detail;
}

/** Snapshot for the UI: every lifeline this mode offers, with live state. */
export function kitState(game) {
  return Object.values(game.state.kit).map((slot) => ({
    id: slot.id,
    name: slot.name,
    hint: slot.hint,
    key: slot.key,
    used: slot.used,
    available: canUse(game, slot.id),
  }));
}
