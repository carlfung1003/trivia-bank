/* ==========================================================================
   THE STREET — a Family Feud–shaped mode, as pure rules.
   --------------------------------------------------------------------------
   One open prompt, a ranked board of hidden answers, each worth its share of
   the room. Name them. Three strikes and the round is over.

   Same contract as engine.js and jeopardy.js: no DOM, no wall-clock, no
   network. Time enters only through tick(dt), everything else through explicit
   player intents, so scripts/playtest-survey.mjs plays complete games headlessly.

   How it differs from the television format, and why:

   - SOLO, so there is no rival family to steal the bank. The steal is the
     source of all tension on the show, and dropping it without a replacement
     would make three strikes a shrug. The replacement is BANKING: the pot is
     live until you lock it, and three strikes takes the whole live pot. That
     is the same decision the show creates ("do we risk one more?") using the
     mechanic this site is already built around.
   - Answers are OPEN TEXT matched against authored alias lists, not picked
     from options. That is the whole appeal — you say what you reckon — and it
     is why the alias lists in data/surveys.json are long and why the audit
     insists no two answers on one board can accept the same guess.
   - A REPEAT guess is not a strike. Saying the same thing twice is a memory
     slip, not a wrong answer, and burning a strike for it feels like a bug.
   ========================================================================== */

import { checkTypedAgainst } from "./bank.js";
import { STREET } from "./config.js";
import { makeRng, sample, matchKey, clamp } from "./util.js";

/* ---- Minimal event bus (same shape as engine.js) ------------------------- */

class Emitter {
  constructor() { this._h = new Map(); }
  on(evt, fn) {
    if (!this._h.has(evt)) this._h.set(evt, new Set());
    this._h.get(evt).add(fn);
    return () => this.off(evt, fn);
  }
  off(evt, fn) { this._h.get(evt)?.delete(fn); }
  emit(evt, payload) {
    for (const fn of this._h.get(evt) || []) {
      try { fn(payload); } catch (err) { console.error(`[street] handler for "${evt}" threw`, err); }
    }
    for (const fn of this._h.get("*") || []) {
      try { fn({ type: evt, payload }); } catch (err) { console.error(err); }
    }
  }
}

export const SPHASE = {
  ASKING: "asking",     /* board up, clock running, guesses accepted */
  ROUND:  "round",      /* round resolved, waiting to continue      */
  OVER:   "over",
};

/** Why a round ended. */
export const SEND = {
  SWEPT:   "swept",     /* every answer found                     */
  BANKED:  "banked",    /* walked away with the pot               */
  STRUCK:  "struck",    /* three strikes, pot lost                */
  TIME:    "time",      /* clock ran out, pot lost                */
};

export class SurveyGame extends Emitter {
  /**
   * @param {object} opts
   * @param {object} opts.data   parsed data/surveys.json
   * @param {string} opts.seed
   */
  constructor({ data, seed = "street" }) {
    super();
    this.data = data;
    this.surveys = data.surveys || [];
    this.seed = String(seed);
    this.rng = makeRng(this.seed);
    this.state = this._blankState();
  }

  _blankState() {
    return {
      phase: SPHASE.ASKING,
      seed: this.seed,

      round: 0,
      multiplier: 1,
      survey: null,
      slots: [],            /* { text, share, found, order } — order = reveal order */

      pot: 0,               /* live, lost on a third strike       */
      banked: 0,            /* locked in, never at risk again     */
      strikes: 0,

      clock: 0,
      clockMax: 0,

      lastGuess: "",
      lastVerdict: null,    /* "hit" | "strike" | "repeat"        */
      lastSlot: -1,

      found: 0,
      guesses: 0,
      hits: 0,
      strikeCount: 0,
      sweeps: 0,
      topAnswers: 0,        /* number-one answers named           */
      bestRound: 0,
      history: [],
      roundEnd: null,
      endReason: null,
      heat: 0,
    };
  }

  /* ---- Lifecycle --------------------------------------------------------- */

  start() {
    this.state = this._blankState();
    this.rng = makeRng(this.seed);
    if (this.surveys.length < STREET.rounds.length) {
      throw new Error(`The Street needs at least ${STREET.rounds.length} surveys, found ${this.surveys.length}`);
    }
    /* Draw the whole game up front so a survey can never repeat within a run. */
    this.queue = sample(this.rng, this.surveys, STREET.rounds.length);
    this.emit("start", { seed: this.seed, rounds: STREET.rounds.length });
    this._startRound(0);
    return this;
  }

