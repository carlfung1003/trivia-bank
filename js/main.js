/* ==========================================================================
   Application controller: boot, screen flow, input, the render loop.
   --------------------------------------------------------------------------
   This is the only module that knows about both the engine and the DOM. It
   subscribes to engine events and translates them into rendering, sound and
   juice. The engine never calls into here.
   ========================================================================== */

import { Bank } from "./bank.js";
import { Game, PHASE, RESULT } from "./engine.js";
import { BoardGame, BPHASE } from "./jeopardy.js";
import * as board from "./board-ui.js";
import { SurveyGame, SPHASE } from "./survey.js";
import * as street from "./street-ui.js";
import { use as useLifeline, kitState } from "./lifelines.js";
import { MODES, DIFFICULTY, LIFELINES, FX, SCORING, BOARD, STREET } from "./config.js";
import { store } from "./store.js";
import { sound } from "./audio.js";
import { Fx, rollNumber } from "./fx.js";
import { shareText, drawCard, downloadCard, copyText } from "./share.js";
import { localDateKey, formatCredits } from "./util.js";
import * as ui from "./ui.js";

const TIER_BLURB = {
  medium: "The locks get real",
  hard:   "No more easy money",
};

const LOCK_IN_MS = 260;   /* anticipation before the verdict lands */

const app = {
  lastTier: null,
  revealTimer: null,
  revealPending: false,
  paused: false,
  doorAngle: 0,
  bank: null,
  game: null,
  boardData: null,
  boardGame: null,
  streetData: null,
  streetGame: null,
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

  /* The Board runs off its own clue file. A missing or broken one must not
     take the vault down with it — the mode card simply does not appear. */
  try {
    const res = await fetch("data/jeopardy.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    app.boardData = await res.json();
    if (!Array.isArray(app.boardData?.categories) || app.boardData.categories.length < BOARD.columns) {
      throw new Error(`needs at least ${BOARD.columns} category packs`);
    }
  } catch (err) {
    console.warn("[boot] The Board is unavailable:", err.message);
    app.boardData = null;
  }

  try {
    const res = await fetch("data/surveys.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    app.streetData = await res.json();
    if (!Array.isArray(app.streetData?.surveys) || app.streetData.surveys.length < STREET.rounds.length) {
      throw new Error(`needs at least ${STREET.rounds.length} surveys`);
    }
  } catch (err) {
    console.warn("[boot] The Street is unavailable:", err.message);
    app.streetData = null;
  }

  ui.buildDialTicks();
  board.buildBoardDial();
  street.buildStreetDial();
  sound.setEnabled(app.settings.sound);
  wireGlobalInput();
  wireTitle();
  wirePlay();
  wireBoard();
  wireStreet();
  wireResults();
  renderTitle();
  ui.showScreen("title");
  exposeDebugApi();
}

/* ==========================================================================
   Title screen
   ========================================================================== */

function renderTitle() {
  ui.renderModes(store, {
    dailyDone: store.dailyDone(),
    dailyResult: store.dailyResult(),
    boardAvailable: !!app.boardData,
    streetAvailable: !!app.streetData,
  });
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
    typedOnly: app.settings.answerMode === "typed",
  });
  ui.renderSetupSummary({ ...app.settings, poolSize });
}

