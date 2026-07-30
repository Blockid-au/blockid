import { describe, expect, it } from "vitest";
import {
  ATLASSIAN_DEMO,
  PHASE_DISPLAY_NAMES,
  groupMilestonesByPhase,
} from "./fixture";
import { CRITERION_KEYS } from "@/lib/evaluation-criteria";
import { DATA_ROOM_STRUCTURE } from "@/lib/data-room-templates";

const PHASE_TO_CANONICAL: Record<string, string> = {
  "1": "idea",
  "2": "validation",
  "3": "validation",
  "4": "mvp_early_revenue",
  "5": "mvp_early_revenue",
  "6": "seed",
  "7": "seed",
  "8": "series_a",
  "9": "series_a",
  "10": "series_b_c",
  "11": "late_stage",
  "12": "public_exit",
};

const URL_RE = /^https?:\/\/[^\s]+$/;

describe("ATLASSIAN_DEMO.profile", () => {
  it("pins the canonical founder + ticker facts (fixture must not drift silently)", () => {
    expect(ATLASSIAN_DEMO.profile.name).toBe("Atlassian");
    expect(ATLASSIAN_DEMO.profile.foundedYear).toBe(2002);
    expect(ATLASSIAN_DEMO.profile.founders).toEqual([
      "Mike Cannon-Brookes",
      "Scott Farquhar",
    ]);
    expect(ATLASSIAN_DEMO.profile.hqCity).toBe("Sydney");
    expect(ATLASSIAN_DEMO.profile.ticker).toBe("NASDAQ:TEAM");
    expect(ATLASSIAN_DEMO.profile.url).toMatch(URL_RE);
  });
});

describe("ATLASSIAN_DEMO.milestones", () => {
  it("carries all 20 rows extracted from the legacy TIMELINE", () => {
    expect(ATLASSIAN_DEMO.milestones).toHaveLength(20);
  });

  it("every milestone has non-empty title / body / source.label / source.url", () => {
    for (const m of ATLASSIAN_DEMO.milestones) {
      expect(m.title.trim().length).toBeGreaterThan(0);
      expect(m.body.trim().length).toBeGreaterThan(0);
      expect(m.source.label.trim().length).toBeGreaterThan(0);
      expect(m.source.url).toMatch(URL_RE);
    }
  });

  it("every phaseSlug is a numeric string in 1..12", () => {
    for (const m of ATLASSIAN_DEMO.milestones) {
      const n = Number(m.phaseSlug);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(12);
    }
  });

  it("canonicalStage on every milestone matches the 12→8 stage map", () => {
    for (const m of ATLASSIAN_DEMO.milestones) {
      expect(m.canonicalStage).toBe(PHASE_TO_CANONICAL[m.phaseSlug]);
    }
  });

  it("year is bounded to the 2002..present window (guards typo drift)", () => {
    for (const m of ATLASSIAN_DEMO.milestones) {
      expect(m.year).toBeGreaterThanOrEqual(2002);
      expect(m.year).toBeLessThanOrEqual(new Date().getUTCFullYear());
    }
  });

  it("insertion order is monotone non-decreasing by year (chronological)", () => {
    const years = ATLASSIAN_DEMO.milestones.map((m) => m.year);
    for (let i = 1; i < years.length; i++) {
      expect(years[i]).toBeGreaterThanOrEqual(years[i - 1]);
    }
  });

  it("optional date field, when present, is a YYYY-MM-DD ISO string", () => {
    const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
    for (const m of ATLASSIAN_DEMO.milestones) {
      if (m.date !== undefined) {
        expect(m.date).toMatch(ISO_RE);
        // The date's year must agree with the milestone's year field.
        expect(m.date.slice(0, 4)).toBe(String(m.year));
      }
    }
  });
});