  _startRound(index) {
    const s = this.state;
    const survey = this.queue[index];
    if (!survey) { this._end("street-done"); return; }

    const spec = STREET.rounds[index];
    s.round = index + 1;
    s.multiplier = spec.multiplier;
    s.survey = survey;

    /* Sorted by share so the board reads top-down, as it does on the show. */
    s.slots = survey.answers
      .slice()
      .sort((a, b) => b.share - a.share)
      .map((a, i) => ({ text: a.text, share: a.share, rank: i + 1, found: false, answer: a }));

    /* One lexicon per BOARD, not per file. Two surveys may legitimately share
       an answer ("Ironing" is on two boards); what must never happen is one
       board's slot swallowing a guess meant for the slot beside it. */
    s.lexicon = new Set();
    for (const slot of s.slots) {
      for (const source of [slot.text, ...(slot.answer.accept || [])]) {
        const key = matchKey(source);
        if (key) s.lexicon.add(key);
      }
    }

    s.pot = 0;
    s.strikes = 0;
    s.found = 0;
    s.lastGuess = "";
    s.lastVerdict = null;
    s.lastSlot = -1;
    s.roundEnd = null;
    s.clockMax = STREET.roundSeconds;
    s.clock = s.clockMax;
    s.phase = SPHASE.ASKING;

    this.emit("round", {
      round: s.round,
      total: STREET.rounds.length,
      multiplier: s.multiplier,
      prompt: survey.prompt,
      slots: this._boardView(),
      banked: s.banked,
      seconds: s.clockMax,
    });
    this._recomputeHeat();
  }

  /** The board as the UI needs it: hidden slots reveal nothing but their rank. */
  _boardView() {
    return this.state.slots.map((slot, i) => ({
      index: i,
      rank: slot.rank,
      found: slot.found,
      text: slot.found ? slot.text : null,
      share: slot.found ? slot.share : null,
      points: slot.found ? slot.share * this.state.multiplier : null,
    }));
  }

  get remaining() {
    return this.state.slots.filter((s) => !s.found).length;
  }

  /** What the pot would be worth if banked right now. */
  get potValue() {
    return this.state.pot;
  }

  /* ---- Player intents ---------------------------------------------------- */

  /**
   * Say what you reckon.
   * @returns {{verdict: "hit"|"strike"|"repeat", slot?: number, points?: number}|null}
   */
  guess(text) {
    const s = this.state;
    if (s.phase !== SPHASE.ASKING) return null;
    const raw = String(text ?? "").trim();
    if (!raw) return null;

    s.guesses += 1;
    s.lastGuess = raw;

    /* Match against every slot, found or not. Checking the FOUND ones too is
       what makes a repeat a repeat instead of a strike. */
    let hitIndex = -1;
    for (let i = 0; i < s.slots.length; i++) {
      const slot = s.slots[i];
      const verdict = checkTypedAgainst({ answer: slot.text, accept: slot.answer.accept }, raw, s.lexicon);
      /* "close" is TRUTHY — the vault learned this expensively. On a survey
         board a near miss counts as a hit: the alias lists cannot anticipate
         every phrasing, and being strict here punishes the exact thing the
         mode is for. Compare explicitly either way. */
      if (verdict === true || verdict === "close") { hitIndex = i; break; }
    }

    if (hitIndex >= 0 && s.slots[hitIndex].found) {
      s.lastVerdict = "repeat";
      s.lastSlot = hitIndex;
      this.emit("guess", { verdict: "repeat", slot: hitIndex, text: raw, strikes: s.strikes });
      return { verdict: "repeat", slot: hitIndex };
    }

    if (hitIndex >= 0) {
      const slot = s.slots[hitIndex];
      slot.found = true;
      s.found += 1;
      s.hits += 1;
      if (slot.rank === 1) s.topAnswers += 1;

      const points = slot.share * s.multiplier;
      s.pot += points;

      s.lastVerdict = "hit";
      s.lastSlot = hitIndex;

      this.emit("guess", {
        verdict: "hit",
        slot: hitIndex,
        text: raw,
        revealed: slot.text,
        share: slot.share,
        points,
        pot: s.pot,
        rank: slot.rank,
        strikes: s.strikes,
        remaining: this.remaining,
      });

      /* Sweeping the board banks it automatically — there is nothing left to
         risk, so leaving the decision open would be a decision with one answer. */
      if (this.remaining === 0) {
        s.sweeps += 1;
        const bonus = Math.round(s.pot * STREET.sweepBonus);
        s.pot += bonus;
        this._endRound(SEND.SWEPT, { bonus });
      } else {
        this._recomputeHeat();
      }
      return { verdict: "hit", slot: hitIndex, points };
    }

    /* A miss. */
    s.strikes += 1;
    s.strikeCount += 1;
    s.lastVerdict = "strike";
    s.lastSlot = -1;

    this.emit("guess", {
      verdict: "strike",
      text: raw,
      strikes: s.strikes,
      allowed: STREET.strikes,
      pot: s.pot,
    });

    if (s.strikes >= STREET.strikes) this._endRound(SEND.STRUCK);
    else this._recomputeHeat();

    return { verdict: "strike" };
  }