function wireTitle() {
  ui.el.modes.addEventListener("click", (e) => {
    const card = e.target.closest(".mode-card");
    if (!card) return;
    sound.unlock();
    if (card.dataset.mode === BOARD.id) startBoard();
    else if (card.dataset.mode === STREET.id) startStreet();
    else startRun(card.dataset.mode);
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
   Haptics
   --------------------------------------------------------------------------
   Cheap and disproportionately effective on a phone, where there is no
   keyboard travel and no speaker worth relying on. Silently absent on
   desktop and on iOS Safari, which does not implement the API — hence the
   guard rather than a feature check the caller has to make.
   ========================================================================== */

function haptic(pattern) {
  if (!app.settings.sound) return;   /* sound off means feedback off */
  try { navigator.vibrate?.(pattern); } catch { /* unsupported */ }
}

/* ==========================================================================
   Run lifecycle
   ========================================================================== */

/** Every screen change goes through the door, with the matching cue. */
function toScreen(name, swap) {
  return ui.curtainSwap(
    () => {
      swap?.();
      ui.showScreen(name);
    },
    (beat) => (beat === "close" ? sound.doorShut() : sound.doorOpen())
  );
}

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
  app.lastTier = null;
  app.paused = false;
  ui.el.pause.hidden = true;

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
  sound.unlock();

  toScreen("play", () => {
    app.fx.clear();
    sound.stopMusic();
    /* The hum only stands in when there is no bed to play. Running both put
       two bass sources on top of each other. */
    if (!sound.playMusic("bedTension", { gain: 0.18 })) sound.startHum();
    app.game.start();
  }).then(() => startLoop());
}

/* ==========================================================================
   The Board
   --------------------------------------------------------------------------
   A parallel lifecycle to startRun(), against a different engine and a
   different screen. Deliberately not folded into the one above: the two share
   the door transition, the sound bus and the fx layer, and nothing else. Every
   `if (isBoard)` avoided here is a branch that cannot break Vault Run.
   ========================================================================== */

function startBoard() {
  if (!app.boardData) {
    ui.toast("The clue file did not load, so The Board is closed. Reload the page.");
    return;
  }

  app.lastMode = BOARD.id;
  app.paused = false;
  ui.el.pause.hidden = true;

  app.boardGame = new BoardGame({
    data: app.boardData,
    seed: `board::${Date.now()}::${Math.random().toString(36).slice(2, 9)}`,
  });

  wireBoardEvents(app.boardGame);
  sound.unlock();

  toScreen("board", () => {
    app.fx.clear();
    sound.stopMusic();
    if (!sound.playMusic("bedTension", { gain: 0.16 })) sound.startHum();
    app.boardGame.start();
  }).then(() => startBoardLoop());
}

function wireBoardEvents(game) {
  const paint = () => {
    board.renderBoard(game);
    board.renderHud(game);
    board.showGrid();
  };

  game.on("round", ({ name, round }) => {
    paint();
    /* A new floor is a scene change, not a stat change: the values double and
       the categories are all different. Say so. */
    if (round > 1) {
      ui.banner(name, "Every value doubles", "tier", 2200);
      sound.vaultOpen();
    }
  });

  game.on("board", paint);

  game.on("wildcard", ({ category, min, max }) => {
    sound.heartbeat();
    app.fx.shake(5, 300);
    haptic([20, 40, 60]);
    ui.banner("Wildcard", "Name your stake", "haven", 1800);
    board.showWager({ category, min, max, value: min, kind: "wildcard" });
    board.el.wagerInput.focus();
  });

  game.on("final", ({ category, max }) => {
    sound.lockdown();
    ui.banner("The last lock", "One clue, one stake", "tier", 2400);
    board.showWager({ category, min: 0, max, value: 0, kind: "final" });
    /* The rail still read "0 clues left" here — true, and the least useful
       thing it could say at the moment the round changed under it. */
    board.renderHud(game);
    board.el.wagerInput.focus();
  });

  game.on("clue", (payload) => {
    board.showClue(game, payload);
    board.renderHud(game);
    sound.tumbler();
    board.focusInput();
    startBoardLoop();
  });

  game.on("reveal", (payload) => onBoardReveal(game, payload));

  game.on("heat", (heat) => {
    ui.setHeat(heat);
    sound.setHeat(heat);
  });

  game.on("over", (summary) => onBoardOver(game, summary));
}

function onBoardReveal(game, payload) {
  stopLoop();
  const { result, delta } = payload;
  const good = result === "correct";

  if (good) {
    sound.correct(game.state.streak);
    app.fx.burstAt(board.el.slab, { count: payload.final ? FX.particleCountBig : FX.particleCount });
    app.fx.hitPause(FX.hitPauseMs);
    haptic(delta > 0 ? [18, 30, 40] : 18);
    nudgeDoor(1);
  } else if (result === "timeout" && delta === 0) {
    /* A pass is not a failure. No shake, no klaxon — just move on. */
    sound.tick();
  } else {
    sound.wrong();
    app.fx.shake(FX.shakeMagnitude, FX.shakeMs);
    app.fx.hitPause(FX.hitPauseWrongMs);
    haptic([70, 40, 90]);
    nudgeDoor(-1);
  }

  board.showVerdict(payload);
  board.renderHud(game);
  board.renderBoard(game);
  board.el.next.focus();
}

function onBoardOver(game, summary) {
  stopLoop();
  app.paused = false;
  ui.el.pause.hidden = true;
  sound.stopHum();
  ui.setHeat(0);

  const previousBest = store.data.best[BOARD.id] || 0;
  const isRecord = summary.score > previousBest && summary.score > 0;
  const unlocked = store.record(summary);
  app.lastSummary = summary;
  app.boardGame = null;

  const won = summary.score > 0;
  if (won) app.fx.coinRain(90);
  else app.fx.shake(FX.shakeMagnitude * 1.2, 520);
  haptic(won ? [30, 60, 30, 60, 90] : [90, 50, 120]);

  toScreen("done", () => {
    ui.renderResults(summary, { unlocked, store, isRecord });
    ui.renderShare(summary, { text: shareText(summary), isDaily: false });
    ui.el.againBtn.hidden = false;
    ui.el.resultScore.textContent = "0";
  }).then(() => {
    if (won) sound.vaultOpen();
    else sound.lockdown();
    rollNumber(ui.el.resultScore, 0, summary.score, 1100, (n) => `$${formatCredits(n)}`);
    if (won) app.fx.coinRain(50);
  });
}

function startBoardLoop() {
  stopLoop();
  app.lastFrame = performance.now();
  const frame = (now) => {
    const dt = Math.min((now - app.lastFrame) / 1000, 0.25);
    app.lastFrame = now;

    const game = app.boardGame;
    const s = game?.state;
    const live = s && (s.phase === BPHASE.ASKING || (s.phase === BPHASE.FINAL && s.finalArmed));
    if (live) {
      game.tick(dt);
      board.renderTimer(game);
      if (game.clockFraction <= BOARD.criticalClockFraction && now - app.heartbeatAt > 780) {
        app.heartbeatAt = now;
        sound.heartbeat();
      }
    }
    app.raf = requestAnimationFrame(frame);
  };
  app.raf = requestAnimationFrame(frame);
}

function wireBoard() {
  board.el.grid.addEventListener("click", (e) => {
    const cell = e.target.closest(".board-cell");
    if (!cell || cell.disabled || !app.boardGame) return;
    sound.tumbler();
    app.boardGame.pick(Number(cell.dataset.col), Number(cell.dataset.row));
  });

  board.el.wagerForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const game = app.boardGame;
    if (!game) return;
    const value = Number(board.el.wagerInput.value);
    if (game.state.phase === BPHASE.WAGER) game.setWager(value);
    else if (game.state.phase === BPHASE.FINAL) game.setFinalWager(value);
  });

  board.el.wagerQuick.addEventListener("click", (e) => {
    const chip = e.target.closest(".wager__chip");
    if (!chip) return;
    board.el.wagerInput.value = chip.dataset.wager;
    sound.tick();
  });

  board.el.form.addEventListener("submit", (e) => {
    e.preventDefault();
    const game = app.boardGame;
    const value = board.el.input.value.trim();
    if (!value || !game) return;
    const s = game.state;
    if (s.phase !== BPHASE.ASKING && !(s.phase === BPHASE.FINAL && s.finalArmed)) return;
    game.answer(value);
  });

  board.el.pass.addEventListener("click", () => {
    app.boardGame?.pass();
  });

  board.el.next.addEventListener("click", () => {
    app.boardGame?.next();
  });

  board.el.quit.addEventListener("click", (e) => {
    const game = app.boardGame;
    if (!game) { goHome(); return; }
    ui.armConfirm(e.currentTarget, {
      label: `Leave with $${formatCredits(game.state.score)}? Tap again`,
      onConfirm: () => {
        stopLoop();
        sound.stopHum();
        ui.setHeat(0);
        app.boardGame = null;
        goHome();
      },
    });
  });
}

