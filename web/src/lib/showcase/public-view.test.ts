import { describe, expect, it } from "vitest";
import {
  buildAgentActivity,
  buildCrossCuttingCount,
  buildMilestoneTimeline,
  buildPhaseArtifactCounts,
  deriveCurrentPhase,
  summarisePublicView,
} from "./public-view";
import type { DataRoomShowcaseRow } from "./report-tagging";

function row(overrides: Partial<DataRoomShowcaseRow>): DataRoomShowcaseRow {
  return {
    source_path: overrides.source_path ?? "web/content/reports/x.md",
    filename: overrides.filename ?? "x.md",
    title: overrides.title ?? "x",
    generated_by_agent: overrides.generated_by_agent ?? "unknown",
    phase_at_generation: overrides.phase_at_generation ?? null,
    generated_at: overrides.generated_at ?? null,
    version: overrides.version ?? null,
    tags: overrides.tags ?? [],
  };
}

describe("buildAgentActivity", () => {
  it("returns empty array on empty input", () => {
    expect(buildAgentActivity([])).toEqual([]);
  });

  it("counts per agent and tracks latest_at", () => {
    const rows = [
      row({ generated_by_agent: "cto", generated_at: "2026-07-01" }),
      row({ generated_by_agent: "cto", generated_at: "2026-07-05" }),
      row({ generated_by_agent: "cfo", generated_at: "2026-06-30" }),
    ];
    const result = buildAgentActivity(rows);
    expect(result).toHaveLength(2);
    const cto = result.find((r) => r.agent === "cto")!;
    expect(cto.count).toBe(2);
    expect(cto.latest_at).toBe("2026-07-05");
    expect(cto.label).toBe("CTO");
    const cfo = result.find((r) => r.agent === "cfo")!;
    expect(cfo.count).toBe(1);
    expect(cfo.latest_at).toBe("2026-06-30");
  });

  it("sorts by count desc, agent asc for ties", () => {
    const rows = [
      row({ generated_by_agent: "cfo", generated_at: "2026-07-01" }),
      row({ generated_by_agent: "cfo", generated_at: "2026-07-02" }),
      row({ generated_by_agent: "cmo", generated_at: "2026-07-03" }),
      row({ generated_by_agent: "cmo", generated_at: "2026-07-04" }),
      row({ generated_by_agent: "cto", generated_at: "2026-07-05" }),
    ];
    const result = buildAgentActivity(rows);
    // cfo(2), cmo(2), cto(1) — cfo before cmo on alpha
    expect(result.map((r) => r.agent)).toEqual(["cfo", "cmo", "cto"]);
  });

  it("handles rows with null generated_at gracefully", () => {
    const rows = [
      row({ generated_by_agent: "cto", generated_at: null }),
      row({ generated_by_agent: "cto", generated_at: "2026-07-05" }),
    ];
    const [cto] = buildAgentActivity(rows);
    expect(cto.count).toBe(2);
    expect(cto.latest_at).toBe("2026-07-05");
  });

  it("keeps latest_at null when every row is undated", () => {
    const rows = [
      row({ generated_by_agent: "cto", generated_at: null }),
      row({ generated_by_agent: "cto", generated_at: null }),
    ];
    const [cto] = buildAgentActivity(rows);
    expect(cto.latest_at).toBeNull();
  });
});

describe("buildPhaseArtifactCounts", () => {
  it("returns 12 entries with zeros for empty input", () => {
    const result = buildPhaseArtifactCounts([]);
    expect(result).toHaveLength(12);
    expect(result[0]).toEqual({ phase: 1, label: expect.any(String), count: 0 });
    expect(result[11].phase).toBe(12);
    expect(result.every((r) => r.count === 0)).toBe(true);
  });

  it("counts rows per phase and ignores null-phase rows", () => {
    const rows = [
      row({ phase_at_generation: 3 }),
      row({ phase_at_generation: 3 }),
      row({ phase_at_generation: 11 }),
      row({ phase_at_generation: null }),
    ];
    const result = buildPhaseArtifactCounts(rows);
    expect(result.find((r) => r.phase === 3)!.count).toBe(2);
    expect(result.find((r) => r.phase === 11)!.count).toBe(1);
    expect(result.find((r) => r.phase === 5)!.count).toBe(0);
  });
});

describe("buildCrossCuttingCount", () => {
  it("counts only null-phase rows", () => {
    const rows = [
      row({ phase_at_generation: null }),
      row({ phase_at_generation: null }),
      row({ phase_at_generation: 4 }),
    ];
    expect(buildCrossCuttingCount(rows)).toBe(2);
    expect(buildCrossCuttingCount([])).toBe(0);
  });
});

