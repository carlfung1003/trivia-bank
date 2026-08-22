/* ==========================================================================
   Rendering layer. Owns the DOM; owns no game rules.
   --------------------------------------------------------------------------
   Every function here takes data and updates elements. Nothing in this file
   decides what is correct, what a lifeline does, or when a run ends — that
   all lives in engine.js and lifelines.js, which never touch the document.
   The split is what lets the whole game be played headlessly.
   ========================================================================== */

import { MODES, DIFFICULTY, SCORING, CATEGORY_SIGILS, DEFAULT_SIGIL, LIFELINES } from "./config.js";
import { formatCredits } from "./util.js";

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const el = {
  body: document.body,
  shell: $(".shell"),
  srStatus: $("#sr-status"),
  vignette: $("#vignette"),
  fxCanvas: $("#fx-canvas"),
  shareCanvas: $("#share-canvas"),

  bootError: $("#boot-error"),
  bankSize: $$("#bank-size, #bank-size-2"),

  modes: $("#modes"),
  answerMode: $("#answer-mode"),
  soundToggle: $("#sound-toggle"),
  categories: $("#categories"),
  difficulties: $("#difficulties"),
  poolCount: $("#pool-count"),
  setupSummary: $("#setup-summary"),
  catAll: $("#cat-all"),
  catNone: $("#cat-none"),
  ledger: $("#ledger"),
  ledgerCats: $("#ledger-cats"),
  resetStats: $("#reset-stats"),

  hudMode: $("#hud-mode"),
  hudProgress: $("#hud-progress"),
  creditBoard: $("#credit-board"),
  hudPot: $("#hud-pot"),
  potValue: $("#pot-value"),
  streak: $("#streak"),
  alarms: $("#alarms"),
  alarmsGauge: $("#alarms-gauge"),
  display: $("#display"),
  dialTicks: $("#dial-ticks"),
  console: $(".console"),
  ladder: $("#ladder"),
  quit: $("#quit"),

  stage: $(".display"),   /* the glass display is what reacts to a hit */
  qSigil: $("#q-sigil"),
  qCat: $("#q-cat"),
  qDiff: $("#q-diff"),
  qHaven: $("#q-haven"),
  timer: $("#timer"),
  timerFill: $("#timer-fill"),
  timerValue: $("#timer-value"),
  question: $("#question"),
  options: $("#options"),
  typedForm: $("#typed-form"),
  typedInput: $("#typed-input"),
  verdict: $("#verdict"),
  verdictLine: $("#verdict-line"),
  verdictAnswer: $("#verdict-answer"),
  nextBtn: $("#next-btn"),
  kit: $("#kit"),
  bankBtn: $("#bank-btn"),
  bankBtnValue: $("#bank-btn-value"),

  resultEyebrow: $("#result-eyebrow"),
  resultScore: $("#result-score"),
  resultSub: $("#result-sub"),
  resultStats: $("#result-stats"),
  share: $("#share"),
  shareGrid: $("#share-grid"),
  shareNote: $("#share-note"),
  copyShare: $("#copy-share"),
  downloadCardBtn: $("#download-card"),
  unlocked: $("#unlocked"),
  unlockedList: $("#unlocked-list"),
  againBtn: $("#again-btn"),
  homeBtn: $("#home-btn"),
  reviewList: $("#review-list"),
};

const TIMER_CIRCUMFERENCE = 2 * Math.PI * 46;   /* dial__fill r=46 */
const OPTION_KEYS = ["A", "B", "C", "D", "E", "F"];

/* ---- Screens -------------------------------------------------------------- */

export function showScreen(name) {
  for (const section of $$(".screen")) {
    section.hidden = section.dataset.screen !== name;
  }
  document.body.dataset.screen = name;
  window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
}

export function announce(message) {
  if (el.srStatus) el.srStatus.textContent = message;
}

export function sigilFor(category) {
  return CATEGORY_SIGILS[category] || DEFAULT_SIGIL;
}

/* ---- Split-flap board ----------------------------------------------------- */