/* ==========================================================================
   The Street
   --------------------------------------------------------------------------
   Third lifecycle, third engine, third screen. Shares the door, the sound bus
   and the fx layer with the other two and nothing else.
   ========================================================================== */

function startStreet() {
  if (!app.streetData) {
    ui.toast("The survey file did not load, so The Street is closed. Reload the page.");
    return;
  }

  app.lastMode = STREET.id;
  app.paused = false;
  ui.el.pause.hidden = true;

  app.streetGame = new SurveyGame({
    data: app.streetData,
    seed: `street::${Date.now()}::${Math.random().toString(36).slice(2, 9)}`,
  });

  wireStreetEvents(app.streetGame);
  sound.unlock();

  toScreen("street", () => {
    app.fx.clear();
    street.hideCard();
    sound.stopMusic();
    if (!sound.playMusic("bedTension", { gain: 0.16 })) sound.startHum();
    app.streetGame.start();
  }).then(() => startStreetLoop());
}

function wireStreetEvents(game) {
  game.on("round", ({ prompt, round, multiplier }) => {
    street.hideCard();
    street.setPrompt(prompt);
    street.renderBoard(game);
    street.renderHud(game);
    street.renderTimer(game);
    street.resetHint();
    street.setInputEnabled(true);
    street.focusInput();
    sound.tumbler();

    /* The multiplier is the reason to keep playing, and it is invisible if
       nobody says it out loud. */
    if (multiplier > 1 && round > 1) {
      ui.banner(multiplier === 3 ? "Triple" : "Double", "Every share counts more", "tier", 2000);
    }
    startStreetLoop();
  });

  game.on("guess", (payload) => onStreetGuess(game, payload));

  game.on("roundEnd", (payload) => onStreetRoundEnd(game, payload));

  game.on("heat", (heat) => {
    ui.setHeat(heat);
    sound.setHeat(heat);
  });

  game.on("over", (summary) => onStreetOver(game, summary));
}

