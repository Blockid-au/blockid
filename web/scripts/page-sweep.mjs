#!/usr/bin/env node
// G20-F2 — signed-in page sweep (spec docs/plans/g20-ready-for-sale-2026-09-20.md § 3 F2).
// Enumerates every page.tsx under src/app, classifies each route by the
// persona it requires, and drives Playwright (chromium from @playwright/test)
// per persona with a storage-state file. Read-only GET traffic; nothing is
// clicked, nothing is spent.
//
//   node scripts/page-sweep.mjs --base https://blockid.au                      # public routes, anonymous
//   node scripts/page-sweep.mjs --state founder=test-results/live-qa/storage-state.json \
//        --state evaluator=test-results/live-qa/evaluator-storage-state.json \
//        --fixtures /tmp/fixtures.json --all-personas                           # signed-in sweep
//   --persona founder   only that persona · --limit 40 · --route /workspace/plan (substring)
//   --report-only       write the report, exit 0 even with defects
//   --all-personas      also visit every signed-in route anonymously (must bounce to
//                       /auth/login) and evaluator/accelerator routes as the founder
//
// Per visit: {route, path, persona, persona_required, status, final_url, h1_count, h1,
// console_errors[], failed_requests[], overflow_375, missing_alt[], has_main,
// gate_markers[], error_boundary, ms, defects[]} → content/reports/page-sweep-latest.json
// (every row) + page-sweep.jsonl (one line per run: summary + defect rows).
// Exit 1 when any visit has a defect (unless --report-only); 2 on a crash /
// lock collision. Lock: /tmp/blockid-page-sweep.lock.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import { acquireLock, appendJsonl, WEB_DIR, writeJsonAtomic } from "./lib/ops-env.mjs";
import {
  CF_EMAIL_SCRIPT_RE,
  CF_EMAIL_SIGNATURES,
  CF_GTM_SIGNATURES,
  PERSONAS,
  USAGE,
  classifyRoute,
  enumerateRoutes,
  filterConsole,
  formatSummary,
  isNoiseRequest,
  isReportableRequest,
  judge,
  overflowScript,
  parseArgs,
  personasFor,
  probeScript,
  resolveDynamic,
  summarize,
} from "./lib/page-sweep-core.mjs";

const LOCK = "/tmp/blockid-page-sweep.lock";
const USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 BlockID-PageSweep/1.0";

/**
 * Documented h1 / 404 exceptions for the CLI (the live-qa lane keeps its own
 * PAGE_SWEEP_EXCEPTIONS map with reasons — docs/ops/page-sweep.md).
 */
export const CLI_EXCEPTIONS = {};

/**
 * Visit one path in `context`, returning the sweep row. The console / request
 * listeners are attached before navigation and detached after the probes so
 * a long-lived page can be reused.
 */
