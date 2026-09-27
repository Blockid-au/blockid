// daily-admin-report — 27/09 health sweep: the run timed out at cron-runner's
// default 60 s because its inner agent-upgrade call was itself allowed 60 s.
// Pins the time budget: the crontab gives the job an explicit --timeout, and
// the two optional enrichments (agent-upgrade + AI recommendations) together
// finish well inside it, so the KPI e-mail still goes out when they are slow.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => null }));
vi.mock("@/lib/ai-client", () => ({
  getAIBudgetStatus: () => ({ spent: 0, limit: 0, percent: 0 }),
  callAIForUpgrade: vi.fn(),
}));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn() }));

import { AGENT_UPGRADE_TIMEOUT_MS, AI_RECOMMENDATIONS_TIMEOUT_MS } from "./route";

function crontabTimeoutMs(endpoint: string): number | null {
  const crontab = readFileSync(resolve(__dirname, "../../../../../scripts/crontab.production"), "utf8");
  const line = crontab
    .split("\n")
    .map((l) => l.trim())
    .find((l) => !l.startsWith("#") && new RegExp(`\\$RUN ${endpoint}(\\s|$)`).test(l));
  if (!line) return null;
  const m = /--timeout\s+(\d+)/.exec(line);
  return (m ? Number(m[1]) : 60) * 1000; // cron-runner.sh default is 60 s
}

describe("daily-admin-report time budget", () => {
  it("the crontab line declares --timeout 180 (not the 60 s default)", () => {
    expect(crontabTimeoutMs("daily-admin-report")).toBe(180_000);
  });

  it("the inner agent-upgrade call is time-boxed below the outer cron budget", () => {
    const outer = crontabTimeoutMs("daily-admin-report")!;
    expect(AGENT_UPGRADE_TIMEOUT_MS).toBeLessThan(outer);
  });

  it("both optional enrichments together leave ≥ 60 s for the DB queries and the e-mail", () => {
    const outer = crontabTimeoutMs("daily-admin-report")!;
    expect(outer - AGENT_UPGRADE_TIMEOUT_MS - AI_RECOMMENDATIONS_TIMEOUT_MS).toBeGreaterThanOrEqual(60_000);
  });
});
