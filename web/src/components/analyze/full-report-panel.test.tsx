// Colocated spec for FullReportPanel (S32-B).
//
// The panel polls in an effect, which a static render never runs, so the
// state-dependent copy is pinned through the exported pure helpers
// (`progressLine`, `parseView`) and the first paint through a static render:
// no row id → nothing; an intake → the echo is on screen before any poll,
// with the free "0 credits" line and the honest "preparing" status.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { AgentCard, FullReportPanel, parseView, progressLine, progressLineV2, reportApiPath, stillBeingWritten, V2_PHASE_LABELS } from "./full-report-panel";
import { sampleIntake, sampleReport } from "@/lib/analyses/first-analysis/fixtures";
import { demoReportV2 } from "@/lib/report-v2/fixtures";
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

  // G28-C: a fresh row is a Trusted Business Report run — the first paint
  // says so (the seven-voice cards belong to pre-G28 rows only, after a poll).
  it("shows the echo from the intake, the free line and the v3 'preparing' status + what is being written, before any poll", () => {
    const intake = sampleIntake() as unknown as IntakeResult;
    const html = renderToStaticMarkup(<FullReportPanel analysisId="0d4f7c1e-9b2a-4c3d-8e5f-6a7b8c9d0e1f" intake={intake} />);
    expect(html).toContain("What we read");
    expect(html).toContain("A$18,500");
    expect(html).toContain("Free · 0 credits");
    expect(html).toContain("Preparing your Trusted Business Report");
    expect(html).toContain('data-kind="v2"');
    expect(html).toContain("analyze-report-v2-pending");
    expect(html).toContain("Eight dimension chapters");
    for (const role of ["CFO", "CMO", "CTO", "CPO", "CLO", "CHRO"]) {
      expect(html).not.toContain(`>${role}<`);
    }
    // No download / resend until the job is done.
    expect(html).not.toContain("analyze-full-report-download");
  });
});

describe("G28-C: the v3 document on the analyze page", () => {
  it("parseView reads kind / reportV2 / progressV2, and infers S32 for an older body that carries a v1 report", () => {
    const v2 = parseView({ ok: true, status: "done", kind: "v2", reportV2: demoReportV2(), progressV2: null })!;
    expect(v2.kind).toBe("v2");
    expect(v2.reportV2?.dimensions).toHaveLength(8);
    expect(v2.report).toBeNull();
    const running = parseView({ ok: true, status: "running", kind: "v2", reportV2: null, progressV2: { phase: "analyze", pct: 35, at: "x", chaptersDone: 2 } })!;
    expect(running.progressV2).toEqual({ phase: "analyze", pct: 35, at: "x", chaptersDone: 2 });
    const legacy = parseView({ ok: true, status: "done", report: sampleReport() })!;
    expect(legacy.kind).toBe("s32");
    expect(parseView({ ok: true, status: "queued" })!.kind).toBe("v2");
  });

  it("progressLineV2 is honest about every state: queued, held, running with phase + chapters, done, degraded, failed", () => {
    expect(progressLineV2(null)).toMatch(/Preparing your Trusted Business Report/);
    expect(progressLineV2({ status: "queued", progressV2: null, error: null, reportV2: null })).toMatch(/^Queued — the report pipeline/);
    expect(progressLineV2({ status: "queued", heldForCap: true, progressV2: null, error: null, reportV2: null })).toMatch(/free reports are all taken/);
    expect(progressLineV2({ status: "running", progressV2: { phase: "analyze", pct: 35, at: "x", chaptersDone: 2 }, error: null, reportV2: null })).toBe(`${V2_PHASE_LABELS.analyze} 2 of 8 chapters in. 35 %`);
    expect(progressLineV2({ status: "running", progressV2: null, error: null, reportV2: null })).toBe(V2_PHASE_LABELS.starting);
    const report = demoReportV2();
    expect(progressLineV2({ status: "done", progressV2: null, error: null, reportV2: { ...report, quality: { ...report.quality, degradedSections: [] } } })).toMatch(/^Complete — the full Trusted Business Report/);
    expect(progressLineV2({ status: "done", progressV2: null, error: null, reportV2: { ...report, quality: { ...report.quality, degradedSections: ["tre", "mpc"] } } })).toBe("Complete — 6 of 8 chapters written by the agents; 2 fell back to the deterministic card.");
    expect(progressLineV2({ status: "failed", progressV2: null, error: "engine_overloaded", reportV2: null })).toMatch(/could not be written.*engine_overloaded.*retried automatically/);
  });

  it("reportApiPath forwards the signed e-mail token to the poll and PDF routes only when present", () => {
    expect(reportApiPath("abc", "full-report")).toBe("/api/analyses/abc/full-report");
    expect(reportApiPath("abc", "report.pdf", "12.a/b")).toBe("/api/analyses/abc/report.pdf?token=12.a%2Fb");
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
