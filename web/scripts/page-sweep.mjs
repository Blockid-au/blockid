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
//   --no-light          skip the G26 light-template check (body + first main section
//                       background luminance > 0.85, body text luminance < 0.35)
//   --all-personas      also visit every signed-in route anonymously (must bounce to
//                       /auth/login) and evaluator/accelerator routes as the founder
//
// Per visit: {route, path, persona, persona_required, status, final_url, h1_count, h1,
// console_errors[], failed_requests[], overflow_375, missing_alt[], has_main,
// gate_markers[], error_boundary, content_type, light{body_bg, section_bg, body_color},
// ms, defects[]} → content/reports/page-sweep-latest.json
// (every row) + page-sweep.jsonl (one line per run: summary + defect rows).
// Exit 1 when any visit has a defect (unless --report-only); 2 on a crash /
// lock collision. Lock: /tmp/blockid-page-sweep.lock.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import { acquireLock, appendJsonl, WEB_DIR, writeJsonAtomic } from "./lib/ops-env.mjs";
import { PERSONAS, USAGE, classifyRoute, enumerateRoutes, formatSummary, parseArgs, planVisits, summarize, sweepOne } from "./lib/page-sweep-core.mjs";

const LOCK = "/tmp/blockid-page-sweep.lock";
const USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 BlockID-PageSweep/1.0";

/**
 * Documented h1 / 404 exceptions for the CLI — the same map the live-qa lane
 * keeps as PAGE_SWEEP_EXCEPTIONS (reasons in docs/ops/page-sweep.md § 3).
 */
export const CLI_EXCEPTIONS = {
  "/docs/design-system": { h1: 7, reason: "noindex typography specimen page — each display/h1 level renders a real <h1> on purpose" },
  // G25-D: the review step 404s by design without an order in the query string — sweep it with one.
  "/checkout/review": { visit: "/checkout/review?plan=founder_growth&trial=1&entry=sweep", reason: "review-before-pay step; needs an order in the query (404 without one by design)" },
  "/vi/checkout/review": { visit: "/vi/checkout/review?plan=founder_growth&trial=1&entry=sweep", reason: "VI mirror of the review step; needs an order in the query" },
};

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
  const { visits, skippedDynamic } = planVisits(routes, { ...opts, exceptions: CLI_EXCEPTIONS });

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
            const row = await sweepOne(context, v, { ...opts, exceptions: CLI_EXCEPTIONS });
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
