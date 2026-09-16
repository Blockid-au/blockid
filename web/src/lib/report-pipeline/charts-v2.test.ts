// charts-v2 (G13-W2-R2, spec §C.4 / §C.11): chapter visuals come from
// module outputs / evidence numbers; an owner-proposed series is accepted
// only when its kind is allowed AND every number passes provenance.

import { describe, expect, it } from "vitest";
import {
  checkProvenance,
  evidenceNumbers,
  generateChartsV2,
  numberTraceable,
  proposalToData,
  universeFor,
  type ChapterVisualDraft,
} from "./chart-generator";
import { DIM_ORDER, DIMENSION_OWNERS, type DimKey } from "./dimension-owners";
import type { EvidenceRow } from "@/lib/report-v2/schema";

const row = (id: string, value?: string): EvidenceRow => ({ evidence_id: id, source: "self_declared", label: id, status: "partial", value, dims: ["tre"] });

function draft(dim: DimKey, extra: Partial<ChapterVisualDraft> = {}): ChapterVisualDraft {
  return {
    dim,
    ownerAgent: DIMENSION_OWNERS[dim].primary,
    score: 55,
    benchmark: { p25: 40, p50: 52, p75: 64 },
    stageLabel: "Seed",
    criterionScore: (key) => (key === "revenue" ? 61 : key === "customer_size" ? 58 : null),
    moduleOutputs: [{ id: "svi-analysis.ts:extractSignals(traction)", output: { mrrAud: 12400, hasRevenue: true } }],
    evidence: [row("ev-1", "MRR A$12,400 from 9 customers")],
    ...extra,
  };
}

describe("number provenance", () => {
  it("evidenceNumbers parses every figure in the row values (commas stripped)", () => {
    expect(evidenceNumbers([row("a", "MRR A$12,400 from 9 customers"), row("b")])).toEqual([12400, 9]);
  });
  it("numberTraceable allows rounding (0.5 abs or 1 %)", () => {
    expect(numberTraceable(12401, [12400])).toBe(true);
    expect(numberTraceable(12550, [12400])).toBe(false);
    expect(numberTraceable(52, [52.4])).toBe(true);
  });
  it("checkProvenance flags every untraceable number in values and points", () => {
    const rep = checkProvenance({ kind: "line", series: [{ label: "x", points: [12400, 9, 777] }, { label: "y", value: 55 }] }, [12400, 9, 55]);
    expect(rep.checked).toBe(4);
    expect(rep.unresolved).toEqual([777]);
    expect(rep.downgraded).toBe(true);
  });

  // W2 review (c): URL digit runs and upload file sizes never license a number.
  it("evidenceNumbers ignores URL digit runs and file sizes", () => {
    expect(evidenceNumbers([row("u", "https://acme.com/blog/2024/q3/12400-customers")])).toEqual([]);
    expect(evidenceNumbers([row("f", "deck.pdf (application/pdf, 48213 bytes)")])).toEqual([]);
    expect(evidenceNumbers([row("m", "9 customers, see https://acme.com/2024 (48213 bytes)")])).toEqual([9]);
  });

  it("universeFor excludes static profile constants and weight / percentile keys but keeps measured fields", () => {
    const u = universeFor(
      draft("mpc", {
        evidence: [],
        moduleOutputs: [
          { id: "agents/cfo-tam-sam-som.ts:auMarketProfile", output: { reachableUnits: 250000, cagrPct: 14, captureRatePct: 2 } },
          { id: "report-pipeline/dimension-owners.ts:benchmarkFor", output: { p25: 40, p50: 52, p75: 64, deterministicScore: 55, benchmarkStage: 2 } },
          { id: "svi-analysis.ts:criterionScores", output: { market: 61, weight: 18 } },
        ],
      }),
    );
    expect(u).not.toContain(250000);
    expect(u).not.toContain(14);
    expect(u).not.toContain(18);
    expect(u).not.toContain(2);
    expect(u).toContain(61);
    expect(u).toContain(55);
    // The three percentiles the owner is handed stay reference values.
    expect(u).toContain(52);
  });

  it("a proposal citing only a static profile constant is downgraded", () => {
    const out = generateChartsV2(
      draft("mpc", {
        evidence: [],
        moduleOutputs: [{ id: "agents/cfo-tam-sam-som.ts:auMarketProfile", output: { reachableUnits: 250000 } }],
        proposedPrimary: { kind: "bar", series: [{ label: "Reachable units", value: 250000 }] },
      }),
    );
    expect(out.provenance.unresolved).toEqual([250000]);
    expect(out.primary.kind).toBe("funnel");
  });

  it("`real` requires at least one evidence-sourced number — module-only numbers cap at partial", () => {
    const out = generateChartsV2(
      draft("tre", {
        evidence: [row("ev-x", "founder note, no figures")],
        moduleOutputs: [{ id: "svi-analysis.ts:extractSignals(traction)", output: { mrrAud: 12400 } }],
        proposedPrimary: { kind: "bar", data_state: "real", series: [{ label: "MRR", value: 12400 }] },
      }),
    );
    expect(out.primary.kind).toBe("bar");
    expect(out.provenance.downgraded).toBe(false);
    expect(out.primary.dataState).toBe("partial");
  });
});

