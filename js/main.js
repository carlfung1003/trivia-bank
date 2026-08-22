/* ==========================================================================
   Application controller: boot, screen flow, input, the render loop.
   --------------------------------------------------------------------------
   This is the only module that knows about both the engine and the DOM. It
   subscribes to engine events and translates them into rendering, sound and
   juice. The engine never calls into here.
   ========================================================================== */

import { Bank } from "./bank.js";
import { Game, PHASE, RESULT } from "./engine.js";
import { use as useLifeline, kitState } from "./lifelines.js";
import { MODES, DIFFICULTY, LIFELINES, FX, SCORING } from "./config.js";
import { store } from "./store.js";
import { sound } from "./audio.js";
import { Fx, rollNumber } from "./fx.js";
import { shareText, drawCard, downloadCard, copyText } from "./share.js";
import { localDateKey, formatCredits } from "./util.js";
import * as ui from "./ui.js";

const app = {
  bank: null,
  game: null,
  fx: null,
  raf: null,
  lastFrame: 0,
  lastSummary: null,
  lastMode: "vault",
  heartbeatAt: 0,
  settings: {
    answerMode: store.pref("answerMode") || "choice",
    sound: store.pref("sound") !== false,
    categories: store.pref("categories"),      /* null = all */
    difficulties: store.pref("difficulties"),  /* null = all */
  },
};

/* ==========================================================================
   Boot
   ========================================================================== */

async function boot() {
  app.fx = new Fx({
    canvas: ui.el.fxCanvas,
    shell: ui.el.shell,
    vignette: ui.el.vignette,
    stage: ui.el.stage,
  });

  try {
    app.bank = await Bank.load("data/questions.json");
  } catch (err) {
    console.error("[boot]", err);
    ui.el.bootError.hidden = false;
    ui.el.bootError.textContent =
      `The vault would not open: ${err.message}. ` +
      `If you are opening this file directly, serve it over HTTP instead — ` +
      `ES modules and fetch do not work from file://.`;
    return;
  }

  for (const node of ui.el.bankSize) node.textContent = String(app.bank.size);

  ui.buildDialTicks();
  sound.setEnabled(app.settings.sound);
  wireGlobalInput();
  wireTitle();
  wirePlay();
  wireResults();
  renderTitle();
  ui.showScreen("title");
  exposeDebugApi();
}

/* ==========================================================================
   Title screen
   ========================================================================== */

function renderTitle() {
  ui.renderModes(store, { dailyDone: store.dailyDone(), dailyResult: store.dailyResult() });
  ui.renderCategories(app.bank, app.settings.categories);
  ui.renderDifficulties(app.settings.difficulties);
  ui.renderLedger(store);
  syncSetupSummary();
  syncSegmented(ui.el.answerMode, app.settings.answerMode);
  syncSegmented(ui.el.soundToggle, app.settings.sound ? "on" : "off");
}

function syncSegmented(root, value) {
  for (const btn of root.querySelectorAll("button")) {
    btn.setAttribute("aria-checked", String(btn.dataset.value === value));
  }
}

function syncSetupSummary() {
  const poolSize = app.bank.count({
    categories: app.settings.categories,
    difficulties: app.settings.difficulties,
    choiceOnly: app.settings.answerMode === "choice",
  });
  ui.renderSetupSummary({ ...app.settings, poolSize });
}

