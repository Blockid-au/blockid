// Render test for the seats & consensus table (G13-W5-D3, F1 / F2). Pins:
// unavailable → nothing; a single personal seat → the invite prompt; ≥ 2
// seats → one row per seat (own row marked), decision chips, the consensus
// row with medians, the "Discuss" marker on disagreeing dimensions, the
// label "(submitted/seats)", and never a private note.

import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { computeConsensus, emptyConsensus, type SeatAssessmentRow } from "@/lib/investor/organisations";
import type { SeatVisibleAssessment } from "@/lib/evaluations/assessments";
import { SeatsConsensus } from "./seats-consensus";

vi.mock("./consensus-tracker", () => ({ ConsensusTracker: () => null }));

function seat(userId: string, over: Partial<SeatVisibleAssessment> | null, isMe = false): SeatAssessmentRow {
  const base: SeatVisibleAssessment = {
    id: `a-${userId}`, evaluationId: "e-1", projectId: "p-1", assessorUserId: userId, orgId: "org-1", snapshotId: null, version: 1, status: "submitted", decision: "track", conviction: 3, thesisFitPct: null,
    dimensionRatings: {}, criterionRatings: {}, valuationView: null, risks: [], questionsForFounder: [], privateNotes: null, sharedNotes: null, sharedFields: [], sharedWithFounderAt: null, submittedAt: "x", createdAt: "", updatedAt: "",
  };
  return { userId, displayName: isMe ? "Me" : userId, isMe, assessment: over === null ? null : { ...base, ...over } };
}

describe("SeatsConsensus", () => {
  it("renders nothing when unavailable and the invite prompt for a single seat", () => {
    expect(renderToStaticMarkup(<SeatsConsensus consensus={emptyConsensus(false)} evaluationId="e-1" />)).toBe("");
    const single = computeConsensus([seat("u-me", { decision: "proceed" }, true)], { id: "o", name: "Personal" });
    const out = renderToStaticMarkup(<SeatsConsensus consensus={single} evaluationId="e-1" />);
    expect(out).toContain('data-testid="seats-single"');
    expect(out).toContain('href="/workspace/investor/team"');
    expect(out).not.toContain("seats-consensus");
  });

  it("≥ 2 seats: rows, chips, medians, Discuss marker, label; other seats' private notes never present", () => {
    const c = computeConsensus(
      [
        seat("u-me", { decision: "proceed", conviction: 4, dimensionRatings: { TRE: { rating: 5, stance: "agree" }, MPC: { rating: 2, stance: "disagree" } } }, true),
        seat("Ben", { decision: "track", conviction: 3, dimensionRatings: { TRE: { rating: 4, stance: "agree" }, MPC: { rating: 4, stance: "agree" } }, privateNotes: null }),
        seat("Cara", null),
      ],
      { id: "org-1", name: "Blue Fund" },
    );
    const out = renderToStaticMarkup(<SeatsConsensus consensus={c} evaluationId="e-1" />);
    expect(out).toMatch(/data-testid="seats-consensus"[^>]*data-seats="3"[^>]*data-submitted="2"/);
    expect(out).toContain("Blue Fund");
    expect(out).toMatch(/data-testid="consensus-label"[^>]*>Firm consensus \(2\/3\)/);
    expect(out).toMatch(/data-testid="consensus-aggregate"[^>]*>split/);
    expect((out.match(/data-testid="seat-row"/g) ?? []).length).toBe(3);
    expect(out).toMatch(/data-testid="seat-row" data-me="1"/);
    expect(out).toContain(">proceed<");
    expect(out).toContain(">track<");
    expect(out).toContain("not started");
    // MPC: 2 vs 4 → Discuss; TRE: 5 vs 4 → no marker.
    expect(out).toMatch(/data-discuss="1"[^>]*>MPC/);
    expect(out).toMatch(/data-discuss="0"[^>]*>TRE/);
    expect(out).toContain("Discuss");
    expect(out).toContain('data-testid="consensus-row"');
    expect(out).toContain("1 proceed · 1 track · 0 pass · mean conviction 3.5/5");
    expect(out).toContain("private notes are never shown");
  });
});
