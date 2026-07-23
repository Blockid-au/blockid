/**
 * PRC-INV lane guard — asserts that all 12 active SKUs declared in
 * `plans.csv` are surfaced by the generated catalogue that powers the
 * marketing /pricing page. Any drift here means the pricing page will
 * silently drop tiers.
 *
 * Source of truth: docs/pricing-upgrade-plan-2026-07-16.md § Tier Matrix.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { GENERATED_PLANS } from "./plans.generated";
import { plansForSegment, type Segment } from "@/lib/plans-v2";

interface CsvRow {
  id: string;
  segment: string;
  name: string;
  active: string;
}

function parseCsv(): CsvRow[] {
  const raw = readFileSync(
    resolve(__dirname, "plans.csv"),
    "utf8",
  );
  const lines = raw.trim().split(/\r?\n/);
  const header = lines.shift();
  if (!header) throw new Error("plans.csv missing header");
  const cols = header.split(",");
  const idx = (name: string) => {
    const i = cols.indexOf(name);
    if (i === -1) throw new Error(`plans.csv missing column: ${name}`);
    return i;
  };
  const idI = idx("id");
  const segI = idx("segment");
  const nameI = idx("name");
  const activeI = idx("active");

  // Naive CSV split good enough for our controlled dataset — quoted JSON
  // columns contain commas, so respect double-quotes.
  const splitRow = (row: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < row.length; i++) {
      const c = row[i];
      if (c === '"') { inQ = !inQ; continue; }
      if (c === "," && !inQ) { out.push(cur); cur = ""; continue; }
      cur += c;
    }
    out.push(cur);
    return out;
  };

  return lines.map((line) => {
    const parts = splitRow(line);
    return {
      id: parts[idI],
      segment: parts[segI],
      name: parts[nameI],
      active: parts[activeI],
    };
  });
}

describe("PRC-INV — 12-SKU pricing matrix", () => {
  const rows = parseCsv();
  const activeRows = rows.filter((r) => r.active === "true");

  it("plans.csv declares exactly 12 active SKUs", () => {
    expect(activeRows).toHaveLength(12);
  });

  it("every active CSV SKU appears in the generated catalogue", () => {
    const generatedIds = new Set(GENERATED_PLANS.map((p) => p.id));
    for (const row of activeRows) {
      expect(generatedIds.has(row.id), `missing generated SKU: ${row.id}`).toBe(true);
    }
    expect(GENERATED_PLANS.filter((p) => p.active)).toHaveLength(12);
  });

  it("Founder / Investor / Advisor / Accelerator segment tabs collectively surface all 12 SKUs", () => {
    const tabs: Segment[] = ["founder", "investor", "advisor", "accelerator"];
    const surfaced = new Set<string>();
    for (const seg of tabs) {
      for (const plan of plansForSegment(seg)) {
        surfaced.add(plan.id);
      }
    }
    // 5 founder + 4 investor (incl. Advisor SKU reused on advisor tab) + 3 accelerator = 12
    expect(surfaced.size).toBe(12);
  });

  it("Founder tab renders the 5 Founder SKUs", () => {
    const founder = plansForSegment("founder");
    expect(founder).toHaveLength(5);
    const ids = founder.map((p) => p.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "founder_free",
        "founder_starter",
        "founder_growth",
        "founder_scale",
        "founder_enterprise",
      ]),
    );
  });

  it("Investor tab renders the 4 Investor SKUs (Angel / Advisor / VC Small / VC Enterprise)", () => {
    const investor = plansForSegment("investor");
    expect(investor).toHaveLength(4);
    const ids = investor.map((p) => p.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "investor_angel",
        "investor_advisor",
        "investor_vc_sm",
        "investor_vc_ent",
      ]),
    );
  });

  it("Accelerator tab renders the 3 Accelerator SKUs", () => {
    const accel = plansForSegment("accelerator");
    expect(accel).toHaveLength(3);
    const ids = accel.map((p) => p.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "accelerator_starter",
        "accelerator_growth",
        "accelerator_enterprise",
      ]),
    );
  });

  it("Accelerator SKU ids in plans-v2 match the canonical ids in plans.generated", () => {
    const marketingIds = new Set(
      plansForSegment("accelerator").map((p) => p.id),
    );
    const generatedIds = new Set(
      GENERATED_PLANS.filter((p) => p.segment === "accelerator").map(
        (p) => p.id,
      ),
    );
    expect([...marketingIds].sort()).toEqual([...generatedIds].sort());
    // Regression guard: legacy accel_* ids must not leak back into the
    // marketing catalogue (see iter-8 task #2).
    for (const id of marketingIds) {
      expect(id.startsWith("accel_")).toBe(false);
      expect(id.startsWith("accelerator_")).toBe(true);
    }
  });

  it("Advisor tab reuses the Investor catalogue with the Advisor SKU highlighted", () => {
    const advisor = plansForSegment("advisor");
    expect(advisor).toHaveLength(4);
    const popular = advisor.filter((p) => p.most_popular).map((p) => p.id);
    expect(popular).toEqual(["investor_advisor"]);
  });
});

describe("PRC-ACC — Accelerator per-cohort SKUs", () => {
  const byId = (id: string) => {
    const plan = GENERATED_PLANS.find((p) => p.id === id);
    if (!plan) throw new Error(`generated plan missing: ${id}`);
    return plan;
  };

  it("Cohort Starter — A$500/mo, 15 seats, cohort_dashboard feature flag", () => {
    const p = byId("accelerator_starter");
    expect(p.price_aud_cents).toBe(50000);
    expect(p.annual_price_aud_cents).toBe(500000);
    expect(p.trial_days).toBe(14);
    expect(p.usage_limits.seats).toBe(15);
    expect(p.usage_limits.monthly_credits).toBe(2000);
    expect(p.feature_flags).toEqual(
      expect.arrayContaining([
        "cohort_dashboard",
        "cohort_reports",
        "program_curriculum_hub",
      ]),
    );
  });

  it("Cohort Growth — A$1500/mo, 50 seats, adds co_mentor_pool + alumni tools", () => {
    const p = byId("accelerator_growth");
    expect(p.price_aud_cents).toBe(150000);
    expect(p.annual_price_aud_cents).toBe(1500000);
    expect(p.trial_days).toBe(14);
    expect(p.usage_limits.seats).toBe(50);
    expect(p.usage_limits.monthly_credits).toBe(8000);
    expect(p.feature_flags).toEqual(
      expect.arrayContaining([
        "cohort_dashboard",
        "co_mentor_pool",
        "cohort_batch_reports",
        "alumni_network_tools",
      ]),
    );
  });

  it("Cohort Enterprise — A$3500/mo, unlimited seats, adds multi_cohort + sso", () => {
    const p = byId("accelerator_enterprise");
    expect(p.price_aud_cents).toBe(350000);
    expect(p.annual_price_aud_cents).toBe(3500000);
    expect(p.trial_days).toBe(14);
    expect(p.usage_limits.seats).toBe(-1);
    expect(p.usage_limits.monthly_credits).toBe(-1);
    expect(p.feature_flags).toEqual(
      expect.arrayContaining([
        "multi_cohort_management",
        "white_label_reports",
        "dedicated_success_manager",
        "sso",
      ]),
    );
    expect(p.stripe_env_var).toBe("STRIPE_PRICE_ACCEL_ENTERPRISE");
  });
});
