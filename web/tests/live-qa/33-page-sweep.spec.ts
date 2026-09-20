/**
 * 33 — Signed-in page sweep (G20-F2, spec docs/plans/g20-ready-for-sale-2026-09-20.md § 3 F2).
 *
 * Walks EVERY page.tsx route the founder / evaluator / accelerator personas
 * can reach (enumerated from src/app by scripts/lib/page-sweep-core.mjs —
 * the same table the CLI `node scripts/page-sweep.mjs` uses) and asserts,
 * per page:
 *   • an expected status — 200 on the route, a gate (402 / a gate card
 *     marker) or a redirect to /pricing · a shell landing · login;
 *   • exactly one <h1> (PAGE_SWEEP_EXCEPTIONS lists the documented ones);
 *   • no console errors (console-guard allow-list, mirrored in the core);
 *   • no failed same-origin requests;
 *   • no horizontal overflow at 375 px;
 *   • a <main> landmark and an alt on every <img>;
 *   • no route error boundary (data-testid="error-boundary").
 *
 * Personas (one browser context each, SWEEP_CONCURRENCY pages in flight):
 *   founder     — the run's account (Free); when LIVE_QA_ELEVATE=1 the routes
 *                 that gated on Free are re-visited on Growth;
 *   evaluator   — the seat the dossier lane (28) registered and typed
 *                 investor_angel (evaluator-storage-state.json);
 *   accelerator — the SAME seat re-typed `accelerator` + plan
 *                 `accelerator_starter` for the duration of its sweep, then
 *                 restored (the register bucket is 3 / 15 min per IP and the
 *                 founder, member and evaluator registers hold the three).
 *
 * Dynamic segments resolve from the run state (project id / slug, the
 * dossier evaluation id, the fundraise round id); the rest are skipped and
 * listed. Rows are attached as evidence and written to
 * content/reports/page-sweep-latest.json + page-sweep.jsonl (label
 * `live-qa`), the same shape the CLI writes. Read-only: nothing is clicked,
 * nothing is spent. Budget ≤ 6 min in total.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Browser, BrowserContext } from "@playwright/test";
import { test, expect } from "./fixtures";
import { evidence } from "./lib/api";
import { env } from "./lib/env";
import { dbAllowed, elevatePlan, setAccountType } from "./lib/db";
import { getScratch, patchRunState, readRunState } from "./lib/run-state";
import { LIVE_QA_OUT, LIVE_QA_STORAGE } from "../../playwright.live-qa.config";
// Only the core — scripts/page-sweep.mjs and scripts/lib/ops-env.mjs use
// `import.meta`, which Playwright's CJS transform refuses inside a spec.
import { classifyRoute, enumerateRoutes, formatSummary, planVisits, summarize, sweepOne } from "../../scripts/lib/page-sweep-core.mjs";

const EVALUATOR_STATE = path.join(LIVE_QA_OUT, "evaluator-storage-state.json");
const APP_DIR = path.resolve(__dirname, "..", "..", "src", "app");
const REPORT_DIR = path.resolve(__dirname, "..", "..", "content", "reports");
/** Pages in flight per persona context. Production is read-only GET traffic. */
const SWEEP_CONCURRENCY = 4;
const SETTLE_MS = 700;
/** The whole lane must fit in 6 min; one persona sweep gets up to 4. */
const PERSONA_BUDGET_MS = 4 * 60_000;

/**
 * Documented exceptions — every entry needs a reason (docs/ops/page-sweep.md
 * repeats this table). `h1`: the accepted h1 count; `allow404`: the route is
 * a fixture-only page that answers 404 for the QA data; `redirectTo`: an
 * expected redirect target outside the shell prefixes.
 */
export const PAGE_SWEEP_EXCEPTIONS: Record<string, { h1?: number; allow404?: boolean; redirectTo?: string; reason: string }> = {
  "/docs/design-system": { h1: 7, reason: "noindex typography specimen page — each display/h1 level renders a real <h1> on purpose (golden-snapshot QA target)" },
  "/workspace/reports/[id]": { allow404: true, reason: "G19-owned report page; the QA project has no completed analysis in a sweep-only run, so the fixture id answers 404" },
};

type Visit = { route: string; path: string; persona: string; personaRequired: string; gate: unknown };
type Row = {
  route: string;
  path: string;
  persona: string;
  status: number | null;
  final_url: string | null;
  h1_count: number;
  h1: string[];
  console_errors: Array<{ type: string; text: string }>;
  failed_requests: Array<{ method: string; url: string; status: number | null }>;
  overflow_375: boolean;
  missing_alt: string[];
  has_main: boolean;
  gate_markers: string[];
  error_boundary: boolean;
  ms: number;
  defects: string[];
};

