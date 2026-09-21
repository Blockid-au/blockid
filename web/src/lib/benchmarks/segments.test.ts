// G21 P3-B — benchmark segments (pure): key / sector normalisation, the
// n bands per segment, one row per company, sector → stage fallback with a
// label that says so, and the published projection never leaking n < 10.
import { describe, expect, it } from "vitest";
import {
  computeSegments,
  isPublished,
  normaliseSector,
  parseSegmentKey,
  sectorLabel,
  segmentKey,
  segmentSampleSize,
  selectSegment,
  toPublishedRows,
  type SegmentScoreRow,
} from "./segments";

function rows(stage: number, sector: string | null, count: number, base = 40): SegmentScoreRow[] {
  return Array.from({ length: count }, (_, i) => ({ projectId: `p-${stage}-${sector ?? "none"}-${i}`, stage, sector, svi: base + i }));
}

describe("segmentKey / normaliseSector", () => {
  it("builds stage-only and stage × sector keys from any sector spelling", () => {
    expect(segmentKey(4)).toBe("stage:4");
    expect(segmentKey(4, null)).toBe("stage:4");
    expect(segmentKey(4, "saas")).toBe("stage:4|sector:saas");
    expect(segmentKey(4, "SaaS / Software")).toBe("stage:4|sector:saas");
    expect(segmentKey(4, " FinTech ")).toBe("stage:4|sector:fintech");
    expect(segmentKey(4, "Unclassified")).toBe("stage:4");
    expect(segmentKey(99)).toBe("stage:12");
    expect(segmentKey(-3)).toBe("stage:0");
  });

  it("normalises labels, sub-labels and unknown sectors", () => {
    expect(normaliseSector("HealthTech / MedTech")).toBe("healthtech");
    expect(normaliseSector("MedTech")).toBe("healthtech");
    expect(normaliseSector("software")).toBe("saas");
    expect(normaliseSector("cyber security fintech")).toBe("fintech");
    expect(normaliseSector("Quantum Widgets")).toBe("quantumwidgets");
    expect(normaliseSector("")).toBeNull();
    expect(normaliseSector("default")).toBeNull();
    expect(normaliseSector(undefined)).toBeNull();
    expect(normaliseSector("///")).toBeNull();
    expect(sectorLabel("saas")).toBe("SaaS / Software");
    expect(sectorLabel("quantumwidgets")).toBe("quantumwidgets");
    expect(sectorLabel(null)).toBeNull();
  });

  it("parses its own keys and rejects others", () => {
    expect(parseSegmentKey("stage:4|sector:saas")).toEqual({ stage: 4, sector: "saas" });
    expect(parseSegmentKey("stage:11")).toEqual({ stage: 11, sector: null });
    expect(parseSegmentKey("sector:saas")).toBeNull();
    expect(parseSegmentKey("stage:4|sector:SaaS")).toBeNull();
  });
});

describe("computeSegments", () => {
  it("emits a stage segment and a stage × sector segment per bucket, with the n band (table)", () => {
    const input = [...rows(4, "saas", 34), ...rows(4, "fintech", 12), ...rows(4, "agtech", 3), ...rows(2, null, 5), ...rows(6, "saas", 120)];
    const out = computeSegments(input, "2026-09-20T03:25:00.000Z");
    const byKey = Object.fromEntries(out.map((s) => [s.segmentKey, s]));
    const table: Array<[string, number, string]> = [
      ["stage:4", 49, "benchmark"],
      ["stage:4|sector:saas", 34, "benchmark"],
      ["stage:4|sector:fintech", 12, "indicative"],
      ["stage:4|sector:agtech", 3, "none"],
      ["stage:2", 5, "none"],
      ["stage:6", 120, "segmented"],
      ["stage:6|sector:saas", 120, "segmented"],
    ];
    for (const [key, n, band] of table) {
      expect(byKey[key], key).toBeDefined();
      expect(byKey[key]!.n, key).toBe(n);
      expect(byKey[key]!.band, key).toBe(band);
      expect(byKey[key]!.computedAt).toBe("2026-09-20T03:25:00.000Z");
    }
    expect(out.map((s) => s.segmentKey)).toEqual(["stage:2", "stage:4", "stage:4|sector:agtech", "stage:4|sector:fintech", "stage:4|sector:saas", "stage:6", "stage:6|sector:saas"]);
  });

  it("computes median / p25 / p75 on the sorted scores and rounds to 0.1", () => {
    const seg = computeSegments([...rows(3, "saas", 11, 50)]).find((s) => s.segmentKey === "stage:3|sector:saas")!;
    // 50..60 → median 55, p25 52.5, p75 57.5
    expect(seg).toMatchObject({ n: 11, median: 55, p25: 52.5, p75: 57.5, band: "indicative" });
    const single = computeSegments([{ projectId: "x", stage: 1, sector: null, svi: 63.44 }]).find((s) => s.segmentKey === "stage:1")!;
    expect(single).toMatchObject({ n: 1, median: 63.4, p25: 63.4, p75: 63.4, band: "none" });
  });

  it("counts one row per company and skips non-finite / out-of-range rows", () => {
    const dup: SegmentScoreRow[] = [
      { projectId: "same", stage: 4, sector: "saas", svi: 50 },
      { projectId: "same", stage: 4, sector: "saas", svi: 90 },
      { projectId: "same", stage: 5, sector: "saas", svi: 70 },
      { projectId: "", stage: 4, sector: "saas", svi: 70 },
      { projectId: "nan", stage: 4, sector: "saas", svi: Number.NaN },
      { projectId: "far", stage: 40, sector: "saas", svi: 70 },
    ];
    const out = computeSegments(dup);
    expect(out).toHaveLength(2);
    expect(out.find((s) => s.segmentKey === "stage:4")!.n).toBe(1);
    expect(out.find((s) => s.segmentKey === "stage:4|sector:saas")!.median).toBe(50);
  });
});

