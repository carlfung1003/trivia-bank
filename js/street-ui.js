/* ==========================================================================
   The Street — DOM only.
   --------------------------------------------------------------------------
   Same contract as ui.js and board-ui.js: reads a SurveyGame, writes elements,
   decides nothing. survey.js owns the rules and never touches the document.
   ========================================================================== */

import { STREET } from "./config.js";
import { formatCredits } from "./util.js";
import { escapeHtml, setFlap, buildDialTicks, announce } from "./ui.js";

const $ = (sel) => document.querySelector(sel);

export const el = {
  screen:     $(".screen--street"),
  quit:       $("#street-quit"),
  round:      $("#street-round"),
  mult:       $("#street-mult"),
  flap:       $("#street-flap"),
  pot:        $("#street-pot"),
  potValue:   $("#street-pot-value"),
  strikes:    $("#street-strikes"),

  prompt:     $("#street-prompt"),
  timer:      $("#street-timer"),
  timerFill:  $("#street-timer-fill"),
  timerValue: $("#street-timer-value"),
  timerTicks: $("#street-dial-ticks"),

  board:      $("#street-board"),
  form:       $("#street-form"),
  input:      $("#street-input"),
  hint:       $("#street-hint"),

  bank:       $("#street-bank"),
  bankValue:  $("#street-bank-value"),

  card:        $("#street-card"),
  cardEyebrow: $("#street-card-eyebrow"),
  cardValue:   $("#street-card-value"),
  cardSub:     $("#street-card-sub"),
  cardList:    $("#street-card-list"),
  next:        $("#street-next"),
};

const TIMER_CIRCUMFERENCE = 2 * Math.PI * 46;   /* dial__fill r=46 */

const MULT_LABEL = { 1: "Face value", 2: "Double", 3: "Triple" };

export function buildStreetDial() {
  buildDialTicks({ node: el.timerTicks });
}

/* ---- HUD ------------------------------------------------------------------ */

export function renderHud(game) {
  const s = game.state;

  el.round.textContent = `Round ${s.round} of ${STREET.rounds.length}`;
  el.mult.textContent = MULT_LABEL[s.multiplier] || `×${s.multiplier}`;

  setFlap(el.flap, s.banked);

  /* The live pot is the whole tension of the mode, so it is stated twice: on
     the meter as a number at risk, and on the bank button as a thing to take. */
  el.pot.hidden = s.pot <= 0;
  el.potValue.textContent = formatCredits(s.pot);

  el.bank.hidden = s.pot <= 0 || s.phase !== "asking";
  el.bankValue.textContent = formatCredits(s.pot);

  el.strikes.innerHTML = "";
  for (let i = 0; i < STREET.strikes; i++) {
    const mark = document.createElement("span");
    mark.className = "strike";
    mark.dataset.on = String(i < s.strikes);
    mark.textContent = i < s.strikes ? "✕" : "·";
    el.strikes.appendChild(mark);
  }
}

export function renderTimer(game) {
  const fraction = Math.max(0, Math.min(1, game.clockFraction));
  el.timerFill.style.strokeDasharray = String(TIMER_CIRCUMFERENCE);
  el.timerFill.style.strokeDashoffset = String(TIMER_CIRCUMFERENCE * (1 - fraction));
  el.timerValue.textContent = String(Math.ceil(game.state.clock));
  el.timer.dataset.critical = String(fraction <= STREET.criticalClockFraction);
}

/* ---- The board ------------------------------------------------------------ */

/**
 * A hidden slot keeps its full footprint and shows dashes sized to the answer.
 * Both halves matter: the footprint stops the board reflowing under the
 * player's eyes as it fills, and the dashes make an empty row feel like
 * something specific rather than a blank.
 */
