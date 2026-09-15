// Colocated spec for FullReportPanel (S32-B).
//
// The panel polls in an effect, which a static render never runs, so the
// state-dependent copy is pinned through the exported pure helpers
// (`progressLine`, `parseView`) and the first paint through a static render:
// no row id → nothing; an intake → the echo is on screen before any poll,
// with the free "0 credits" line and the honest "preparing" status.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { FullReportPanel, parseView, progressLine } from "./full-report-panel";
import { sampleIntake, sampleReport } from "@/lib/analyses/first-analysis/fixtures";
import type { IntakeResult } from "@/lib/intake/analyze-input";

describe("progressLine", () => {
  it("is honest about every state, including the AI queue", () => {
    expect(progressLine(null)).toMatch(/Preparing/);
    expect(progressLine({ status: "queued", report: null, error: null })).toMatch(/Queued/);
    const r = sampleReport({ agents: false });
    r.progress.current = "cfo";
    expect(progressLine({ status: "running", report: r, error: null })).toBe("The CFO is checking the valuation…");
    r.progress.queuedForSec = 12;
    expect(progressLine({ status: "running", report: r, error: null })).toBe("AI queue is busy — queued, ~12 s.");
    expect(progressLine({ status: "done", report: sampleReport(), error: null })).toMatch(/Complete/);
    expect(progressLine({ status: "failed", report: r, error: "1 section(s) not written: clo" })).toMatch(/could not finish.*clo.*retried/);
  });
});

describe("parseView", () => {
  it("rejects anything that is not an ok body and fills defaults", () => {
    expect(parseView(null)).toBeNull();
    expect(parseView({ ok: false })).toBeNull();
    expect(parseView({ ok: true, status: "queued" })).toMatchObject({ status: "queued", locked: false, report: null, pollAfterSec: 0, attempts: 0 });
  });
});

describe("FullReportPanel — first paint", () => {
  it("renders nothing without a row id", () => {
    expect(renderToStaticMarkup(<FullReportPanel analysisId={null} />)).toBe("");
  });

  it("shows the echo from the intake, the free line and the preparing status before any poll", () => {
    const intake = sampleIntake() as unknown as IntakeResult;
    const html = renderToStaticMarkup(<FullReportPanel analysisId="0d4f7c1e-9b2a-4c3d-8e5f-6a7b8c9d0e1f" intake={intake} />);
    expect(html).toContain("What we read");
    expect(html).toContain("A$18,500");
    expect(html).toContain("Free · 0 credits");
    expect(html).toContain("Preparing your first analysis");
    for (const role of ["CEO", "CFO", "CMO", "CTO", "CPO", "CLO", "CHRO"]) {
      expect(html).toContain(`>${role}<`);
    }
    // No download / resend until the job is done.
    expect(html).not.toContain("analyze-full-report-download");
  });
});
