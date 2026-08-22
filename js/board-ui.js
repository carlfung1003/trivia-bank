/* ==========================================================================
   The Board — DOM only.
   --------------------------------------------------------------------------
   Mirrors ui.js's contract exactly: this file owns the document and owns no
   rules, jeopardy.js owns the rules and owns no document, and main.js is the
   only module that knows both. Everything here reads from a BoardGame and
   writes to elements; nothing here decides anything.
   ========================================================================== */

import { BOARD } from "./config.js";
import { formatCredits, answerShape } from "./util.js";
import { el as core, escapeHtml, setFlap, buildDialTicks, announce } from "./ui.js";

const $ = (sel) => document.querySelector(sel);

export const el = {
  screen:      $(".screen--board"),
  quit:        $("#board-quit"),
  round:       $("#board-round"),
  progress:    $("#board-progress"),
  flap:        $("#board-flap"),
  negative:    $("#board-negative"),
  streak:      $("#board-streak"),

  grid:        $("#board-grid"),
  slab:        $("#board-slab"),
  slabCat:     $("#slab-cat"),
  slabValue:   $("#slab-value"),
  slabWild:    $("#slab-wildcard"),
  slabClue:    $("#slab-clue"),
  slabShape:   $("#slab-shape"),
  slabTimer:   $("#slab-timer"),
  slabFill:    $("#slab-timer-fill"),
  slabTime:    $("#slab-timer-value"),
  slabTicks:   $("#slab-dial-ticks"),

  wager:       $("#board-wager"),
  wagerEyebrow:$("#wager-eyebrow"),
  wagerCat:    $("#wager-cat"),
  wagerNote:   $("#wager-note"),
  wagerForm:   $("#wager-form"),
  wagerInput:  $("#wager-input"),
  wagerQuick:  $("#wager-quick"),
  wagerRange:  $("#wager-range"),

  form:        $("#board-form"),
  input:       $("#board-input"),
  pass:        $("#board-pass"),
  verdict:     $("#board-verdict"),
  verdictLine: $("#board-verdict-line"),
  verdictAnswer: $("#board-verdict-answer"),
  next:        $("#board-next"),
  hint:        $("#board-hint"),
};

const TIMER_CIRCUMFERENCE = 2 * Math.PI * 46;   /* dial__fill r=46 */

export function buildBoardDial() {
  buildDialTicks({ node: el.slabTicks });
}

/* ---- HUD ------------------------------------------------------------------ */

export function renderHud(game) {
  const s = game.state;

  el.round.textContent = s.roundName || "";
  const left = game.remaining;
  /* On the final round the plate's LABEL already says "The Last Lock", so
     repeating it in the value said the same thing twice in two type sizes. */
  el.progress.textContent = s.round >= BOARD.rounds.length
    ? "One clue, one stake"
    : `${left} clue${left === 1 ? "" : "s"} left`;

  /* The flap board has no minus sign, so a negative score is reported by the
     lamp beside it rather than by a digit that cannot be drawn. */
  setFlap(el.flap, Math.abs(s.score));
  el.negative.hidden = s.score >= 0;

  el.streak.innerHTML = "";
  const pips = Math.min(6, Math.max(0, s.streak));
  for (let i = 0; i < 6; i++) {
    const pip = document.createElement("span");
    pip.className = "streak__pip";
    pip.dataset.on = String(i < pips);
    el.streak.appendChild(pip);
  }
  if (s.streak > 6) {
    const x = document.createElement("span");
    x.className = "streak__mult";
    x.textContent = `×${s.streak}`;
    el.streak.appendChild(x);
  }
}

/* ---- Grid ----------------------------------------------------------------- */

export function renderBoard(game) {
  const s = game.state;
  el.grid.style.setProperty("--cols", String(s.board.length));
  el.grid.innerHTML = "";

  s.board.forEach((col, ci) => {
    const column = document.createElement("div");
    column.className = "board-col";
    column.setAttribute("role", "rowgroup");

    const cap = document.createElement("div");
    cap.className = "board-cat mat-plate";
    cap.innerHTML = escapeHtml(col.name)
      + (col.blurb ? `<span class="board-cat__blurb">${escapeHtml(col.blurb)}</span>` : "");
    column.appendChild(cap);

    col.cells.forEach((cell, ri) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "board-cell mat-key";
      btn.dataset.col = String(ci);
      btn.dataset.row = String(ri);
      btn.dataset.used = String(cell.used);
      btn.disabled = cell.used;
      btn.textContent = cell.used ? "" : `$${cell.value}`;
      btn.setAttribute(
        "aria-label",
        cell.used ? `${col.name}, $${cell.value}, already played` : `${col.name} for $${cell.value}`
      );
      column.appendChild(btn);
    });

    el.grid.appendChild(column);
  });
}

/* ---- Modes of the frame ---------------------------------------------------- */

/** Grid visible, nothing over it. */
export function showGrid() {
  el.slab.hidden = true;
  el.wager.hidden = true;
  el.form.hidden = true;
  el.verdict.hidden = true;
  el.hint.hidden = false;
  el.hint.textContent = "Pick a cell. Respond in the form of a question for a bonus.";
}