function wireTitle() {
  ui.el.modes.addEventListener("click", (e) => {
    const card = e.target.closest(".mode-card");
    if (!card) return;
    sound.unlock();
    startRun(card.dataset.mode);
  });

  ui.el.answerMode.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    app.settings.answerMode = btn.dataset.value;
    store.pref("answerMode", btn.dataset.value);
    syncSegmented(ui.el.answerMode, btn.dataset.value);
    syncSetupSummary();
    sound.unlock();
    sound.tumbler();
  });

  ui.el.soundToggle.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const on = btn.dataset.value === "on";
    app.settings.sound = on;
    store.pref("sound", on);
    syncSegmented(ui.el.soundToggle, btn.dataset.value);
    if (on) { sound.unlock(); sound.setEnabled(true); sound.tumbler(); }
    else sound.setEnabled(false);
  });

  ui.el.categories.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    toggleFilter("categories", chip.dataset.category, app.bank.categories);
  });

  ui.el.difficulties.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    toggleFilter("difficulties", chip.dataset.difficulty, DIFFICULTY.order);
  });

  ui.el.catAll.addEventListener("click", () => {
    app.settings.categories = null;
    store.pref("categories", null);
    ui.renderCategories(app.bank, null);
    syncSetupSummary();
  });

  ui.el.catNone.addEventListener("click", () => {
    /* "Clear" leaves one category on: an empty pool has nothing to draw. */
    app.settings.categories = [app.bank.categories[0]];
    store.pref("categories", app.settings.categories);
    ui.renderCategories(app.bank, app.settings.categories);
    syncSetupSummary();
  });

  ui.el.resetStats.addEventListener("click", (e) => {
    ui.armConfirm(e.currentTarget, {
      label: "Tap again to wipe",
      onConfirm: () => {
        store.reset();
        app.settings.categories = null;
        app.settings.difficulties = null;
        renderTitle();
        ui.toast("Record wiped.");
      },
    });
  });
}

function toggleFilter(key, value, all) {
  const current = app.settings[key] ? [...app.settings[key]] : [...all];
  const at = current.indexOf(value);
  if (at >= 0) current.splice(at, 1);
  else current.push(value);

  /* Never allow an empty selection — it produces an unplayable run. */
  if (!current.length) return;

  const next = current.length === all.length ? null : current;
  app.settings[key] = next;
  store.pref(key, next);

  if (key === "categories") ui.renderCategories(app.bank, next);
  else ui.renderDifficulties(next);
  syncSetupSummary();
  sound.tumbler();
}

/* ==========================================================================
   Run lifecycle
   ========================================================================== */

function startRun(modeId) {
  const mode = MODES[modeId];
  if (!mode) return;

  if (mode.oneAttemptPerDay && store.dailyDone()) {
    const prev = store.dailyResult();
    ui.toast(prev
      ? `Today's heist is done — ${prev.correct}/${prev.total}, ${formatCredits(prev.score)} credits. Back tomorrow.`
      : "Today's heist is already done. Back tomorrow.");
    return;
  }

  app.lastMode = modeId;

  /* The Daily Heist is seeded by the date alone, so every player in the world
     gets the same ten locks in the same order. Every other mode gets a fresh
     random seed per run. */
  const seed = mode.oneAttemptPerDay
    ? `daily::${localDateKey()}`
    : `${modeId}::${Date.now()}::${Math.random().toString(36).slice(2, 9)}`;

  app.game = new Game({
    bank: app.bank,
    mode: modeId,
    seed,
    answerMode: app.settings.answerMode,
    categories: mode.oneAttemptPerDay ? null : app.settings.categories,
    difficulties: mode.oneAttemptPerDay ? null : app.settings.difficulties,
  });

  wireGameEvents(app.game);
  ui.showScreen("play");
  app.fx.clear();
  sound.unlock();
  sound.stopMusic();
  sound.startHum();
  sound.playMusic("bedTension", { gain: 0.18 });

  app.game.start();
  startLoop();
}

function wireGameEvents(game) {
  game.on("question", () => {
    ui.renderQuestion(game);
    ui.renderHud(game);
    ui.renderLadder(game);
    ui.renderKit(kitState(game));
    ui.renderTimer(game);
    sound.tumbler();
  });

  game.on("reveal", (payload) => onReveal(game, payload));

  game.on("haven", ({ total }) => {
    sound.bankIt();
    app.fx.coinRain(28);
    ui.announce(`Safe haven. ${formatCredits(total)} credits locked in.`);
  });

  game.on("lifeline", ({ id, detail }) => onLifeline(game, id, detail));

  game.on("heat", (heat) => {
    ui.setHeat(heat);
    sound.setHeat(heat);
  });

  game.on("over", (summary) => onOver(game, summary));
}

