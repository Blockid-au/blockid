// Colocated vitest for lib/evaluations/assessment-prefill.ts (G13-W4-D2).
// Pins the pure seed builder (thesis fit from the mandate score, 1–5
// ratings from the snapshot dims, risks from blockers / gaps / lowest
// criteria, questions from next_action, everything `source: "ai"`) and the
// gathering path (no mandate → no fit; missing tables → fewer seeds, never
// a throw).

import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
const state = { fit: null as Row | null, snapshot: null as Row | null, mandates: [] as Row[] };

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      const q: Record<string, unknown> = {
        select: () => q,
        eq: () => q,
        order: () => q,
        limit: () => q,
        maybeSingle: async () => ({ data: table === "mandate_fit_scores" ? state.fit : table === "svi_snapshots" ? state.snapshot : null, error: null }),
      };
      return q;
    },
  }),
}));
vi.mock("@/lib/investors/mandates", () => ({
  listMandates: async () => ({ migrated: true, mandates: state.mandates, primary: state.mandates[0] ?? null }),
}));

import { buildAssessmentPrefill, nextActionToQuestion, prefillFromFit, scoreToRating } from "./assessment-prefill";

beforeEach(() => {
  state.fit = null;
  state.snapshot = null;
  state.mandates = [];
});

describe("scoreToRating / nextActionToQuestion", () => {
  it("maps the band ladder 0–100 → 1–5", () => {
    expect([10, 35, 50, 65, 80, 100].map(scoreToRating)).toEqual([1, 2, 3, 4, 5, 5]);
  });
  it("rewrites an imperative next action as a question and keeps an existing question", () => {
    expect(nextActionToQuestion("Hire a second engineer by Q2.")).toBe("What is your plan to hire a second engineer by Q2?");
    expect(nextActionToQuestion("How will you reach A$1M ARR?")).toBe("How will you reach A$1M ARR?");
    expect(nextActionToQuestion("   ")).toBeNull();
  });
});

describe("buildAssessmentPrefill (pure)", () => {
  it("seeds thesis fit, per-dimension ratings (stance unsure), AI risks and questions from the three lowest criteria", () => {
    const p = buildAssessmentPrefill({
      snapshotId: "s-1",
      dimScores: { tre: 61, mpc: 82, ftv: 30 },
      criteria: [
        { key: "idea", title: "Idea", primary_dimension: "mpc", score: 74, gaps: ["No moat statement"], next_action: "Write the moat statement" },
        { key: "team", title: "Team", primary_dimension: "ftv", score: 22, gaps: ["Single founder", "No CTO"], next_action: "Recruit a technical co-founder" },
        { key: "traction", title: "Traction", primary_dimension: "tre", score: 45, gaps: ["MRR not evidenced"], next_action: "Connect Stripe" },
        { key: "legal", title: "Legal", primary_dimension: "lco", score: 38, gaps: [], next_action: "" },
      ],
      fit: { score: 72.4, gaps: ["stage later than mandate"], blockers: [], mandateName: "Seed AU" },
    });
    expect(p.thesisFitPct).toBe(72);
    expect(p.mandateName).toBe("Seed AU");
    expect(p.dimensionRatings).toEqual({ TRE: { rating: 3, stance: "unsure" }, MPC: { rating: 5, stance: "unsure" }, FTV: { rating: 1, stance: "unsure" } });
    // lowest three: team (22) → critical, legal (38, no gap → no risk), traction (45) → medium; mandate gap first
    expect(p.risks.map((r) => [r.title, r.severity, r.dimension, r.source])).toEqual([
      ["stage later than mandate", "medium", undefined, "ai"],
      ["Single founder", "critical", "FTV", "ai"],
      ["MRR not evidenced", "medium", "TRE", "ai"],
    ]);
    expect(p.questionsForFounder.map((q) => q.text)).toEqual(["What is your plan to recruit a technical co-founder?", "What is your plan to connect Stripe?"]);
    expect(p.questionsForFounder[0].dimension).toBe("FTV");
    expect(p.seeded).toBe(true);
  });

  it("no inputs → nothing seeded", () => {
    const p = buildAssessmentPrefill({ snapshotId: null, dimScores: {}, criteria: [], fit: null });
    expect(p).toEqual({ snapshotId: null, thesisFitPct: null, mandateName: null, dimensionRatings: {}, risks: [], questionsForFounder: [], seeded: false });
  });

  it("blockers become high-severity risks and the score is clamped 0–100", () => {
    const p = buildAssessmentPrefill({ snapshotId: null, dimScores: {}, criteria: [], fit: { score: 140, gaps: [], blockers: ["excluded sector"], mandateName: null } });
    expect(p.thesisFitPct).toBe(100);
    expect(p.risks).toEqual([{ title: "excluded sector", severity: "high", source: "ai", note: "Mandate blocker" }]);
  });
});

describe("prefillFromFit (gather)", () => {
  it("reads the primary mandate's fit row + latest snapshot", async () => {
    state.mandates = [{ id: "m-1", label: "Seed AU" }];
    state.fit = { score: "55.5", gaps: ["geo"], blockers: [] };
    state.snapshot = { id: "s-9", dim_results: null, dimension_scores: { tre: 70 }, criterion_results: [{ key: "k", title: "K", primary_dimension: "tre", score: 41, gaps: ["g"], next_action: "Do x" }] };
    const p = await prefillFromFit({ userId: "u", projectId: "p" });
    expect(p.snapshotId).toBe("s-9");
    expect(p.thesisFitPct).toBe(56);
    expect(p.mandateName).toBe("Seed AU");
    expect(p.dimensionRatings.TRE).toEqual({ rating: 4, stance: "unsure" });
    expect(p.risks.map((r) => r.title)).toEqual(["geo", "g"]);
  });

  it("no mandate → no fit; no snapshot → no ratings; never throws", async () => {
    const p = await prefillFromFit({ userId: "u", projectId: "p" });
    expect(p.thesisFitPct).toBeNull();
    expect(p.seeded).toBe(false);
  });
});
