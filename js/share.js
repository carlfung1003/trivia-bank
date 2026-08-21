/* ==========================================================================
   Daily Heist sharing.
   --------------------------------------------------------------------------
   Two artefacts, both spoiler-free — they show the SHAPE of a run, never a
   question or an answer, so posting one cannot ruin the day for anyone else:

     1. a text grid for pasting into chat
     2. a rendered card (canvas -> PNG) for posting as an image
   ========================================================================== */

import { localDateKey, formatCredits } from "./util.js";

const MARK = {
  correct: "▰",
  wrong: "▱",
  timeout: "▱",
};

/**
 * Spoiler-free text result.
 * Deliberately does not include category names — on a 10-question set, naming
 * the categories in order is most of the way to naming the questions.
 */
export function shareText(summary, { url = "trivia.carlfung.dev" } = {}) {
  const date = localDateKey();
  const grid = summary.history.map((h) => MARK[h.result] || MARK.wrong).join("");
  const lines = [
    `The Trivia Bank — Daily Heist ${date}`,
    `${summary.correct}/${summary.answered} · ${formatCredits(summary.score)} credits`,
    grid,
  ];
  if (summary.bestStreak >= 3) lines.push(`best run: ${summary.bestStreak} in a row`);
  lines.push(url);
  return lines.join("\n");
}

/* ---- Card ---------------------------------------------------------------- */

const CARD = {
  w: 1200,
  h: 630,
  ink: "#0a0c10",
  panel: "#12161f",
  brass: "#c9a24d",
  brassHi: "#e6c883",
  bone: "#ece6da",
  muted: "#6b7280",
  jade: "#43a882",
  alarm: "#e0483c",
};

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Draw the result card onto the given canvas.
 * Uses only fonts already loaded by the page, with generic fallbacks, so it
 * never renders a blank box waiting on a webfont.
 */
export function drawCard(canvas, summary) {
  const ctx = canvas.getContext("2d");
  const { w, h } = CARD;
  canvas.width = w;
  canvas.height = h;

  /* Background */
  ctx.fillStyle = CARD.ink;
  ctx.fillRect(0, 0, w, h);

  const glow = ctx.createRadialGradient(w / 2, h * 0.42, 40, w / 2, h * 0.42, w * 0.62);
  glow.addColorStop(0, "rgba(201,162,77,0.20)");
  glow.addColorStop(1, "rgba(201,162,77,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  /* Vault rings */
  ctx.save();
  ctx.translate(w / 2, h * 0.44);
  ctx.strokeStyle = "rgba(201,162,77,0.18)";
  [300, 244, 188].forEach((r, i) => {
    ctx.lineWidth = i === 0 ? 3 : 1.5;
    if (i === 2) ctx.setLineDash([9, 13]);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
  });
  ctx.setLineDash([]);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 188, Math.sin(a) * 188);
    ctx.lineTo(Math.cos(a) * 300, Math.sin(a) * 300);
    ctx.stroke();
  }
  ctx.restore();

  /* Eyebrow */
  ctx.textAlign = "center";
  ctx.fillStyle = CARD.brass;
  ctx.font = '500 21px "IBM Plex Mono", ui-monospace, monospace';
  ctx.fillText("THE  TRIVIA  BANK".split("").join(" "), w / 2, 96);

  ctx.fillStyle = CARD.muted;
  ctx.font = '400 19px "IBM Plex Mono", ui-monospace, monospace';
  ctx.fillText(`DAILY HEIST · ${localDateKey()}`, w / 2, 132);

  /* Score */
  ctx.fillStyle = CARD.brassHi;
  ctx.font = '600 128px "IBM Plex Mono", ui-monospace, monospace';
  ctx.fillText(formatCredits(summary.score), w / 2, 276);

  ctx.fillStyle = CARD.muted;
  ctx.font = '400 20px "IBM Plex Mono", ui-monospace, monospace';
  ctx.fillText("CREDITS", w / 2, 312);

  /* Result grid — one tile per lock */
  const n = summary.history.length || 1;
  const tile = Math.min(64, Math.floor((w - 320) / n) - 12);
  const gap = 12;
  const totalW = n * tile + (n - 1) * gap;
  let x = (w - totalW) / 2;
  const y = 372;

  summary.history.forEach((entry) => {
    const ok = entry.result === "correct";
    ctx.fillStyle = ok ? "rgba(67,168,130,0.22)" : "rgba(224,72,60,0.16)";
    roundRect(ctx, x, y, tile, tile, 8);
    ctx.fill();
    ctx.strokeStyle = ok ? CARD.jade : "rgba(224,72,60,0.55)";
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, tile, tile, 8);
    ctx.stroke();

    ctx.fillStyle = ok ? CARD.jade : CARD.alarm;
    ctx.font = `600 ${Math.floor(tile * 0.5)}px "IBM Plex Mono", ui-monospace, monospace`;
    ctx.textBaseline = "middle";
    ctx.fillText(ok ? "✓" : "✕", x + tile / 2, y + tile / 2 + 2);
    ctx.textBaseline = "alphabetic";

    x += tile + gap;
  });

  /* Footline */
  const parts = [
    `${summary.correct}/${summary.answered} locks`,
    `best run ${summary.bestStreak}`,
  ];
  if (summary.answerMode === "typed") parts.push("typed");

  ctx.fillStyle = CARD.bone;
  ctx.font = '400 26px "IBM Plex Mono", ui-monospace, monospace';
  ctx.fillText(parts.join("   ·   "), w / 2, y + tile + 78);

  ctx.fillStyle = CARD.muted;
  ctx.font = '400 20px "IBM Plex Mono", ui-monospace, monospace';
  ctx.fillText("trivia.carlfung.dev", w / 2, h - 44);

  /* Hairline frame */
  ctx.strokeStyle = "rgba(201,162,77,0.30)";
  ctx.lineWidth = 1;
  roundRect(ctx, 22, 22, w - 44, h - 44, 14);
  ctx.stroke();

  return canvas;
}

/** Trigger a PNG download of the card. */
export function downloadCard(canvas, summary) {
  drawCard(canvas, summary);
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `trivia-bank-${localDateKey()}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, "image/png");
}

/** Copy text to the clipboard, with a fallback for insecure contexts. */
export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through to the legacy path */ }

  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}
