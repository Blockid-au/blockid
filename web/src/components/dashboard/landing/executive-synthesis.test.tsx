// Block 1b · Executive synthesis (G19-S44) — registry + projection + render.
//
//   1. The block is OPTIONAL: `landingBlocksFor` lists it only with a stored
//      report_v2, right after "Where you stand"; phase-0 keeps five blocks.
//   2. `synthesisFromReport` carries the SAME numbers as the TBR fixture —
//      phase, A$ range, top-3 strengths / weaknesses, plan steps by lift.
//   3. The static render shows every one of them, linked to the report.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { demoReportV2, preRevenueFixtureReportV2 } from "@/lib/report-v2/fixtures";
import { fromSnapshot } from "@/lib/report-v2/adapter";
import { demoSnapshotInput } from "@/lib/report-v2/fixtures";
import { coverHero } from "@/lib/report-v2/cover-hero";
import { GROWTH_PHASE_LABELS } from "@/lib/growth/phase-taxonomy";
import { TBR_STRINGS } from "@/lib/i18n/tbr-strings";
import { EXECUTIVE_SYNTHESIS_REPORT_HREF, synthesisFromReport, topFollowUps } from "@/lib/dashboard/executive-synthesis";
import { ExecutiveSynthesis } from "./executive-synthesis";
import { LANDING_BLOCKS, OPTIONAL_LANDING_BLOCKS, landingBlocksFor } from "./landing-blocks";

const ctx = { phase: "investor_review", plan: "founder_free", persona: "founder" };

describe("landingBlocksFor — executive synthesis is optional", () => {
  it("phase-0 / no report keeps the five blocks; a report_v2 inserts the synthesis right after Where you stand", () => {
    expect(LANDING_BLOCKS.length).toBe(5);
    expect(OPTIONAL_LANDING_BLOCKS).toContain("executive-synthesis");
    expect(landingBlocksFor()).toEqual([...LANDING_BLOCKS]);
    expect(landingBlocksFor({ hasReportV2: false })).toEqual([...LANDING_BLOCKS]);
    expect(landingBlocksFor({ hasReportV2: true })).toEqual(["where-you-stand", "executive-synthesis", "next-best-action", "money-on-the-table", "evidence-to-add", "your-reports"]);
    expect(landingBlocksFor({ hasReportV2: true, isMember: true, hasFeedbackLetter: true })).toEqual(["where-you-stand", "executive-synthesis", "next-best-action", "evidence-to-add", "your-reports", "what-investors-said"]);
  });
});

describe("synthesisFromReport — same numbers as the TBR", () => {
  it("demo fixture: phase, A$ range + confidence, top-3 strengths / weaknesses and plan steps equal the report's own fields", () => {
    const report = demoReportV2();
    const d = synthesisFromReport(report, "en");
    const hero = coverHero(report, "en");
    expect(d.where.phaseId).toBe(report.cover.phaseId);
    expect(d.where.phaseLabel).toBe(GROWTH_PHASE_LABELS[report.cover.phaseId].en);
    expect(d.where.sentence).toBe(report.cover.threeQuestions.where);
    expect(d.worth.pending).toBe(false);
    expect(d.worth.lowAud).toBe(report.valuation.consensus.lowAud);
    expect(d.worth.highAud).toBe(report.valuation.consensus.highAud);
    expect(d.worth.confidencePct).toBe(Math.round(report.valuation.consensus.confidence * 100));
    expect(d.worth.headline).toBe(hero.headline);
    expect(d.svi.total).toBe(report.cover.svi.total);
    expect(d.strengths).toEqual(report.executive.strengths.slice(0, 3));
    expect(d.weaknesses).toEqual(report.executive.gaps.slice(0, 3));
    expect(d.strengths.length).toBe(3);
    expect(d.weaknesses.length).toBe(3);
    // Follow-ups are the plan's top steps by lift — every title exists in chapter 13.
    const titles = new Set(report.actionPlan.steps.map((s) => s.title));
    expect(d.followUps.length).toBe(Math.min(3, report.actionPlan.steps.length));
    for (const f of d.followUps) expect(titles.has(f.title)).toBe(true);
    expect(d.followUps).toEqual(topFollowUps(report.actionPlan.steps, 3));
    expect(d.reportHref).toBe(EXECUTIVE_SYNTHESIS_REPORT_HREF);
    // S43: the demo carries CTA rows in actionPlan.evidenceToAdd → linked "data to add" entries with the catalogue lift.
    const rows = report.actionPlan.evidenceToAdd ?? [];
    expect(d.dataToAdd.length).toBe(Math.min(3, rows.length));
    for (const [i, row] of d.dataToAdd.entries()) {
      expect(row.href.startsWith("/")).toBe(true);
      expect(row.label).toBe(rows[i]!.cta?.label ?? rows[i]!.label);
      expect(row.lift).toBe(rows[i]!.cta?.lift ?? null);
    }
    // Pre-S43 document: no evidenceToAdd → empty, never a throw.
    const legacy = demoReportV2();
    delete legacy.actionPlan.evidenceToAdd;
    expect(synthesisFromReport(legacy, "en").dataToAdd).toEqual([]);
  });

  it("nothing scored → worth is pending (the same rule as the cover hero)", () => {
    const empty = fromSnapshot({ ...demoSnapshotInput(), dimStates: {}, criterionStates: [], sviTotal: null, vc: null });
    const d = synthesisFromReport(empty, "en");
    expect(d.worth.pending).toBe(true);
    expect(d.worth.headline).toBe(TBR_STRINGS.en.v2.s44.valuationPending);
  });

  it("topFollowUps sorts by lift then earlier day", () => {
    const steps = [
      { day: 90 as const, title: "c", ownerAgent: "coo" as const, dimension: "tre" as const, criterion: "revenue" as const, expectedLift: 3 },
      { day: 30 as const, title: "a", ownerAgent: "coo" as const, dimension: "mpc" as const, criterion: "market" as const, expectedLift: 3 },
      { day: 60 as const, title: "b", ownerAgent: "coo" as const, dimension: "ftv" as const, criterion: "team" as const, expectedLift: 5 },
    ];
    expect(topFollowUps(steps, 2).map((s) => s.title)).toEqual(["b", "a"]);
  });

  it("S43 evidenceToAdd rows become linked 'data to add' entries (structural read, top-3)", () => {
    const report = demoReportV2();
    (report.actionPlan as unknown as { evidenceToAdd: unknown[] }).evidenceToAdd = [
      { evidence_id: "ev-1", source: "stripe", label: "Connect Stripe", status: "missing", dims: ["tre"], cta: { label: "Connect Stripe", href: "/workspace/settings/connectors", lift: 6 } },
      { evidence_id: "ev-2", source: "upload", label: "Cap table", status: "missing", dims: ["cgh"], cta: { label: "Upload the cap table", href: "/workspace/evidence", lift: 4 } },
      { evidence_id: "ev-3", source: "github", label: "GitHub", status: "missing", dims: ["ptd"] },
      { evidence_id: "ev-4", source: "url", label: "Website", status: "missing", dims: ["ptd"], cta: { label: "x", href: "/x", lift: 1 } },
    ];
    const d = synthesisFromReport(report, "en");
    expect(d.dataToAdd.length).toBe(3);
    expect(d.dataToAdd[0]).toEqual({ label: "Connect Stripe", href: "/workspace/settings/connectors", lift: 6, dims: ["tre"] });
    expect(d.dataToAdd[2]).toEqual({ label: "GitHub", href: "/workspace/evidence", lift: null, dims: ["ptd"] });
  });
});

