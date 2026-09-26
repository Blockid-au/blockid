// G34 RQ25 + RQ26 — mandate axes from the one fit-v2 scorer and the triage
// relabel (read further / needs more evidence / outside mandate) derived
// deterministically from the page-1 projection + the mandate fit.

import { describe, expect, it } from "vitest";
import { scoreFit, type FitMandate, type FitStartup } from "@/lib/investors/fit-v2";
import { alignReportWithAssessmentCard } from "@/lib/svi/assessment-card";
import { buildDashboardV4 } from "@/lib/report-v2/dashboard-v4";
import { demoReportV2 } from "@/lib/report-v2/fixtures";
import { investmentViewFor } from "@/lib/report-v2/investment-view";
import type { InvestmentBand, ReportV2 } from "@/lib/report-v2/schema";
import { buildEvaluatorTriage, mandateAxesFrom, mandateLine, TRIAGE_NOTE, triageMissingItems, type MandateAxis } from "./triage-verdict";

const MANDATE: FitMandate = { id: "m-1", sectors_include: ["fintech"], sectors_exclude: [], business_models: [], customer_types: [], stages: ["seed"], cheque_min_aud: 100_000, cheque_max_aud: 500_000, lead_or_follow: "lead", geographies: ["NSW"], revenue_min_aud: null, growth_min_pct: null, min_svi: null, tags_include: [], tags_exclude: [] };
const startup = (over: Partial<FitStartup["taxonomy"] & object> = {}, raise: number | null = 300_000): FitStartup => ({
  project_id: "p-1",
  taxonomy: { industry: "fintech", industry_secondary: null, business_model: "saas", customer_types: [], stage_key: "seed", hq_state: "NSW", hq_country: "AU", geo_scope: null, tags: [], ...over },
  svi: 70,
  raise_aud: raise,
});

function v4For(report: ReportV2) {
  const aligned = alignReportWithAssessmentCard(report, {});
  return buildDashboardV4(aligned.report, aligned.card, investmentViewFor(aligned.report, aligned.card, "en"), { locale: "en", lockCards: false });
}
const withBand = (band: InvestmentBand) => {
  const v4 = v4For(demoReportV2());
  return { ...v4, meeting: { ...v4.meeting, band, label: v4.strings.meeting[band] } };
};
const axes = (status: Partial<Record<MandateAxis["key"], MandateAxis["status"]>>): MandateAxis[] =>
  (["stage", "sector", "ticket", "geography"] as const).map((key) => ({ key, label: key, status: status[key] ?? "fit", note: null }));

describe("mandateAxesFrom (RQ25)", () => {
  it("stage ✓ · sector ✓ · ticket ✓ · geography ✓ when every axis fits", () => {
    const a = mandateAxesFrom(scoreFit(MANDATE, startup()).breakdown);
    expect(a.map((x) => x.key)).toEqual(["stage", "sector", "ticket", "geography"]);
    expect(mandateLine(a)).toBe("stage ✓ · sector ✓ · ticket ✓ · geography ✓");
  });

  it("ticket ✗ when the ask is outside the cheque range; sector ✗ outside the focus; stage ◐ when adjacent", () => {
    const a = mandateAxesFrom(scoreFit(MANDATE, startup({ industry: "healthtech_medtech", stage_key: "mvp_early_revenue" }, 5_000_000)).breakdown);
    const byKey = Object.fromEntries(a.map((x) => [x.key, x.status]));
    expect(byKey.ticket).toBe("miss");
    expect(byKey.sector).toBe("miss");
    expect(byKey.stage).toBe("partial");
    expect(mandateLine(a)).toContain("ticket ✗");
  });

  it("unknown startup data reads '?', never a miss (raise not stated, industry unclassified)", () => {
    const a = mandateAxesFrom(scoreFit(MANDATE, startup({ industry: "unclassified" }, null)).breakdown);
    const byKey = Object.fromEntries(a.map((x) => [x.key, x.status]));
    expect(byKey.ticket).toBe("unknown");
    expect(byKey.sector).toBe("unknown");
    expect(mandateLine(a)).toContain("ticket ?");
  });

  it("a hard gate (excluded sector) is a miss with the scorer's own sentence", () => {
    const a = mandateAxesFrom(scoreFit({ ...MANDATE, sectors_include: [], sectors_exclude: ["fintech"] }, startup()).breakdown);
    expect(a.find((x) => x.key === "sector")).toMatchObject({ status: "miss", note: "Excludes fintech" });
  });
});

