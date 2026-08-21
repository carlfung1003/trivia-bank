/* ==========================================================================
   Persistence — localStorage only.
   --------------------------------------------------------------------------
   Single-player, single-device, no accounts. gitadora proved localStorage is
   entirely sufficient state for a personal tracker; resist adding a database
   before there is a second player to share it with.

   Every read is defensive: a corrupt or half-written blob must degrade to a
   fresh record rather than white-screening the game.
   ========================================================================== */

import { STORE } from "./config.js";
import { localDateKey } from "./util.js";

const BLANK = () => ({
  version: 1,
  lifetime: {
    runs: 0,
    correct: 0,
    wrong: 0,
    credits: 0,
    bestStreak: 0,
    lifelinesUsed: 0,
    typedRuns: 0,
  },
  best: {},              /* mode -> best score                  */
  categories: {},        /* category -> { seen, correct }       */
  achievements: [],      /* ids unlocked                        */
  daily: {
    lastPlayed: null,    /* YYYY-MM-DD                          */
    streak: 0,
    history: {},         /* date -> { score, correct, total }   */
  },
  prefs: {
    answerMode: "choice",
    sound: true,
    categories: null,    /* null = all                          */
    difficulties: null,
  },
});

function read() {
  try {
    const raw = localStorage.getItem(STORE.key);
    if (!raw) return BLANK();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return BLANK();
    /* Merge onto a blank so a record written by an older build never
       produces undefined lookups downstream. */
    const base = BLANK();
    return {
      ...base,
      ...parsed,
      lifetime: { ...base.lifetime, ...(parsed.lifetime || {}) },
      best: { ...base.best, ...(parsed.best || {}) },
      categories: { ...base.categories, ...(parsed.categories || {}) },
      daily: { ...base.daily, ...(parsed.daily || {}) },
      prefs: { ...base.prefs, ...(parsed.prefs || {}) },
      achievements: Array.isArray(parsed.achievements) ? parsed.achievements : [],
    };
  } catch (err) {
    console.warn("[store] unreadable record, starting fresh", err);
    return BLANK();
  }
}

function write(data) {
  try {
    localStorage.setItem(STORE.key, JSON.stringify(data));
  } catch (err) {
    /* Private browsing, or quota. Losing the record is survivable; crashing
       mid-run is not. */
    console.warn("[store] could not save", err);
  }
}

export const store = {
  data: read(),

  save() { write(this.data); },

  reset() {
    this.data = BLANK();
    this.save();
    return this.data;
  },

  /* ---- Preferences ------------------------------------------------------- */

  pref(key, value) {
    if (value === undefined) return this.data.prefs[key];
    this.data.prefs[key] = value;
    this.save();
    return value;
  },

  /* ---- Recording a finished run ------------------------------------------ */

  /**
   * @param {object} summary the engine's `over` payload
   * @returns {string[]} ids of achievements newly unlocked by this run
   */
  record(summary) {
    const d = this.data;
    const lt = d.lifetime;

    lt.runs += 1;
    lt.correct += summary.correct;
    lt.wrong += summary.wrong;
    lt.credits += summary.score;
    lt.bestStreak = Math.max(lt.bestStreak, summary.bestStreak);
    lt.lifelinesUsed += summary.lifelinesUsed;
    if (summary.answerMode === "typed") lt.typedRuns += 1;

    d.best[summary.mode] = Math.max(d.best[summary.mode] || 0, summary.score);

    for (const h of summary.history) {
      const c = d.categories[h.category] || { seen: 0, correct: 0 };
      c.seen += 1;
      if (h.result === "correct") c.correct += 1;
      d.categories[h.category] = c;
    }

    if (summary.mode === "daily") this._recordDaily(summary);

    const unlocked = this._checkAchievements(summary);
    this.save();
    return unlocked;
  },

  _recordDaily(summary) {
    const d = this.data;
    const today = localDateKey();
    const prev = d.daily.lastPlayed;

    if (prev === today) return;   /* already recorded */

    /* Streak continues only if the previous play was literally yesterday. */
    const yesterday = (() => {
      const dt = new Date();
      dt.setDate(dt.getDate() - 1);
      return localDateKey(dt);
    })();

    d.daily.streak = prev === yesterday ? d.daily.streak + 1 : 1;
    d.daily.lastPlayed = today;
    d.daily.history[today] = {
      score: summary.score,
      correct: summary.correct,
      total: summary.answered,
    };
  },

  /** Has today's Daily Heist already been played? */
  dailyDone() {
    return this.data.daily.lastPlayed === localDateKey();
  },

  dailyResult() {
    return this.data.daily.history[localDateKey()] || null;
  },

  /* ---- Achievements ------------------------------------------------------ */

  _checkAchievements(summary) {
    const d = this.data;
    const have = new Set(d.achievements);
    const newly = [];

    const unlock = (id) => {
      if (have.has(id)) return;
      have.add(id);
      newly.push(id);
    };

    const cleanRun = summary.wrong === 0 && summary.answered > 0;

    if (summary.mode === "vault" && summary.score > 0 &&
        (summary.reason === "banked" || summary.reason === "cleared")) {
      unlock("first-haul");
      if (cleanRun) unlock("clean-vault");
      if (summary.lifelinesUsed === 0) unlock("no-tools");
      if (summary.answerMode === "typed") unlock("typed-true");
    }
    if (summary.mode === "survival" && summary.answered >= 30) unlock("deep-six");
    if (d.lifetime.correct >= 100) unlock("century");

    const cats = Object.entries(d.categories).filter(([, v]) => v.correct > 0);
    if (cats.length >= 12) unlock("polymath");

    for (const h of summary.history) {
      if (h.result !== "correct") continue;
      if (h.doubledDown && h.difficulty === "hard") unlock("double-or");
    }
    /* Speed Demon: a correct answer inside the first 10% of the clock. */
    if (summary.history.some((h) => h.result === "correct" && h.seconds <= 2)) {
      unlock("speed-demon");
    }
    if (d.daily.streak >= 7) unlock("week-streak");

    d.achievements = [...have];
    return newly;
  },

  achievementMeta(id) {
    return STORE.achievements.find((a) => a.id === id) || { id, name: id, hint: "" };
  },

  /* ---- Derived views for the ledger -------------------------------------- */

  accuracy() {
    const { correct, wrong } = this.data.lifetime;
    const total = correct + wrong;
    return total ? correct / total : 0;
  },

  categoryRows() {
    return Object.entries(this.data.categories)
      .map(([name, v]) => ({ name, ...v, pct: v.seen ? v.correct / v.seen : 0 }))
      .sort((a, b) => b.seen - a.seen);
  },
};
