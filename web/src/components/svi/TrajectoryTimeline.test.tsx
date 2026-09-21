// G21 P3-A — <TrajectoryTimeline>: empty state, single snapshot, series
// with Day 0 / 60 / 180 tiles, SVG series + markers, a11y table, theme
// tokens (no dark: colours, no hex), no forecasting words.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { buildTrajectory } from "@/lib/svi/trajectory";
import { TrajectoryTimeline } from "./TrajectoryTimeline";

const SERIES = buildTrajectory({
  snapshots: [
    { snapshot_date: "2026-01-01", svi_total: 38, evidence_confidence: 22, stage: 1 },
    { snapshot_date: "2026-02-15", svi_total: 45, evidence_confidence: 35, stage: 1 },
    { snapshot_date: "2026-07-15", svi_total: 58, evidence_confidence: 61, stage: 2 },
  ],
  evidenceRecords: [{ evidence_type: "L3_uploaded_document", submitted_at: "2026-02-10T00:00:00Z", status: "active" }],
  outcomes: [{ id: "o-1", kind: "grant_success", observed_at: "2026-03-04", value: { program: "AEA Ignite" }, source: "external_signal", status: "confirmed" }],
  verificationLevel: "L2",
});

function html(el: React.ReactElement): string {
  return renderToStaticMarkup(el);
}

describe("<TrajectoryTimeline>", () => {
  it("empty → the honest empty state, h2 heading, no chart", () => {
    const out = html(<TrajectoryTimeline data={buildTrajectory({ snapshots: [], evidenceRecords: [], outcomes: [], verificationLevel: null })} />);
    expect(out).toContain('data-trajectory-state="empty"');
    expect(out).toContain('data-testid="trajectory-empty"');
    expect(out).toMatch(/<h2[^>]*>How the record has moved<\/h2>/);
    expect(out).not.toContain("<svg");
  });

  it("series → three tiles (Day 0 present, Day 60 present, Day 180 present), SVI + confidence paths, an outcome marker, the a11y table, the outcome chip", () => {
    const out = html(<TrajectoryTimeline data={SERIES} outcomesHref="/workspace/evidence/outcomes" />);
    expect(out).toContain('data-trajectory-state="series"');
    expect(out).toContain('data-trajectory-milestone="0" data-trajectory-present="true"');
    expect(out).toContain('data-trajectory-milestone="60" data-trajectory-present="true"');
    expect(out).toContain('data-trajectory-milestone="180" data-trajectory-present="true"');
    expect(out).toContain('data-series="svi"');
    expect(out).toContain('data-series="confidence"');
    expect(out).toContain('data-trajectory-marker="grant_success"');
    expect(out).toContain("Grant awarded");
    expect(out).toContain("AEA Ignite");
    expect(out).toContain("<table");
    expect(out).toContain("Highest evidence level");
    expect(out).toContain('data-testid="trajectory-outcomes"');
    expect(out).toContain("Day 0 / 60 / 180");
    // tile deltas: Day 60 picks the 45-day point (+7), Day 180 the 45-day point too (the next is day 195)
    expect(out).toMatch(/\+7/);
    expect(out).toContain("L2");
  });

  it("single snapshot + no outcomes → Day 60 / 180 'not reached', the no-outcome line with the record link; compact variant is shorter", () => {
    const one = buildTrajectory({ snapshots: [{ snapshot_date: "2026-09-01", svi_total: 40, evidence_confidence: 20, stage: 1 }], evidenceRecords: [], outcomes: [], verificationLevel: null });
    const out = html(<TrajectoryTimeline data={one} variant="compact" headingLevel={3} outcomesHref="/workspace/evidence/outcomes" />);
    expect(out).toContain('data-trajectory-state="single"');
    expect(out).toContain('data-trajectory-milestone="60" data-trajectory-present="false"');
    expect(out).toContain("Not reached yet");
    expect(out).toContain('data-testid="trajectory-no-outcomes"');
    expect(out).toContain('href="/workspace/evidence/outcomes"');
    expect(out).toMatch(/<h3[^>]*>How the record has moved<\/h3>/);
    expect(out).toContain('height="160"');
    expect(out).toContain("One snapshot so far");
  });

  it("theme contract: semantic tokens only, no dark: colour classes, no hex, no forecasting words", () => {
    const out = html(<TrajectoryTimeline data={SERIES} />);
    expect(out).toContain("bg-surface");
    expect(out).toContain("text-primary");
    expect(out).not.toMatch(/\bdark:(?!border-)/);
    expect(out).not.toMatch(/#[0-9a-f]{3,6}\b/i);
    expect(out).not.toMatch(/\bbg-white\b/);
    expect(out).not.toMatch(/predict|forecast|accura/i);
  });
});