function fixturesFromRunState(): Record<string, string> {
  const qa = readRunState();
  const fx: Record<string, string> = {};
  if (qa.projectId) fx["[projectId]"] = qa.projectId;
  if (qa.projectSlug) fx["[slug]"] = qa.projectSlug;
  const evaluationId = getScratch<string>("dossier.evaluationId");
  if (evaluationId) fx["[evaluationId]"] = evaluationId;
  const roundId = getScratch<string>("fundraise.roundId");
  if (roundId) fx["[roundId]"] = roundId;
  const reportId = getScratch<string>("funding.reportId");
  fx["[id]"] = reportId ?? "00000000-0000-4000-8000-000000000000";
  fx["[chapter]"] = "01-vision";
  fx["[role]"] = "cfo";
  return fx;
}

function routeTable() {
  return enumerateRoutes(APP_DIR).map((entry: { file: string; route: string; groups: string[]; dynamic: string[] }) => {
    let source = "";
    try {
      source = readFileSync(path.join(APP_DIR, entry.file), "utf8");
    } catch {
      /* unreadable page — classify from the path alone */
    }
    return { ...entry, ...classifyRoute(entry, source) };
  });
}

function visitsFor(persona: string, fixtures: Record<string, string>): { visits: Visit[]; skippedDynamic: string[] } {
  const { visits, skippedDynamic } = planVisits(routeTable(), { fixtures, mode: "own", persona, limit: Infinity, routeFilter: null });
  return { visits: visits as Visit[], skippedDynamic: skippedDynamic as string[] };
}

async function sweep(context: BrowserContext, visits: Visit[], baseURL: string, label: string): Promise<Row[]> {
  const rows: Row[] = [];
  const opts = { base: baseURL, settleMs: SETTLE_MS, timeoutMs: 45_000, exceptions: PAGE_SWEEP_EXCEPTIONS };
  const started = Date.now();
  let i = 0;
  const worker = async () => {
    while (i < visits.length) {
      if (Date.now() - started > PERSONA_BUDGET_MS) throw new Error(`${label}: persona budget of ${PERSONA_BUDGET_MS / 1000}s exceeded after ${rows.length}/${visits.length} pages`);
      const v = visits[i++]!;
      const row = (await sweepOne(context, v, opts)) as Row;
      rows.push(row);
    }
  };
  await Promise.all(Array.from({ length: Math.min(SWEEP_CONCURRENCY, visits.length) }, worker));
  return rows.sort((a, b) => (a.path < b.path ? -1 : 1));
}

const ALL_ROWS: Row[] = [];
const ALL_SKIPPED = new Set<string>();

async function assertClean(rows: Row[], skipped: string[], label: string, testInfo: Parameters<typeof evidence>[0]): Promise<void> {
  ALL_ROWS.push(...rows);
  for (const s of skipped) ALL_SKIPPED.add(s);
  const summary = summarize(rows, { skippedDynamic: skipped });
  await evidence(testInfo, `${label} — summary`, summary);
  await evidence(testInfo, `${label} — rows`, rows.map((r) => ({ path: r.path, status: r.status, final: r.final_url, h1: r.h1_count, main: r.has_main, ms: r.ms, defects: r.defects })));
  console.log(`[live-qa] ${label}\n${formatSummary(summary)}`);
  const defects = rows.filter((r) => r.defects.length).map((r) => `${r.persona} ${r.path} → ${r.status} ${r.defects.join(", ")}${r.console_errors[0] ? ` · ${r.console_errors[0].text.slice(0, 120)}` : ""}${r.failed_requests[0] ? ` · ${r.failed_requests[0].method} ${r.failed_requests[0].url} ${r.failed_requests[0].status}` : ""}`);
  expect(defects, `${label}: every page renders clean`).toEqual([]);
}

async function personaContext(browser: Browser, storageState: string): Promise<BrowserContext> {
  return browser.newContext({ storageState, viewport: { width: 1366, height: 900 } });
}

test.describe("Page sweep — founder", () => {
  test("every founder route renders clean on the run's plan (Free → gates; Growth when elevated)", async ({ browser, qa, credits }, testInfo) => {
    test.setTimeout(PERSONA_BUDGET_MS + 60_000);
    const before = await credits.snapshot();
    const fixtures = fixturesFromRunState();
    const { visits, skippedDynamic } = visitsFor("founder", fixtures);
    expect(visits.length, "founder routes enumerated").toBeGreaterThan(100);
    const ctx = await personaContext(browser, LIVE_QA_STORAGE);
    try {
      const rows = await sweep(ctx, visits, qa.baseURL, `founder (${qa.plan})`);
      const gated = rows.filter((r) => (r.final_url ?? "").includes("/pricing") || r.status === 402 || r.gate_markers.length > 0);
      await evidence(testInfo, "gated on this plan", gated.map((r) => ({ path: r.path, status: r.status, final: r.final_url, markers: r.gate_markers })));
      let growthRows: Row[] = [];
      if (env.elevate && dbAllowed() && !qa.elevated && gated.length) {
        // Same step as 01-elevate — a sweep-only run still covers the Growth pages.
        elevatePlan(qa.email, "growth");
        patchRunState({ plan: "growth", elevated: true });
        growthRows = await sweep(ctx, gated.map((r) => visits.find((v) => v.path === r.path)!).filter(Boolean), qa.baseURL, "founder (growth, re-visit of gated routes)");
        for (const r of growthRows) r.persona = "founder-growth";
      }
      // Read-only by construction — nothing is clicked; the balance proves it.
      await credits.assertUnchanged(before, "founder page sweep");
      await assertClean([...rows, ...growthRows], skippedDynamic, `founder (${readRunState().plan})`, testInfo);
    } finally {
      await ctx.close();
    }
  });
});