export async function sweepOne(context, { route, path: urlPath, persona, personaRequired, gate }, opts) {
  const page = await context.newPage();
  const consoleEntries = [];
  const failed = [];
  let htmlHasCfInjection = false;
  let htmlHasCfEmail = false;
  const siteOrigin = new URL(opts.base).origin;
  const onConsole = (msg) => {
    if (msg.type() !== "error") return;
    consoleEntries.push({ type: "console", text: msg.text().slice(0, 400), url: msg.location()?.url });
  };
  const onPageError = (err) => consoleEntries.push({ type: "pageerror", text: String(err?.message ?? err).slice(0, 400) });
  const onRequestFailed = (req) => {
    const failure = req.failure()?.errorText ?? null;
    if (isNoiseRequest(req.url(), failure ?? "")) return;
    failed.push({ method: req.method(), url: req.url(), status: null, failure });
  };
  const onResponse = (res) => {
    const req = res.request();
    if (req.resourceType() === "document" && res.status() < 500) {
      void res
        .text()
        .then((body) => {
          if (CF_GTM_SIGNATURES.some((s) => body.includes(s))) htmlHasCfInjection = true;
          if (CF_EMAIL_SIGNATURES.some((s) => body.includes(s))) htmlHasCfEmail = true;
        })
        .catch(() => {});
    }
    if (res.status() < 400) return;
    failed.push({ method: req.method(), url: res.url(), status: res.status(), failure: null });
  };
  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  page.on("requestfailed", onRequestFailed);
  page.on("response", onResponse);

  const t0 = Date.now();
  const row = { ts: new Date().toISOString(), route, path: urlPath, persona, persona_required: personaRequired, gate: gate ?? null, status: null, final_url: null, h1_count: 0, h1: [], console_errors: [], failed_requests: [], overflow_375: false, overflow_wide: [], missing_alt: [], has_main: false, gate_markers: [], error_boundary: false, title: null, ms: 0, defects: [] };
  try {
    let res = await page.goto(`${opts.base}${urlPath}`, { waitUntil: "domcontentloaded", timeout: opts.timeoutMs });
    if (res && (res.status() === 502 || res.status() === 503 || res.status() === 504)) {
      // Deploy swap — one retry after a pause, like tests/live-qa/lib/api.ts.
      await page.waitForTimeout(8_000);
      res = await page.goto(`${opts.base}${urlPath}`, { waitUntil: "domcontentloaded", timeout: opts.timeoutMs });
    }
    row.status = res ? res.status() : null;
    await page.waitForTimeout(opts.settleMs);
    row.final_url = page.url();
    const probe = await page.evaluate(probeScript).catch(() => null);
    if (probe) Object.assign(row, { title: probe.title, h1_count: probe.h1_count, h1: probe.h1, has_main: probe.has_main, missing_alt: probe.missing_alt, gate_markers: probe.gate_markers, error_boundary: probe.error_boundary });
    if (row.status !== null && row.status < 400) {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.waitForTimeout(150);
      const ov = await page.evaluate(overflowScript).catch(() => null);
      if (ov) {
        row.overflow_375 = ov.scrollWidth > ov.innerWidth + 1 || ov.wide.length > 0;
        row.overflow_wide = ov.wide;
      }
    }
  } catch (e) {
    consoleEntries.push({ type: "pageerror", text: `navigation: ${String(e?.message ?? e).slice(0, 300)}` });
  } finally {
    row.ms = Date.now() - t0;
    page.off("console", onConsole);
    page.off("pageerror", onPageError);
    page.off("requestfailed", onRequestFailed);
    page.off("response", onResponse);
    await page.close().catch(() => {});
  }
  const failedRequests = failed.filter((f) => isReportableRequest(f, siteOrigin) && !(htmlHasCfEmail && f.status === null && CF_EMAIL_SCRIPT_RE.test(f.url)));
  // The document's own 4xx (a 402 gate, a 404) is the status — not a failed request.
  row.failed_requests = failedRequests.filter((f) => !(f.url === `${opts.base}${urlPath}` || f.url === row.final_url));
  const allowedRequestUrls = new Set(failed.filter((f) => !failedRequests.includes(f)).map((f) => f.url));
  for (const f of failedRequests) if (!row.failed_requests.includes(f)) allowedRequestUrls.add(f.url);
  row.console_errors = filterConsole(consoleEntries, { htmlHasCfInjection, htmlHasCfEmail, allowedRequestUrls }).errors;
  row.defects = judge(row, { exceptions: opts.exceptions ?? CLI_EXCEPTIONS });
  return row;
}