  /**
   * Lock the pot and move on.
   *
   * The whole decision of the mode lives here. Banking early keeps a modest
   * pot; pushing on for the long tail risks all of it on a board where the
   * remaining answers are, by construction, the ones nobody thinks of.
   */
  bank() {
    const s = this.state;
    if (s.phase !== SPHASE.ASKING) return false;
    if (s.pot <= 0) return false;
    this._endRound(SEND.BANKED);
    return true;
  }

  /** Continue to the next survey, or finish. */
  next() {
    const s = this.state;
    if (s.phase !== SPHASE.ROUND) return;
    if (s.round >= STREET.rounds.length) { this._end("street-done"); return; }
    this._startRound(s.round);
  }

  /* ---- Clock ------------------------------------------------------------- */

  tick(dt) {
    const s = this.state;
    if (s.phase !== SPHASE.ASKING) return;
    s.clock = Math.max(0, s.clock - dt);
    this._recomputeHeat();
    if (s.clock <= 0) this._endRound(SEND.TIME);
  }

  _recomputeHeat() {
    const s = this.state;
    const clockFraction = s.clockMax ? s.clock / s.clockMax : 1;
    const clockHeat = clockFraction < STREET.criticalClockFraction
      ? 1 - clockFraction / STREET.criticalClockFraction
      : 0;
    /* Strikes are their own kind of heat, and the third one is the cliff. */
    const strikeHeat = clamp(s.strikes / Math.max(1, STREET.strikes), 0, 1);
    const next = clamp(Math.max(clockHeat, strikeHeat), 0, 1);
    if (Math.abs(next - s.heat) > 0.01) {
      s.heat = next;
      this.emit("heat", next);
    }
  }

  /* ---- Resolution -------------------------------------------------------- */

  _endRound(reason, extra = {}) {
    const s = this.state;
    if (s.phase !== SPHASE.ASKING) return;

    const kept = reason === SEND.SWEPT || reason === SEND.BANKED;
    const lost = kept ? 0 : s.pot;
    const taken = kept ? s.pot : 0;

    s.banked += taken;
    s.bestRound = Math.max(s.bestRound, taken);
    s.phase = SPHASE.ROUND;
    s.roundEnd = reason;

    const entry = {
      round: s.round,
      prompt: s.survey.prompt,
      multiplier: s.multiplier,
      found: s.found,
      total: s.slots.length,
      strikes: s.strikes,
      reason,
      kept: taken,
      lost,
      /* Aliases so the shared results renderer can list a Street run through
         the same code path as a vault run — see ui.renderResults. */
      question: s.survey.prompt,
      answer: s.slots.map((x) => x.text).join(", "),
      result: kept ? "correct" : "wrong",
      points: taken,
      given: `${s.found}/${s.slots.length}`,
      missed: s.slots.filter((x) => !x.found).map((x) => ({ text: x.text, share: x.share })),
    };
    s.history.push(entry);

    this.emit("roundEnd", {
      reason,
      kept: taken,
      lost,
      banked: s.banked,
      board: this._boardView(),
      /* Every slot, revealed — the round is over, so the answers are news
         rather than a spoiler, and not showing them is the single most
         frustrating thing a survey game can do. */
      full: s.slots.map((x) => ({ text: x.text, share: x.share, found: x.found, rank: x.rank })),
      entry,
      last: s.round >= STREET.rounds.length,
      ...extra,
    });
    this._recomputeHeat();
    return entry;
  }

  _end(reason) {
    const s = this.state;
    if (s.phase === SPHASE.OVER) return;
    s.phase = SPHASE.OVER;
    s.endReason = reason;

    const summary = {
      reason,
      mode: "street",
      seed: this.seed,
      score: s.banked,
      correct: s.hits,
      wrong: s.strikeCount,
      answered: s.guesses,
      bestStreak: s.bestRound,
      sweeps: s.sweeps,
      topAnswers: s.topAnswers,
      rounds: s.history.length,
      history: s.history.slice(),
    };
    this.emit("over", summary);
    return summary;
  }

  /** Walk out mid-game, keeping only what is already banked. */
  quit() { return this._end("walked"); }

  get clockFraction() {
    const s = this.state;
    return s.clockMax ? s.clock / s.clockMax : 1;
  }
}