test.describe("Page sweep — evaluator + accelerator seat", () => {
  test("every evaluator route renders clean for the investor_angel seat", async ({ browser, qa }, testInfo) => {
    test.setTimeout(PERSONA_BUDGET_MS + 60_000);
    test.skip(!existsSync(EVALUATOR_STATE) || !readRunState().evaluator, getScratch<string>("dossier.skipReason") ?? "the evaluator seat was not provisioned earlier in this run (28-dossier)");
    const fixtures = fixturesFromRunState();
    const evaluatorProject = readRunState().evaluator?.projectId;
    if (evaluatorProject) fixtures["[projectId]"] = evaluatorProject;
    const { visits, skippedDynamic } = visitsFor("evaluator", fixtures);
    expect(visits.length).toBeGreaterThan(5);
    const ctx = await personaContext(browser, EVALUATOR_STATE);
    try {
      const rows = await sweep(ctx, visits, qa.baseURL, "evaluator (investor_angel)");
      await assertClean(rows, skippedDynamic, "evaluator", testInfo);
    } finally {
      await ctx.close();
    }
  });

  test("every accelerator route renders clean for the seat re-typed accelerator (accelerator_starter when elevated), then restored", async ({ browser, qa }, testInfo) => {
    test.setTimeout(PERSONA_BUDGET_MS + 60_000);
    const seat = readRunState().evaluator;
    test.skip(!dbAllowed(), "needs LIVE_QA_ALLOW_DB=1 to re-type the evaluator seat as an accelerator");
    test.skip(!existsSync(EVALUATOR_STATE) || !seat, getScratch<string>("dossier.skipReason") ?? "the evaluator seat was not provisioned earlier in this run (28-dossier)");
    const fixtures = fixturesFromRunState();
    if (seat!.projectId) fixtures["[projectId]"] = seat!.projectId;
    const { visits, skippedDynamic } = visitsFor("accelerator", fixtures);
    expect(visits.length).toBeGreaterThan(3);
    setAccountType(seat!.email, "accelerator");
    if (env.elevate) elevatePlan(seat!.email, "accelerator_starter");
    const ctx = await personaContext(browser, EVALUATOR_STATE);
    try {
      const rows = await sweep(ctx, visits, qa.baseURL, `accelerator (${env.elevate ? "accelerator_starter" : "free"})`);
      await assertClean(rows, skippedDynamic, "accelerator", testInfo);
    } finally {
      await ctx.close();
      // Restore the seat for the lanes that follow (29-intake expects a paying Scout).
      setAccountType(seat!.email, "investor_angel");
      if (env.elevate) elevatePlan(seat!.email, "investor_angel");
    }
  });
});

test.describe("Page sweep — report", () => {
  test("write content/reports/page-sweep-latest.json + page-sweep.jsonl (label live-qa)", async ({ qa }, testInfo) => {
    const rows = [...ALL_ROWS].sort((a, b) => (a.persona === b.persona ? (a.path < b.path ? -1 : 1) : a.persona < b.persona ? -1 : 1));
    test.skip(rows.length === 0, "no sweep rows in this run");
    const summary = summarize(rows, { skippedDynamic: [...ALL_SKIPPED].sort() });
    const ts = new Date().toISOString();
    mkdirSync(REPORT_DIR, { recursive: true });
    const latest = path.join(REPORT_DIR, "page-sweep-latest.json");
    writeFileSync(`${latest}.${process.pid}.tmp`, JSON.stringify({ ts, base: qa.baseURL, label: "live-qa", ...summary, rows }, null, 2) + "\n");
    renameSync(`${latest}.${process.pid}.tmp`, latest);
    appendFileSync(path.join(REPORT_DIR, "page-sweep.jsonl"), JSON.stringify({ ts, base: qa.baseURL, label: "live-qa", pages: summary.pages, defects: summary.defects, by_persona: summary.by_persona, skipped_dynamic: summary.skipped_dynamic.length, defect_rows: summary.defect_rows }) + "\n");
    await evidence(testInfo, "page-sweep summary", summary);
    console.log(`[live-qa] page sweep total\n${formatSummary(summary)}`);
  });
});