function onStreetGuess(game, payload) {
  const { verdict, rank } = payload;

  if (verdict === "hit") {
    /* The top answer is the one everyone is chasing — it gets the big cue. */
    sound.correct(rank === 1 ? 4 : 1);
    app.fx.burstAt(street.el.board, { count: rank === 1 ? FX.particleCountBig : FX.particleCount });
    app.fx.hitPause(FX.hitPauseMs);
    haptic(rank === 1 ? [20, 40, 20, 40, 60] : [18, 30]);
    nudgeDoor(1);
  } else if (verdict === "repeat") {
    sound.tick();
  } else {
    sound.wrong();
    app.fx.shake(FX.shakeMagnitude * 0.8, FX.shakeMs);
    haptic([70, 40, 90]);
    nudgeDoor(-1);
  }

  street.showGuess(payload);
  street.renderBoard(game);
  street.renderHud(game);
  street.focusInput();
}

function onStreetRoundEnd(game, payload) {
  stopLoop();
  street.setInputEnabled(false);
  street.renderBoard(game, { revealAll: true });
  street.renderHud(game);

  const kept = payload.reason === "swept" || payload.reason === "banked";
  if (kept) {
    sound.bankIt();
    app.fx.coinRain(payload.reason === "swept" ? 60 : 34);
    haptic([20, 40, 20, 40, 60]);
  } else {
    sound.lockdown();
    app.fx.shake(FX.shakeMagnitude * 1.2, 520);
    haptic([90, 50, 120]);
  }

  street.showCard(payload);
}

function onStreetOver(game, summary) {
  stopLoop();
  app.paused = false;
  ui.el.pause.hidden = true;
  sound.stopHum();
  ui.setHeat(0);
  street.hideCard();

  const previousBest = store.data.best[STREET.id] || 0;
  const isRecord = summary.score > previousBest && summary.score > 0;
  const unlocked = store.record(summary);
  app.lastSummary = summary;
  app.streetGame = null;

  const won = summary.score > 0;
  if (won) app.fx.coinRain(90);
  else app.fx.shake(FX.shakeMagnitude * 1.2, 520);
  haptic(won ? [30, 60, 30, 60, 90] : [90, 50, 120]);

  toScreen("done", () => {
    ui.renderResults(summary, { unlocked, store, isRecord });
    ui.renderShare(summary, { text: shareText(summary), isDaily: false });
    ui.el.againBtn.hidden = false;
    ui.el.resultScore.textContent = "0";
  }).then(() => {
    if (won) sound.vaultOpen();
    else sound.lockdown();
    rollNumber(ui.el.resultScore, 0, summary.score, 1100, (n) => formatCredits(n));
    if (won) app.fx.coinRain(50);
  });
}

function startStreetLoop() {
  stopLoop();
  app.lastFrame = performance.now();
  const frame = (now) => {
    const dt = Math.min((now - app.lastFrame) / 1000, 0.25);
    app.lastFrame = now;

    const game = app.streetGame;
    if (game && game.state.phase === SPHASE.ASKING) {
      game.tick(dt);
      street.renderTimer(game);
      if (game.clockFraction <= STREET.criticalClockFraction && now - app.heartbeatAt > 780) {
        app.heartbeatAt = now;
        sound.heartbeat();
      }
    }
    app.raf = requestAnimationFrame(frame);
  };
  app.raf = requestAnimationFrame(frame);
}