function onReveal(game, { result, correctIndex, correctAnswer, given, points, streak }) {
  ui.revealAnswer(game, { result, correctIndex, correctAnswer, given });

  /* Where the answer physically happened, for particles and popups. */
  const source = game.answerMode === "choice"
    ? document.querySelector(`.option[data-index="${correctIndex}"]`)
    : ui.el.typedForm;

  if (result === RESULT.CORRECT) {
    app.fx.hitPause(FX.hitPauseMs);
    app.fx.flash("correct");
    sound.correct(streak);

    app.fx.burstAt(source, {
      count: streak >= 4 ? FX.particleCountBig : FX.particleCount,
      hue: 41,
      speed: 5 + Math.min(streak, 6),
    });

    /* The earned number travels to the board that holds it. */
    if (points > 0) {
      app.fx.popup(`+${formatCredits(points)}`, source, ui.el.creditBoard, "gain");
    }
    /* Blitz pays in seconds as well as credits — show both. */
    if (game.mode.correctBonusSeconds) {
      app.fx.popup(`+${game.mode.correctBonusSeconds}s`, source, ui.el.timer, "time");
    }
    if (streak >= 3) {
      const mult = SCORING.streakLadder[Math.min(streak, SCORING.streakLadder.length - 1)];
      app.fx.popup(`\u00d7${mult}`, ui.el.streak, ui.el.streak, "gain");
    }
  } else {
    app.fx.hitPause(FX.hitPauseWrongMs);
    app.fx.shake(FX.shakeMagnitude, FX.shakeMs);
    app.fx.flash("wrong");
    if (result === RESULT.TIMEOUT) sound.timeout();
    else sound.wrong();

    if (points < 0) {
      app.fx.popup(formatCredits(points), source, ui.el.creditBoard, "loss");
    }
    if (game.mode.wrongPenaltySeconds) {
      app.fx.popup(`-${game.mode.wrongPenaltySeconds}s`, source, ui.el.timer, "loss");
    }
  }

  ui.renderHud(game);
  ui.renderLadder(game);
  ui.renderKit(kitState(game));
}

function onLifeline(game, id, detail) {
  switch (id) {
    case "drill":
      sound.drill();
      ui.renderBurn(game, detail.removed);
      app.fx.shake(4, 240);
      break;
    case "wiretap":
      sound.tumbler();
      ui.renderPoll(game);
      break;
    case "freeze":
      sound.tick();
      ui.renderTimer(game);
      break;
    case "bypass":
      sound.tumbler();
      ui.renderQuestion(game);
      ui.renderTimer(game);
      break;
    case "doubledown":
      sound.heartbeat();
      ui.armTool("doubledown", true);
      ui.announce("Double down armed. Twice the payout, or the whole pot.");
      break;
  }
  ui.renderKit(kitState(game));
  ui.renderHud(game);
}

function onOver(game, summary) {
  stopLoop();
  sound.stopHum();
  ui.setHeat(0);

  const previousBest = store.data.best[summary.mode] || 0;
  const isRecord = summary.score > previousBest && summary.score > 0;

  const unlocked = store.record(summary);
  app.lastSummary = summary;

  const good = summary.reason === "banked" || summary.reason === "cleared" || summary.reason === "exhausted";
  if (good && summary.score > 0) {
    sound.vaultOpen();
    app.fx.coinRain(90);
  } else {
    sound.lockdown();
    app.fx.shake(FX.shakeMagnitude * 1.2, 520);
  }

  ui.showScreen("done");
  ui.renderResults(summary, { unlocked, store, isRecord });

  const isDaily = summary.mode === "daily";
  ui.renderShare(summary, { text: shareText(summary), isDaily });

  /* Roll the headline number up rather than snapping it. */
  ui.el.resultScore.textContent = "0";
  rollNumber(ui.el.resultScore, 0, summary.score, 900, (n) => formatCredits(n));

  ui.el.againBtn.hidden = isDaily;
}

