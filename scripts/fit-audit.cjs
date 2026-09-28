/* ==========================================================================
   Fit audit — is the whole question readable on the glass, at every size?
   Usage:  python3 scripts/serve.py 8765 &   then
           node scripts/fit-audit.cjs [baseUrl] [--shots <dir>] [--motion]

   Runs with reduced motion by default (no entrance animations to wait out);
   --motion runs the default a player gets. Run both: the fitter once read
   stale sizes only under reduced motion, where every property transitions.

   "0px page overflow" is not the test. The console can fit the viewport
   exactly while the display, the row that gives, is squeezed to a sliver and
   the question is cut off inside it — which shipped in b7df47b and was caught
   by eye on a short laptop window. This rig measures the question itself:
   how many pixels of its box fall outside the display's visible area, in
   every state that takes height from the display (Bank button docked, a
   reveal, Type-It with bought intel), for two REAL bank questions pinned
   onto the glass: the longest question, and the one with the longest options
   (long options wrap and grow the keys, which squeezes the glass instead).
   Random draws made the phone results change from run to run.

   Exits 1 if any question is clipped, if the fitter had to take it down to
   its type floor (a squeezed glass hiding behind small type is the same bug,
   quieter), or if the page itself overflows.
   ========================================================================== */
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const shotsAt = args.indexOf("--shots");
const shotDir = shotsAt >= 0 ? args.splice(shotsAt, 2)[1] : null;
const motionAt = args.indexOf("--motion");
const motion = motionAt >= 0 ? (args.splice(motionAt, 1), "no-preference") : "reduce";
const base = args[0] || "http://localhost:8765/";
if (shotDir) fs.mkdirSync(shotDir, { recursive: true });

const bank = require("../data/questions.json");
const all = Array.isArray(bank) ? bank : bank.questions;
const longestOpt = (q) => Math.max(...[q.answer, ...(q.options || [])].map((o) => String(o).length));
const PROBES = [
  { tag: "longQ", id: all.reduce((a, b) => (b.question.length > a.question.length ? b : a)).id, typed: true },
  { tag: "longOpts", id: all.reduce((a, b) => (longestOpt(b) > longestOpt(a) ? b : a)).id, typed: false },
];

/* Laptop windows with the browser chrome up, landscape phones (wide AND
   short, so none of the phone rules apply), and the iPhone sizes from the
   original fit pass. */
const VIEWPORTS = [
  { name: "laptop-1000x581", w: 1000, h: 581 },
  { name: "laptop-1280x600", w: 1280, h: 600 },
  { name: "laptop-1280x680", w: 1280, h: 680 },
  { name: "laptop-1366x625", w: 1366, h: 625 },
  { name: "laptop-1440x760", w: 1440, h: 760 },
  { name: "desk-1440x900", w: 1440, h: 900 },
  { name: "desk-1920x1000", w: 1920, h: 1000 },
  { name: "tablet-820x1080", w: 820, h: 1080, mobile: true },
  { name: "land-844x390", w: 844, h: 390, mobile: true },
  { name: "land-667x375", w: 667, h: 375, mobile: true },
  { name: "phone-320x568", w: 320, h: 568, mobile: true },
  { name: "phone-375x548", w: 375, h: 548, mobile: true },
  { name: "phone-393x659", w: 393, h: 659, mobile: true },
  { name: "phone-430x739", w: 430, h: 739, mobile: true },
];

/* ui.js QUESTION_MIN_PX. Landing on it means the layout left too little glass. */
const TYPE_FLOOR_PX = 13;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* Pixels of the question's box outside the display's visible box, plus
   whether the display has to scroll and whether the page itself overflows. */
function measure() {
  const d = document.getElementById("display");
  const q = document.getElementById("question");
  const dr = d.getBoundingClientRect();
  const cs = getComputedStyle(d);
  const top = dr.top + parseFloat(cs.borderTopWidth);
  const bottom = dr.bottom - parseFloat(cs.borderBottomWidth);
  /* Line boxes, not the element box: an h2 can be taller than its text. */
  const range = document.createRange();
  range.selectNodeContents(q);
  const rects = [...range.getClientRects()].filter((r) => r.height > 0);
  const qTop = Math.min(...rects.map((r) => r.top));
  const qBottom = Math.max(...rects.map((r) => r.bottom));
  const clipped = Math.max(0, top - qTop) + Math.max(0, qBottom - bottom);
  const doc = document.scrollingElement;
  /* The Bank button floats (fixed): it must not cover a key, a tool or the
     glass wherever a tier parks it. */
  const bank = document.getElementById("bank-btn");
  let bankHits = 0;
  if (bank && !bank.hidden) {
    const b = bank.getBoundingClientRect();
    const hit = (r) => r.width && r.height && b.left < r.right - 1 && b.right > r.left + 1 && b.top < r.bottom - 1 && b.bottom > r.top + 1;
    bankHits = [...document.querySelectorAll(".screen--play .option, .screen--play .tool, #display")].filter((n) => hit(n.getBoundingClientRect())).length;
  }
  return {
    bankHits,
    displayH: Math.round(bottom - top),
    lines: new Set(rects.map((r) => Math.round(r.top))).size,
    font: parseFloat(getComputedStyle(q).fontSize),
    clipped: Math.round(clipped),
    scrolls: d.scrollHeight - d.clientHeight > 1,
    pageOverflow: Math.max(0, doc.scrollHeight - window.innerHeight),
  };
}