describe("ATLASSIAN_DEMO.phaseSnapshots", () => {
  it("has exactly one snapshot per 12 phases with slugs 1..12 in order", () => {
    expect(ATLASSIAN_DEMO.phaseSnapshots).toHaveLength(12);
    const slugs = ATLASSIAN_DEMO.phaseSnapshots.map((s) => s.phaseSlug);
    expect(slugs).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
      "11",
      "12",
    ]);
  });

  it("sviAtThisPoint is monotone non-decreasing across phases 1..12", () => {
    // Phase-1 SVI must be ≤ Phase-2 SVI ≤ ... ≤ Phase-12 SVI. The demo tells
    // the story of an Australian bootstrap climbing the SVI curve — a phase
    // dropping below its predecessor would contradict that narrative.
    const scores = ATLASSIAN_DEMO.phaseSnapshots.map((s) =>
      s.sviAtThisPoint ?? -1,
    );
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeGreaterThanOrEqual(scores[i - 1]);
    }
  });

  it("every headline / atlassianMoment is non-empty and every sourceUrl is http(s)", () => {
    for (const s of ATLASSIAN_DEMO.phaseSnapshots) {
      expect(s.headline.trim().length).toBeGreaterThan(0);
      expect(s.atlassianMoment.trim().length).toBeGreaterThan(0);
      expect(s.sourceUrl).toMatch(URL_RE);
    }
  });

  it("canonicalStage on every snapshot matches the 12→8 stage map", () => {
    for (const s of ATLASSIAN_DEMO.phaseSnapshots) {
      expect(s.canonicalStage).toBe(PHASE_TO_CANONICAL[s.phaseSlug]);
    }
  });
});

