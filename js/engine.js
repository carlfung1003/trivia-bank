/* ==========================================================================
   Game engine — pure logic, zero DOM.
   --------------------------------------------------------------------------
   Nothing in this file touches the document, the clock, or the network. It is
   driven entirely by tick(dt) and by explicit player intents, which means the
   whole game can be played headlessly at any speed. That is what makes
   window.__game.fastForward() possible, and it is the discipline that made
   the open-empires and seventh-floor test loops work.

   Communication out is via events, never by reaching into the UI.
   ========================================================================== */

import { DIFFICULTY, SCORING, MODES, LIFELINES, FX } from "./config.js";
import { buildOptions } from "./distractors.js";
import { makeRng, clamp } from "./util.js";

/* ---- Minimal event bus --------------------------------------------------- */

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
      try { fn(payload); } catch (err) { console.error(`[engine] handler for "${evt}" threw`, err); }
    }
    for (const fn of this._h.get("*") || []) {
      try { fn({ type: evt, payload }); } catch (err) { console.error(err); }
    }
  }
}

export const PHASE = {
  IDLE: "idle",
  ASKING: "asking",
  REVEALED: "revealed",
  OVER: "over",
};

export const RESULT = {
  CORRECT: "correct",
  WRONG: "wrong",
  TIMEOUT: "timeout",
};

export class Game extends Emitter {
  /**
   * @param {object} opts
   * @param {Bank}   opts.bank
   * @param {string} opts.mode        key into MODES
   * @param {string} opts.seed
   * @param {string} opts.answerMode  "choice" | "typed"
   * @param {string[]} opts.categories
   * @param {string[]} opts.difficulties
   */
  constructor({ bank, mode = "vault", seed = "run", answerMode = "choice", categories = null, difficulties = null }) {
    super();
    this.bank = bank;
    this.mode = MODES[mode] || MODES.vault;
    this.seed = String(seed);
    this.answerMode = answerMode;
    this.categories = categories;
    this.difficulties = difficulties;
    this.rng = makeRng(this.seed);

    this.state = this._blankState();
  }

  _blankState() {
    const kit = {};
    for (const id of this.mode.lifelines) kit[id] = { id, used: false, ...LIFELINES[id] };
    return {
      phase: PHASE.IDLE,
      mode: this.mode.id,
      seed: this.seed,
      answerMode: this.answerMode,

      qIndex: -1,
      question: null,
      options: [],
      correctIndex: -1,
      removed: [],          /* option indices burned away by DRILL */
      poll: null,           /* WIRETAP result, array of 0..1 per option */
      revealed: "",         /* ETCH: the opening letter, once bought        */
      intel: "",            /* INFORMANT: the authored clue, once bought    */

      /* Timing. Per-question clock drives the ring; runClock drives Blitz. */
      questionTime: 0,
      questionLeft: 0,
      frozen: false,
      runClock: this.mode.clock ?? 0,

      pot: 0,               /* at risk    */
      banked: 0,            /* locked in  */
      streak: 0,
      bestStreak: 0,
      lives: this.mode.livesAlarm || 0,
      doubledDown: false,

      correctCount: 0,
      wrongCount: 0,
      answered: 0,
      lifelinesUsed: 0,

      kit,
      history: [],
      lastResult: null,
      endReason: null,
      /* 0..1, drives the visual heat treatment in the UI layer. */
      heat: 0,
    };
  }

  /* ---- Lifecycle --------------------------------------------------------- */

  start() {
    this.state = this._blankState();
    this.rng = makeRng(this.seed);

    /* Vault Run and Daily Heist draw the whole set up front so the difficulty
       ramp is guaranteed and — for Daily — identical for every player. */
    if (Number.isFinite(this.mode.length)) {
      this.queue = this.bank.drawRun(this.rng, {
        length: this.mode.length,
        ramp: this.mode.ramp,
        categories: this.categories,
        difficulties: this.difficulties,
        choiceOnly: this.answerMode === "choice",
      });
    } else {
      this.queue = null;
    }
    this.usedIds = new Set();

    this.emit("start", { mode: this.mode.id, seed: this.seed });
    this._nextQuestion();
    return this;
  }

  /** Which difficulty the next question should be, for endless modes. */
  _nextDifficulty() {
    if (this.mode.id === "survival") {
      const step = Math.floor(this.state.answered / this.mode.escalateEvery);
      return DIFFICULTY.order[clamp(step, 0, DIFFICULTY.order.length - 1)];
    }
    return null;
  }