function wireStreet() {
  street.el.form.addEventListener("submit", (e) => {
    e.preventDefault();
    const game = app.streetGame;
    const value = street.el.input.value.trim();
    if (!value || !game || game.state.phase !== SPHASE.ASKING) return;
    game.guess(value);
  });

  street.el.bank.addEventListener("click", () => {
    app.streetGame?.bank();
  });

  street.el.next.addEventListener("click", () => {
    app.streetGame?.next();
  });

  street.el.quit.addEventListener("click", (e) => {
    const game = app.streetGame;
    if (!game) { goHome(); return; }
    const atRisk = game.state.pot;
    if (!atRisk) { leaveStreet(); return; }
    ui.armConfirm(e.currentTarget, {
      label: `Leave ${formatCredits(atRisk)} on the table? Tap again`,
      onConfirm: leaveStreet,
    });
  });
}

function leaveStreet() {
  stopLoop();
  sound.stopHum();
  ui.setHeat(0);
  street.hideCard();
  app.streetGame = null;
  goHome();
}

function wireGameEvents(game) {
  game.on("question", () => {
    /* Cancel any verdict still waiting on its anticipation beat. Without
       this, advancing fast lets a stale reveal paint correct/wrong states
       onto the options of the question that replaced it. */
    clearTimeout(app.revealTimer);
    app.revealTimer = null;
    app.revealPending = false;

    /* Announce a difficulty escalation the first time each tier appears —
     the ramp is invisible otherwise, and crossing into Federal territory
     should feel like a decision point rather than a quiet stat change. */
    const diff = game.state.question?.difficulty;
    if (diff && diff !== app.lastTier) {
      if (app.lastTier !== null && DIFFICULTY.order.indexOf(diff) > DIFFICULTY.order.indexOf(app.lastTier)) {
        ui.banner(`${DIFFICULTY.label[diff]} territory`, TIER_BLURB[diff] || "", "tier", 1800);
        sound.timeout();
      }
      app.lastTier = diff;
    }

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
    haptic([20, 40, 20, 40, 60]);
    ui.banner("Haven secured", `${formatCredits(total)} locked in`, "haven", 2200);
  });

  game.on("lifeline", ({ id, detail }) => onLifeline(game, id, detail));

  game.on("heat", (heat) => {
    ui.setHeat(heat);
    sound.setHeat(heat);
  });

  game.on("over", (summary) => onOver(game, summary));
}