/** The wager pad, for a wildcard or the last lock. */
export function showWager({ category, min, max, value, kind }) {
  el.slab.hidden = true;
  el.wager.hidden = false;
  el.form.hidden = true;
  el.verdict.hidden = true;
  el.hint.hidden = true;

  const isFinal = kind === "final";
  el.wagerEyebrow.textContent = isFinal ? "The last lock" : "Wildcard";
  el.wagerCat.textContent = category;
  el.wagerNote.textContent = isFinal
    ? "One clue. Wager what you can stand to lose."
    : "Hidden behind the cell. Name your stake.";

  el.wagerInput.min = String(min);
  el.wagerInput.max = String(max);
  el.wagerInput.value = String(value);
  el.wagerRange.textContent = `${formatCredits(min)} – ${formatCredits(max)}`;

  /* Quick stakes, because typing a number under a clock is friction nobody
     asked for. Deduped and clamped so "all in" and "max" never double up. */
  const quick = [...new Set([
    min,
    Math.round(max / 4 / 100) * 100,
    Math.round(max / 2 / 100) * 100,
    max,
  ])].filter((n) => n >= min && n <= max).sort((a, b) => a - b);

  el.wagerQuick.innerHTML = "";
  for (const n of quick) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "wager__chip";
    chip.dataset.wager = String(n);
    chip.textContent = n === max ? "All in" : `$${formatCredits(n)}`;
    el.wagerQuick.appendChild(chip);
  }

  announce(`${isFinal ? "Last lock" : "Wildcard"}. ${category}. Name your stake between ${min} and ${max}.`);
}

/** The clue, over the grid, clock running. */
export function showClue(game, { category, clue, value, wildcard, final }) {
  const s = game.state;

  el.wager.hidden = true;
  el.slab.hidden = false;
  el.verdict.hidden = true;
  el.form.hidden = false;
  el.hint.hidden = true;

  el.slab.dataset.wildcard = String(!!wildcard);
  el.slabCat.textContent = category;
  el.slabValue.textContent = `$${formatCredits(value)}`;
  el.slabWild.hidden = !wildcard && !final;
  el.slabWild.textContent = final ? "Last lock" : "Wildcard";

  el.slabClue.textContent = clue;

  /* The shape, for the same reason Type-It shows it: typing blind is what
     made the vault's typed mode brutal, and a clue you cannot see the size of
     is the same problem wearing a different hat. */
  renderShape(s.clue?.answer || "");

  /* A pass is only meaningful when nothing is staked — you cannot decline a
     bet you already placed. */
  el.pass.hidden = !!wildcard || !!final;

  el.input.value = "";
  el.input.disabled = false;
  el.input.placeholder = "What is…";
  renderTimer(game);
}

function renderShape(answer) {
  const shape = answerShape(answer);
  if (!shape.length) { el.slabShape.hidden = true; return; }
  el.slabShape.hidden = false;
  el.slabShape.innerHTML = shape
    .map((n) => `<span class="shape__word">${'<span class="shape__slot"></span>'.repeat(n)}</span>`)
    .join("");
  const total = shape.reduce((a, b) => a + b, 0);
  el.slabShape.setAttribute(
    "aria-label",
    `${total} letters, ${shape.length} word${shape.length === 1 ? "" : "s"}`
  );
}

export function renderTimer(game) {
  const fraction = Math.max(0, Math.min(1, game.clockFraction));
  el.slabFill.style.strokeDasharray = String(TIMER_CIRCUMFERENCE);
  el.slabFill.style.strokeDashoffset = String(TIMER_CIRCUMFERENCE * (1 - fraction));
  el.slabTime.textContent = String(Math.ceil(game.state.clueLeft));
  el.slabTimer.dataset.critical = String(fraction <= BOARD.criticalClockFraction);
}

/* ---- Verdict --------------------------------------------------------------- */

export function showVerdict({ result, close, answer, delta, inForm, final, score }) {
  el.form.hidden = true;
  el.verdict.hidden = false;
  el.input.disabled = true;

  const gained = delta > 0;
  const lines = {
    correct: gained ? `Right — $${formatCredits(delta)}` : "Right",
    wrong:   close ? "So close" : `Wrong — $${formatCredits(Math.abs(delta))}`,
    timeout: delta === 0 ? "Passed" : `Out of time — $${formatCredits(Math.abs(delta))}`,
  };
  el.verdictLine.textContent = lines[result] || "";
  el.verdictLine.dataset.result = result;

  const bonus = result === "correct" && inForm && !final
    ? " <span class=\"verdict__bonus\">+ question form</span>"
    : "";
  el.verdictAnswer.innerHTML = `${escapeHtml(answer)}${bonus}`;

  el.next.textContent = final ? "See the damage" : "Back to the board";

  announce(`${lines[result]}. ${answer}. Score ${score}.`);
}

export function focusInput() {
  /* iOS will not raise the keyboard without a user gesture, and stealing focus
     mid-scroll on a phone is worse than not having it. Desktop only. */
  if (window.matchMedia("(pointer: fine)").matches) el.input.focus();
}