/* ==========================================================================
   Render loop
   ========================================================================== */

function startLoop() {
  stopLoop();
  app.lastFrame = performance.now();
  const frame = (now) => {
    const dt = Math.min((now - app.lastFrame) / 1000, 0.25);
    app.lastFrame = now;

    const game = app.game;
    if (game && game.state.phase === PHASE.ASKING) {
      game.tick(dt);
      ui.renderTimer(game);
      /* Blitz's headline number is its clock, so the HUD must track it. */
      if (game.mode.clock) ui.renderHud(game);

      /* Heartbeat pulse while the clock is critical. */
      if (game.clockFraction <= FX.criticalClockFraction && now - app.heartbeatAt > 780) {
        app.heartbeatAt = now;
        sound.heartbeat();
      }
    }
    app.raf = requestAnimationFrame(frame);
  };
  app.raf = requestAnimationFrame(frame);
}

function stopLoop() {
  if (app.raf) cancelAnimationFrame(app.raf);
  app.raf = null;
}

/* ==========================================================================
   Play-screen input
   ========================================================================== */

function wirePlay() {
  ui.el.options.addEventListener("click", (e) => {
    const btn = e.target.closest(".option");
    if (!btn || btn.disabled) return;
    submitChoice(Number(btn.dataset.index));
  });

  ui.el.typedForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const value = ui.el.typedInput.value.trim();
    if (!value || !app.game || app.game.state.phase !== PHASE.ASKING) return;
    app.game.answer(value);
  });

  ui.el.nextBtn.addEventListener("click", () => {
    if (!app.game) return;
    app.game.next();
  });

  ui.el.kit.addEventListener("click", (e) => {
    const btn = e.target.closest(".tool");
    if (!btn || btn.disabled) return;
    fireLifeline(btn.dataset.tool);
  });

  ui.el.bankBtn.addEventListener("click", () => {
    if (!app.game) return;
    app.game.bankIt();
  });

  ui.el.quit.addEventListener("click", (e) => {
    const game = app.game;
    if (!game || game.state.phase === PHASE.OVER) { goHome(); return; }

    /* Nothing at stake — just leave, no ceremony. */
    const atRisk = game.state.pot > 0;
    if (!atRisk) { abandon(); return; }

    const btn = e.currentTarget;
    if (btn.dataset.armed === "true") {
      clearTimeout(Number(btn.dataset.timer));
      btn.dataset.armed = "false";
      abandon();
      return;
    }
    btn.dataset.armed = "true";
    ui.toast(`Abandon the heist? ${formatCredits(game.state.pot)} unbanked credits are lost. Press again to confirm.`);
    btn.dataset.timer = String(setTimeout(() => { btn.dataset.armed = "false"; }, 3500));
  });
}

function submitChoice(index) {
  const game = app.game;
  if (!game || game.state.phase !== PHASE.ASKING) return;
  game.answer(index);
}

function fireLifeline(id) {
  const game = app.game;
  if (!game) return;
  const result = useLifeline(game, id);
  if (!result) {
    /* Give a reason rather than failing silently. */
    const def = LIFELINES[id];
    if (def?.requiresChoice && game.answerMode !== "choice") {
      ui.announce(`${def.name} needs multiple choice.`);
    }
  }
}

/* ==========================================================================
   Results-screen input
   ========================================================================== */