/** Plan the (path, persona) visits from the route table. */
export function planVisits(routes, opts) {
  const visits = [];
  const skippedDynamic = [];
  for (const entry of routes) {
    if (opts.routeFilter && !entry.route.includes(opts.routeFilter)) continue;
    const urlPath = resolveDynamic(entry.route, entry.dynamic, opts.fixtures);
    if (urlPath === null) {
      skippedDynamic.push(entry.route);
      continue;
    }
    for (const persona of personasFor(entry.persona, opts.mode)) {
      if (opts.persona && persona !== opts.persona) continue;
      visits.push({ route: entry.route, path: urlPath, persona, personaRequired: entry.persona, gate: entry.gate });
    }
  }
  return { visits: visits.slice(0, opts.limit), skippedDynamic };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(USAGE);
    return 0;
  }
  const appDir = path.join(WEB_DIR, "src", "app");
  const routes = enumerateRoutes(appDir).map((entry) => {
    let source = "";
    try {
      source = readFileSync(path.join(appDir, entry.file), "utf8");
    } catch {
      /* unreadable page — classify from the path alone */
    }
    return { ...entry, ...classifyRoute(entry, source) };
  });
  const { visits, skippedDynamic } = planVisits(routes, opts);

  const needed = [...new Set(visits.map((v) => v.persona))];
  const skippedPersonas = needed.filter((p) => p !== "public" && !(opts.states[p] && existsSync(opts.states[p])));
  const active = needed.filter((p) => !skippedPersonas.includes(p));
  const todo = visits.filter((v) => active.includes(v.persona));
  console.log(`page-sweep: ${routes.length} routes · ${visits.length} planned visits · personas ${active.join(", ") || "(none)"}${skippedPersonas.length ? ` · skipped ${skippedPersonas.join(", ")} (no --state)` : ""} · base ${opts.base}`);

  const outDir = opts.outDir ?? path.join(WEB_DIR, "content", "reports");
  const browser = await chromium.launch();
  const rows = [];
  try {
    for (const persona of PERSONAS) {
      const mine = todo.filter((v) => v.persona === persona);
      if (!mine.length) continue;
      const context = await browser.newContext({
        storageState: persona === "public" ? { cookies: [], origins: [] } : opts.states[persona],
        viewport: { width: 1366, height: 900 },
        userAgent: USER_AGENT,
        ignoreHTTPSErrors: false,
      });
      try {
        let i = 0;
        const worker = async () => {
          while (i < mine.length) {
            const v = mine[i++];
            const row = await sweepOne(context, v, opts);
            rows.push(row);
            const mark = row.defects.length ? "✗" : "·";
            console.log(`  ${mark} ${persona.padEnd(11)} ${v.path.padEnd(52)} ${String(row.status ?? "—").padStart(3)} ${String(row.ms).padStart(5)} ms${row.defects.length ? `  ${row.defects.join(", ")}` : ""}`);
          }
        };
        await Promise.all(Array.from({ length: Math.min(opts.concurrency, mine.length) }, worker));
      } finally {
        await context.close().catch(() => {});
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }

  rows.sort((a, b) => (a.persona === b.persona ? (a.path < b.path ? -1 : 1) : PERSONAS.indexOf(a.persona) - PERSONAS.indexOf(b.persona)));
  const summary = summarize(rows, { skippedDynamic, skippedPersonas });
  const report = { ts: new Date().toISOString(), base: opts.base, ...summary, routes: routes.length, rows };
  writeJsonAtomic(path.join(outDir, "page-sweep-latest.json"), report);
  appendJsonl(path.join(outDir, "page-sweep.jsonl"), { ts: report.ts, base: opts.base, routes: routes.length, pages: summary.pages, defects: summary.defects, by_persona: summary.by_persona, skipped_dynamic: skippedDynamic.length, defect_rows: summary.defect_rows });
  console.log(formatSummary(summary));
  console.log(`page-sweep: report → ${path.join(outDir, "page-sweep-latest.json")}`);
  return summary.defects > 0 && !opts.reportOnly ? 1 : 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  const release = acquireLock(LOCK);
  if (!release) {
    console.error(`page-sweep: another run holds ${LOCK} — aborting`);
    process.exit(2);
  }
  main()
    .then((code) => {
      release();
      process.exit(code);
    })
    .catch((e) => {
      console.error(`page-sweep: crashed — ${e?.stack ?? e}`);
      release();
      process.exit(2);
    });
}
