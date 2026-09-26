// G34 BT3 leftovers — page-1 next step (founder "Add evidence" / evaluator
// "Request evidence from founder", none on the demo), the signal chip
// popover (button + aria-expanded, Esc closes and returns focus, summary +
// linked criteria, never a score) and the old-revision banner (spec §3).
// renderToStaticMarkup — no DOM runner in this workspace, so the popover's
// keyboard / focus behaviour is pinned through its pure state machine.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { alignReportWithAssessmentCard } from "@/lib/svi/assessment-card";
import { buildDashboardV4, EVIDENCE_GAPS_HREF } from "@/lib/report-v2/dashboard-v4";
import { demoReportV2, freeFixtureReportV2 } from "@/lib/report-v2/fixtures";
import { investmentViewFor } from "@/lib/report-v2/investment-view";
import { TBR_REQUEST_EVIDENCE_HASH } from "@/lib/report-v2/request-evidence";
import type { ReportV2 } from "@/lib/report-v2/schema";
import { TbrReportV2 } from "./report";
import { SignalChipStrip, signalPopoverReduce } from "./signal-chip-strip";

const page1 = (html: string) => html.slice(html.indexOf('id="tbr-dashboard"'), html.indexOf('id="tbr-investment-view"'));
const textOf = (html: string) => html.replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/<[^>]+>/g, "\n").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/&quot;/g, '"');

function v4For(report: ReportV2, lockCards = false) {
  const aligned = alignReportWithAssessmentCard(report, {});
  return buildDashboardV4(aligned.report, aligned.card, investmentViewFor(aligned.report, aligned.card, "en"), { locale: "en", lockCards });
}

function withPending(report: ReportV2, dim: "svm" | "cgh"): ReportV2 {
  const ch = report.dimensions.find((d) => d.dim === dim)!;
  ch.band = "pending";
  ch.score = 0;
  ch.scoreBreakdown = { base: 35, signals: [], confidenceMultiplier: 0.2, adjustment: 0, assessed: false };
  report.cover.dims[dim] = { ...report.cover.dims[dim], band: "pending", score: 0 };
  return report;
}

describe("dashboard v4 — next step target (projection)", () => {
  it("targets the first pending dimension, else the lowest-scored one", () => {
    const pending = v4For(withPending(demoReportV2(), "cgh"));
    expect(pending.nextStep).toMatchObject({ dim: "cgh", founderHref: `${EVIDENCE_GAPS_HREF}?dim=cgh` });

    const plain = v4For(demoReportV2());
    const lowest = [...plain.scorecard].filter((r) => !r.pending).sort((a, b) => (a.score ?? 0) - (b.score ?? 0))[0]!;
    expect(plain.nextStep.dim).toBe(lowest.dim);
    expect(plain.nextStep.dimTitle).toBe(lowest.title);
  });
});

describe("TbrDashboard — next step bar", () => {
  it("founder: one primary 'Add evidence' → the Evidence Hub gap list for that dimension", () => {
    const html = page1(renderToStaticMarkup(<TbrReportV2 report={withPending(demoReportV2(), "svm")} nextStep={{ viewer: "founder" }} />));
    expect(html).toContain('data-tbr-next-step="founder"');
    expect(html).toMatch(/href="\/workspace\/evidence\/gaps\?dim=svm"[^>]*data-tbr-next-step-primary/);
    expect((html.match(/data-tbr-next-step-primary/g) ?? []).length).toBe(1);
    expect(textOf(html)).toContain("Add evidence");
    expect(textOf(html)).not.toContain("Request evidence from founder");
    expect(html).toContain('href="#tbr-investment-view"');
  });

  it("evaluator / shared: 'Request evidence from founder' → the share page's existing lead form anchor", () => {
    const html = page1(renderToStaticMarkup(<TbrReportV2 report={demoReportV2()} nextStep={{ viewer: "evaluator", href: TBR_REQUEST_EVIDENCE_HASH }} />));
    expect(html).toContain('data-tbr-next-step="evaluator"');
    expect(html).toMatch(/href="#tbr-request-evidence"[^>]*data-tbr-next-step-primary/);
    expect(textOf(html)).toContain("Request evidence from founder");
    expect(textOf(html)).not.toMatch(/\nAdd evidence\n/);
    // Never a founder-only workspace link for a share-link reader.
    expect(html).not.toContain("/workspace/evidence/gaps");
  });

  it("evaluator without a request path renders no bar (never a dead button)", () => {
    const html = page1(renderToStaticMarkup(<TbrReportV2 report={demoReportV2()} nextStep={{ viewer: "evaluator" }} />));
    expect(html).not.toContain("data-tbr-next-step");
  });

  it("public demo / showcase (no viewer given): no next-step bar at all", () => {
    const html = page1(renderToStaticMarkup(<TbrReportV2 report={demoReportV2()} />));
    expect(html).not.toContain("data-tbr-next-step");
  });
});