describe("ATLASSIAN_DEMO.sviScores", () => {
  it("has exactly 13 entries — one per CRITERION_KEYS entry, no duplicates", () => {
    expect(ATLASSIAN_DEMO.sviScores).toHaveLength(CRITERION_KEYS.length);
    const seen = new Set<string>();
    for (const row of ATLASSIAN_DEMO.sviScores) {
      expect(seen.has(row.criterion)).toBe(false);
      seen.add(row.criterion);
    }
  });

  it("every criterion is a known CRITERION_KEYS entry (no invented keys)", () => {
    const known = new Set<string>(CRITERION_KEYS);
    for (const row of ATLASSIAN_DEMO.sviScores) {
      expect(known.has(row.criterion)).toBe(true);
    }
  });

  it("covers every CRITERION_KEYS entry (no gaps)", () => {
    const covered = new Set(ATLASSIAN_DEMO.sviScores.map((r) => r.criterion));
    for (const key of CRITERION_KEYS) {
      expect(covered.has(key)).toBe(true);
    }
  });

  it("every score0to100 is bounded to 0..100 with a non-empty rationale", () => {
    for (const row of ATLASSIAN_DEMO.sviScores) {
      expect(row.score0to100).toBeGreaterThanOrEqual(0);
      expect(row.score0to100).toBeLessThanOrEqual(100);
      expect(row.rationale.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("ATLASSIAN_DEMO.agentReports", () => {
  it("has exactly 7 reports (one per C-Level slot)", () => {
    expect(ATLASSIAN_DEMO.agentReports).toHaveLength(7);
  });

  it("covers each of CEO/CFO/CTO/CMO/COO/CHRO/CLO exactly once", () => {
    const expected = ["CEO", "CFO", "CTO", "CMO", "COO", "CHRO", "CLO"];
    const seen = ATLASSIAN_DEMO.agentReports.map((r) => r.agent).sort();
    expect(seen).toEqual([...expected].sort());
  });

  it("every phaseSlug is a numeric string in 1..12", () => {
    for (const r of ATLASSIAN_DEMO.agentReports) {
      const n = Number(r.phaseSlug);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(12);
    }
  });

  it("bodyMarkdown is non-empty and every source has label + http(s) url", () => {
    for (const r of ATLASSIAN_DEMO.agentReports) {
      expect(r.bodyMarkdown.trim().length).toBeGreaterThan(0);
      expect(r.sources.length).toBeGreaterThan(0);
      for (const src of r.sources) {
        expect(src.label.trim().length).toBeGreaterThan(0);
        expect(src.url).toMatch(URL_RE);
      }
    }
  });
});

describe("ATLASSIAN_DEMO.dataRoomRows", () => {
  const FOLDER_NAMES = new Set(DATA_ROOM_STRUCTURE.map((f) => f.name));

  it("every row's status is present | redacted | inferred", () => {
    const allowed = new Set(["present", "redacted", "inferred"]);
    for (const row of ATLASSIAN_DEMO.dataRoomRows) {
      expect(allowed.has(row.status)).toBe(true);
    }
  });

  it("every category matches a live DATA_ROOM_STRUCTURE folder name", () => {
    // This is the cross-consistency guard: if the sibling data-room-templates
    // agent renames folder 5 from "Market & Traction" to "Traction & Market",
    // this fixture will lose its mapping — this test surfaces that immediately.
    for (const row of ATLASSIAN_DEMO.dataRoomRows) {
      expect(FOLDER_NAMES.has(row.category)).toBe(true);
    }
  });

  it("covers all 12 folders (no orphaned buckets)", () => {
    const covered = new Set(ATLASSIAN_DEMO.dataRoomRows.map((r) => r.category));
    for (const name of FOLDER_NAMES) {
      expect(covered.has(name)).toBe(true);
    }
  });

  it("every phaseSlug is a numeric string in 1..12; title is non-empty", () => {
    for (const row of ATLASSIAN_DEMO.dataRoomRows) {
      const n = Number(row.phaseSlug);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(12);
      expect(row.title.trim().length).toBeGreaterThan(0);
    }
  });

  it("optional sourceUrl, when present, is http(s); optional version is non-empty", () => {
    for (const row of ATLASSIAN_DEMO.dataRoomRows) {
      if (row.sourceUrl !== undefined) {
        expect(row.sourceUrl).toMatch(URL_RE);
      }
      if (row.version !== undefined) {
        expect(row.version.trim().length).toBeGreaterThan(0);
      }
    }
  });
});

describe("ATLASSIAN_DEMO.valuations", () => {
  it("carries 16 rows — 4 methods × 4 timestamps", () => {
    expect(ATLASSIAN_DEMO.valuations).toHaveLength(16);
  });

  it("every method is one of DCF | Berkus | Scorecard | Comparables", () => {
    const allowed = new Set(["DCF", "Berkus", "Scorecard", "Comparables"]);
    for (const v of ATLASSIAN_DEMO.valuations) {
      expect(allowed.has(v.method)).toBe(true);
    }
  });

  it("every timestamp appears exactly 4 times (one row per method)", () => {
    const byTimestamp = new Map<string, number>();
    for (const v of ATLASSIAN_DEMO.valuations) {
      byTimestamp.set(v.timestamp, (byTimestamp.get(v.timestamp) ?? 0) + 1);
    }
    for (const [, count] of byTimestamp) {
      expect(count).toBe(4);
    }
    // Sanity: 16 rows / 4 rows per timestamp = 4 distinct timestamps.
    expect(byTimestamp.size).toBe(4);
  });

  it("valueAUD > 0, fxRate > 0, narrative non-empty, sourceUrl http(s)", () => {
    for (const v of ATLASSIAN_DEMO.valuations) {
      expect(v.valueAUD).toBeGreaterThan(0);
      expect(v.fxRate).toBeGreaterThan(0);
      expect(v.narrative.trim().length).toBeGreaterThan(0);
      expect(v.sourceUrl).toMatch(URL_RE);
    }
  });
});

describe("PHASE_DISPLAY_NAMES", () => {
  it("has exactly 12 entries with keys 1..12 and non-empty labels", () => {
    const keys = Object.keys(PHASE_DISPLAY_NAMES)
      .map(Number)
      .sort((a, b) => a - b);
    expect(keys).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    for (const key of keys) {
      expect(PHASE_DISPLAY_NAMES[key].trim().length).toBeGreaterThan(0);
    }
  });
});

describe("groupMilestonesByPhase()", () => {
  it("returns buckets in ascending numeric phase order", () => {
    const grouped = groupMilestonesByPhase();
    const phases = grouped.map((g) => g.phase);
    for (let i = 1; i < phases.length; i++) {
      expect(phases[i]).toBeGreaterThan(phases[i - 1]);
    }
  });

  it("no bucket is empty (a phase key in output implies ≥ 1 milestone)", () => {
    for (const group of groupMilestonesByPhase()) {
      expect(group.milestones.length).toBeGreaterThan(0);
    }
  });

  it("total milestone count across all buckets equals MILESTONES.length", () => {
    const total = groupMilestonesByPhase().reduce(
      (acc, g) => acc + g.milestones.length,
      0,
    );
    expect(total).toBe(ATLASSIAN_DEMO.milestones.length);
  });

  it("preserves insertion order within a bucket (chronological within a phase)", () => {
    for (const group of groupMilestonesByPhase()) {
      const years = group.milestones.map((m) => m.year);
      for (let i = 1; i < years.length; i++) {
        expect(years[i]).toBeGreaterThanOrEqual(years[i - 1]);
      }
    }
  });
});
