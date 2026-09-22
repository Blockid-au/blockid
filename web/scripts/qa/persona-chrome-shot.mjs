#!/usr/bin/env node
// G29-C evidence: a FOUNDER-typed seat elevated to an evaluator plan must get
// the evaluator chrome — no "You are on Phase N of 12" banner, no founder hub
// tablist, `data-chrome="evaluator"` on the sidebar nav.
//
//   node scripts/qa/persona-chrome-shot.mjs --base http://127.0.0.1:4109 --plan investor_vc_small --out docs/design/screenshots/g29-c
//
// Registers a throw-away founder (qa-live-<yyyymmdd-hhmmss>@blockid.au),
// flips ONLY its plan via `docker exec supabase-db psql` (account_type stays
// "founder" — that is the case under test), opens /dashboard and
// /workspace/evaluations at 375 and prints the chrome pins + screenshot paths.
// Erase the printed address afterwards with scripts/db/erase-account.mjs.
import { chromium, request } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith("--") ? [a.slice(2), all[i + 1] ?? ""] : [])).filter((e) => e.length));
const base = (args.base ?? "http://127.0.0.1:4001").replace(/\/+$/, "");
const plan = args.plan ?? "investor_vc_small";
if (!/^[a-z_]+$/.test(plan)) throw new Error("bad plan token");
const out = path.resolve(args.out ?? "content/screenshots/g29-c");
mkdirSync(out, { recursive: true });

const p = (n) => String(n).padStart(2, "0");
const d = new Date();
const stamp = `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
const email = `qa-live-${stamp}@blockid.au`;
const password = `Qa!${randomBytes(18).toString("base64url")}`;

function psql(sql) {
  const container = process.env.SUPABASE_DB_CONTAINER || "supabase-db";
  return execFileSync("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8" }).trim();
}

const api = await request.newContext({ baseURL: base, extraHTTPHeaders: { accept: "application/json" } });
const reg = await api.post("/api/auth/register", { data: { email, password, displayName: "QA Persona Chrome" } });
const regBody = await reg.json().catch(() => ({}));
if (reg.status() !== 200 || !regBody.ok || regBody.pending || !regBody.user?.id) {
  console.error(`register failed: ${reg.status()} ${JSON.stringify(regBody).slice(0, 200)}`);
  process.exit(1);
}
await api.post("/api/onboarding/complete", { data: { name: "QA Persona Chrome", role: "founder", startupName: "QA Persona Chrome", stage: "mvp", industry: "saas", goals: ["valuation"] } });
const flipped = psql(`update public.app_users set plan = '${plan}' where email = '${email}' and email ~ '^qa-live-[0-9]{8}-[0-9]{6}@blockid\\.au$' returning account_type || '/' || plan;`);
const state = await api.storageState();

const browser = await chromium.launch();
const ctx = await browser.newContext({ storageState: state, viewport: { width: 375, height: 740 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const report = [];
for (const route of ["/dashboard", "/workspace/evaluations", "/workspace/settings"]) {
  const slug = route.replace(/^\//, "").replace(/[^a-z0-9]+/gi, "-");
  try {
    await page.goto(`${base}${route}`, { waitUntil: "networkidle", timeout: 60_000 });
    await page.waitForTimeout(2500);
    const file = path.join(out, `persona-${plan}-${slug}-375.png`);
    await page.screenshot({ path: file, fullPage: false });
    const pins = await page.evaluate(() => {
      const nav = document.querySelector("nav[aria-label='Workspace navigation']");
      return {
        url: location.pathname,
        chrome: nav?.getAttribute("data-chrome") ?? null,
        persona: nav?.getAttribute("data-persona") ?? null,
        phaseBanner: document.querySelectorAll('[data-testid="product-tour-banner"]').length,
        phaseCopy: /You are on Phase \d+ of 12/.test(document.body.innerText),
        tablist: document.querySelectorAll('[role="tablist"]').length,
        growthNudge: /Credits running low/.test(document.body.innerText),
        checklistSubtitle: [...document.querySelectorAll("p")].map((n) => n.textContent ?? "").find((t) => /keeps doing for you every week/.test(t)) ?? null,
      };
    });
    report.push({ route, file, ...pins });
  } catch (e) {
    report.push({ route, error: String(e).slice(0, 200) });
  }
}
await browser.close();
await api.dispose();
console.log(JSON.stringify({ base, email, flipped, report }, null, 2));
