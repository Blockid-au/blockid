import { describe, expect, it } from "vitest";
import { computeSVI, extractSignals } from "@/lib/svi-analysis";
import { fakeSupabase } from "@/test/fake-supabase";
import {
  countIntakeAnalysesForUser,
  latestIntakeAnalysisForUser,
  rebuildFromRow,
  type BridgeClient,
} from "./dashboard-bridge";

// S31-B (2026-09-13): /analyze writes `analyses`; the dashboard read only
// `svi_analyses`, so a founder who followed the dashboard's own CTA came back
// to "Run your first SVI score". This bridge is how the dashboard now sees
// that run.

const SAMPLE_TEXT =
  "Acme Robotics is a Sydney pre-seed startup building an AI-powered inspection drone for construction sites. " +
  "We have 3 paying pilot customers, A$40k in revenue over the last quarter, a team of 4 including two engineers, " +
  "and are raising a A$1.2M seed round to expand across Australia.";

function row(over: Record<string, unknown> = {}) {
  return {
    id: "an-42",
    intake: { signals: extractSignals({ rawText: SAMPLE_TEXT }) },
    svi_total: 61.5,
    input_text: SAMPLE_TEXT,
    created_at: "2026-09-13T01:02:03.000Z",
    ...over,
  };
}

describe("rebuildFromRow", () => {
  it("rebuilds the SVIAnalysis with the same computeSVI the screen used", () => {
    const out = rebuildFromRow(row())!;
    expect(out).not.toBeNull();
    expect(out.analysisId).toBe("an-42");
    const expected = computeSVI(extractSignals({ rawText: SAMPLE_TEXT }));
    expect(out.analysis.subs?.length ?? 0).toBe(expected.subs?.length ?? 0);
    expect(out.analysis.stage).toBe(expected.stage);
    // The stored svi_total is what the founder saw; it wins over a recompute.
    expect(out.totalSVI).toBe(61.5);
    expect(out.analysis.totalSVI).toBe(61.5);
    expect(out.rawInput).toBe(SAMPLE_TEXT);
    expect(out.createdAt).toBe("2026-09-13T01:02:03.000Z");
  });

  it("falls back to the recomputed total when svi_total is missing", () => {
    const out = rebuildFromRow(row({ svi_total: null }))!;
    const expected = computeSVI(extractSignals({ rawText: SAMPLE_TEXT }));
    expect(out.totalSVI).toBe(expected.totalSVI);
  });

  it("is honest about rows it cannot rebuild", () => {
    expect(rebuildFromRow(null)).toBeNull();
    expect(rebuildFromRow(row({ intake: null }))).toBeNull();
    expect(rebuildFromRow(row({ intake: {} }))).toBeNull();
    expect(rebuildFromRow(row({ id: undefined }))).toBeNull();
  });
});

describe("latestIntakeAnalysisForUser / countIntakeAnalysesForUser", () => {
  it("reads the user's latest claimed analyses row", async () => {
    const sb = fakeSupabase({ analyses: [row()] });
    const out = await latestIntakeAnalysisForUser(sb as unknown as BridgeClient, "u-1");
    expect(out?.analysisId).toBe("an-42");
    expect(sb.hasEq("analyses", "user_id", "u-1")).toBe(true);
    expect(await countIntakeAnalysesForUser(sb as unknown as BridgeClient, "u-1")).toBe(1);
  });

  it("is null / 0 without a client, a user, or any rows — never throws", async () => {
    const empty = fakeSupabase({});
    expect(await latestIntakeAnalysisForUser(null, "u-1")).toBeNull();
    expect(await latestIntakeAnalysisForUser(empty as unknown as BridgeClient, null)).toBeNull();
    expect(await latestIntakeAnalysisForUser(empty as unknown as BridgeClient, "u-1")).toBeNull();
    expect(await countIntakeAnalysesForUser(empty as unknown as BridgeClient, "u-1")).toBe(0);
    const throwing = { from: () => { throw new Error("boom"); } } as unknown as BridgeClient;
    expect(await latestIntakeAnalysisForUser(throwing, "u-1")).toBeNull();
    expect(await countIntakeAnalysesForUser(throwing, "u-1")).toBe(0);
  });
});
