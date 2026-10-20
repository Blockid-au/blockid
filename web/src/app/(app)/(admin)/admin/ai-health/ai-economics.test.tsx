// G35 A1/A3 — the /admin/ai-health economics cards render from the cron JSON.
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const dir = mkdtempSync(join(tmpdir(), "ai-econ-"));
vi.mock("@/lib/runtime-paths", () => ({ runtimeReportsPath: (...s: string[]) => join(dir, "content", "reports", ...s) }));

import { AIEconomicsCards } from "./ai-economics";
import { REPORT_PRICE_POLICY_EXPIRES_AT } from "@/lib/ai/report-attempt-budget";

const NOW = Date.parse(REPORT_PRICE_POLICY_EXPIRES_AT) - 5 * 86_400_000;

beforeAll(() => {
  const reports = join(dir, "content", "reports");
  mkdirSync(reports, { recursive: true });
  writeFileSync(join(reports, "ai-balances.json"), JSON.stringify({
    updated_at: "2026-10-20T12:00:00Z",
    thresholds: { warn_days: 14, critical_days: 3, warn_usd: 10, critical_usd: 3, burn_window_days: 7 },
    flags: { updated_at: "2026-10-20T12:00:00Z", deepinfra_critical: true, openrouter_paid_disabled: false, reasons: { deepinfra_critical: "balance US$2.00 < US$3" } },
    providers: {
      deepinfra: { provider: "deepinfra", kind: "prepaid", configured: true, balance_usd: 2, burn_usd_per_day: 1, runway_days: 2, level: "critical", reasons: ["balance US$2.00 < US$3"], source: "x", checked_at: "2026-10-20T12:00:00Z" },
      groq: { provider: "groq", kind: "free_tier", configured: true, balance_usd: null, burn_usd_per_day: 0, runway_days: null, level: "ok", reasons: [], source: "x", checked_at: "2026-10-20T12:00:00Z" },
    },
  }));
  writeFileSync(join(reports, "ai-price-feed.json"), JSON.stringify({
    generated_at: "2026-10-20T02:13:00Z", threshold_pct: 5, feeds: {},
    summary: { checked: 18, unchanged: 17, drift_minor: 0, changed: 1, missing: 0, feed_errors: 0 },
    comparisons: [{ provider: "deepinfra", id: "deepseek-ai/DeepSeek-V4-Flash", admitted: true, catalog: { in: 0.09, out: 0.18 }, feed: { in: 0.1, out: 0.18 }, changePct: 11.11, status: "changed" }],
  }));
  writeFileSync(join(reports, "ai-price-policy-renewal.json"), JSON.stringify({
    status: "proposed", policy_id: "deepinfra-standard-2026-09-23", current_expires_at: REPORT_PRICE_POLICY_EXPIRES_AT, days_left: 5, proposed_expires_at: "2026-12-22T00:00:00Z",
    generated_at: "2026-10-20T02:13:00Z", auto_applied: false, approval: "Founder approval required.", evidence: [], apply_steps: ["Set REPORT_PRICE_POLICY_EXPIRES_AT"],
  }));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("AIEconomicsCards", () => {
  it("shows balances + runway + level, the DeepInfra critical effect, price drift, policy countdown, the renewal proposal and the catalogue", () => {
    const html = renderToStaticMarkup(AIEconomicsCards({ now: NOW }));
    expect(html).toContain("AI balances + runway");
    expect(html).toMatch(/report jobs are queued/);
    expect(html).toContain("US$2.00");
    expect(html).toContain("2.0 d");
    expect(html).toContain("critical");
    expect(html).toContain("changed (11.11%)");
    expect(html).toMatch(/5\.0 days left/);
    expect(html).toContain("Renewal proposal ready → 2026-12-22T00:00:00Z");
    expect(html).toContain("Model catalogue");
    expect(html).toContain("deepseek-ai/DeepSeek-V3.2");
    expect(html).toContain("report (primary)");
  });
});
