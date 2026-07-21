import { describe, expect, it } from "vitest";
import {
  agentLabel,
  buildGallerySections,
  CROSS_CUTTING_LABEL,
  PHASE_COUNT,
  PHASE_LABELS,
  summariseGallery,
} from "./gallery";
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

describe("PHASE_LABELS", () => {
  it("covers all 12 phases", () => {
    for (let phase = 1; phase <= PHASE_COUNT; phase += 1) {
      expect(PHASE_LABELS[phase]).toBeDefined();
      expect(PHASE_LABELS[phase].en.length).toBeGreaterThan(0);
      expect(PHASE_LABELS[phase].vi.length).toBeGreaterThan(0);
    }
  });
});

describe("buildGallerySections", () => {
  it("returns empty array on empty input", () => {
    expect(buildGallerySections([])).toEqual([]);
  });

  it("groups rows by phase in ascending order 1..12", () => {
    const rows = [
      row({ filename: "a.md", phase_at_generation: 3 }),
      row({ filename: "b.md", phase_at_generation: 1 }),
      row({ filename: "c.md", phase_at_generation: 12 }),
    ];
    const sections = buildGallerySections(rows);
    expect(sections.map((s) => s.phase)).toEqual([1, 3, 12]);
    expect(sections[0].key).toBe("phase-1");
    expect(sections[2].key).toBe("phase-12");
  });

  it("omits phases with no rows", () => {
    const rows = [row({ phase_at_generation: 5 })];
    const sections = buildGallerySections(rows);
    expect(sections).toHaveLength(1);
    expect(sections[0].phase).toBe(5);
  });

  it("appends cross-cutting section last when null phase rows exist", () => {
    const rows = [
      row({ filename: "a.md", phase_at_generation: 1 }),
      row({ filename: "b.md", phase_at_generation: null }),
      row({ filename: "c.md", phase_at_generation: 7 }),
    ];
    const sections = buildGallerySections(rows);
    expect(sections.map((s) => s.key)).toEqual(["phase-1", "phase-7", "cross-cutting"]);
    expect(sections[sections.length - 1].label).toEqual(CROSS_CUTTING_LABEL);
  });

  it("does not append cross-cutting section when no null rows", () => {
    const rows = [row({ phase_at_generation: 4 })];
    const sections = buildGallerySections(rows);
    expect(sections.some((s) => s.key === "cross-cutting")).toBe(false);
  });

  it("preserves per-section input order", () => {
    const rows = [
      row({ filename: "second.md", phase_at_generation: 2, generated_at: "2026-07-20" }),
      row({ filename: "first.md", phase_at_generation: 2, generated_at: "2026-07-21" }),
    ];
    const sections = buildGallerySections(rows);
    expect(sections[0].rows.map((r) => r.filename)).toEqual(["second.md", "first.md"]);
  });

  it("bins multiple rows per phase", () => {
    const rows = [
      row({ filename: "a.md", phase_at_generation: 3 }),
      row({ filename: "b.md", phase_at_generation: 3 }),
      row({ filename: "c.md", phase_at_generation: 3 }),
    ];
    const sections = buildGallerySections(rows);
    expect(sections).toHaveLength(1);
    expect(sections[0].rows).toHaveLength(3);
  });
});

describe("agentLabel", () => {
  it("maps every ShowcaseAgent slug to a non-empty label", () => {
    const slugs = [
      "ceo",
      "cto",
      "cfo",
      "cmo",
      "coo",
      "cpo",
      "cdo",
      "chro",
      "ciso",
      "clo",
      "cro",
      "cso",
      "ccso",
      "ir",
      "qa",
      "rnd",
      "customer-care",
      "ops",
      "perf",
      "security",
      "unknown",
    ] as const;
    for (const slug of slugs) {
      const label = agentLabel(slug);
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it("resolves customer-care to Customer Success", () => {
    expect(agentLabel("customer-care")).toBe("Customer Success");
  });

  it("resolves unknown to Platform (never leaks the slug)", () => {
    expect(agentLabel("unknown")).toBe("Platform");
  });
});

describe("summariseGallery", () => {
  it("returns zeroed summary on empty input", () => {
    const summary = summariseGallery([]);
    expect(summary.total_rows).toBe(0);
    expect(summary.sections).toEqual([]);
    expect(summary.agents_covered).toEqual([]);
    expect(summary.latest_generated_at).toBeNull();
  });

  it("counts total rows and unique agents", () => {
    const rows = [
      row({ generated_by_agent: "ceo", phase_at_generation: 1 }),
      row({ generated_by_agent: "cto", phase_at_generation: 4 }),
      row({ generated_by_agent: "cto", phase_at_generation: 4 }),
    ];
    const summary = summariseGallery(rows);
    expect(summary.total_rows).toBe(3);
    expect(summary.agents_covered).toEqual(["ceo", "cto"]);
  });

  it("picks the most recent generated_at across the pool", () => {
    const rows = [
      row({ filename: "old.md", generated_at: "2026-06-15", phase_at_generation: 1 }),
      row({ filename: "newer.md", generated_at: "2026-07-21", phase_at_generation: 2 }),
      row({ filename: "middle.md", generated_at: "2026-07-01", phase_at_generation: 1 }),
    ];
    const summary = summariseGallery(rows);
    expect(summary.latest_generated_at).toBe("2026-07-21");
  });

  it("tolerates rows with null generated_at without crashing", () => {
    const rows = [
      row({ generated_at: null, phase_at_generation: null }),
      row({ generated_at: "2026-07-21", phase_at_generation: 1 }),
    ];
    const summary = summariseGallery(rows);
    expect(summary.latest_generated_at).toBe("2026-07-21");
    expect(summary.sections.map((s) => s.key)).toEqual(["phase-1", "cross-cutting"]);
  });
});
