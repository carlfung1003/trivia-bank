/* ==========================================================================
   THE BOARD — a Jeopardy-shaped mode, as pure rules.
   --------------------------------------------------------------------------
   Same contract as engine.js: no DOM, no wall-clock, no network. Time enters
   only through tick(dt) and everything else through explicit player intents,
   so scripts/playtest-board.mjs can play thousands of complete games headlessly
   and window.__board.autoplay() works in the console.

   It is a SEPARATE module rather than a fifth entry in MODES for one reason:
   engine.js models a queue of questions, and this models a board you pick from.
   Grafting a 30-cell grid, two rounds, hidden wagers and a final onto the
   queue would have put four working modes at risk to save one file. The two
   engines share the matcher (bank.js) and the balance file (config.js), which
   are the parts that actually want to agree.

   Deviations from the television format, all deliberate:
     - Solo. There are no rivals to buzz against, so a clue is yours the moment
       you pick it and the clock is the only opponent.
     - A miss costs the clue's value, as on the show. The floor is what keeps
       a run from becoming free: guess everything and you finish negative.
     - Responses are accepted with or without the question form. Requiring
       "What is..." would test typing, not knowing — but supplying it correctly
       is worth a courtesy bonus, because the format deserves that much.
   ========================================================================== */

import { checkTypedAgainst } from "./bank.js";
import { BOARD } from "./config.js";
import { makeRng, shuffle, sample, matchKey, clamp } from "./util.js";

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
      try { fn(payload); } catch (err) { console.error(`[board] handler for "${evt}" threw`, err); }
    }
    for (const fn of this._h.get("*") || []) {
      try { fn({ type: evt, payload }); } catch (err) { console.error(err); }
    }
  }
}

export const BPHASE = {
  BOARD:   "board",     /* choosing a cell                       */
  WAGER:   "wager",     /* a wildcard is showing, name the stake */
  ASKING:  "asking",    /* clue is up, clock running             */
  REVEALED:"revealed",  /* verdict shown, waiting to continue    */
  FINAL:   "final",     /* the last lock: wager, then the clue   */
  OVER:    "over",
};

export const BRESULT = { CORRECT: "correct", WRONG: "wrong", TIMEOUT: "timeout" };

/* Strip the question form. "What is a martini?" and "a martini" are the same
   response — the show's convention is a ritual, not a memory test — but the
   ritual is worth acknowledging, so the wrapper is detected, not just
   discarded. See BOARD.formBonus. */