describe("buildEvaluatorTriage (RQ26) — a relabel, never a second conclusion", () => {
  it("band A / B → Read further; C / D → Needs more evidence (mandate fits)", () => {
    const fit = { mandateLabel: "Seed fintech NSW", passesFloor: true, blockers: [], axes: axes({}) };
    expect(buildEvaluatorTriage(withBand("A"), fit)).toMatchObject({ verdict: "read_further", verdictLabel: "Read further" });
    expect(buildEvaluatorTriage(withBand("B"), fit).verdict).toBe("read_further");
    expect(buildEvaluatorTriage(withBand("C"), fit)).toMatchObject({ verdict: "needs_evidence", verdictLabel: "Needs more evidence" });
    expect(buildEvaluatorTriage(withBand("D"), fit).rule).toMatch(/^Report meeting label D \(Evidence incomplete\)$/);
  });

  it("Outside mandate on an axis miss, a hard gate or a sub-floor fit — whatever the band", () => {
    expect(buildEvaluatorTriage(withBand("A"), { mandateLabel: "M", passesFloor: true, blockers: [], axes: axes({ ticket: "miss" }) })).toMatchObject({ verdict: "outside_mandate", rule: "Mandate: ticket outside your mandate" });
    expect(buildEvaluatorTriage(withBand("A"), { mandateLabel: "M", passesFloor: false, blockers: ["industry_excluded"], axes: axes({}) }).verdict).toBe("outside_mandate");
    expect(buildEvaluatorTriage(withBand("B"), { mandateLabel: "M", passesFloor: false, blockers: [], axes: axes({}) }).rule).toBe("Mandate: fit below the listing floor");
    // Unknown is never outside the mandate.
    expect(buildEvaluatorTriage(withBand("A"), { mandateLabel: "M", passesFloor: true, blockers: [], axes: axes({ ticket: "unknown" }) }).verdict).toBe("read_further");
  });

  it("no mandate saved: band-only verdict, the rule says so, no mandate line", () => {
    const t = buildEvaluatorTriage(withBand("B"), null);
    expect(t.mandate).toBeNull();
    expect(t.verdict).toBe("read_further");
    expect(t.rule).toContain("no mandate saved");
  });

  it("missing items = red flags + pending dimensions + un-evidenced key metrics, de-duplicated; the not-advice note", () => {
    const report = demoReportV2();
    const svm = report.dimensions.find((d) => d.dim === "svm")!;
    svm.band = "pending";
    svm.score = 0;
    svm.scoreBreakdown = { base: 35, signals: [], confidenceMultiplier: 0.2, adjustment: 0, assessed: false };
    report.cover.dims.svm = { ...report.cover.dims.svm, band: "pending", score: 0 };
    const v4 = v4For(report);
    const missing = triageMissingItems(v4);
    for (const f of v4.redFlags) expect(missing.some((m) => m.startsWith(f.text.slice(0, 12)))).toBe(true);
    expect(missing).toContain(`${v4.scorecard.find((r) => r.dim === "svm")!.title}: not assessed — no evidence on file`);
    expect(missing).toContain("NRR: not evidenced");
    expect(new Set(missing).size).toBe(missing.length);
    const t = buildEvaluatorTriage(v4, null);
    expect(t.missing).toEqual(missing);
    expect(t.note).toBe(TRIAGE_NOTE);
    expect(t.note).toContain("not a second investment conclusion");
    expect(t.note).toContain("not financial, legal or investment advice");
  });
});