  _nextQuestion() {
    const s = this.state;
    s.qIndex += 1;

    let q = null;
    if (this.queue) {
      q = this.queue[s.qIndex] || null;
    } else {
      q = this.bank.draw(this.rng, {
        categories: this.categories,
        difficulties: this.difficulties,
        difficulty: this._nextDifficulty(),
        exclude: this.usedIds,
        choiceOnly: this.answerMode === "choice",
      });
    }

    if (!q) {
      this._end(this.mode.canBank ? "cleared" : "exhausted");
      return;
    }
    this.usedIds.add(q.id);

    s.question = q;
    s.removed = [];
    s.poll = null;
    s.revealed = "";
    s.intel = "";
    s.doubledDown = false;
    s.lastResult = null;

    if (this.answerMode === "choice") {
      const built = this.buildOptionsFor(q, `${this.seed}#${s.qIndex}`);
      s.options = built.options;
      s.correctIndex = built.correctIndex;
    } else {
      s.options = [];
      s.correctIndex = -1;
    }

    const base = DIFFICULTY.time[q.difficulty] ?? 25;
    s.questionTime = this.mode.timeScale > 0 ? base * this.mode.timeScale : base;
    s.questionLeft = s.questionTime;
    s.frozen = false;
    s.phase = PHASE.ASKING;

    this.emit("question", {
      index: s.qIndex,
      question: q,
      options: s.options.slice(),
      total: Number.isFinite(this.mode.length) ? this.mode.length : null,
      isSafeHaven: this.mode.safeHavens.includes(s.qIndex),
    });
    this._recomputeHeat();
  }

  /* ---- Clock ------------------------------------------------------------- */

  /**
   * Advance the simulation by `dt` seconds. The only source of time in the
   * whole game — the render loop calls this, and so does fastForward().
   */
  tick(dt) {
    const s = this.state;
    if (s.phase !== PHASE.ASKING) return;

    /* Blitz runs one shared clock; everything else runs per-question. */
    if (this.mode.timeScale === 0 && this.mode.clock) {
      s.runClock = Math.max(0, s.runClock - dt);
      if (!s.frozen) s.questionLeft = Math.max(0, s.questionLeft - dt);
      this._recomputeHeat();
      if (s.runClock <= 0) {
        this._end("time");
        return;
      }
      return;
    }

    if (s.frozen) return;
    s.questionLeft = Math.max(0, s.questionLeft - dt);
    this._recomputeHeat();
    if (s.questionLeft <= 0) this._resolve(null, RESULT.TIMEOUT);
  }

  _recomputeHeat() {
    const s = this.state;
    const streakHeat = clamp(
      (s.streak - FX.heatStreakStart) / Math.max(1, FX.heatStreakFull - FX.heatStreakStart),
      0, 1
    );
    const clockFraction = this.mode.timeScale === 0 && this.mode.clock
      ? s.runClock / this.mode.clock
      : s.questionTime ? s.questionLeft / s.questionTime : 1;
    const clockHeat = clockFraction < FX.criticalClockFraction
      ? 1 - clockFraction / FX.criticalClockFraction
      : 0;
    const next = clamp(Math.max(streakHeat, clockHeat), 0, 1);
    if (Math.abs(next - s.heat) > 0.01) {
      s.heat = next;
      this.emit("heat", next);
    }
  }

  /* ---- Player intents ---------------------------------------------------- */

  /** @param {number|string} answer option index (choice mode) or text (typed) */
  answer(answer) {
    const s = this.state;
    if (s.phase !== PHASE.ASKING) return null;

    let correct;
    if (this.answerMode === "choice") {
      const idx = Number(answer);
      if (!Number.isInteger(idx) || idx < 0 || idx >= s.options.length) return null;
      if (s.removed.includes(idx)) return null;   /* burned by DRILL */
      correct = idx === s.correctIndex;
      return this._resolve(idx, correct ? RESULT.CORRECT : RESULT.WRONG);
    }

    correct = this.bank.checkTyped(s.question, String(answer));
    return this._resolve(String(answer), correct ? RESULT.CORRECT : RESULT.WRONG);
  }

  /** Continue past the reveal. */
  next() {
    const s = this.state;
    if (s.phase !== PHASE.REVEALED) return;
    if (Number.isFinite(this.mode.length) && s.qIndex + 1 >= this.mode.length) {
      this._end("cleared");
      return;
    }
    this._nextQuestion();
  }

  /** Walk away with the pot. Vault Run only. */
  bankIt() {
    const s = this.state;
    if (!this.mode.canBank) return false;
    if (s.phase !== PHASE.ASKING && s.phase !== PHASE.REVEALED) return false;
    s.banked += s.pot;
    s.pot = 0;
    this.emit("banked", { total: s.banked });
    this._end("banked");
    return true;
  }

  /* ---- Resolution -------------------------------------------------------- */