function wireResults() {
  ui.el.againBtn.addEventListener("click", () => startRun(app.lastMode));
  ui.el.homeBtn.addEventListener("click", goHome);

  ui.el.copyShare.addEventListener("click", async () => {
    const text = ui.el.share.dataset.text || "";
    const ok = await copyText(text);
    ui.flashButton(ui.el.copyShare, ok ? "Copied" : "Copy failed");
  });

  ui.el.downloadCardBtn.addEventListener("click", () => {
    if (!app.lastSummary) return;
    downloadCard(ui.el.shareCanvas, app.lastSummary);
    ui.flashButton(ui.el.downloadCardBtn, "Saved");
  });
}

function abandon() {
  stopLoop();
  sound.stopHum();
  ui.setHeat(0);
  goHome();
}

function goHome() {
  sound.stopMusic();
  sound.playMusic("themeTitle", { gain: 0.22 });
  app.game = null;
  stopLoop();
  app.fx.clear();
  renderTitle();
  ui.showScreen("title");
}

/* ==========================================================================
   Keyboard
   ========================================================================== */

function wireGlobalInput() {
  /* Any first gesture unlocks audio — browsers require it. */
  const unlockOnce = () => sound.unlock();
  window.addEventListener("pointerdown", unlockOnce, { once: true });
  window.addEventListener("keydown", unlockOnce, { once: true });

  window.addEventListener("keydown", (e) => {
    const screen = document.body.dataset.screen;
    const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;

    if (screen === "play" && app.game) {
      const phase = app.game.state.phase;

      if (phase === PHASE.REVEALED && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        app.game.next();
        return;
      }

      if (phase !== PHASE.ASKING) return;

      /* Answer keys: 1-4 and A-D, but never while typing an answer. */
      if (!typing && app.game.answerMode === "choice") {
        const n = "1234".indexOf(e.key);
        const a = "abcd".indexOf(e.key.toLowerCase());
        const index = n >= 0 ? n : a;
        if (index >= 0 && index < app.game.state.options.length) {
          e.preventDefault();
          submitChoice(index);
          return;
        }
      }

      /* Lifeline hotkeys — also suppressed while typing. */
      if (!typing) {
        for (const def of Object.values(LIFELINES)) {
          if (e.key.toLowerCase() === def.key && app.game.state.kit[def.id]) {
            e.preventDefault();
            fireLifeline(def.id);
            return;
          }
        }
      }

      if (e.key === "Escape") {
        e.preventDefault();
        ui.el.quit.click();
      }
    }

    if (screen === "done" && e.key === "Enter" && !typing) {
      e.preventDefault();
      if (!ui.el.againBtn.hidden) ui.el.againBtn.click();
      else ui.el.homeBtn.click();
    }
  });

  /* Pausing is not a feature, but leaving the tab should not burn the clock
     in a mode where time is the whole point. */
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopLoop();
    else if (app.game && app.game.state.phase === PHASE.ASKING) startLoop();
  });
}

/* ==========================================================================
   Debug API
   --------------------------------------------------------------------------
   Exposing the simulation is what makes a browser game testable by an agent
   or a headless driver: real gameplay, no pixel-hunting, no reliance on
   wall-clock waits. window.__game.fastForward() runs the clock without a
   render, so a timeout path can be exercised in milliseconds.
   ========================================================================== */