/**
 * Render a number as split-flap digits, animating only the digits that
 * actually changed. Rebuilding the whole board every frame would flap every
 * digit on every point and read as noise.
 */
export function setFlap(root, value) {
  const text = formatCredits(value);
  const chars = text.split("");

  if (root.childElementCount !== chars.length) {
    root.innerHTML = "";
    for (const ch of chars) {
      const d = document.createElement("span");
      d.className = ch === "," ? "flap__digit flap__digit--sep" : "flap__digit";
      d.textContent = ch;
      root.appendChild(d);
    }
    root.setAttribute("aria-label", `${text} credits`);
    return;
  }

  chars.forEach((ch, i) => {
    const d = root.children[i];
    if (!d || d.textContent === ch) return;
    d.textContent = ch;
    d.setAttribute("data-rolling", "true");
    setTimeout(() => d.removeAttribute("data-rolling"), 280);
  });
  root.setAttribute("aria-label", `${text} credits`);
}


/* ---- Dial ticks -----------------------------------------------------------
   Engraved graduations around the timer well. Drawn once rather than authored
   in the HTML, so the count is a single number to change.                    */

export function buildDialTicks({ count = 60, major = 5 } = {}) {
  if (!el.dialTicks) return;
  const cx = 60, cy = 60, rOuter = 55, parts = [];
  for (let i = 0; i < count; i++) {
    const isMajor = i % major === 0;
    const a = (i / count) * Math.PI * 2;
    const rInner = rOuter - (isMajor ? 7 : 4);
    const x1 = cx + Math.cos(a) * rInner, y1 = cy + Math.sin(a) * rInner;
    const x2 = cx + Math.cos(a) * rOuter, y2 = cy + Math.sin(a) * rOuter;
    parts.push(`<line class="${isMajor ? "major" : ""}" x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}"/>`);
  }
  el.dialTicks.innerHTML = parts.join("");
}

/* ---- Title screen --------------------------------------------------------- */

export function renderModes(store, { dailyDone, dailyResult }) {
  el.modes.innerHTML = "";
  Object.values(MODES).forEach((mode, i) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "mode-card mat-key";
    card.setAttribute("role", "listitem");
    card.dataset.mode = mode.id;
    card.style.setProperty("--i", String(i));

    const done = mode.oneAttemptPerDay && dailyDone;
    if (done) card.dataset.done = "true";

    const best = store.data.best[mode.id] || 0;
    const meta = [];
    if (Number.isFinite(mode.length)) meta.push(`${mode.length} locks`);
    if (mode.clock) meta.push(`${mode.clock}s`);
    if (mode.livesAlarm) meta.push(`${mode.livesAlarm} alarms`);
    if (mode.lifelines.length) meta.push(`${mode.lifelines.length} tools`);
    else meta.push("no tools");
    if (mode.safeHavens.length) meta.push(`${mode.safeHavens.length} safe havens`);

    /* Once today's heist is played, the card reports the result instead of
       advertising a run the player cannot take. */
    const doneLine = done && dailyResult
      ? `<span class="mode-card__done">Today: ${dailyResult.correct}/${dailyResult.total} · ${formatCredits(dailyResult.score)} credits</span>`
      : "";

    card.innerHTML = `
      <span class="lamp mode-card__lamp${done ? "" : " lamp--jade"}" data-on="${!done}" aria-hidden="true"></span>
      ${best ? `<span class="mode-card__best">best ${formatCredits(best)}</span>` : ""}
      <span class="mode-card__name">${mode.name}</span>
      <span class="mode-card__tag">${mode.tagline}</span>
      ${doneLine || `<span class="mode-card__meta">${meta.map((m) => `<span>${m}</span>`).join("")}</span>`}
    `;
    el.modes.appendChild(card);
  });
}

