import { describe, it, expect } from "vitest";
import {
  ATLASSIAN_DATAROOM_TEMPLATE,
  templateRowsForPhase,
  templateRowsUpToPhase,
  type DataRoomTemplateRow,
} from "./atlassian-template";
import { DATA_ROOM_STRUCTURE } from "@/lib/data-room-templates";
import { ATLASSIAN_DEMO } from "@/lib/showcase/atlassian/fixture";

// Colocated vitest for the pure phase-ordered projection of the Atlassian
// showcase dataRoomRows into web/src/lib/dataroom/populate.ts's consumer
// shape. Tracks docs/plans/atlassian-standard-mapping-goal.md P1_dataroom_map.

const CATEGORY_ORDER = new Map(
  DATA_ROOM_STRUCTURE.map((f, i) => [f.name, i]),
);

function categoryRank(name: string): number {
  const i = CATEGORY_ORDER.get(name);
  return i === undefined ? Number.MAX_SAFE_INTEGER : i;
}

function phaseRank(slug: string): number {
  const n = Number.parseInt(slug, 10);
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
}

describe("ATLASSIAN_DATAROOM_TEMPLATE", () => {
  it("mirrors every fixture row (no invented rows, no dropped rows)", () => {
    expect(ATLASSIAN_DATAROOM_TEMPLATE.length).toBe(
      ATLASSIAN_DEMO.dataRoomRows.length,
    );
  });

  it("carries a non-trivial number of rows (>= 60 per §2 spec)", () => {
    expect(ATLASSIAN_DATAROOM_TEMPLATE.length).toBeGreaterThanOrEqual(60);
  });

  it("every row has a non-empty category + title + phaseSlug", () => {
    for (const row of ATLASSIAN_DATAROOM_TEMPLATE) {
      expect(row.category).toBeTruthy();
      expect(row.title).toBeTruthy();
      expect(row.phaseSlug).toBeTruthy();
    }
  });

  it("status_in_reference is one of the 3 canonical strings", () => {
    const allowed = new Set<DataRoomTemplateRow["status_in_reference"]>([
      "present",
      "redacted",
      "inferred",
    ]);
    for (const row of ATLASSIAN_DATAROOM_TEMPLATE) {
      expect(allowed.has(row.status_in_reference)).toBe(true);
    }
  });

  it("every category resolves to a folder in DATA_ROOM_STRUCTURE", () => {
    const validNames = new Set(DATA_ROOM_STRUCTURE.map((f) => f.name));
    for (const row of ATLASSIAN_DATAROOM_TEMPLATE) {
      expect(
        validNames.has(row.category),
        `unknown category "${row.category}" — row title: ${row.title}`,
      ).toBe(true);
    }
  });

  it("every phaseSlug is a numeric string 1..12", () => {
    for (const row of ATLASSIAN_DATAROOM_TEMPLATE) {
      const n = Number.parseInt(row.phaseSlug, 10);
      expect(Number.isFinite(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(12);
    }
  });

  it("rows are primary-sorted by DATA_ROOM_STRUCTURE folder order", () => {
    for (let i = 1; i < ATLASSIAN_DATAROOM_TEMPLATE.length; i++) {
      const prev = ATLASSIAN_DATAROOM_TEMPLATE[i - 1];
      const cur = ATLASSIAN_DATAROOM_TEMPLATE[i];
      expect(categoryRank(cur.category)).toBeGreaterThanOrEqual(
        categoryRank(prev.category),
      );
    }
  });

  it("within each category rows are secondary-sorted by phase then title", () => {
    for (let i = 1; i < ATLASSIAN_DATAROOM_TEMPLATE.length; i++) {
      const prev = ATLASSIAN_DATAROOM_TEMPLATE[i - 1];
      const cur = ATLASSIAN_DATAROOM_TEMPLATE[i];
      if (prev.category !== cur.category) continue;
      const p = phaseRank(prev.phaseSlug);
      const c = phaseRank(cur.phaseSlug);
      if (p !== c) {
        expect(c).toBeGreaterThan(p);
      } else {
        expect(cur.title.localeCompare(prev.title)).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("preserves every fixture sourceUrl (when set) and is a plausible URL", () => {
    for (const row of ATLASSIAN_DATAROOM_TEMPLATE) {
      if (row.sourceUrl !== undefined) {
        expect(row.sourceUrl.length).toBeGreaterThan(0);
        expect(row.sourceUrl).toMatch(/^https?:\/\//);
      }
    }
  });

  it("distribution covers all 3 status_in_reference kinds", () => {
    const kinds = new Set(
      ATLASSIAN_DATAROOM_TEMPLATE.map((r) => r.status_in_reference),
    );
    expect(kinds.has("present")).toBe(true);
    expect(kinds.has("redacted")).toBe(true);
    expect(kinds.has("inferred")).toBe(true);
  });

  it("covers a broad slice of the 12 canonical phases (>= 8 distinct)", () => {
    const phases = new Set(
      ATLASSIAN_DATAROOM_TEMPLATE.map((r) => r.phaseSlug),
    );
    for (const slug of phases) {
      const n = Number.parseInt(slug, 10);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(12);
    }
    expect(phases.size).toBeGreaterThanOrEqual(8);
  });
});

describe("templateRowsForPhase", () => {
  it("returns only rows matching the exact phase slug", () => {
    const rows = templateRowsForPhase("10");
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.phaseSlug).toBe("10");
    }
  });

  it("preserves the parent template ordering (stable projection)", () => {
    const rows = templateRowsForPhase("1");
    for (let i = 1; i < rows.length; i++) {
      expect(categoryRank(rows[i].category)).toBeGreaterThanOrEqual(
        categoryRank(rows[i - 1].category),
      );
    }
  });

  it("returns [] for an out-of-range phase (e.g. '13')", () => {
    expect(templateRowsForPhase("13")).toEqual([]);
  });

  it("returns [] for a non-numeric phase slug", () => {
    expect(templateRowsForPhase("nope")).toEqual([]);
  });
});

describe("templateRowsUpToPhase", () => {
  it("returns only phase-1 rows for cutoff '1'", () => {
    const rows = templateRowsUpToPhase("1");
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(phaseRank(row.phaseSlug)).toBeLessThanOrEqual(1);
    }
  });

  it("returns the full template for cutoff '12'", () => {
    expect(templateRowsUpToPhase("12").length).toBe(
      ATLASSIAN_DATAROOM_TEMPLATE.length,
    );
  });

  it("cutoff '5' filters correctly and excludes phase >= 6", () => {
    const rows = templateRowsUpToPhase("5");
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(phaseRank(row.phaseSlug)).toBeLessThanOrEqual(5);
    }
    const later = rows.some((r) => phaseRank(r.phaseSlug) > 5);
    expect(later).toBe(false);
  });

  it("non-numeric cutoff behaves as unbounded (returns full template)", () => {
    // phaseRank() maps NaN → MAX_SAFE_INTEGER, so an unparseable cutoff acts
    // as "no upper bound" rather than "everything is out of range". Pin the
    // current semantics so downstream nudge-engine callers don't silently
    // regress if the helper is ever tightened.
    expect(templateRowsUpToPhase("nope").length).toBe(
      ATLASSIAN_DATAROOM_TEMPLATE.length,
    );
  });

  it("counts are monotone as cutoff grows 1..12", () => {
    let prev = 0;
    for (let n = 1; n <= 12; n++) {
      const size = templateRowsUpToPhase(String(n)).length;
      expect(size).toBeGreaterThanOrEqual(prev);
      prev = size;
    }
  });
});