  _resolve(given, result) {
    const s = this.state;
    const q = s.question;
    const elapsed = s.questionTime - s.questionLeft;
    const fraction = s.questionTime ? clamp(s.questionLeft / s.questionTime, 0, 1) : 0;

    s.phase = PHASE.REVEALED;
    s.answered += 1;

    let points = 0;
    if (result === RESULT.CORRECT) {
      s.correctCount += 1;
      s.streak += 1;
      s.bestStreak = Math.max(s.bestStreak, s.streak);

      const base = DIFFICULTY.base[q.difficulty] ?? 100;
      const speed = 1 + (SCORING.speedBonusMax - 1) * fraction;
      const ladder = SCORING.streakLadder;
      const mult = ladder[Math.min(s.streak, ladder.length - 1)] ?? SCORING.streakLadderMax;
      const typed = this.answerMode === "typed" ? SCORING.typedMultiplier : 1;
      const dd = s.doubledDown ? SCORING.doubleDownMultiplier : 1;

      points = Math.round(base * speed * mult * typed * dd);
      s.pot += points;

      /* Blitz buys time with correct answers, up to the ceiling. */
      if (this.mode.correctBonusSeconds) {
        const cap = this.mode.clockCap ?? Infinity;
        s.runClock = Math.min(cap, s.runClock + this.mode.correctBonusSeconds);
      }
    } else {
      s.wrongCount += 1;
      s.streak = 0;

      if (this.mode.wrongPenaltySeconds) {
        s.runClock = Math.max(0, s.runClock - this.mode.wrongPenaltySeconds);
      }
      /* A lost Double Down costs the entire unbanked pot. */
      if (s.doubledDown) {
        points = -s.pot;
        s.pot = 0;
      }
      if (this.mode.livesAlarm) s.lives -= 1;
    }

    s.lastResult = result;
    const entry = {
      id: q.id,
      question: q.question,
      answer: q.answer,
      category: q.category,
      difficulty: q.difficulty,
      given: this.answerMode === "choice" && Number.isInteger(given) ? s.options[given] : given,
      result,
      points,
      seconds: Number(elapsed.toFixed(2)),
      doubledDown: s.doubledDown,
    };
    s.history.push(entry);

    this.emit("reveal", {
      result,
      correctIndex: s.correctIndex,
      correctAnswer: q.answer,
      given,
      points,
      streak: s.streak,
      entry,
      fraction,
    });
    this._recomputeHeat();

    /* Run-ending conditions, per mode. */
    if (result !== RESULT.CORRECT) {
      if (this.mode.canBank) {
        /* Vault Run: a miss drops you to the last safe haven and ends it. */
        const haven = this._havenValue();
        s.pot = 0;
        s.banked = haven;
        this._end("busted");
        return entry;
      }
      if (this.mode.livesAlarm && s.lives <= 0) {
        this._end("alarms");
        return entry;
      }
    }

    if (Number.isFinite(this.mode.length) && s.qIndex + 1 >= this.mode.length && result === RESULT.CORRECT) {
      /* Cleared the last lock — the pot is yours. */
      s.banked += s.pot;
      s.pot = 0;
      this._end("cleared");
      return entry;
    }

    /* Crossing a safe haven locks the haul in. */
    if (result === RESULT.CORRECT && this.mode.safeHavens.includes(s.qIndex)) {
      s.banked += s.pot;
      s.pot = 0;
      this.emit("haven", { index: s.qIndex, total: s.banked });
    }

    return entry;
  }

  /** The amount guaranteed by the highest safe haven already passed. */
  _havenValue() {
    const s = this.state;
    return s.banked;   /* havens move pot -> banked as they are crossed */
  }

  _end(reason) {
    const s = this.state;
    if (s.phase === PHASE.OVER) return;
    s.phase = PHASE.OVER;
    s.endReason = reason;

    /* Blitz and Survival score straight from the pot. */
    if (!this.mode.canBank) {
      s.banked += s.pot;
      s.pot = 0;
    }

    const summary = {
      reason,
      mode: this.mode.id,
      seed: this.seed,
      answerMode: this.answerMode,
      score: s.banked,
      correct: s.correctCount,
      wrong: s.wrongCount,
      answered: s.answered,
      bestStreak: s.bestStreak,
      lifelinesUsed: s.lifelinesUsed,
      history: s.history.slice(),
      depth: s.qIndex + (s.lastResult === RESULT.CORRECT ? 1 : 0),
    };
    this.emit("over", summary);
    return summary;
  }

  /**
   * Build a multiple-choice option set for a question against this game's
   * bank index. Exposed so lifelines.js (BYPASS) can lay out a swapped-in
   * question without reaching into the distractor module itself.
   */
  buildOptionsFor(question, seedSlot) {
    return buildOptions(question, this.bank.index, seedSlot);
  }

  /* ---- Introspection ----------------------------------------------------- */

  /** Live options with burned entries marked, for the UI. */
  visibleOptions() {
    const s = this.state;
    return s.options.map((text, i) => ({
      text,
      index: i,
      removed: s.removed.includes(i),
      poll: s.poll ? s.poll[i] : null,
    }));
  }

  get clockFraction() {
    const s = this.state;
    if (this.mode.timeScale === 0 && this.mode.clock) return s.runClock / this.mode.clock;
    return s.questionTime ? s.questionLeft / s.questionTime : 1;
  }
}