export function renderCategories(bank, selected) {
  el.categories.innerHTML = "";
  for (const cat of bank.categories) {
    const n = bank.buckets.get(cat)
      ? [...bank.buckets.get(cat).values()].reduce((a, b) => a + b.length, 0)
      : 0;
    const on = !selected || selected.includes(cat);
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.dataset.category = cat;
    chip.setAttribute("aria-pressed", String(on));
    chip.innerHTML = `
      <span class="chip__dot" aria-hidden="true"></span>
      <span>${sigilFor(cat)} ${cat}</span>
      <span class="chip__n">${n}</span>
    `;
    el.categories.appendChild(chip);
  }
}

export function renderDifficulties(selected) {
  el.difficulties.innerHTML = "";
  for (const d of DIFFICULTY.order) {
    const on = !selected || selected.includes(d);
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.dataset.difficulty = d;
    chip.setAttribute("aria-pressed", String(on));
    chip.innerHTML = `
      <span class="chip__dot" aria-hidden="true"></span>
      <span>${DIFFICULTY.label[d]}</span>
      <span class="chip__n">${DIFFICULTY.base[d]}</span>
    `;
    el.difficulties.appendChild(chip);
  }
}

export function renderLedger(store) {
  const lt = store.data.lifetime;
  const acc = store.accuracy();
  const rows = [
    ["Runs", lt.runs],
    ["Correct", lt.correct],
    ["Accuracy", `${Math.round(acc * 100)}%`],
    ["Best streak", lt.bestStreak],
    ["Lifetime credits", formatCredits(lt.credits)],
    ["Daily streak", store.data.daily.streak],
  ];
  el.ledger.innerHTML = rows.map(([k, v]) => `
    <div class="stat"><span class="stat__v">${v}</span><span class="stat__k">${k}</span></div>
  `).join("");

  const cats = store.categoryRows();
  el.ledgerCats.innerHTML = cats.length ? cats.map((c) => `
    <div class="catbar">
      <span class="catbar__sigil">${sigilFor(c.name)}</span>
      <span>${c.name}</span>
      <span class="catbar__track"><span class="catbar__fill" style="width:${Math.round(c.pct * 100)}%"></span></span>
      <span class="catbar__n">${c.correct}/${c.seen}</span>
    </div>
  `).join("") : `<p class="field__note">No locks picked yet.</p>`;
}

export function renderSetupSummary({ answerMode, categories, difficulties, poolSize }) {
  const bits = [
    answerMode === "typed" ? "type it" : "4 options",
    categories && categories.length ? `${categories.length} categories` : "all categories",
  ];
  if (difficulties && difficulties.length && difficulties.length < 3) {
    bits.push(difficulties.map((d) => DIFFICULTY.label[d].toLowerCase()).join(" + "));
  }
  el.setupSummary.textContent = bits.join(" · ");
  el.poolCount.textContent = `${poolSize} questions in play`;
}

/* ---- Play screen ---------------------------------------------------------- */

export function renderHud(game) {
  const s = game.state;
  const mode = game.mode;

  el.hudMode.textContent = mode.name;

  if (Number.isFinite(mode.length)) {
    el.hudProgress.textContent = `Lock ${Math.min(s.qIndex + 1, mode.length)} of ${mode.length}`;
  } else if (mode.clock) {
    el.hudProgress.textContent = `${Math.ceil(s.runClock)}s left · ${s.correctCount} picked`;
  } else {
    el.hudProgress.textContent = `Lock ${s.qIndex + 1} · ${s.correctCount} picked`;
  }

  setFlap(el.creditBoard, s.banked + s.pot);

  const showPot = mode.canBank && s.pot > 0;
  el.hudPot.hidden = !showPot;
  if (showPot) el.potValue.textContent = formatCredits(s.pot);

  /* Streak pips + live multiplier. */
  const ladder = SCORING.streakLadder;
  const capacity = ladder.length - 1;
  el.streak.innerHTML = Array.from({ length: capacity }, (_, i) =>
    `<span class="streak__pip" data-on="${i < s.streak}"></span>`
  ).join("") + (s.streak >= 2
    ? `<span class="streak__mult">&times;${ladder[Math.min(s.streak, capacity)]}</span>`
    : "");

  /* Alarms (Survival). */
  if (mode.livesAlarm) {
    el.alarmsGauge.hidden = false;
    el.alarms.innerHTML = Array.from({ length: mode.livesAlarm }, (_, i) =>
      `<span class="alarm-pip" data-spent="${i >= s.lives}"></span>`
    ).join("");
  } else {
    el.alarmsGauge.hidden = true;
  }

  /* Bank button (Vault Run only, and only with something at risk). */
  const canBank = mode.canBank && s.pot > 0 && s.phase === "asking";
  el.bankBtn.hidden = !canBank;
  if (canBank) el.bankBtnValue.textContent = formatCredits(s.banked + s.pot);
}