export function renderBoard(game, { revealAll = false } = {}) {
  const s = game.state;
  el.board.innerHTML = "";

  s.slots.forEach((slot, i) => {
    const row = document.createElement("div");
    row.className = "slot";
    row.setAttribute("role", "listitem");
    row.dataset.found = String(slot.found);
    if (revealAll && !slot.found) row.dataset.missed = "true";

    const shown = slot.found || revealAll;
    const body = shown
      ? `<span class="slot__text">${escapeHtml(slot.text)}</span>
         <span class="slot__share">${slot.share}%</span>`
      : `<span class="slot__dashes" aria-hidden="true">${
           "<span class=\"slot__dash\"></span>".repeat(Math.min(6, slot.text.split(/\s+/).length + 1))
         }</span>
         <span class="slot__share">&nbsp;</span>`;

    row.innerHTML = `<span class="slot__rank">${slot.rank}</span>${body}`;
    row.setAttribute(
      "aria-label",
      shown ? `${slot.rank}. ${slot.text}, ${slot.share} per cent` : `${slot.rank}. Not yet named`
    );
    el.board.appendChild(row);
  });
}

export function setPrompt(prompt) {
  el.prompt.textContent = prompt;
}

/* ---- Guess feedback -------------------------------------------------------- */

export function showGuess({ verdict, text, revealed, share, points, rank }) {
  el.input.value = "";
  el.hint.dataset.kind = verdict;

  if (verdict === "hit") {
    el.hint.textContent = rank === 1
      ? `Number one — ${revealed}, ${share}%. ${formatCredits(points)} on the table.`
      : `${revealed} — ${share}%. ${formatCredits(points)} on the table.`;
    announce(`Yes. ${revealed}, ${share} per cent.`);
  } else if (verdict === "repeat") {
    el.hint.textContent = "Already up there — that one's free.";
    announce("Already named. No strike.");
  } else {
    el.hint.textContent = `"${text}" — not on the board.`;
    announce(`Strike. ${text} is not on the board.`);
  }
}

export function resetHint() {
  el.hint.removeAttribute("data-kind");
  el.hint.textContent = "Three strikes and everything on the table is gone.";
}

export function focusInput() {
  /* Desktop only: stealing focus on a phone raises the keyboard over the board
     the player is trying to read. */
  if (window.matchMedia("(pointer: fine)").matches) el.input.focus();
}

export function setInputEnabled(on) {
  el.input.disabled = !on;
  /* The bank button is excluded: renderHud owns whether it is showable at all,
     and re-enabling it here would put a live Bank control on a finished round. */
  for (const btn of el.form.querySelectorAll("button")) {
    if (btn !== el.bank) btn.disabled = !on;
  }
  if (!on) el.bank.hidden = true;
}

/* ---- Round card ------------------------------------------------------------ */

const CARD_COPY = {
  swept:  { eyebrow: "Swept the board", kind: "kept" },
  banked: { eyebrow: "Banked",          kind: "kept" },
  struck: { eyebrow: "Three strikes",   kind: "lost" },
  time:   { eyebrow: "Out of time",     kind: "lost" },
};

export function showCard({ reason, kept, lost, full, bonus, last }) {
  const copy = CARD_COPY[reason] || CARD_COPY.banked;
  el.card.hidden = false;
  el.card.dataset.kind = copy.kind;

  el.cardEyebrow.textContent = copy.eyebrow;
  el.cardValue.textContent = copy.kind === "kept"
    ? `+${formatCredits(kept)}`
    : `−${formatCredits(lost)}`;

  const found = full.filter((f) => f.found).length;
  const bits = [`${found} of ${full.length} named`];
  if (bonus) bits.push(`clean sweep bonus ${formatCredits(bonus)}`);
  if (copy.kind === "lost" && lost > 0) bits.push("the table is cleared");
  el.cardSub.textContent = bits.join(" · ");

  /* Everything revealed. Not showing the answers you missed is the single most
     frustrating thing a survey game can do, and the round is already over. */
  el.cardList.innerHTML = full.map((f) => `
    <li data-found="${f.found}">
      <span class="street-card__mark">${f.found ? "✓" : "·"}</span>
      <span>${escapeHtml(f.text)}</span>
      <span class="street-card__pct">${f.share}%</span>
    </li>
  `).join("");

  el.next.textContent = last ? "See the tally" : "Next survey";
  el.next.focus();

  announce(`${copy.eyebrow}. ${bits.join(". ")}.`);
}

export function hideCard() {
  el.card.hidden = true;
  el.card.removeAttribute("data-kind");
}