describe("selectSegment — sector → stage fallback", () => {
  const segs = computeSegments([...rows(4, "saas", 34), ...rows(4, "agtech", 3), ...rows(2, "saas", 5)], "2026-09-20T03:25:00.000Z");

  it("prefers the published sector segment and labels it with the sector", () => {
    const s = selectSegment(segs, 4, "SaaS / Software")!;
    expect(s).toMatchObject({ segmentKey: "stage:4|sector:saas", sector: "saas", n: 34, band: "benchmark", fellBackToStage: false, segment: "Stage 4 · SaaS / Software" });
    expect(s.label).toBe("Stage 4 · SaaS / Software — benchmark (n = 34)");
    expect(s.computedAt).toBe("2026-09-20T03:25:00.000Z");
  });

  it("falls back to the stage segment when the sector one is unpublished, and says so", () => {
    const s = selectSegment(segs, 4, "agtech")!;
    expect(s).toMatchObject({ segmentKey: "stage:4", sector: null, n: 37, band: "benchmark", fellBackToStage: true });
    expect(s.label).toBe("Stage 4 — benchmark (n = 37) (AgTech / FoodTech segment not published yet — n = 3)");
  });

  it("falls back to the stage segment for an unknown sector and for no sector at all", () => {
    expect(selectSegment(segs, 4, "quantum")!.label).toBe("Stage 4 — benchmark (n = 37) (quantum segment not published yet — n = 0)");
    expect(selectSegment(segs, 4)!).toMatchObject({ segmentKey: "stage:4", fellBackToStage: false, label: "Stage 4 — benchmark (n = 37)" });
  });

  it("returns null when neither segment is published (n < 10) and quotes the right n for the not-enough line", () => {
    expect(selectSegment(segs, 2, "saas")).toBeNull();
    expect(selectSegment(segs, 7)).toBeNull();
    expect(segmentSampleSize(segs, 2, "saas")).toBe(5);
    expect(segmentSampleSize(segs, 2)).toBe(5);
    expect(segmentSampleSize(segs, 4, "agtech")).toBe(3);
    expect(segmentSampleSize(segs, 9)).toBe(0);
  });

  it("isPublished follows the floor exactly (9 → no, 10 → yes)", () => {
    expect(isPublished({ n: 9, median: 50 })).toBe(false);
    expect(isPublished({ n: 10, median: 50 })).toBe(true);
    expect(isPublished({ n: 50, median: null })).toBe(false);
  });
});

describe("toPublishedRows", () => {
  it("never emits an n < 10 row and carries n + band + label on every row", () => {
    const segs = computeSegments([...rows(4, "saas", 34), ...rows(4, "agtech", 3), ...rows(1, null, 2)]);
    const pub = toPublishedRows(segs);
    expect(pub.map((r) => r.segment_key)).toEqual(["stage:4", "stage:4|sector:saas"]);
    for (const r of pub) {
      expect(r.n).toBeGreaterThanOrEqual(10);
      expect(["indicative", "benchmark", "segmented"]).toContain(r.band);
      expect(r.label).toContain(`n = ${r.n}`);
    }
    expect(pub[1]).toMatchObject({ sector: "saas", sector_label: "SaaS / Software", median: 56.5 });
  });
});