export function renderLadder(game) {
  const mode = game.mode;
  if (!Number.isFinite(mode.length)) { el.ladder.innerHTML = ""; return; }

  const s = game.state;
  el.ladder.innerHTML = Array.from({ length: mode.length }, (_, i) => {
    const past = s.history[i];
    let state = "todo";
    if (past) state = past.result === "correct" ? "done" : "wrong";
    else if (i === s.qIndex) state = "now";
    const haven = mode.safeHavens.includes(i);
    return `<span class="ladder__rung" data-state="${state}" data-haven="${haven}"></span>`;
  }).join("");
}

export function renderQuestion(game) {
  const s = game.state;
  const q = s.question;
  if (!q) return;

  el.qSigil.textContent = sigilFor(q.category);
  el.qCat.textContent = q.category;
  el.qDiff.textContent = DIFFICULTY.label[q.difficulty] || q.difficulty;
  el.qDiff.dataset.diff = q.difficulty;
  el.qHaven.hidden = !game.mode.safeHavens.includes(s.qIndex);

  el.question.textContent = q.question;
  /* Restart the entrance animation for the new question. */
  el.question.style.animation = "none";
  void el.question.offsetWidth;
  el.question.style.animation = "";

  el.verdict.hidden = true;
  el.verdict.removeAttribute("data-result");

  if (game.answerMode === "choice") {
    el.options.hidden = false;
    el.typedForm.hidden = true;
    renderOptions(game);
  } else {
    el.options.hidden = true;
    el.typedForm.hidden = false;
    el.typedInput.value = "";
    el.typedInput.disabled = false;
    /* Only steal focus on a device with a keyboard — an auto-raised mobile
       keyboard covers the question the player is trying to read. */
    if (window.matchMedia("(min-width: 720px)").matches) el.typedInput.focus();
  }

  announce(`${q.category}, ${DIFFICULTY.label[q.difficulty]}. ${q.question}`);
}

export function renderOptions(game) {
  const s = game.state;
  el.options.innerHTML = "";
  s.options.forEach((text, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "option mat-key";
    btn.dataset.index = String(i);
    btn.style.setProperty("--i", String(i));
    if (s.removed.includes(i)) btn.dataset.removed = "true";
    btn.innerHTML = `
      <span class="option__poll" aria-hidden="true"></span>
      <span class="option__key" aria-hidden="true">${OPTION_KEYS[i] || i + 1}</span>
      <span class="option__text">${escapeHtml(text)}</span>
    `;
    el.options.appendChild(btn);
  });
}

/** Paint WIRETAP results onto the option rows. */
export function renderPoll(game) {
  const s = game.state;
  if (!s.poll) return;
  $$(".option", el.options).forEach((btn) => {
    const i = Number(btn.dataset.index);
    const v = s.poll[i];
    if (v == null) return;
    const bar = $(".option__poll", btn);
    if (bar) bar.style.setProperty("--poll", `${Math.round(v * 100)}%`);
    if (!$(".option__pollv", btn)) {
      const tag = document.createElement("span");
      tag.className = "option__pollv";
      tag.textContent = `${Math.round(v * 100)}%`;
      btn.appendChild(tag);
    }
  });
}

/** Mark options burned by the DRILL. */
export function renderBurn(game, removed) {
  $$(".option", el.options).forEach((btn) => {
    const i = Number(btn.dataset.index);
    if (!removed.includes(i)) return;
    btn.dataset.burning = "true";
    btn.disabled = true;
    setTimeout(() => {
      btn.removeAttribute("data-burning");
      btn.dataset.removed = "true";
    }, 460);
  });
}

