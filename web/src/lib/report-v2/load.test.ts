// report-v2/load — snapshot row → ReportV2 (stored wins, adapter otherwise).

import { describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "@/test/fake-supabase";
import { demoReportV2 } from "./fixtures";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => null }));

import { dimStatesFromRow, loadLatestReportV2ForAccount, loadLatestReportV2ForProject, loadReportV2ByShareToken, loadReportV2BySnapshotId, reportV2FromSnapshotRow, snapshotInputFromRow } from "./load";

const ROW = {
  id: "s-1",
  account_id: "acct-1",
  project_id: "p-1",
  svi_total: 58,
  stage: 2,
  created_at: "2026-09-12T00:00:00Z",
  dim_results: { tre: { status: "complete", score: 61, insights: ["x"] }, mpc: { score: 70 } },
  dimension_scores: { ftv: 55, ptd: { score: 66 } },
  criterion_results: [{ key: "idea", title: "Idea", primary_dimension: "mpc", weight: 10, score: 74, verdict: "v", strengths: [], gaps: [], next_action: "" }],
  analysis_json: { industry: "SaaS", stageLabel: "Seed", startupName: "From meta" },
  report_share_token: "tok",
};

describe("dimStatesFromRow / snapshotInputFromRow", () => {
  it("reads dim_results first, bare or object dimension_scores second, idle otherwise", () => {
    const d = dimStatesFromRow(ROW);
    expect(d.tre).toMatchObject({ status: "complete", score: 61, insights: ["x"] });
    expect(d.mpc.score).toBe(70);
    expect(d.ftv).toMatchObject({ status: "complete", score: 55 });
    expect(d.ptd.score).toBe(66);
    expect(d.cgh).toMatchObject({ status: "idle", score: null });
    const input = snapshotInputFromRow(ROW, { tier: "free" });
    expect(input).toMatchObject({ snapshotId: "s-1", projectId: "p-1", accountId: "acct-1", startupName: "From meta", industry: "SaaS", stageLabel: "Seed", sviTotal: 58, tier: "free" });
    expect(snapshotInputFromRow(ROW, { startupName: "Ctx wins" }).startupName).toBe("Ctx wins");
  });

  // G19-S41 — a post-S41 analysis_json (subs[].breakdown + ledger) becomes the chapter / cover ledgers; older rows get none.
  it("lifts the score ledger out of analysis_json when present and leaves pre-S41 rows without one", () => {
    expect(snapshotInputFromRow(ROW).sviLedger).toBeNull();
    expect(snapshotInputFromRow(ROW).dimStates.tre.scoreBreakdown).toBeUndefined();
    const ledger = { base: 100, dimAdjustments: { tre: 2, mpc: 1, ftv: 0, ptd: 0, cgh: 0, iri: 0, lco: 0, svm: 0 }, stageBonus: 5, riskPenalties: -10, sectorAdj: 0, metricsBonus: 0, ciBoost: 0, floorClamp: 0, total: 98 };
    const row = {
      ...ROW,
      analysis_json: {
        ...ROW.analysis_json,
        confidenceMultiplier: 0.5,
        ledger,
        subs: [
          { key: "tre", value: 61, adjustment: 2, base: 30, breakdown: [{ signal: "Early revenue traction", points: 20, source: "self_declared" }], assessed: true, gaps: [] },
          { key: "cgh", value: 40, adjustment: 0, base: 40, breakdown: [], assessed: false, gaps: [] },
        ],
      },
    };
    const input = snapshotInputFromRow(row);
    expect(input.sviLedger).toEqual(ledger);
    expect(input.dimStates.tre.scoreBreakdown).toMatchObject({ base: 30, confidenceMultiplier: 0.5, adjustment: 2, assessed: true, signals: [{ signal: "Early revenue traction", points: 20, source: "self_declared" }] });
    expect(input.dimStates.cgh.scoreBreakdown).toMatchObject({ assessed: false });
    const r = reportV2FromSnapshotRow(row);
    expect(r.cover.sviLedger).toEqual(ledger);
    expect(r.dimensions.find((d) => d.dim === "tre")!.scoreBreakdown!.signals).toHaveLength(1);
    expect(r.dimensions.find((d) => d.dim === "cgh")!.band).toBe("pending");
  });
});

