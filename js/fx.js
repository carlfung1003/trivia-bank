/* ==========================================================================
   Visual juice: particles, screen shake, hit-pause, counter roll-up.
   --------------------------------------------------------------------------
   The particle field is a single full-screen canvas that only runs a rAF loop
   while particles are alive, so an idle title screen costs nothing.

   All of it is suppressed under prefers-reduced-motion — checked live rather
   than cached, because a player can change the OS setting mid-session.
   ========================================================================== */

import { FX } from "./config.js";
import { clamp, lerp } from "./util.js";

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---- Particle field ------------------------------------------------------ */

class Particles {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.items = [];
    this.running = false;
    this.dpr = 1;
    this._resize = this._resize.bind(this);
    this._frame = this._frame.bind(this);
    this._resize();
    window.addEventListener("resize", this._resize, { passive: true });
  }

  _resize() {
    /* Cap the pixel ratio — an uncapped DPR on a 3x phone is the single
       biggest cause of a canvas-heavy page dropping frames. */
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.floor(window.innerWidth * this.dpr);
    this.canvas.height = Math.floor(window.innerHeight * this.dpr);
    this.canvas.style.width = `${window.innerWidth}px`;
    this.canvas.style.height = `${window.innerHeight}px`;
  }

  /**
   * @param {number} x screen x
   * @param {number} y screen y
   * @param {object} opts
   */
  burst(x, y, { count = FX.particleCount, hue = 41, spread = Math.PI * 2, speed = 6, gravity = 0.28, life = 1, size = 3 } = {}) {
    if (reduced()) return;
    for (let i = 0; i < count; i++) {
      const a = (spread === Math.PI * 2)
        ? Math.random() * Math.PI * 2
        : -Math.PI / 2 + (Math.random() - 0.5) * spread;
      const v = speed * (0.35 + Math.random() * 0.85);
      this.items.push({
        x: x * this.dpr,
        y: y * this.dpr,
        vx: Math.cos(a) * v * this.dpr,
        vy: Math.sin(a) * v * this.dpr,
        g: gravity * this.dpr,
        life: life * (0.6 + Math.random() * 0.7),
        age: 0,
        size: (size * (0.5 + Math.random())) * this.dpr,
        hue: hue + (Math.random() - 0.5) * 18,
        sat: 55 + Math.random() * 30,
        lig: 55 + Math.random() * 22,
        spin: (Math.random() - 0.5) * 0.3,
        rot: Math.random() * Math.PI,
      });
    }
    this._start();
  }

  /** Coins raining from the top — banked a haul. */
  rain(count = 60) {
    if (reduced()) return;
    const w = this.canvas.width;
    for (let i = 0; i < count; i++) {
      this.items.push({
        x: Math.random() * w,
        y: -Math.random() * this.canvas.height * 0.4,
        vx: (Math.random() - 0.5) * 1.2 * this.dpr,
        vy: (2 + Math.random() * 3) * this.dpr,
        g: 0.12 * this.dpr,
        life: 2.6,
        age: 0,
        size: (3 + Math.random() * 3) * this.dpr,
        hue: 41 + (Math.random() - 0.5) * 14,
        sat: 62, lig: 58,
        spin: (Math.random() - 0.5) * 0.35,
        rot: Math.random() * Math.PI,
      });
    }
    this._start();
  }

  _start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this._frame);
  }

  _frame(now) {
    const dt = clamp((now - this.last) / 1000, 0, 0.05);
    this.last = now;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    for (let i = this.items.length - 1; i >= 0; i--) {
      const p = this.items[i];
      p.age += dt;
      if (p.age >= p.life) { this.items.splice(i, 1); continue; }

      p.vy += p.g;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.spin;

      const t = 1 - p.age / p.life;
      ctx.save();
      ctx.globalAlpha = clamp(t * 1.4, 0, 1);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = `hsl(${p.hue} ${p.sat}% ${p.lig}%)`;
      /* Squashed rects read as tumbling coins far better than circles. */
      const h = p.size * (0.35 + Math.abs(Math.cos(p.rot)) * 0.65);
      ctx.fillRect(-p.size / 2, -h / 2, p.size, h);
      ctx.restore();
    }

    if (this.items.length) {
      requestAnimationFrame(this._frame);
    } else {
      this.running = false;
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  clear() {
    this.items.length = 0;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}

/* ---- Shake, flash, hit-pause --------------------------------------------- */

export class Fx {
  constructor({ canvas, shell, vignette, stage }) {
    this.particles = new Particles(canvas);
    this.shell = shell;
    this.vignette = vignette;
    this.stage = stage;
    this._shakeTimer = null;
    this._flashTimer = null;
    this._freezeTimer = null;
  }

  shake(magnitude = FX.shakeMagnitude, ms = FX.shakeMs) {
    if (reduced() || !this.shell) return;
    clearTimeout(this._shakeTimer);
    this.shell.style.setProperty("--shake", String(magnitude));
    this.shell.style.setProperty("--shake-ms", `${ms}ms`);
    /* Reflow so a repeat shake restarts the animation. */
    this.shell.removeAttribute("data-shake");
    void this.shell.offsetWidth;
    this.shell.setAttribute("data-shake", "true");
    this._shakeTimer = setTimeout(() => this.shell.removeAttribute("data-shake"), ms + 40);
  }

  flash(kind) {
    if (!this.vignette) return;
    clearTimeout(this._flashTimer);
    this.vignette.removeAttribute("data-flash");
    void this.vignette.offsetWidth;
    this.vignette.setAttribute("data-flash", kind);
    this._flashTimer = setTimeout(() => this.vignette.removeAttribute("data-flash"), 700);
  }

  /**
   * Freeze-frame. A beat of held time on impact is the difference between an
   * answer that registers and an answer that lands.
   */
  hitPause(ms = FX.hitPauseMs) {
    if (reduced() || !this.stage) return;
    clearTimeout(this._freezeTimer);
    this.stage.setAttribute("data-freeze", "true");
    this._freezeTimer = setTimeout(() => this.stage.removeAttribute("data-freeze"), ms);
  }

  /** Gold burst centred on an element. */
  burstAt(el, opts = {}) {
    if (!el) return;
    const r = el.getBoundingClientRect();
    this.particles.burst(r.left + r.width / 2, r.top + r.height / 2, opts);
  }

  coinRain(n) { this.particles.rain(n); }

  /**
   * Fly a value from wherever it was earned to wherever it is counted.
   *
   * Without this the score board just changes, and the player has to infer
   * that the change came from the key they pressed. With it, the number is
   * visibly the thing they earned, travelling to the place that holds it —
   * which is most of why arcade scoring feels good.
   */
  popup(text, fromEl, toEl, kind = "gain") {
    if (!fromEl) return;
    const node = document.createElement("div");
    node.className = `popup popup--${kind}`;
    node.textContent = text;
    document.body.appendChild(node);

    const from = fromEl.getBoundingClientRect();
    const startX = from.left + from.width / 2;
    const startY = from.top + from.height / 2;
    node.style.left = `${startX}px`;
    node.style.top = `${startY}px`;

    const cleanup = () => node.remove();

    if (reduced()) {
      node.style.transform = "translate(-50%, -50%)";
      setTimeout(cleanup, 700);
      return;
    }

    const to = toEl?.getBoundingClientRect();
    const dx = to ? to.left + to.width / 2 - startX : 0;
    const dy = to ? to.top + to.height / 2 - startY : -70;

    /* Two phases: a punchy pop where it was earned, then a travel to the
       board. Arcing via a mid-keyframe rather than a straight line — a
       straight tween reads as a UI transition, an arc reads as a thrown
       object. */
    const anim = node.animate(
      [
        { transform: "translate(-50%, -50%) scale(0.6)", opacity: 0, offset: 0 },
        { transform: "translate(-50%, -50%) scale(1.15)", opacity: 1, offset: 0.14 },
        { transform: "translate(-50%, -50%) scale(1) translateY(-18px)", opacity: 1, offset: 0.42 },
        {
          transform: `translate(-50%, -50%) translate(${dx * 0.55}px, ${dy * 0.4 - 26}px) scale(0.85)`,
          opacity: 1,
          offset: 0.7,
        },
        {
          transform: `translate(-50%, -50%) translate(${dx}px, ${dy}px) scale(0.45)`,
          opacity: 0,
          offset: 1,
        },
      ],
      { duration: 1050, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "forwards" }
    );
    anim.onfinish = cleanup;
    anim.oncancel = cleanup;
  }

  clear() {
    this.particles.clear();
    for (const p of document.querySelectorAll(".popup")) p.remove();
  }
}

/* ---- Counter roll-up ------------------------------------------------------
   Numbers that tick up read as earned; numbers that snap read as assigned. */

export function rollNumber(el, from, to, ms = FX.counterRollMs, format = (n) => String(Math.round(n))) {
  if (!el) return;
  if (reduced() || ms <= 1) { el.textContent = format(to); return; }
  const start = performance.now();
  const step = (now) => {
    const t = clamp((now - start) / ms, 0, 1);
    /* Same expo-out shape as --ease, so JS motion matches CSS motion. */
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = format(lerp(from, to, eased));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