describe("generateChartsV2", () => {
  it("every dimension renders a deterministic primary + ≥ 1 secondary with an accessible SVG", () => {
    DIM_ORDER.forEach((dim) => {
      const out = generateChartsV2(draft(dim, { evidence: [] }));
      expect(out.primary.kind).toBe(DIMENSION_OWNERS[dim].primaryVisual);
      expect(out.primary.svg).toContain("role=\"img\"");
      expect(out.primary.svg).toContain("<title");
      expect(out.primary.dataState).not.toBe("real");
      expect(out.secondary.length).toBeGreaterThanOrEqual(1);
      expect(out.provenance.downgraded).toBe(false);
    });
  });

  it("uses an owner proposal when the kind is allowed and every number is traceable", () => {
    const out = generateChartsV2(draft("tre", { proposedPrimary: { kind: "bar", data_state: "real", title: "MRR vs customers", series: [{ label: "MRR", value: 12400 }, { label: "Customers", value: 9 }] } }));
    expect(out.primary.kind).toBe("bar");
    expect(out.primary.title).toBe("MRR vs customers");
    expect(out.primary.dataState).toBe("real");
    expect(out.primary.data).toEqual({ bars: [{ label: "MRR", value: 12400 }, { label: "Customers", value: 9 }], max: 100 });
    expect(out.provenance.downgraded).toBe(false);
  });

  it("downgrades to the deterministic chart (data_state partial) when a number is untraceable", () => {
    const out = generateChartsV2(draft("tre", { proposedPrimary: { kind: "bar", data_state: "real", series: [{ label: "MRR", value: 99999 }] } }));
    expect(out.primary.kind).toBe("sparkline");
    expect(out.primary.dataState).not.toBe("real");
    expect(out.provenance.unresolved).toEqual([99999]);
    expect(out.provenance.downgraded).toBe(true);
  });

  it("never lets a proposal claim `real` without evidence rows", () => {
    const out = generateChartsV2(draft("tre", { evidence: [], proposedPrimary: { kind: "bar", data_state: "real", series: [{ label: "MRR", value: 12400 }] } }));
    expect(out.primary.kind).toBe("bar");
    expect(out.primary.dataState).toBe("partial");
  });

  it("rejects kinds outside allowedVisuals and kinds the generic series cannot fill", () => {
    const wrongKind = generateChartsV2(draft("cgh", { proposedPrimary: { kind: "sparkline", series: [{ label: "a", value: 55 }] } }));
    expect(wrongKind.primary.kind).toBe("donut");
    expect(wrongKind.provenance.downgraded).toBe(true);
    const heat = generateChartsV2(draft("ftv", { proposedPrimary: { kind: "heat_map", series: [{ label: "a", value: 55 }] } }));
    expect(heat.primary.id).toBe("dim-ftv-primary");
    expect(heat.provenance.downgraded).toBe(true);
  });

  it("proposalToData maps generic series onto the kind shapes", () => {
    expect(proposalToData("donut", { kind: "donut", series: [{ label: "F", value: 70 }] })).toEqual({ slices: [{ label: "F", value: 70 }] });
    expect(proposalToData("line", { kind: "line", series: [{ label: "F", points: [70, 56] }] })).toEqual({ series: [{ label: "F", points: [70, 56] }] });
    expect(proposalToData("sparkline", { kind: "sparkline", series: [{ label: "m", points: [1, 2, 3] }] })).toEqual({ points: [{ value: 1 }, { value: 2 }, { value: 3 }] });
    expect(proposalToData("radar", { kind: "radar", series: [{ label: "a", value: 1 }] })).toBeNull();
    expect(proposalToData("heat_map", { kind: "heat_map", series: [] })).toBeNull();
  });

  it("module outputs drive the deterministic charts (Antler bars, compliance checklist, moat radar, readiness ring)", () => {
    const ftv = generateChartsV2(draft("ftv", { moduleOutputs: [{ id: "agents/antler-signals.ts:evaluateAntlerSignals", output: { progressionScore: 60, team: 70, market: 40 } }] }));
    expect(ftv.secondary[0].title).toContain("Antler");
    const lco = generateChartsV2(draft("lco", { moduleOutputs: [{ id: "agents/clo-compliance.ts:calculateComplianceScore", output: { completedIds: ["acn", "sha"] } }] }));
    const items = (lco.primary.data as { items: Array<{ status: string }> }).items;
    expect(items[0].status).toBe("done");
    expect(items[1].status).toBe("pending");
    const svm = generateChartsV2(draft("svm", { moduleOutputs: [{ id: "report-pipeline/module-precompute.ts:fiveFactorMoat", output: { networkEffects: 100, switchingCosts: 0, brand: 20, proprietaryData: 100, economiesOfScale: 50 } }] }));
    expect(svm.primary.title).toContain("5-factor moat");
    const iri = generateChartsV2(draft("iri", { moduleOutputs: [{ id: "agents/cro-funding-readiness.ts:scoreFundingReadiness", output: { overall: 47 } }] }));
    expect((iri.secondary[0].data as { value: number }).value).toBe(47);
  });

  it("S-R5: a GA4 snapshot module turns the TRE funnel into real AARRR counts and adds the MPC channel-mix bars", () => {
    const funnelModule = { id: "oauth-ga4-signals.ts:aarrrFunnel", output: { windowDays: 90, sessions: 2000, engagedSessions: 1300, returningUsers: 300, conversions: 90, engagementRatePct: 65, returningSharePct: 23 } };
    const tre = generateChartsV2(draft("tre", { moduleOutputs: [funnelModule], evidence: [{ evidence_id: "ga4", source: "ga4", label: "GA4 90-day snapshot", status: "evidenced", value: "sessions = 2000; engaged_sessions = 1300", dims: ["tre", "mpc"] }] }));
    const funnel = tre.secondary.find((v) => v.id === "dim-tre-funnel")!;
    expect(funnel.dataState).toBe("real");
    expect(funnel.title).toBe("AARRR funnel — GA4, last 90 days");
    expect((funnel.data as { stages: Array<{ label: string; value: number }> }).stages.map((s) => s.value)).toEqual([2000, 1300, 300, 90]);
    expect(funnel.svg).toContain("<svg");
    // Without a snapshot the criterion-score funnel stays (partial).
    expect(generateChartsV2(draft("tre")).secondary.find((v) => v.id === "dim-tre-funnel")?.dataState).toBe("partial");

    const mixModule = { id: "oauth-ga4-signals.ts:channelMix", output: { sessions: 2000, channels: 3, channel1: "Organic Search", channel1Sessions: 900, channel1SharePct: 45, channel2: "Direct", channel2Sessions: 600, channel2SharePct: 30, channel3: "Paid Social", channel3Sessions: 300, channel3SharePct: 15 } };
    const mpc = generateChartsV2(draft("mpc", { moduleOutputs: [mixModule] }));
    const bars = mpc.secondary.find((v) => v.id === "dim-mpc-channels")!;
    expect(bars.kind).toBe("bar");
    expect((bars.data as { bars: Array<{ label: string; value: number }> }).bars).toEqual([{ label: "Organic Search", value: 45 }, { label: "Direct", value: 30 }, { label: "Paid Social", value: 15 }]);
    expect(generateChartsV2(draft("mpc")).secondary.some((v) => v.id === "dim-mpc-channels")).toBe(false);
  });

  it("S-R5: the equity register module draws the real CGH donut (dataState real) instead of the AU-norm target", () => {
    const withRegister = generateChartsV2(draft("cgh", { moduleOutputs: [{ id: "report-pipeline/gather.ts:capTable", output: { holders: 4, founderPct: 72, esopPct: 10, investorPct: 18, vestingFlag: true } }] }));
    expect(withRegister.primary.dataState).toBe("real");
    expect(withRegister.primary.title).toBe("Cap-table structure (equity register)");
    expect((withRegister.primary.data as { slices: Array<{ label: string; value: number }> }).slices).toEqual([{ label: "Founders", value: 72 }, { label: "ESOP pool", value: 10 }, { label: "Investors", value: 18 }]);
    expect(withRegister.primary.subtitle).toContain("vesting on file");
    expect(withRegister.secondary[0].title).toContain("from the register");
    const target = generateChartsV2(draft("cgh", { moduleOutputs: [] }));
    expect(target.primary.dataState).toBe("target");
  });
});
