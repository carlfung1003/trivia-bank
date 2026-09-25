/* ==========================================================================
   Screenshot rig — every screen, desktop 1440x900 and a 390x844 phone.
   Usage:  python3 scripts/serve.py 8765 &   then
           node scripts/shots.cjs <outDir> [baseUrl]

   Judge visual changes from these, never from code. Drives the real UI
   through the debug API (window.__game / __board / __street) and real DOM
   clicks, so reveals, the busted hold and the results slip are captured the
   way a player sees them. Console errors land in <outDir>/<vp>-errors.txt.

   The repo has no package.json (house rule), so Playwright is borrowed from
   wherever it is installed: PLAYWRIGHT_MODULE, then a normal resolve.
   ========================================================================== */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const fs = require("fs");
const path = require("path");

const out = process.argv[2] || "shots";
const base = process.argv[3] || "http://localhost:8765/";
fs.mkdirSync(out, { recursive: true });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function run(vpName, viewport, isMobile) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: isMobile ? 2 : 1, isMobile, hasTouch: isMobile });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  const shot = async (name, full = false) => {
    await page.screenshot({ path: path.join(out, `${vpName}-${name}.png`), fullPage: full });
  };

  await page.goto(base, { waitUntil: "networkidle" });
  await wait(1800);
  await shot("01-title");
  await shot("01-title-full", true);

  await page.evaluate(() => { const d = document.querySelector(".panel--setup"); if (d) d.open = true; });
  await wait(500);
  await shot("02-setup-full", true);
  await page.evaluate(() => { const d = document.querySelector(".panel--setup"); if (d) d.open = false; });

  // Vault run, choice
  await page.evaluate(() => window.__game.start("vault", { answerMode: "choice" }));
  await wait(2200);
  await shot("03-play-choice");
  await page.evaluate(() => window.__game.lifeline("wiretap"));
  await wait(900);
  await shot("04-play-wiretap");
  await page.evaluate(() => { const g = window.__game.game; document.querySelector(`.option[data-index="${g.state.correctIndex}"]`).click(); });
  await wait(1100);
  await shot("05-reveal-correct");
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => document.getElementById("next-btn").click());
    await wait(500);
    await page.evaluate(() => { const g = window.__game.game; document.querySelector(`.option[data-index="${g.state.correctIndex}"]`).click(); });
    await wait(700);
  }
  await shot("06-after-haven");
  await page.evaluate(() => document.getElementById("next-btn").click());
  await wait(600);
  await page.evaluate(() => { const g = window.__game.game; const s = g.state; const w = s.options.map((_, i) => i).find((i) => i !== s.correctIndex); document.querySelector(`.option[data-index="${w}"]`).click(); });
  await wait(700);
  await shot("07-reveal-alibi");
  await page.evaluate(() => document.getElementById("next-btn").click());
  await wait(600);
  await page.evaluate(() => { const g = window.__game.game; const s = g.state; const w = s.options.map((_, i) => i).find((i) => i !== s.correctIndex); document.querySelector(`.option[data-index="${w}"]`).click(); });
  await wait(1400);
  await shot("08-busted-hold");
  await page.evaluate(() => document.getElementById("next-btn").click());
  await wait(3500);
  await shot("09-results");
  await shot("09-results-full", true);

  // Typed mode with etch + informant
  await page.evaluate(() => window.__game.start("vault", { answerMode: "typed" }));
  await wait(2200);
  await page.evaluate(() => { window.__game.lifeline("etch"); window.__game.lifeline("informant"); });
  await wait(700);
  await page.fill("#typed-input", "Somethin");
  await shot("10-play-typed");

  // Pause
  await page.evaluate(() => document.querySelector("#quit, [data-action='quit'], .hud__back")?.click());
  await wait(600);
  await shot("11-pause");

  // Board — fresh page, so no pause overlay or pending transition interferes.
  await page.goto(base, { waitUntil: "networkidle" });
  await wait(1500);
  await page.evaluate(() => window.__board.start());
  await wait(2400);
  await shot("12-board");
  await page.evaluate(() => window.__board.pick(2, 2));
  await wait(1200);
  await shot("13-board-clue");
  await page.evaluate(() => window.__board.answer("wrong"));
  await wait(900);
  await shot("14-board-verdict");

  // Street
  await page.goto(base, { waitUntil: "networkidle" });
  await wait(1500);
  await page.evaluate(() => window.__street.start());
  await wait(2400);
  await page.evaluate(() => { window.__street.guess("next"); window.__street.guess("next"); window.__street.guess("wrong"); });
  await wait(1200);
  await shot("15-street");

  fs.writeFileSync(path.join(out, `${vpName}-errors.txt`), errors.join("\n"));
  await browser.close();
}

(async () => {
  await run("desk", { width: 1440, height: 900 }, false);
  await run("mob", { width: 390, height: 844 }, true);
  console.log("done");
})().catch((e) => { console.error(e); process.exit(1); });