function exposeDebugApi() {
  window.__game = {
    get game() { return app.game; },
    get state() { return app.game?.state ?? null; },
    get bank() { return app.bank; },
    store,

    start(mode = "vault", opts = {}) {
      Object.assign(app.settings, opts);
      startRun(mode);
      return app.game?.state ?? null;
    },

    /** Answer by option index, by text, or "correct" / "wrong". */
    answer(what = "correct") {
      const g = app.game;
      if (!g || g.state.phase !== PHASE.ASKING) return null;
      if (what === "correct") {
        return g.answer(g.answerMode === "choice" ? g.state.correctIndex : g.state.question.answer);
      }
      if (what === "wrong") {
        if (g.answerMode !== "choice") return g.answer("__deliberately wrong__");
        const wrong = g.state.options
          .map((_, i) => i)
          .find((i) => i !== g.state.correctIndex && !g.state.removed.includes(i));
        return g.answer(wrong ?? 0);
      }
      return g.answer(what);
    },

    next() { app.game?.next(); return app.game?.state ?? null; },
    lifeline(id) { return app.game ? useLifeline(app.game, id) : null; },
    bankIt() { return app.game?.bankIt() ?? false; },

    /** Advance the simulation clock without waiting on real time. */
    fastForward(seconds = 60, step = 0.25) {
      const g = app.game;
      if (!g) return null;
      for (let t = 0; t < seconds && g.state.phase === PHASE.ASKING; t += step) g.tick(step);
      ui.renderTimer(g);
      ui.renderHud(g);
      return g.state;
    },

    /** Play a whole run with a scripted accuracy. Returns the summary. */
    autoplay({ accuracy = 1, maxSteps = 4000 } = {}) {
      const g = app.game;
      if (!g) return null;
      let summary = null;
      const off = g.on("over", (s) => { summary = s; });
      let steps = 0;
      while (g.state.phase !== PHASE.OVER && steps++ < maxSteps) {
        if (g.state.phase === PHASE.ASKING) {
          g.tick(0.4);
          if (g.state.phase === PHASE.ASKING) {
            this.answer(Math.random() < accuracy ? "correct" : "wrong");
          }
        } else if (g.state.phase === PHASE.REVEALED) {
          g.next();
        }
      }
      off();
      return summary;
    },

    modes: Object.keys(MODES),
    version: "1.0.0",
  };
}

/* ==========================================================================
   Boot guard
   --------------------------------------------------------------------------
   A no-build ES-module site has one failure mode worth handling explicitly:
   MIXED MODULE VERSIONS. index.html versions its entry point (main.js?v=N)
   but a module's own imports carry no query string, so a browser holding an
   over-cached ./ui.js will happily load a fresh main.js against a stale
   dependency. The symptom is a TypeError during boot and a blank screen.

   This happened in production during a fifteen-minute window when JS was
   still served `immutable` — and once a browser has cached under that
   header, correcting the header does not evict the entry.

   So instead of a white page: catch it, say what it is, and offer a button
   that force-refetches every module and reloads. Self-healing beats a bug
   report that reads "the site is blank".
   ========================================================================== */

const MODULES = [
  "main", "ui", "fx", "audio", "engine", "distractors",
  "config", "bank", "store", "share", "lifelines", "util",
];
const STYLES = ["tokens", "base", "material", "game", "fx"];

async function purgeAndReload() {
  try {
    await Promise.all([
      ...MODULES.map((m) => fetch(`js/${m}.js`, { cache: "reload" })),
      ...STYLES.map((c) => fetch(`css/${c}.css`, { cache: "reload" })),
      fetch("data/questions.json", { cache: "reload" }),
    ]);
  } catch { /* offline, or the fetch itself failed — reload anyway */ }
  location.reload();
}

function showBootFailure(err) {
  console.error("[boot]", err);
  const box = ui.el.bootError;
  if (!box) return;
  box.hidden = false;
  box.textContent = "";

  const msg = document.createElement("p");
  msg.textContent =
    "The vault jammed on a stale file — your browser is holding an old copy " +
    "of part of the game. One refresh clears it.";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn btn--primary";
  btn.textContent = "Clear and reload";
  btn.style.marginTop = "1rem";
  btn.addEventListener("click", purgeAndReload, { once: true });

  const detail = document.createElement("p");
  detail.style.cssText = "margin-top:1rem;opacity:0.55;font-size:0.72rem";
  detail.textContent = String(err && err.message ? err.message : err);

  box.append(msg, btn, detail);
}

/* ---- Go ------------------------------------------------------------------- */

function start() {
  try {
    const result = boot();
    if (result && typeof result.catch === "function") result.catch(showBootFailure);
  } catch (err) {
    showBootFailure(err);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}