describe("SignalChipStrip — popover", () => {
  it("each chip is a button with aria-expanded=false + aria-controls; the popover is in the DOM but hidden", () => {
    const html = renderToStaticMarkup(<SignalChipStrip v4={v4For(demoReportV2())} />);
    expect((html.match(/<button type="button" aria-expanded="false" aria-controls="tbr-signal-pop-/g) ?? []).length).toBe(6);
    expect((html.match(/hidden="" data-tbr-signal-popover="[a-z_]+"/g) ?? []).length).toBe(6);
    expect(html).toContain('href="#investor-signal-team"');
  });

  it("open: aria-expanded=true, summary + linked criteria titles, no score in the popover", () => {
    const v4 = v4For(demoReportV2());
    const chip = v4.signalChips.find((c) => c.criteria.length > 0)!;
    expect(chip).toBeDefined();
    const html = renderToStaticMarkup(<SignalChipStrip v4={v4} initialOpenKey={chip.key} />);
    expect(html).toContain(`aria-expanded="true" aria-controls="tbr-signal-pop-${chip.key}"`);
    const pop = html.slice(html.indexOf(`data-tbr-signal-popover="${chip.key}"`), html.indexOf("</div>", html.indexOf(`data-tbr-signal-popover="${chip.key}"`)));
    expect(html).not.toContain(`hidden="" data-tbr-signal-popover="${chip.key}"`);
    expect((html.match(/hidden="" data-tbr-signal-popover=/g) ?? []).length).toBe(5);
    expect(textOf(pop)).toContain(chip.summary);
    for (const title of chip.criteria) expect(textOf(pop)).toContain(title);
    expect(textOf(pop.slice(pop.indexOf(">") + 1))).not.toMatch(/\d/);
    expect(html).toMatch(/role="region" aria-label="[^"]+ signal details"/);
  });

  it("free tier (D24-b): a gated signal's popover names no criterion", () => {
    const v4 = v4For(freeFixtureReportV2(), true);
    const gated = v4.signalChips.filter((c) => c.detailLocked);
    for (const chip of gated) {
      expect(chip.criteria).toEqual([]);
      const html = renderToStaticMarkup(<SignalChipStrip v4={v4} initialOpenKey={chip.key} />);
      const pop = html.slice(html.indexOf(`data-tbr-signal-popover="${chip.key}"`), html.indexOf("</div>", html.indexOf(`data-tbr-signal-popover="${chip.key}"`)));
      expect(textOf(pop)).toContain("Linked criteria are in the full report.");
      expect(pop).not.toContain("data-tbr-signal-criteria");
    }
  });

  it("state machine: toggle opens one at a time, Escape closes and returns focus to the chip, outside / follow close", () => {
    expect(signalPopoverReduce(null, { type: "toggle", key: "team" })).toEqual({ open: "team", focus: null });
    expect(signalPopoverReduce("team", { type: "toggle", key: "moat" })).toEqual({ open: "moat", focus: null });
    expect(signalPopoverReduce("team", { type: "toggle", key: "team" })).toEqual({ open: null, focus: null });
    expect(signalPopoverReduce("ip", { type: "escape" })).toEqual({ open: null, focus: "ip" });
    expect(signalPopoverReduce(null, { type: "escape" })).toEqual({ open: null, focus: null });
    expect(signalPopoverReduce("ip", { type: "outside" })).toEqual({ open: null, focus: null });
    expect(signalPopoverReduce("ip", { type: "follow" })).toEqual({ open: null, focus: null });
  });
});

describe("TbrDashboard — old-revision banner (spec §3)", () => {
  const rev = (current: number, latest: number, latestHref: string | null) => ({ current: { n: current, createdAt: "2026-08-12T01:00:00Z" }, latest: { n: latest, createdAt: "2026-09-25T01:00:00Z" }, latestHref });

  it("older revision + owner link: 'Viewing rev 2 (12/08/2026). Latest rev 3 (25/09/2026) ›'", () => {
    const html = page1(renderToStaticMarkup(<TbrReportV2 report={demoReportV2()} revision={rev(2, 3, "/tbr/latest-token")} />));
    expect(html).toMatch(/role="status" data-tbr-revision-banner="2"/);
    const text = textOf(html).replace(/\s+/g, " ");
    expect(text).toContain("Viewing rev 2 (12/08/2026).");
    expect(text).toContain("Latest rev 3 (25/09/2026) ›");
    expect(html).toMatch(/href="\/tbr\/latest-token" data-tbr-revision-latest/);
  });

  it("older revision, not the owner: no link — 'ask the founder'", () => {
    const html = page1(renderToStaticMarkup(<TbrReportV2 report={demoReportV2()} revision={rev(1, 3, null)} />));
    expect(html).toContain('data-tbr-revision-banner="1"');
    expect(html).not.toContain("data-tbr-revision-latest");
    expect(textOf(html).replace(/\s+/g, " ")).toContain("Latest rev 3 (25/09/2026). Ask the founder for the latest link.");
  });

  it("latest revision or no revision data: no banner", () => {
    expect(page1(renderToStaticMarkup(<TbrReportV2 report={demoReportV2()} revision={rev(3, 3, "/tbr/x")} />))).not.toContain("data-tbr-revision-banner");
    expect(page1(renderToStaticMarkup(<TbrReportV2 report={demoReportV2()} />))).not.toContain("data-tbr-revision-banner");
  });
});