function onReveal(game, { result, correctIndex, correctAnswer, given, points, streak, close }) {
  /* Where the answer physically happened, for particles and popups. */
  const source = game.answerMode === "choice"
    ? document.querySelector(`.option[data-index="${given}"]`)
      || document.querySelector(`.option[data-index="${correctIndex}"]`)
    : ui.el.typedForm;

  /* ---- The anticipation beat --------------------------------------------
     The engine has already resolved; only the RENDERING waits. Revealing on
     the same frame as the press reads as a form submit. A short hold — the
     key seats, a tumbler turns, the rung fills — reads as a mechanism
     deciding, which is the whole conceit of the game.

     Kept short (LOCK_IN_MS) because it is paid on every single question, and
     skipped entirely under reduced motion. */
  ui.lockIn(game, given);
  sound.tumbler();
  haptic(12);

  const land = () => {
    ui.revealAnswer(game, { result, correctIndex, correctAnswer, given, close });

    if (result === RESULT.CORRECT) {
      app.fx.hitPause(FX.hitPauseMs);
      app.fx.flash("correct");
      sound.correct(streak);
      haptic([18, 30, 42]);
      nudgeDoor(1);

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
      /* Streak milestones get a callout, but only on the way up. */
      if (streak === 3 || streak === 5 || streak === 8) {
        ui.banner(`${streak} in a row`, streak >= 8 ? "Untouchable" : "On a run", "streak", 1500);
      }
    } else {
      app.fx.hitPause(FX.hitPauseWrongMs);
      app.fx.shake(FX.shakeMagnitude, FX.shakeMs);
      app.fx.flash("wrong");
      nudgeDoor(-1);
      if (result === RESULT.TIMEOUT) { sound.timeout(); haptic([140]); }
      else { sound.wrong(); haptic([70, 40, 90]); }

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
  };

  const delay = ui.reducedMotion() ? 0 : LOCK_IN_MS;
  if (delay <= 0) {
    land();
  } else {
    app.revealPending = true;
    clearTimeout(app.revealTimer);
    app.revealTimer = setTimeout(() => {
      app.revealPending = false;
      land();
    }, delay);
  }
}

/* The background door turns a notch on a hit and jolts on a miss, so the
   thing the whole game is named after actually responds to play. */
function nudgeDoor(direction) {
  app.doorAngle = (app.doorAngle || 0) + direction * (3 + Math.random() * 2);
  document.documentElement.style.setProperty("--door-rot", `${app.doorAngle.toFixed(2)}deg`);
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
    case "etch":
      sound.drill();
      ui.renderIntel(game);
      haptic(18);
      ui.announce(`The answer starts with ${detail.letter}.`);
      break;
    case "informant":
      sound.tumbler();
      ui.renderIntel(game);
      haptic([12, 30, 12]);
      ui.announce(`Informant: ${detail.hint}`);
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
  app.paused = false;
  ui.el.pause.hidden = true;
  sound.stopHum();
  ui.setHeat(0);

  const previousBest = store.data.best[summary.mode] || 0;
  const isRecord = summary.score > previousBest && summary.score > 0;

  const unlocked = store.record(summary);
  app.lastSummary = summary;

  const good = summary.reason === "banked" || summary.reason === "cleared" || summary.reason === "exhausted";
  const won = good && summary.score > 0;
  const isDaily = summary.mode === "daily";

  /* The outcome is punctuated on the outgoing screen, where the player is
     still looking, rather than under a closed door. */
  if (won) app.fx.coinRain(90);
  else app.fx.shake(FX.shakeMagnitude * 1.2, 520);
  haptic(won ? [30, 60, 30, 60, 90] : [90, 50, 120]);

  toScreen("done", () => {
    ui.renderResults(summary, { unlocked, store, isRecord });
    ui.renderShare(summary, { text: shareText(summary), isDaily });
    ui.el.againBtn.hidden = isDaily;
    /* Park the headline at zero so it has somewhere to count up from once
       the door is out of the way. */
    ui.el.resultScore.textContent = "0";
  }).then(() => {
    /* Sting and count-up land on the reveal, not behind the transition —
       a payoff the player cannot see is a payoff wasted. */
    if (won) sound.vaultOpen();
    else sound.lockdown();
    rollNumber(ui.el.resultScore, 0, summary.score, 1100, (n) => formatCredits(n));
    if (won) app.fx.coinRain(50);
  });
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

  ui.el.nextBtn.addEventListener("click", advanceQuestion);

  ui.el.kit.addEventListener("click", (e) => {
    const btn = e.target.closest(".tool");
    if (!btn || btn.disabled) return;
    fireLifeline(btn.dataset.tool);
  });

  ui.el.bankBtn.addEventListener("click", () => {
    if (!app.game) return;
    app.game.bankIt();
  });

  /* The back control now pauses rather than quitting. Leaving is a choice
     made inside the pause panel, where the cost is stated. */
  ui.el.quit.addEventListener("click", () => {
    const game = app.game;
    if (!game || game.state.phase === PHASE.OVER) { goHome(); return; }
    setPaused(true);
  });

  ui.el.resumeBtn.addEventListener("click", () => setPaused(false));

  ui.el.abandonBtn.addEventListener("click", (e) => {
    const game = app.game;
    const atRisk = game?.state.pot > 0;
    if (!atRisk) { setPaused(false); abandon(); return; }
    ui.armConfirm(e.currentTarget, {
      label: `Lose ${formatCredits(game.state.pot)}? Tap again`,
      onConfirm: () => { setPaused(false); abandon(); },
    });
  });
}

/**
 * Player-driven advance. Refuses while a verdict is still mid-anticipation,
 * so hammering Enter cannot skip past the answer you were about to be shown.
 * The engine's own next() is deliberately not gated — scripted playthroughs
 * in window.__game.autoplay() drive it directly and must not depend on
 * real-time timers, which never run inside a synchronous loop.
 */
/* ---- Pause -----------------------------------------------------------------
   Esc used to abandon the run on the spot. Pausing stops the clock, which is
   the only thing that actually needs to stop — the engine advances solely
   through tick(dt), so not calling it IS the pause. No special engine state,
   no way for the two to disagree. */

function setPaused(on) {
  const game = app.game;
  if (!game || game.state.phase === PHASE.OVER) return;
  app.paused = !!on;

  ui.el.pause.hidden = !app.paused;
  if (app.paused) {
    stopLoop();
    sound.setHeat(0);
    const s = game.state;
    ui.el.pauseStat.textContent =
      `${formatCredits(s.banked + s.pot)} credits · lock ${s.qIndex + 1}` +
      (s.pot > 0 ? ` · ${formatCredits(s.pot)} at risk` : "");
    ui.el.resumeBtn.focus();
  } else {
    if (game.state.phase === PHASE.ASKING) startLoop();
  }
}

function advanceQuestion() {
  if (!app.game || app.revealPending) return;
  app.game.next();
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
  app.game = null;
  stopLoop();
  toScreen("title", () => {
    sound.stopMusic();
    sound.playMusic("themeTitle", { gain: 0.22 });
    app.fx.clear();
    renderTitle();
  });
}

/* ==========================================================================
   Keyboard
   ========================================================================== */

function wireGlobalInput() {
  /* Any first gesture unlocks audio — browsers require it. The title theme
     starts on that same gesture, since it cannot legally start before one. */
  const unlockOnce = () => {
    sound.unlock();
    /* File probing is async; give it a beat before asking for the bed. If no
       file is present playMusic returns false and nothing happens. */
    setTimeout(() => {
      if (document.body.dataset.screen === "title") {
        sound.playMusic("themeTitle", { gain: 0.22 });
      }
    }, 700);
  };
  window.addEventListener("pointerdown", unlockOnce, { once: true });
  window.addEventListener("keydown", unlockOnce, { once: true });

  window.addEventListener("keydown", (e) => {
    const screen = document.body.dataset.screen;
    const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;

    if (screen === "play" && app.paused) {
      if (e.key === "Escape") { e.preventDefault(); setPaused(false); }
      return;   /* every other key is inert while paused */
    }

    if (screen === "play" && app.game) {
      const phase = app.game.state.phase;

      if (phase === PHASE.REVEALED && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        advanceQuestion();
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
        setPaused(!app.paused);
      }
    }

    if (screen === "board" && app.boardGame) {
      const s = app.boardGame.state;

      if (s.phase === BPHASE.REVEALED && (e.key === "Enter" || e.key === " ") && !typing) {
        e.preventDefault();
        app.boardGame.next();
        return;
      }

      /* Pass on Escape, because declining a clue is the one action you want
         under time pressure and it is a long way to the button. Only when
         nothing is staked — Escape must not be able to fold a live bet. */
      if (e.key === "Escape" && s.phase === BPHASE.ASKING && !s.onWildcard) {
        e.preventDefault();
        app.boardGame.pass();
        return;
      }
    }

    if (screen === "street" && app.streetGame) {
      const s = app.streetGame.state;
      if (s.phase === SPHASE.ROUND && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        app.streetGame.next();
        return;
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
    else if (app.game && !app.paused && app.game.state.phase === PHASE.ASKING) startLoop();
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
    /* Exposed for debugging the audio graph: whether the context started,
       which optional files were found, and forcing playback without waiting
       on a real gesture. */
    sound,

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

  window.__street = {
    get game() { return app.streetGame; },
    get state() { return app.streetGame?.state ?? null; },
    get data() { return app.streetData; },

    start() { startStreet(); return app.streetGame?.state ?? null; },

    /** Say something, or "top" / "next" to name the best unfound answer. */
    guess(what = "next") {
      const g = app.streetGame;
      if (!g || g.state.phase !== SPHASE.ASKING) return null;
      if (what === "top" || what === "next") {
        const slot = g.state.slots.find((x) => !x.found);
        return slot ? g.guess(slot.text) : null;
      }
      if (what === "wrong") return g.guess("__deliberately wrong__");
      return g.guess(what);
    },

    bank() { return app.streetGame?.bank() ?? false; },
    next() { app.streetGame?.next(); return app.streetGame?.state ?? null; },

    /** Burn the round clock without waiting on real time. */
    fastForward(seconds = 90, step = 0.25) {
      const g = app.streetGame;
      if (!g) return null;
      for (let t = 0; t < seconds && g.state.phase === SPHASE.ASKING; t += step) g.tick(step);
      street.renderTimer(g);
      return g.state;
    },

    /**
     * Play a whole run. `knows` is the chance of thinking of any given answer,
     * weighted by how popular it is; `banksWhenStuck` is the decision the mode
     * is built on — see scripts/playtest-survey.mjs.
     */
    autoplay({ knows = 0.8, banksWhenStuck = true, maxSteps = 3000 } = {}) {
      const g = app.streetGame;
      if (!g) return null;
      let summary = null;
      const off = g.on("over", (s) => { summary = s; });
      let steps = 0;
      while (g.state.phase !== SPHASE.OVER && steps++ < maxSteps) {
        const s = g.state;
        if (s.phase === SPHASE.ROUND) { g.next(); continue; }
        if (s.phase !== SPHASE.ASKING) break;
        const unfound = s.slots.filter((x) => !x.found);
        const known = unfound.filter((x) => Math.random() < knows * (x.share / 30 + 0.25));
        if (known.length) g.guess(known[0].text);
        else if (banksWhenStuck && s.pot > 0) g.bank();
        else g.guess("__deliberately wrong__");
      }
      off();
      return summary;
    },
  };

  /* The Board gets its own handle for the same reason it gets its own engine:
     the two simulations do not share a state shape, and one debug object
     pretending otherwise would lie to whoever is driving it. */
  window.__board = {
    get game() { return app.boardGame; },
    get state() { return app.boardGame?.state ?? null; },
    get data() { return app.boardData; },

    start() { startBoard(); return app.boardGame?.state ?? null; },

    /** Answer by text, or "correct" / "wrong" / "form" (correct, in form). */
    answer(what = "correct") {
      const g = app.boardGame;
      if (!g) return null;
      const s = g.state;
      if (s.phase !== BPHASE.ASKING && !(s.phase === BPHASE.FINAL && s.finalArmed)) return null;
      if (what === "correct") return g.answer(s.clue.answer);
      if (what === "form") return g.answer(`What is ${s.clue.answer}?`);
      if (what === "wrong") return g.answer("__deliberately wrong__");
      return g.answer(what);
    },

    pick(col, row) { return app.boardGame?.pick(col, row) ?? null; },
    wager(n) {
      const g = app.boardGame;
      if (!g) return false;
      return g.state.phase === BPHASE.FINAL ? g.setFinalWager(n) : g.setWager(n);
    },
    pass() { return app.boardGame?.pass() ?? null; },
    next() { app.boardGame?.next(); return app.boardGame?.state ?? null; },

    /** Advance the clue clock without waiting on real time. */
    fastForward(seconds = 60, step = 0.25) {
      const g = app.boardGame;
      if (!g) return null;
      for (let t = 0; t < seconds; t += step) {
        const s = g.state;
        if (s.phase !== BPHASE.ASKING && !(s.phase === BPHASE.FINAL && s.finalArmed)) break;
        g.tick(step);
      }
      board.renderTimer(g);
      return g.state;
    },

    /** Play a whole board at a scripted accuracy. Returns the summary. */
    autoplay({ accuracy = 1, cautious = true, maxSteps = 4000 } = {}) {
      const g = app.boardGame;
      if (!g) return null;
      let summary = null;
      const off = g.on("over", (s) => { summary = s; });
      let steps = 0;
      while (g.state.phase !== BPHASE.OVER && steps++ < maxSteps) {
        const s = g.state;
        if (s.phase === BPHASE.BOARD) {
          const open = [];
          s.board.forEach((col, ci) => col.cells.forEach((cell, ri) => { if (!cell.used) open.push([ci, ri]); }));
          if (!open.length) break;
          const [ci, ri] = open[0];
          g.pick(ci, ri);
        } else if (s.phase === BPHASE.WAGER) {
          g.setWager(g.maxWager());
        } else if (s.phase === BPHASE.FINAL && !s.finalArmed) {
          g.setFinalWager(Math.round(s.score / 2));
        } else if (s.phase === BPHASE.ASKING || s.phase === BPHASE.FINAL) {
          if (Math.random() < accuracy) g.answer(s.clue.answer);
          else if (cautious && s.phase === BPHASE.ASKING && !s.onWildcard) g.pass();
          else g.answer("__deliberately wrong__");
        } else if (s.phase === BPHASE.REVEALED) {
          g.next();
        }
      }
      off();
      return summary;
    },
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