describe("<ExecutiveSynthesis>", () => {
  it("renders the six answers from the fixture with the stable block contract and the report CTA", () => {
    const report = demoReportV2();
    const d = synthesisFromReport(report, "en");
    const html = renderToStaticMarkup(<ExecutiveSynthesis ctx={ctx} data={d} />);
    expect(html).toContain('data-landing-block="executive-synthesis"');
    expect(html).toContain("lg:col-span-12");
    expect(html).toContain(`data-synthesis-phase="${report.cover.phaseId}"`);
    expect(html).toContain(GROWTH_PHASE_LABELS[report.cover.phaseId].en);
    expect(html).toContain('data-synthesis-worth="range"');
    expect(html).toContain(d.worth.headline.replace(/&/g, "&amp;"));
    for (const s of d.strengths) expect(html).toContain(s.replace(/&/g, "&amp;").replace(/"/g, "&quot;"));
    for (const w of d.weaknesses) expect(html).toContain(w.replace(/&/g, "&amp;").replace(/"/g, "&quot;"));
    for (const f of d.followUps) expect(html).toContain(`+${f.lift} SVI`);
    expect(html).toContain(`href="${EXECUTIVE_SYNTHESIS_REPORT_HREF}"`);
    expect(html).toContain('data-testid="landing-synthesis-cta"');
    // Executive strengths never restate a score.
    expect(html).not.toMatch(/\d{2}\/100/);
  });

  it("pending valuation renders the honest sentence, and the VI locale has diacritics without English chrome", () => {
    const pre = preRevenueFixtureReportV2();
    pre.valuation.consensus.confidence = 0.2;
    const d = synthesisFromReport(pre, "vi");
    const html = renderToStaticMarkup(<ExecutiveSynthesis ctx={ctx} data={d} locale="vi" />);
    expect(html).toContain('data-synthesis-worth="pending"');
    expect(html).toContain(TBR_STRINGS.vi.v2.s44.valuationPending);
    expect(html).toContain(TBR_STRINGS.vi.v2.s44.dashboard.title);
    expect(html).not.toContain("Executive synthesis");
    expect(html).not.toContain("Top strengths");
  });

  // G24-A: the dashboard has no footnote appendix — a stored `[ev:]` / `[unevidenced]` marker is stripped, never printed.
  it("strips citation markers from the strengths, weaknesses, where-sentence and follow-ups", () => {
    const report = demoReportV2();
    report.executive.strengths[0] = `${report.executive.strengths[0]} [ev:ev-connected-revenue-stripe]`;
    report.executive.gaps[0] = `${report.executive.gaps[0]} [unevidenced]`;
    report.cover.threeQuestions.where = "Investor Progress Review with A$1.2M ARR [ev:ev-connected-revenue-stripe].";
    report.actionPlan.steps[0]!.title = `${report.actionPlan.steps[0]!.title} [ev:ev-hub-data-room]`;
    const data = synthesisFromReport(report);
    const html = renderToStaticMarkup(<ExecutiveSynthesis ctx={ctx} data={data} />);
    expect(html).not.toContain("[ev:");
    expect(html).not.toMatch(/\[unevidenced\]/i);
    expect(data.where.sentence).toBe("Investor Progress Review with A$1.2M ARR.");
    expect(report.executive.strengths[0]).toContain("[ev:ev-connected-revenue-stripe]");
  });
});