describe("deriveCurrentPhase", () => {
  const now = new Date("2026-07-21T00:00:00.000Z");

  it("returns null on empty input", () => {
    expect(deriveCurrentPhase([], { now })).toBeNull();
  });

  it("returns max phase with a recent artefact", () => {
    const rows = [
      row({ phase_at_generation: 4, generated_at: "2026-07-15" }),
      row({ phase_at_generation: 11, generated_at: "2026-07-10" }),
      row({ phase_at_generation: 8, generated_at: "2026-07-01" }),
    ];
    expect(deriveCurrentPhase(rows, { now })).toBe(11);
  });

  it("falls back to overall max when nothing is recent", () => {
    const rows = [
      row({ phase_at_generation: 11, generated_at: "2026-01-01" }),
      row({ phase_at_generation: 4, generated_at: "2026-02-01" }),
    ];
    expect(deriveCurrentPhase(rows, { now })).toBe(11);
  });

  it("uses overall max when no rows carry a date", () => {
    const rows = [
      row({ phase_at_generation: 4, generated_at: null }),
      row({ phase_at_generation: 9, generated_at: null }),
    ];
    expect(deriveCurrentPhase(rows, { now })).toBe(9);
  });

  it("ignores null-phase rows entirely", () => {
    const rows = [
      row({ phase_at_generation: null, generated_at: "2026-07-20" }),
    ];
    expect(deriveCurrentPhase(rows, { now })).toBeNull();
  });

  it("respects recencyDays override", () => {
    const rows = [
      row({ phase_at_generation: 11, generated_at: "2026-07-01" }),
      row({ phase_at_generation: 4, generated_at: "2026-07-20" }),
    ];
    // With a 7-day window, only phase 4 is "recent"; phase 11 becomes stale.
    expect(deriveCurrentPhase(rows, { now, recencyDays: 7 })).toBe(4);
    // With the default 30-day window, phase 11 wins.
    expect(deriveCurrentPhase(rows, { now })).toBe(11);
  });
});

describe("summarisePublicView", () => {
  const now = new Date("2026-07-21T00:00:00.000Z");

  it("returns zeros on empty input", () => {
    expect(summarisePublicView([], { now })).toEqual({
      total_reports: 0,
      agents_covered: 0,
      phases_with_activity: 0,
      cross_cutting: 0,
      current_phase: null,
      latest_generated_at: null,
    });
  });

  it("rolls up counts + current phase + latest date", () => {
    const rows = [
      row({ generated_by_agent: "cto", phase_at_generation: 4, generated_at: "2026-07-20" }),
      row({ generated_by_agent: "cfo", phase_at_generation: 6, generated_at: "2026-07-15" }),
      row({ generated_by_agent: "ceo", phase_at_generation: null, generated_at: "2026-07-19" }),
      row({ generated_by_agent: "cto", phase_at_generation: 11, generated_at: "2026-07-18" }),
    ];
    const result = summarisePublicView(rows, { now });
    expect(result.total_reports).toBe(4);
    expect(result.agents_covered).toBe(3);
    expect(result.phases_with_activity).toBe(3);
    expect(result.cross_cutting).toBe(1);
    expect(result.current_phase).toBe(11);
    expect(result.latest_generated_at).toBe("2026-07-20");
  });
});

describe("buildMilestoneTimeline", () => {
  it("returns empty array on empty input", () => {
    expect(buildMilestoneTimeline([])).toEqual([]);
  });

  it("emits entries newest-first (last-in first-out)", () => {
    const ids = ["M001", "M002", "M003"];
    const result = buildMilestoneTimeline(ids);
    expect(result).toEqual([
      { id: "M003", order: 3 },
      { id: "M002", order: 2 },
      { id: "M001", order: 1 },
    ]);
  });

  it("respects the limit option", () => {
    const ids = Array.from({ length: 30 }, (_, i) => `M${String(i + 1).padStart(3, "0")}`);
    const result = buildMilestoneTimeline(ids, { limit: 5 });
    expect(result).toHaveLength(5);
    expect(result[0].id).toBe("M030");
    expect(result[4].id).toBe("M026");
  });

  it("defaults to limit=12", () => {
    const ids = Array.from({ length: 20 }, (_, i) => `M${i}`);
    expect(buildMilestoneTimeline(ids)).toHaveLength(12);
  });
});
