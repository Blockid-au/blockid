// Colocated spec for FullReportPanel (S32-B).
//
// The panel polls in an effect, which a static render never runs, so the
// state-dependent copy is pinned through the exported pure helpers
// (`progressLine`, `parseView`) and the first paint through a static render:
// no row id → nothing; an intake → the echo is on screen before any poll,
// with the free "0 credits" line and the honest "preparing" status.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { AgentCard, FullReportPanel, parseView, progressLine, stillBeingWritten } from "./full-report-panel";
import { sampleIntake, sampleReport } from "@/lib/analyses/first-analysis/fixtures";
import type { FullReportView } from "@/lib/analyses/first-analysis/types";
import type { IntakeResult } from "@/lib/intake/analyze-input";

describe("progressLine", () => {
  it("is honest about every state, including the AI queue", () => {
    expect(progressLine(null)).toMatch(/Preparing/);
    expect(progressLine({ status: "queued", report: null, error: null })).toMatch(/Queued/);
    const r = sampleReport({ agents: false });
    r.progress.current = "cfo";
    expect(progressLine({ status: "running", report: parseView({ ok: true, report: r })!.report, error: null })).toBe("The CFO is checking the valuation…");
    r.progress.queuedForSec = 12;
    expect(progressLine({ status: "running", report: parseView({ ok: true, report: r })!.report, error: null })).toBe("AI queue is busy — queued, ~12 s.");
    expect(progressLine({ status: "done", report: parseView({ ok: true, report: sampleReport() })!.report, error: null })).toMatch(/Complete — seven/);
    expect(progressLine({ status: "failed", report: parseView({ ok: true, report: r })!.report, error: "1 section(s) not written: clo" })).toMatch(/could not finish.*clo.*retried/);
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

// S32-E: the payload's `report.agents` is one object per voice; the panel
// normalises whatever arrives and is honest about a partial report.
describe("S32-E: partial report and normalised sections", () => {
  function partialView(): FullReportView {
    const r = sampleReport();
    delete r.agents.cpo;
    delete r.agents.clo;
    delete r.agents.chro;
    r.sections = { cpo: { status: "failed", attempts: 1 }, clo: { status: "failed", attempts: 2 }, chro: { status: "unavailable", attempts: 3 } };
    r.partialAt = "2026-09-15T00:05:00.000Z";
    return parseView({ ok: true, status: "done_partial", locked: false, report: r, preview: null, emailedAt: null, emailTo: "f******@example.com", attempts: 1, error: "3 section(s) not written", pollAfterSec: 20 })!;
  }

  it("parseView normalises objects, bare strings and missing voices to the same shape", () => {
    const r = sampleReport() as unknown as { agents: Record<string, unknown> };
    r.agents.cfo = "A bare body.";
    delete r.agents.clo;
    const v = parseView({ ok: true, status: "done", report: r })!;
    expect(Object.keys(v.report!.agents)).toHaveLength(7);
    expect(v.report!.agents.ceo).toMatchObject({ role: "ceo", status: "done", provider: "test", model: "stub" });
    expect(v.report!.agents.cfo).toMatchObject({ role: "cfo", status: "done", body: "A bare body.", nextSteps: [] });
    expect(v.report!.agents.clo).toMatchObject({ role: "clo", status: "pending", body: null, title: null, nextSteps: [] });
  });

  it("progressLine says how many sections are still being written, and counts unavailable ones on done", () => {
    const v = partialView();
    expect(progressLine(v)).toBe("2 sections are still being written — we will email the full report when they finish. What is ready is below.");
    expect(stillBeingWritten(v.report)).toEqual(["cpo", "clo"]);
    const done = parseView({ ok: true, status: "done", report: partialView().report })!;
    expect(progressLine(done)).toMatch(/1 section could not be written after three attempts/);
  });

  it("cards: a written section with a benchmark footer, a 'still being written' card, an honest 'unavailable' card", () => {
    const v = partialView();
    const ceo = { ...v.report!.agents.ceo, benchmarkFigures: ["$70k"] };
    const written = renderToStaticMarkup(<AgentCard role="ceo" section={ceo} ceoPreview={null} locked={false} status="done_partial" current={null} />);
    expect(written).toContain(ceo.title!);
    expect(written).toContain("Figures marked as benchmarks are market references, not your data.");
    expect(written).toContain('data-status="done"');

    const pending = renderToStaticMarkup(<AgentCard role="cpo" section={v.report!.agents.cpo} ceoPreview={null} locked={false} status="done_partial" current={null} />);
    expect(pending).toContain("Still being written — we will email the full report when it finishes.");
    expect(pending).toContain('data-status="failed"');

    const unavailable = renderToStaticMarkup(<AgentCard role="chro" section={v.report!.agents.chro} ceoPreview={null} locked={false} status="done_partial" current={null} />);
    expect(unavailable).toContain("could not be written after three attempts");
    expect(unavailable).toContain('data-status="unavailable"');

    const writing = renderToStaticMarkup(<AgentCard role="clo" section={v.report!.agents.clo} ceoPreview={null} locked={false} status="done_partial" current="clo" />);
    expect(writing).toContain("The CLO is checking structure and compliance…");
  });
});