/* Pin a bank question onto the live lock the way the engine's _nextQuestion
   does, then paint it with the shipped ui.renderQuestion (fitter included).
   The dynamic import resolves to the same module instance main.js uses. */
async function pin(page, id) {
  await page.evaluate(async (id) => {
    const ui = await import("/js/ui.js");
    const g = window.__game.game;
    const s = g.state;
    const q = g.bank.byId.get(id);
    Object.assign(s, { question: q, removed: [], poll: null, revealed: "", intel: "" });
    if (g.answerMode === "choice") {
      const built = g.buildOptionsFor(q, "fit-audit");
      s.options = built.options;
      s.correctIndex = built.correctIndex;
    } else {
      s.options = [];
      s.correctIndex = -1;
    }
    ui.renderQuestion(g);
  }, id);
  await wait(600);
}

async function run(engine, vp) {
  const browser = await engine.launch();
  const ctx = await browser.newContext({
    viewport: { width: vp.w, height: vp.h },
    deviceScaleFactor: vp.mobile ? 2 : 1,
    isMobile: !!vp.mobile,
    hasTouch: !!vp.mobile,
    reducedMotion: motion,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(base, { waitUntil: "networkidle" });
  await wait(800);

  const results = [];
  const check = async (state) => {
    await wait(250);
    const m = await page.evaluate(measure);
    results.push({ state, ...m });
    if (shotDir) await page.screenshot({ path: path.join(shotDir, `${engine.name()}-${vp.name}-${state}.png`) });
  };

  for (const probe of PROBES) {
    await page.evaluate(() => window.__game.start("vault", { answerMode: "choice" }));
    await wait(1600);
    await pin(page, probe.id);
    await check(`${probe.tag}:live`);

    await page.evaluate(() => window.__game.answer("correct"));
    await wait(700);
    await check(`${probe.tag}:reveal`);

    await page.evaluate(() => document.getElementById("next-btn").click());
    await wait(900);
    await pin(page, probe.id);
    await check(`${probe.tag}:bank`);

    if (probe.typed) {
      await page.evaluate(() => window.__game.start("vault", { answerMode: "typed" }));
      await wait(1600);
      await pin(page, probe.id);
      await page.evaluate(() => { window.__game.lifeline("etch"); window.__game.lifeline("informant"); });
      await wait(600);
      await check(`${probe.tag}:typed+intel`);
    }
  }

  await browser.close();
  return { results, errors };
}

(async () => {
  let bad = 0;
  for (const p of PROBES) {
    const q = all.find((x) => x.id === p.id);
    console.log(`${p.tag.padEnd(9)} #${p.id}: ${q.question.length}-char question, longest option ${longestOpt(q)} chars`);
  }
  console.log(`Motion: ${motion}\n`);
  for (const vp of VIEWPORTS) {
    const engines = vp.mobile ? [webkit] : [chromium, webkit];
    for (const engine of engines) {
      const { results, errors } = await run(engine, vp);
      for (const r of results) {
        const floored = r.font <= TYPE_FLOOR_PX + 0.5;
        const fail = r.clipped > 0 || r.pageOverflow > 0 || floored || r.bankHits > 0;
        if (fail) bad++;
        console.log(
          `${fail ? "FAIL" : " ok "}  ${engine.name().padEnd(8)} ${vp.name.padEnd(17)} ${r.state.padEnd(21)}` +
          ` glass ${String(r.displayH).padStart(3)}px  ${r.lines} lines @ ${r.font.toFixed(1)}px` +
          `  clipped ${r.clipped}px${floored ? "  AT TYPE FLOOR" : ""}${r.scrolls ? "  (glass scrolls)" : ""}${r.pageOverflow ? `  PAGE +${r.pageOverflow}px` : ""}${r.bankHits ? `  BANK COVERS ${r.bankHits}` : ""}`
        );
      }
      if (errors.length) { bad++; console.log(`      page errors: ${errors.join(" | ")}`); }
    }
  }
  console.log(bad ? `\n${bad} failing checks` : "\nall clear");
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