export function renderKit(kit) {
  el.kit.innerHTML = "";
  for (const tool of kit) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tool";
    btn.dataset.tool = tool.id;
    btn.disabled = !tool.available;
    if (tool.used) btn.dataset.used = "true";
    btn.title = tool.hint;
    btn.setAttribute("aria-label", `${tool.name}. ${tool.hint}${tool.used ? " Already spent." : ""}`);
    btn.classList.add("mat-key");
    btn.innerHTML = `
      <span class="lamp tool__lamp" data-on="${!tool.used}" aria-hidden="true"></span>
      <span class="tool__name">${tool.name}</span>
      <span class="tool__key">${tool.key.toUpperCase()}</span>
    `;
    el.kit.appendChild(btn);
  }
}

export function armTool(id, armed) {
  const btn = $(`.tool[data-tool="${id}"]`, el.kit);
  if (btn) btn.dataset.armed = String(armed);
}

export function renderTimer(game) {
  const s = game.state;
  const mode = game.mode;

  /* Blitz shows the shared run clock; everything else the per-question one. */
  const usingRunClock = mode.timeScale === 0 && mode.clock;
  const left = usingRunClock ? s.runClock : s.questionLeft;
  const fraction = game.clockFraction;

  el.timerValue.textContent = String(Math.ceil(Math.max(0, left)));
  el.timerFill.style.strokeDasharray = String(TIMER_CIRCUMFERENCE);
  el.timerFill.style.strokeDashoffset = String(TIMER_CIRCUMFERENCE * (1 - Math.max(0, Math.min(1, fraction))));

  let state = "ok";
  if (fraction <= 0.22) state = "critical";
  else if (fraction <= 0.5) state = "warn";
  el.timer.dataset.state = state;
  el.timer.dataset.frozen = String(!!s.frozen && !usingRunClock);
}

export function revealAnswer(game, { result, correctIndex, correctAnswer, given }) {
  if (game.answerMode === "choice") {
    $$(".option", el.options).forEach((btn) => {
      const i = Number(btn.dataset.index);
      btn.disabled = true;
      if (i === correctIndex) btn.dataset.state = "correct";
      else if (i === given && result !== "correct") btn.dataset.state = "wrong";
    });
  } else {
    el.typedInput.disabled = true;
  }

  const lines = {
    correct: "Lock picked",
    wrong: "The lock held",
    timeout: "Out of time",
  };
  el.verdict.dataset.result = result;
  el.verdictLine.textContent = lines[result] || "";
  el.verdictAnswer.textContent = result === "correct" ? correctAnswer : `Answer: ${correctAnswer}`;
  el.verdict.hidden = false;
  el.nextBtn.focus();

  announce(result === "correct"
    ? `Correct. ${correctAnswer}.`
    : `${lines[result]}. The answer was ${correctAnswer}.`);
}

/* ---- Results -------------------------------------------------------------- */

const END_COPY = {
  banked:    { eyebrow: "Walked out clean",       sub: "credits banked" },
  cleared:   { eyebrow: "The vault is open",      sub: "credits banked" },
  busted:    { eyebrow: "The alarm went off",     sub: "credits salvaged" },
  alarms:    { eyebrow: "Three alarms. You're done", sub: "credits" },
  time:      { eyebrow: "Time",                   sub: "credits" },
  exhausted: { eyebrow: "You emptied the bank",   sub: "credits" },
  quit:      { eyebrow: "You walked away",        sub: "credits" },
};