describe("reportV2FromSnapshotRow", () => {
  it("builds through the adapter when there is no stored document", () => {
    const r = reportV2FromSnapshotRow(ROW, { startupName: "Acme" });
    expect(r.source).toBe("adapter");
    expect(r.cover.startupName).toBe("Acme");
    expect(r.dimensions).toHaveLength(8);
    expect(r.tier).toBe("standard");
  });

  it("prefers a valid stored report_v2 and ignores an invalid one", () => {
    const stored = demoReportV2();
    expect(reportV2FromSnapshotRow({ ...ROW, report_v2: stored }).reportId).toBe(stored.reportId);
    expect(reportV2FromSnapshotRow({ ...ROW, report_v2: { schemaVersion: "2.0", dimensions: [] } }).source).toBe("adapter");
  });

  it("a forced tier re-projects adapter documents but never rewrites a pipeline document", () => {
    const free = reportV2FromSnapshotRow(ROW, { tier: "free" });
    expect(free.tier).toBe("free");
    const stored = { ...demoReportV2(), source: "pipeline" as const };
    expect(reportV2FromSnapshotRow({ ...ROW, report_v2: stored }, { tier: "free" }).tier).toBe("standard");
  });
});

describe("loaders", () => {
  it("token / account / id loaders resolve the row, the account name and the path", async () => {
    const sb = fakeSupabase({ svi_snapshots: [ROW], svi_accounts: [{ id: "acct-1", startup_name: "Acme Robotics" }] });
    const byToken = await loadReportV2ByShareToken("tok", {}, sb as never);
    expect(byToken?.path).toBe("adapter");
    expect(byToken?.report.cover.startupName).toBe("Acme Robotics");
    expect(byToken?.shareToken).toBe("tok");
    expect(sb.hasEq("svi_snapshots", "report_share_token", "tok")).toBe(true);

    const latest = await loadLatestReportV2ForAccount("acct-1", "p-1", { startupName: "Given" }, sb as never);
    expect(latest?.report.cover.startupName).toBe("Given");
    expect(sb.hasEq("svi_snapshots", "project_id", "p-1")).toBe(true);

    const byId = await loadReportV2BySnapshotId("s-1", {}, sb as never);
    expect(byId?.snapshotId).toBe("s-1");

    expect(await loadReportV2ByShareToken("tok", {}, null)).toBeNull();
    expect(await loadReportV2ByShareToken("tok", {}, fakeSupabase({ svi_snapshots: [] }) as never)).toBeNull();
  });

  // G19-S46: the showcase reads the newest snapshot of the project that STORES a report_v2 — never an adapter projection.
  it("loadLatestReportV2ForProject filters on project_id + report_v2 not null and returns only a stored document", async () => {
    const stored = demoReportV2();
    const sb = fakeSupabase({ svi_snapshots: [{ ...ROW, report_v2: stored }], svi_accounts: [{ id: "acct-1", startup_name: "Acme Robotics" }] });
    const loaded = await loadLatestReportV2ForProject("p-1", {}, sb as never);
    expect(loaded?.path).toBe("stored");
    expect(loaded?.report.reportId).toBe(stored.reportId);
    expect(loaded?.snapshotId).toBe("s-1");
    expect(sb.hasEq("svi_snapshots", "project_id", "p-1")).toBe(true);
    expect(sb.calls.some((c) => c.table === "svi_snapshots" && c.op === "not" && c.args[0] === "report_v2")).toBe(true);

    // A row without a stored document (or none at all, or no DB) → null, never the adapter fallback.
    expect(await loadLatestReportV2ForProject("p-1", {}, fakeSupabase({ svi_snapshots: [ROW] }) as never)).toBeNull();
    expect(await loadLatestReportV2ForProject("p-1", {}, fakeSupabase({ svi_snapshots: [] }) as never)).toBeNull();
    expect(await loadLatestReportV2ForProject("p-1", {}, null)).toBeNull();
    expect(await loadLatestReportV2ForProject("", {}, sb as never)).toBeNull();
    // 42P01-style error → null.
    const broken = { from: () => { throw new Error('relation "svi_snapshots" does not exist'); } };
    expect(await loadLatestReportV2ForProject("p-1", {}, broken as never)).toBeNull();
  });
});
