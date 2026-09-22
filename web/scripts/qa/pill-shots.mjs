#!/usr/bin/env node
// G29-C evidence: screenshots of the floating pills at 375 on a long page.
//
//   node scripts/qa/pill-shots.mjs --base http://127.0.0.1:4001 --label before --out content/screenshots/g29-c
//
// Registers a throw-away founder (qa-live-<yyyymmdd-hhmmss>@blockid.au — seconds
// so two runs in one minute never collide into the "pending" re-register path), opens the page
// signed in at 375×740, scrolls to the foot, and writes <label>-<route>.png.
// Prints the email so the caller erases it with scripts/db/erase-account.mjs.
// Never prints env values.
import { chromium, request } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith("--") ? [a.slice(2), all[i + 1] ?? ""] : [])).filter((e) => e.length));
const base = (args.base ?? "http://127.0.0.1:4001").replace(/\/+$/, "");
const label = args.label ?? "shot";
const out = path.resolve(args.out ?? "content/screenshots/g29-c");
const routes = (args.routes ?? "/tbr/demo,/pricing,/dashboard").split(",").filter(Boolean);
mkdirSync(out, { recursive: true });

const p = (n) => String(n).padStart(2, "0");
const d = new Date();
const stamp = `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
const email = `qa-live-${stamp}@blockid.au`;
const password = `Qa!${randomBytes(18).toString("base64url")}`;

const api = await request.newContext({ baseURL: base, extraHTTPHeaders: { accept: "application/json" } });
const reg = await api.post("/api/auth/register", { data: { email, password, displayName: "QA Pill Shots" } });
const regBody = await reg.json().catch(() => ({}));
if (reg.status() !== 200 || !regBody.ok || regBody.pending || !regBody.user?.id) {
  console.error(`register failed: ${reg.status()} ${JSON.stringify(regBody).slice(0, 200)}`);
  process.exit(1);
}
await api.post("/api/onboarding/complete", { data: { name: "QA Pill Shots", role: "founder", startupName: "QA Pill Shots", stage: "mvp", industry: "saas", goals: ["valuation"] } });
const me = await (await api.get("/api/auth/me")).json().catch(() => ({}));
if (!me?.ok || !me?.user?.id) {
  console.error(`no session after register: ${JSON.stringify(me).slice(0, 200)}`);
  process.exit(1);
}
const state = await api.storageState();

const browser = await chromium.launch();
const ctx = await browser.newContext({ storageState: state, viewport: { width: 375, height: 740 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const report = [];
for (const route of routes) {
  const slug = route.replace(/^\//, "").replace(/[^a-z0-9]+/gi, "-") || "home";
  try {
    await page.goto(`${base}${route}`, { waitUntil: "networkidle", timeout: 60_000 });
    // Let the consent pill / feedback FAB mount (both are post-hydration).
    await page.waitForTimeout(1500);
    // Answer the consent dialog once (Reject → no analytics) so the revocable
    // "Cookie prefs" pill is what stays on screen — the state under test.
    const reject = page.getByRole("dialog", { name: "Analytics consent" }).getByRole("button", { name: "Reject" });
    if (await reject.count()) {
      await reject.click();
      await page.waitForTimeout(400);
    }
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(800);
    const file = path.join(out, `${label}-${slug}-375.png`);
    await page.screenshot({ path: file, fullPage: false });
    const boxes = await page.evaluate(() => {
      const pick = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
      };
      return {
        cookie: pick('[aria-label="Open cookie preferences"]'),
        feedback: pick('[aria-label="Open feedback"]'),
        feedbackCount: document.querySelectorAll('[aria-label="Open feedback"]').length,
        stickyCta: pick('[data-testid="sticky-cta-link"]'),
        stack: pick('[data-testid="floating-stack"]'),
        viewport: { w: window.innerWidth, h: window.innerHeight },
      };
    });
    report.push({ route, file, ...boxes });
  } catch (e) {
    report.push({ route, error: String(e).slice(0, 200) });
  }
}
await browser.close();
await api.dispose();
console.log(JSON.stringify({ base, label, email, report }, null, 2));