export function renderResults(summary, { unlocked, store, isRecord }) {
  const copy = END_COPY[summary.reason] || END_COPY.time;
  el.resultEyebrow.textContent = isRecord ? `${copy.eyebrow} · personal best` : copy.eyebrow;
  el.resultScore.textContent = formatCredits(summary.score);
  el.resultSub.textContent = copy.sub;

  const acc = summary.answered ? Math.round((summary.correct / summary.answered) * 100) : 0;
  const stats = [
    ["Locks", `${summary.correct}/${summary.answered}`],
    ["Accuracy", `${acc}%`],
    ["Best run", summary.bestStreak],
    ["Tools used", summary.lifelinesUsed],
  ];
  el.resultStats.innerHTML = stats.map(([k, v]) => `
    <div class="stat"><span class="stat__v">${v}</span><span class="stat__k">${k}</span></div>
  `).join("");

  if (unlocked.length) {
    el.unlocked.hidden = false;
    el.unlockedList.innerHTML = unlocked.map((id, i) => {
      const meta = store.achievementMeta(id);
      return `<span class="badge" style="--i:${i}" title="${escapeHtml(meta.hint)}">${escapeHtml(meta.name)}</span>`;
    }).join("");
  } else {
    el.unlocked.hidden = true;
  }

  el.reviewList.innerHTML = summary.history.map((h, i) => `
    <li class="review__item" data-result="${h.result}">
      <span class="review__mark">${h.result === "correct" ? "✓" : h.result === "timeout" ? "◷" : "✕"}</span>
      <span>
        <span class="review__q">${i + 1}. ${escapeHtml(h.question)}</span>
        <span class="review__a">${escapeHtml(h.answer)}${
          h.result !== "correct" && h.given ? ` &nbsp;·&nbsp; you said ${escapeHtml(String(h.given))}` : ""
        }</span>
      </span>
      <span class="review__pts">${h.points > 0 ? `+${formatCredits(h.points)}` : h.points < 0 ? formatCredits(h.points) : "—"}</span>
    </li>
  `).join("");
}

export function renderShare(summary, { text, isDaily }) {
  el.share.hidden = !isDaily;
  if (!isDaily) return;
  el.shareGrid.textContent = summary.history
    .map((h) => (h.result === "correct" ? "▰" : "▱"))
    .join("");
  el.shareNote.textContent = "Spoiler-free — no questions, no answers.";
  el.share.dataset.text = text;
}

/* ---- Helpers -------------------------------------------------------------- */

export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function setHeat(value) {
  document.documentElement.style.setProperty("--heat", String(value.toFixed(3)));
}

/* ---- Toast ---------------------------------------------------------------
   Replaces window.alert(). A native dialog blocks the entire renderer — it
   froze the page outright during playtesting — and it looks nothing like the
   rest of the game. This is non-blocking and disappears on its own. */

let toastTimer = null;

export function toast(message, ms = 3200) {
  let node = document.querySelector(".toast");
  if (!node) {
    node = document.createElement("div");
    node.className = "toast";
    node.setAttribute("role", "status");
    document.body.appendChild(node);
  }
  node.textContent = message;
  node.removeAttribute("data-show");
  void node.offsetWidth;
  node.setAttribute("data-show", "true");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.removeAttribute("data-show"), ms);
}

/**
 * Two-step confirmation on a single button, replacing window.confirm().
 * First press arms it and relabels; a second press within `window` commits.
 * Anything else — a timeout, a click elsewhere — disarms it.
 */
export function armConfirm(btn, { label, onConfirm, ms = 3500 }) {
  if (btn.dataset.armed === "true") {
    clearTimeout(Number(btn.dataset.timer));
    btn.dataset.armed = "false";
    btn.textContent = btn.dataset.originalLabel || btn.textContent;
    onConfirm();
    return true;
  }
  btn.dataset.originalLabel = btn.textContent;
  btn.dataset.armed = "true";
  btn.textContent = label;
  const t = setTimeout(() => {
    btn.dataset.armed = "false";
    btn.textContent = btn.dataset.originalLabel;
  }, ms);
  btn.dataset.timer = String(t);
  return false;
}

export function flashButton(btn, label, revert = 1400) {
  if (!btn) return;
  const original = btn.textContent;
  btn.textContent = label;
  btn.disabled = true;
  setTimeout(() => { btn.textContent = original; btn.disabled = false; }, revert);
}
