import { beforeEach, describe, expect, it, vi } from "vitest";

// G13-W4-IA4 — the evaluator landing loader: four summaries in one round,
// every loader fail-soft, deal flow skipped for the advisor / accelerator
// variants, block-4 completeness from the primary mandate.

const m = vi.hoisted(() => ({
  listEvaluations: vi.fn(),
  buildEvaluatorProgress: vi.fn(),
  getReportQuota: vi.fn(),
  getBalance: vi.fn(),
  getDealFlowV2: vi.fn(),
  listMandates: vi.fn(),
}));
vi.mock("@/lib/evaluations", () => ({ listEvaluations: m.listEvaluations }));
vi.mock("@/lib/evaluations/progress-radar", () => ({ buildEvaluatorProgress: m.buildEvaluatorProgress }));
vi.mock("@/lib/evaluations/report-quota", () => ({ getReportQuota: m.getReportQuota, NO_TRIAL: { active: false, allowance: 1, used: 0, ends_at: null, started_at: null, plan_id: null } }));
vi.mock("@/lib/credits", () => ({ getBalance: m.getBalance }));
vi.mock("./dealflow", () => ({ getDealFlowV2: m.getDealFlowV2 }));
vi.mock("./mandates", async () => {
  const shared = await import("./mandates-shared");
  return { ...shared, listMandates: m.listMandates, sectionsFilled: (x: { label?: string; stages?: string[] }) => (x.label ? 1 : 0) + (x.stages?.length ? 1 : 0) };
});

import { loadInvestorLanding, planLabelFor } from "./landing-data";

const ROW = { id: "ev-1", projectId: "p-1", projectName: "Acme", consentTier: "attributed_only", claimedAt: null, latestSvi: 60, createdAt: "2026-09-01" };

beforeEach(() => {
  for (const fn of Object.values(m)) fn.mockReset();
  m.listEvaluations.mockResolvedValue([ROW]);
  m.buildEvaluatorProgress.mockResolvedValue({ items: [{ evaluationId: "ev-1", name: "Acme", sviNow: 60, delta: 4 }] });
  m.getReportQuota.mockResolvedValue({ limit: 3, used: 1, remaining: 2, unlimited: false, configured: true });
  m.getBalance.mockResolvedValue(7);
  m.getDealFlowV2.mockResolvedValue({ migrated: true, mandate: { id: "m1", label: "L", stages: ["seed"] }, rows: Array.from({ length: 9 }, (_, i) => ({ project_id: `p${i}` })), total_above_floor: 9, never_computed: false });
  m.listMandates.mockResolvedValue({ migrated: true, mandates: [{ id: "m1", label: "L", stages: ["seed"] }], primary: { id: "m1", label: "L", stages: ["seed"] } });
});

describe("loadInvestorLanding", () => {
  it("investor: all four summaries, deal flow capped to 5 rows, mandate completeness from the primary", async () => {
    const d = await loadInvestorLanding({ id: "u-1", plan: "investor_angel" }, "investor_angel");
    expect(d.variant).toBe("investor");
    expect(d.evaluating.count).toBe(1);
    expect(d.evaluating.movers).toEqual([{ evaluationId: "ev-1", name: "Acme", sviNow: 60, delta: 4 }]);
    expect(d.dealflow.rows).toHaveLength(5);
    expect(d.dealflow.totalAboveFloor).toBe(9);
    expect(m.getDealFlowV2).toHaveBeenCalledWith("u-1", { sort: "fit" });
    expect(d.quota).toEqual({ quota: { limit: 3, used: 1, remaining: 2, unlimited: false, configured: true }, credits: 7, planId: "investor_angel", planLabel: "Scout" });
    expect(d.mandate).toMatchObject({ migrated: true, sectionsFilled: 2, empty: false, needsSetup: true });
  });

  it("advisor / accelerator never call the deal-flow loader", async () => {
    const a = await loadInvestorLanding({ id: "u-1", plan: null }, "advisor");
    const b = await loadInvestorLanding({ id: "u-1", plan: null }, "accelerator");
    expect(m.getDealFlowV2).not.toHaveBeenCalled();
    expect(a.dealflow.rows).toEqual([]);
    expect(b.variant).toBe("accelerator");
  });

  it("zero evaluations → progress is not built; empty summary", async () => {
    m.listEvaluations.mockResolvedValue([]);
    const d = await loadInvestorLanding({ id: "u-1", plan: null }, "investor_vc");
    expect(d.evaluating.count).toBe(0);
    expect(m.buildEvaluatorProgress).not.toHaveBeenCalled();
  });

  it("every loader is fail-soft — a throw degrades to the empty summary, the page still renders", async () => {
    m.listEvaluations.mockRejectedValue(new Error("boom"));
    m.getDealFlowV2.mockRejectedValue(new Error("boom"));
    m.getReportQuota.mockRejectedValue(new Error("boom"));
    m.getBalance.mockRejectedValue(new Error("boom"));
    m.listMandates.mockRejectedValue(new Error("boom"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const d = await loadInvestorLanding({ id: "u-1", plan: "investor_advisor" }, "investor_angel");
    warn.mockRestore();
    expect(d.evaluating.count).toBe(0);
    expect(d.dealflow).toMatchObject({ migrated: false, rows: [] });
    expect(d.quota).toMatchObject({ credits: 0, planLabel: "Firm" });
    expect(d.quota.quota.limit).toBe(0);
    expect(d.mandate).toMatchObject({ migrated: false, empty: true, needsSetup: true });
  });

  it("no primary mandate → empty + needsSetup (block 4 takes slot 2 on the investor variant)", async () => {
    m.listMandates.mockResolvedValue({ migrated: true, mandates: [], primary: null });
    const d = await loadInvestorLanding({ id: "u-1", plan: null }, "investor_angel");
    expect(d.mandate).toMatchObject({ migrated: true, empty: true, needsSetup: true, sectionsFilled: 0 });
  });

  it("planLabelFor: public evaluator names, catalogue name, raw id, Free", () => {
    expect(planLabelFor("investor_angel")).toBe("Scout");
    expect(planLabelFor("investor_vc_small")).toBe("Program");
    expect(planLabelFor("founder_free")).toBe("Free");
    expect(planLabelFor("mystery_plan")).toBe("mystery_plan");
    expect(planLabelFor(null)).toBe("Free");
  });
});