const QUESTION_FORM = /^\s*(what|whats|what's|who|whos|who's|where|wheres|where's|when|whens|when's|which|why|how)\s+(is|are|was|were|s|'s)?\s*/i;

export function stripQuestionForm(input) {
  const raw = String(input ?? "").trim().replace(/[?？]+\s*$/, "");
  const stripped = raw.replace(QUESTION_FORM, "").trim();
  /* Only count it as the question form if something survived. "What is it?"
     with nothing after the wrapper is not a response. */
  if (!stripped || stripped === raw) return { text: raw, inForm: false };
  return { text: stripped, inForm: true };
}

/**
 * Deal a board: `columns` categories, each with its five tiers, plus wildcards
 * hidden behind cells that are never in the top row — the show buries them
 * low, and a wildcard on a $200 cell is not worth finding.
 */
function dealRound(rng, packs, { columns, wildcards, multiplier }) {
  /* Collapse variants before sampling: one pack per heading, chosen at random
     among that heading's variants. Sampling first and filtering after would
     quietly deal fewer than `columns` columns whenever two variants collided. */
  const byName = new Map();
  for (const pack of packs) {
    if (!byName.has(pack.name)) byName.set(pack.name, []);
    byName.get(pack.name).push(pack);
  }
  const oneEach = [...byName.values()].map((variants) =>
    variants.length === 1 ? variants[0] : sample(rng, variants, 1)[0]
  );

  const chosen = sample(rng, oneEach, columns);
  const board = chosen.map((pack) => ({
    id: pack.id,
    name: pack.name,
    blurb: pack.blurb || "",
    cells: pack.clues
      .slice()
      .sort((a, b) => a.tier - b.tier)
      .map((clue) => ({
        tier: clue.tier,
        value: clue.tier * multiplier,
        clue,
        used: false,
        wildcard: false,
      })),
  }));

  /* Wildcard placement: any cell from tier 2 down, one per column at most. */
  const eligible = [];
  board.forEach((col, ci) => {
    col.cells.forEach((cell, ri) => {
      if (cell.tier >= BOARD.wildcardMinTier) eligible.push([ci, ri]);
    });
  });
  const columnsTaken = new Set();
  for (const [ci, ri] of shuffle(rng, eligible)) {
    if (columnsTaken.size >= wildcards) break;
    if (columnsTaken.has(ci)) continue;
    board[ci].cells[ri].wildcard = true;
    columnsTaken.add(ci);
  }

  return board;
}

export class BoardGame extends Emitter {
  /**
   * @param {object} opts
   * @param {object} opts.data   parsed data/jeopardy.json
   * @param {string} opts.seed
   */
  constructor({ data, seed = "board" }) {
    super();
    this.data = data;
    this.packs = data.categories || [];
    this.finals = data.final || [];
    this.seed = String(seed);
    this.rng = makeRng(this.seed);

    /* One lexicon over every clue in the file, for the same reason the vault
       has one: "Titian" must not pass as a typo for "Titan". Answers repeated
       across packs are harmless — an exact match returns before the guard. */
    this.lexicon = new Set();
    for (const pack of this.packs) {
      for (const clue of pack.clues) {
        for (const source of [clue.answer, ...(clue.accept || [])]) {
          const key = matchKey(source);
          if (key) this.lexicon.add(key);
        }
      }
    }

    this.state = this._blankState();
  }

  _blankState() {
    return {
      phase: BPHASE.BOARD,
      seed: this.seed,
      round: 0,               /* 1 = first floor, 2 = second, 3 = last lock  */
      roundName: "",
      board: [],
      score: 0,
      /* The live clue. */
      cell: null,
      column: -1,
      row: -1,
      clue: null,
      value: 0,
      wager: 0,
      onWildcard: false,
      clueTime: 0,
      clueLeft: 0,
      given: "",
      inForm: false,
      lastResult: null,
      wasClose: false,
      /* Bookkeeping. */
      answered: 0,
      correctCount: 0,
      wrongCount: 0,
      passedCount: 0,
      streak: 0,
      bestStreak: 0,
      bestScore: 0,
      wildcardsFound: 0,
      formStreak: 0,          /* consecutive responses in the question form  */
      history: [],
      finalClue: null,
      finalWager: 0,
      endReason: null,
      heat: 0,
    };
  }

  /* ---- Lifecycle --------------------------------------------------------- */

  start() {
    this.state = this._blankState();
    this.rng = makeRng(this.seed);
    /* Headings, not packs — five variants of one category still deal one
       column, so counting packs would let a broken file through. */
    const headings = new Set(this.packs.map((p) => p.name)).size;
    if (headings < BOARD.columns) {
      throw new Error(`The Board needs at least ${BOARD.columns} distinct categories, found ${headings}`);
    }
    /* Deduped by NAME, not id, because a category may have several packs of
       different clues under the same heading — "DIM SUM" appearing on the
       second floor with five questions you have not seen is the point of
       variants, but "DIM SUM" appearing twice in one game is a bug. */
    this.usedPackNames = new Set();
    this.emit("start", { seed: this.seed });
    this._startRound(1);
    return this;
  }

  _startRound(round) {
    const s = this.state;
    const spec = BOARD.rounds[round - 1];
    s.round = round;
    s.roundName = spec.name;
    s.board = dealRound(this.rng, this.packs.filter((p) => !this.usedPackNames.has(p.name)), {
      columns: BOARD.columns,
      wildcards: spec.wildcards,
      multiplier: spec.multiplier,
    });
    for (const col of s.board) this.usedPackNames.add(col.name);
    s.phase = BPHASE.BOARD;
    s.cell = null;
    s.clue = null;
    this.emit("round", { round, name: spec.name, board: this._boardView(), score: s.score });
  }

  /** The board as the UI needs it — never the live objects. */
  _boardView() {
    return this.state.board.map((col) => ({
      id: col.id,
      name: col.name,
      blurb: col.blurb,
      cells: col.cells.map((c) => ({ tier: c.tier, value: c.value, used: c.used })),
    }));
  }

  get remaining() {
    let n = 0;
    for (const col of this.state.board) for (const c of col.cells) if (!c.used) n++;
    return n;
  }

  /* ---- Player intents ---------------------------------------------------- */

  /** Choose a cell. Returns the clue, or null if the pick was not legal. */
  pick(column, row) {
    const s = this.state;
    if (s.phase !== BPHASE.BOARD) return null;
    const col = s.board[column];
    if (!col) return null;
    const cell = col.cells[row];
    if (!cell || cell.used) return null;

    cell.used = true;
    s.column = column;
    s.row = row;
    s.cell = cell;
    s.clue = cell.clue;
    s.value = cell.value;
    s.wager = 0;
    s.given = "";
    s.inForm = false;
    s.wasClose = false;
    s.lastResult = null;
    s.onWildcard = cell.wildcard;

    if (cell.wildcard) {
      s.wildcardsFound += 1;
      s.phase = BPHASE.WAGER;
      this.emit("wildcard", {
        category: col.name,
        min: BOARD.wagerMin,
        max: this.maxWager(),
        score: s.score,
      });
      return s.clue;
    }

    this._present();
    return s.clue;
  }

  /**
   * The ceiling on a wildcard wager: your score, or the round's top cell if
   * that is larger. Without the floor a player who is broke or negative can
   * never wager anything, which turns finding a wildcard into a punishment.
   */
  maxWager() {
    const spec = BOARD.rounds[this.state.round - 1] || BOARD.rounds[0];
    const topCell = BOARD.tiers * spec.multiplier;
    return Math.max(topCell, this.state.score);
  }

  /** Commit the wildcard stake and reveal the clue. */
  setWager(amount) {
    const s = this.state;
    if (s.phase !== BPHASE.WAGER) return false;
    const n = Math.round(Number(amount));
    if (!Number.isFinite(n)) return false;
    s.wager = clamp(n, BOARD.wagerMin, this.maxWager());
    s.value = s.wager;
    this._present();
    return true;
  }

  _present() {
    const s = this.state;
    s.clueTime = BOARD.clueSeconds + (s.onWildcard ? BOARD.wildcardExtraSeconds : 0);
    s.clueLeft = s.clueTime;
    s.phase = BPHASE.ASKING;
    this.emit("clue", {
      round: s.round,
      category: s.board[s.column]?.name ?? s.finalClue?.category ?? "",
      clue: s.clue.clue,
      value: s.value,
      wildcard: s.onWildcard,
      column: s.column,
      row: s.row,
      seconds: s.clueTime,
    });
    this._recomputeHeat();
  }

  /** @param {string} text the typed response, question form optional. */
  answer(text) {
    const s = this.state;
    if (s.phase !== BPHASE.ASKING && s.phase !== BPHASE.FINAL) return null;
    if (s.phase === BPHASE.FINAL && !s.finalArmed) return null;

    const { text: bare, inForm } = stripQuestionForm(text);
    /* checkTypedAgainst returns true | "close" | false, and "close" is TRUTHY.
       The vault learned this the expensive way; do not collapse the compare. */
    const verdict = checkTypedAgainst(s.clue, bare, this.lexicon);
    s.wasClose = verdict === "close";
    s.inForm = inForm;
    s.given = String(text);
    return this._resolve(verdict === true ? BRESULT.CORRECT : BRESULT.WRONG);
  }

  /**
   * Decline the clue. On the show you simply do not buzz, and nobody pays for
   * a clue nobody attempted — which is the whole reason a 35%-accuracy game is
   * survivable there and was not here. Without a pass, picking a cell is a
   * forced bet, and the headless sweep showed exactly what that does: a
   * player who knows a third of the board finishes at minus eleven thousand.
   *
   * The cell is still spent, so passing is not a free look at the board.
   * A wager already committed cannot be passed out of — that is what
   * committing means.
   */
  pass() {
    const s = this.state;
    if (s.phase !== BPHASE.ASKING) return null;
    if (s.onWildcard) return null;
    s.given = "";
    s.inForm = false;
    s.wasClose = false;
    return this._resolve(BRESULT.TIMEOUT);
  }

  /** Continue past a reveal: next pick, next round, or the end. */
  next() {
    const s = this.state;
    if (s.phase !== BPHASE.REVEALED) return;

    if (s.round >= BOARD.rounds.length) {
      /* The last lock has been resolved. */
      this._end("played-out");
      return;
    }

    if (this.remaining > 0) {
      s.phase = BPHASE.BOARD;
      s.cell = null;
      s.clue = null;
      this.emit("board", { board: this._boardView(), score: s.score, round: s.round });
      return;
    }

    if (s.round + 1 < BOARD.rounds.length) {
      this._startRound(s.round + 1);
      return;
    }
    this._startFinal();
  }

  /* ---- The last lock ------------------------------------------------------ */

  _startFinal() {
    const s = this.state;
    s.round = BOARD.rounds.length;
    s.roundName = BOARD.rounds[s.round - 1].name;

    /* Below the threshold there is nothing to wager and no last lock — the
       show sends you home too. */
    if (s.score < BOARD.finalMinScore) {
      this._end("short");
      return;
    }

    s.finalClue = sample(this.rng, this.finals, 1)[0] || null;
    if (!s.finalClue) { this._end("played-out"); return; }

    s.clue = s.finalClue;
    s.finalArmed = false;
    s.phase = BPHASE.FINAL;
    this.emit("final", {
      category: s.finalClue.category,
      max: s.score,
      score: s.score,
    });
  }

  /** Name the last-lock stake. The clue is only shown once this is committed. */
  setFinalWager(amount) {
    const s = this.state;
    if (s.phase !== BPHASE.FINAL || s.finalArmed) return false;
    const n = Math.round(Number(amount));
    if (!Number.isFinite(n)) return false;
    s.finalWager = clamp(n, 0, Math.max(0, s.score));
    s.value = s.finalWager;
    s.wager = s.finalWager;
    s.finalArmed = true;
    s.onWildcard = false;
    s.clueTime = BOARD.finalSeconds;
    s.clueLeft = s.clueTime;
    this.emit("clue", {
      round: s.round,
      category: s.finalClue.category,
      clue: s.finalClue.clue,
      value: s.finalWager,
      wildcard: false,
      final: true,
      column: -1,
      row: -1,
      seconds: s.clueTime,
    });
    this._recomputeHeat();
    return true;
  }

  /* ---- Clock ------------------------------------------------------------- */

  tick(dt) {
    const s = this.state;
    const live = s.phase === BPHASE.ASKING || (s.phase === BPHASE.FINAL && s.finalArmed);
    if (!live) return;
    s.clueLeft = Math.max(0, s.clueLeft - dt);
    this._recomputeHeat();
    if (s.clueLeft <= 0) this._resolve(BRESULT.TIMEOUT);
  }

  _recomputeHeat() {
    const s = this.state;
    const fraction = s.clueTime ? s.clueLeft / s.clueTime : 1;
    const clockHeat = fraction < BOARD.criticalClockFraction
      ? 1 - fraction / BOARD.criticalClockFraction
      : 0;
    const streakHeat = clamp((s.streak - 2) / 4, 0, 1);
    const next = clamp(Math.max(clockHeat, streakHeat), 0, 1);
    if (Math.abs(next - s.heat) > 0.01) {
      s.heat = next;
      this.emit("heat", next);
    }
  }

  /* ---- Resolution -------------------------------------------------------- */

  _resolve(result) {
    const s = this.state;
    const isFinal = s.phase === BPHASE.FINAL;
    const clue = s.clue;
    const elapsed = s.clueTime - s.clueLeft;

    s.phase = BPHASE.REVEALED;
    s.answered += 1;

    /* A timeout on an ordinary clue costs nothing — on the show nobody buzzed,
       so nobody paid. A timeout on a wager costs the stake, because the stake
       was already committed when the clue was revealed. */
    const staked = isFinal || s.onWildcard;
    let delta = 0;

    if (result === BRESULT.CORRECT) {
      s.correctCount += 1;
      s.streak += 1;
      s.bestStreak = Math.max(s.bestStreak, s.streak);
      delta = isFinal ? s.finalWager : s.value;

      /* The courtesy bonus: phrasing it as a question is the format, and the
         format is the point. Small enough that nobody is punished for
         skipping it, visible enough to be worth learning. */
      if (s.inForm && !isFinal) {
        s.formStreak += 1;
        delta += Math.round(s.value * BOARD.formBonus);
      } else if (!s.inForm) {
        s.formStreak = 0;
      }
    } else if (result === BRESULT.TIMEOUT && !staked) {
      /* Passed, or ran the clock out, on a clue with nothing staked. Counted
         apart from wrong answers: it is not a mistake, it is a decision, and
         lumping the two together made the end screen read as if a cautious
         player had been wrong forty times. */
      s.passedCount += 1;
      s.streak = 0;
      delta = 0;
    } else {
      s.wrongCount += 1;
      s.streak = 0;
      delta = -(isFinal ? s.finalWager : s.value);
    }

    s.score += delta;
    s.bestScore = Math.max(s.bestScore, s.score);
    s.lastResult = result;

    const entry = {
      round: s.round,
      category: isFinal ? clue.category : (s.board[s.column]?.name ?? ""),
      clue: clue.clue,
      answer: clue.answer,
      /* `question` and `points` are aliases of `clue` and `delta`, carried so
         the shared results renderer (ui.renderResults) can list a board run
         and a vault run through the same code path instead of branching on
         mode for every field. */
      question: clue.clue,
      points: 0,
      value: isFinal ? s.finalWager : s.value,
      wildcard: s.onWildcard,
      final: isFinal,
      given: s.given,
      inForm: s.inForm,
      result,
      delta,
      seconds: Number(elapsed.toFixed(2)),
    };
    entry.points = delta;
    s.history.push(entry);

    this.emit("reveal", {
      result,
      close: !!s.wasClose && result !== BRESULT.CORRECT,
      answer: clue.answer,
      given: s.given,
      inForm: s.inForm,
      delta,
      score: s.score,
      streak: s.streak,
      final: isFinal,
      entry,
    });
    this._recomputeHeat();
    return entry;
  }

  _end(reason) {
    const s = this.state;
    if (s.phase === BPHASE.OVER) return;
    s.phase = BPHASE.OVER;
    s.endReason = reason;

    const summary = {
      reason,
      mode: "board",
      seed: this.seed,
      score: s.score,
      bestScore: s.bestScore,
      correct: s.correctCount,
      wrong: s.wrongCount,
      passed: s.passedCount,
      answered: s.answered,
      bestStreak: s.bestStreak,
      wildcardsFound: s.wildcardsFound,
      history: s.history.slice(),
      roundsPlayed: s.round,
    };
    this.emit("over", summary);
    return summary;
  }

  /** Abandon mid-game, keeping whatever is on the board. */
  quit() { return this._end("walked"); }

  get clockFraction() {
    const s = this.state;
    return s.clueTime ? s.clueLeft / s.clueTime : 1;
  }
}
