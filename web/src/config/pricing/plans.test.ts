/**
 * PRC-INV lane guard — asserts that all 15 active SKUs declared in
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

describe("PRC-INV — 15-SKU pricing matrix (14 tier SKUs + Startup Package one-off)", () => {
  const rows = parseCsv();
  const activeRows = rows.filter((r) => r.active === "true");

  it("plans.csv declares exactly 15 active SKUs (14 recurring + founder_package one-off)", () => {
    // founder_scale (Pro, A$299) retired 2026-09-08 — active=false in the CSV,
    // row retained so historical invoices + grandfathered renewals resolve.
    // Pricing v4 (2026-09-16) added investor_fund, accelerator_intake and
    // index_api (plan §3.2).
    expect(activeRows).toHaveLength(15);
    // Regression guard: the Startup Package MUST stay active.
    expect(activeRows.some((r) => r.id === "founder_package")).toBe(true);
    for (const id of ["investor_fund", "accelerator_intake", "index_api"]) {
      expect(activeRows.some((r) => r.id === id), id).toBe(true);
    }
  });

  it("every active CSV SKU appears in the generated catalogue", () => {
    const generatedIds = new Set(GENERATED_PLANS.map((p) => p.id));
    for (const row of activeRows) {
      expect(generatedIds.has(row.id), `missing generated SKU: ${row.id}`).toBe(true);
    }
    expect(GENERATED_PLANS.filter((p) => p.active)).toHaveLength(15);
  });

  it("Founder / Investor / Advisor / Accelerator segment tabs collectively surface all 15 tier SKUs", () => {
    const tabs: Segment[] = ["founder", "investor", "advisor", "accelerator"];
    const surfaced = new Set<string>();
    for (const seg of tabs) {
      for (const plan of plansForSegment(seg)) {
        surfaced.add(plan.id);
      }
    }
    // 5 founder + 6 investor (incl. Advisor SKU reused on advisor tab, Fund,
    // hidden Index API) + 4 accelerator = 15. founder_package is an add-on
    // SKU, NOT a tier — it is intentionally absent from plansForSegment() so
    // the segment tabs stay clean.
    expect(surfaced.size).toBe(15);
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

  it("Investor catalogue holds the 6 Investor SKUs (Scout / Firm / Program / Fund / VC Enterprise / Index API)", () => {
    const investor = plansForSegment("investor");
    expect(investor).toHaveLength(6);
    const ids = investor.map((p) => p.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "investor_angel",
        "investor_advisor",
        "investor_vc_small",
        "investor_fund",
        "investor_vc_ent",
        "index_api",
      ]),
    );
  });

  it("Accelerator tab renders the 4 Programs SKUs", () => {
    const accel = plansForSegment("accelerator");
    expect(accel).toHaveLength(4);
    const ids = accel.map((p) => p.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "accelerator_intake",
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
    expect(advisor).toHaveLength(6);
    const popular = advisor.filter((p) => p.most_popular).map((p) => p.id);
    expect(popular).toEqual(["investor_advisor"]);
  });
});

describe("PRC-ACC — Programs SKUs (Pricing v4, 2026-09-16)", () => {
  const byId = (id: string) => {
    const plan = GENERATED_PLANS.find((p) => p.id === id);
    if (!plan) throw new Error(`generated plan missing: ${id}`);
    return plan;
  };

  // The Intake link is the smallest Programs rung; every cohort rung above
  // it is a strict superset (tier-ladder invariant b). `reports_per_month`
  // is what report-quota.ts reads — a Programs row without it 402s
  // `quota_not_configured` on batch scoring, which is why v4 added it.
  const INTAKE_FLAGS = [
    "cohort.view",
    "cohort.view.stats",
    "accelerator.cohort",
    "investor.dealflow",
    "watchlist",
    "svi.feed",
    "diligence_pack",
    "lp_report",
    "grant_finder",
    "money_radar",
    "intake.manage",
  ];

  it("Intake link — A$249/mo, 14-day trial, 60 startups / 40 reports / 3 seats", () => {
    const p = byId("accelerator_intake");
    expect(p.price_aud_cents).toBe(24900);
    expect(p.annual_price_aud_cents).toBe(249000);
    expect(p.trial_days).toBe(14);
    expect(p.usage_limits).toEqual({ profiles: 60, reports_per_month: 40, seats: 3 });
    expect(p.feature_flags).toEqual(INTAKE_FLAGS);
    expect(p.stripe_env_var).toBe("STRIPE_PRICE_ACCEL_INTAKE");
    expect(p.sort_order).toBe(98);
  });

  it("Cohort 25 — A$500/mo (price untouched), 25 startups / 50 reports / 5 seats / 200 credits", () => {
    const p = byId("accelerator_starter");
    expect(p.name).toBe("Cohort 25");
    expect(p.price_aud_cents).toBe(50000);
    expect(p.annual_price_aud_cents).toBe(500000);
    expect(p.trial_days).toBe(14);
    expect(p.usage_limits).toEqual({ profiles: 25, reports_per_month: 50, seats: 5, monthly_credits: 200 });
    expect(p.feature_flags).toEqual(expect.arrayContaining(INTAKE_FLAGS));
    expect(p.stripe_env_var).toBe("STRIPE_PRICE_ACCEL_STARTER");
  });

  it("Cohort 100 — A$1500/mo (price untouched), 100 startups / 200 reports / 15 seats / 800 credits, adds cohort.manage", () => {
    const p = byId("accelerator_growth");
    expect(p.name).toBe("Cohort 100");
    expect(p.price_aud_cents).toBe(150000);
    expect(p.annual_price_aud_cents).toBe(1500000);
    expect(p.trial_days).toBe(14);
    expect(p.usage_limits).toEqual({ profiles: 100, reports_per_month: 200, seats: 15, monthly_credits: 800 });
    expect(p.feature_flags).toEqual(expect.arrayContaining([...INTAKE_FLAGS, "cohort.manage"]));
  });

  it("Cohort Enterprise — from A$3500/mo contact-sales (custom interval, no trial), unlimited seats / credits / reports, adds white_label + api + sso", () => {
    const p = byId("accelerator_enterprise");
    expect(p.price_aud_cents).toBe(350000);
    expect(p.annual_price_aud_cents).toBe(3500000);
    // G18-A (2026-09-19): contact-sales like founder_enterprise / investor_vc_ent
    // — `custom` interval, trial_days 0 (migration 0413).
    expect(p.interval).toBe("custom");
    expect(p.trial_days).toBe(0);
    expect(p.usage_limits.seats).toBe(-1);
    expect(p.usage_limits.monthly_credits).toBe(-1);
    expect(p.usage_limits.reports_per_month).toBe(-1);
    expect(p.feature_flags).toEqual(
      expect.arrayContaining([...INTAKE_FLAGS, "cohort.manage", "white_label", "api", "api.access", "sso"]),
    );
    expect(p.stripe_env_var).toBe("STRIPE_PRICE_ACCEL_ENTERPRISE");
  });

  it("Programs ladder is a strict flag superset from Intake up (tier-ladder invariant b)", () => {
    const ladder = ["accelerator_intake", "accelerator_starter", "accelerator_growth", "accelerator_enterprise"];
    for (let i = 1; i < ladder.length; i += 1) {
      const lower = new Set(byId(ladder[i - 1]!).feature_flags);
      const higher = new Set(byId(ladder[i]!).feature_flags);
      for (const f of lower) expect(higher.has(f), `${ladder[i]} missing ${f}`).toBe(true);
    }
  });
});

describe("PRC-FUND / PRC-API — Fund + Index API rows (Pricing v4)", () => {
  const byId = (id: string) => {
    const plan = GENERATED_PLANS.find((p) => p.id === id);
    if (!plan) throw new Error(`generated plan missing: ${id}`);
    return plan;
  };

  it("Fund — A$999/mo, 7-day trial, Program flags + custom_benchmark / multi_fund / weekly_delta, unlimited reports", () => {
    const fund = byId("investor_fund");
    const program = byId("investor_vc_small");
    expect(fund.segment).toBe("investor_vc");
    expect(fund.price_aud_cents).toBe(99900);
    expect(fund.annual_price_aud_cents).toBe(999000);
    expect(fund.trial_days).toBe(7);
    expect(fund.usage_limits).toEqual({ profiles: 500, portfolio_size: 500, reports_per_month: -1, seats: 10 });
    expect(fund.feature_flags).toEqual(
      expect.arrayContaining([...program.feature_flags, "custom_benchmark", "multi_fund", "weekly_delta", "api", "api.access"]),
    );
    expect(fund.feature_flags).not.toContain("sso");
    expect(fund.stripe_env_var).toBe("STRIPE_PRICE_INVESTOR_FUND");
    expect(fund.sort_order).toBe(85);
    // VC Enterprise stays a superset of Fund.
    const ent = new Set(byId("investor_vc_ent").feature_flags);
    for (const f of fund.feature_flags) expect(ent.has(f), f).toBe(true);
  });

  it("Index API — A$299/mo, no trial, api + svi.feed only, no workspace or reports", () => {
    const api = byId("index_api");
    expect(api.segment).toBe("investor_vc");
    expect(api.price_aud_cents).toBe(29900);
    expect(api.annual_price_aud_cents).toBe(299000);
    expect(api.trial_days).toBe(0);
    expect(api.feature_flags).toEqual(["api", "api.access", "svi.feed"]);
    expect(api.usage_limits).toEqual({ profiles: 0, reports_per_month: 0, seats: 2, api_daily_calls: 1000 });
    expect(api.stripe_env_var).toBe("STRIPE_PRICE_INDEX_API");
    expect(api.sort_order).toBe(130);
  });

  it("every evaluator row that sells reports carries reports_per_month (report-quota.ts reads nothing else)", () => {
    for (const id of [
      "investor_angel",
      "investor_advisor",
      "investor_vc_small",
      "investor_fund",
      "investor_vc_ent",
      "accelerator_intake",
      "accelerator_starter",
      "accelerator_growth",
      "accelerator_enterprise",
    ]) {
      expect(typeof byId(id).usage_limits.reports_per_month, id).toBe("number");
    }
  });
});

// ── Money Finder flags (G11 T0242) ──────────────────────────────────────────

describe("grant_finder + money_radar flags (T0242, migration 0316)", () => {
  const flagsFor = (id: string): string[] => {
    const plan = GENERATED_PLANS.find((p) => p.id === id);
    if (!plan) throw new Error(`plan ${id} missing from GENERATED_PLANS`);
    return plan.feature_flags as string[];
  };

  it("Starter, Growth, Startup Package and the three evaluator rungs include the report + radar", () => {
    for (const id of ["founder_starter", "founder_growth", "founder_package", "investor_angel", "investor_advisor", "investor_vc_small"]) {
      expect(flagsFor(id), `${id} must grant grant_finder`).toContain("grant_finder");
      expect(flagsFor(id), `${id} must grant money_radar`).toContain("money_radar");
    }
  });

  it("Free stays preview-only (A$3 or 3 credits for the report)", () => {
    expect(flagsFor("founder_free")).not.toContain("grant_finder");
    expect(flagsFor("founder_free")).not.toContain("money_radar");
  });
});

// ── tier supersetting (regression) ──────────────────────────────────────────

describe("founder ladder — a higher tier never has fewer features", () => {
  // founder_enterprise was missing share_management, investor_pack and
  // per_investor_share_links while founder_growth — a cheaper tier — had all
  // three. A top tier holding fewer features than the one below it is never
  // intentional, and it meant the one live Enterprise account was 402'd out of
  // the data room. Paired with migration 0127, which resynced the DB (which is
  // what getEntitlements actually reads) back to this file.
  const ladder = ["founder_starter", "founder_growth", "founder_enterprise"] as const;

  function flagsFor(id: string): string[] {
    const plan = GENERATED_PLANS.find((p) => p.id === id);
    if (!plan) throw new Error(`plan ${id} missing from GENERATED_PLANS`);
    return plan.feature_flags as string[];
  }

  for (let i = 1; i < ladder.length; i += 1) {
    const lower = ladder[i - 1];
    const higher = ladder[i];
    it(`${higher} is a superset of ${lower}`, () => {
      const lowerFlags = flagsFor(lower);
      const higherFlags = new Set(flagsFor(higher));
      const missing = lowerFlags.filter((f) => !higherFlags.has(f));
      expect(missing, `${higher} is missing ${missing.join(", ")}`).toEqual([]);
    });
  }

  it("gates the data room on the tiers that advertise it", () => {
    // share_management gates POST /api/data-room/generate. If it is absent
    // from a tier that sells a data room, that tier 402s on its own feature.
    for (const id of ["founder_growth", "founder_scale", "founder_enterprise"]) {
      expect(flagsFor(id), `${id} must grant share_management`).toContain("share_management");
      expect(flagsFor(id), `${id} must grant data_room.access`).toContain("data_room.access");
    }
  });
});
