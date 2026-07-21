import { describe, expect, it } from "vitest";
import { buildReviewsSummary, hashComment } from "./reviews";

describe("hashComment", () => {
  it("returns a stable SHA-256 hex", () => {
    const h = hashComment("great pitch");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(hashComment("great pitch")).toBe(h);
  });

  it("trims whitespace before hashing", () => {
    expect(hashComment("  hello  ")).toBe(hashComment("hello"));
  });

  it("hashes null/undefined/blank to the same empty-body sentinel", () => {
    const empty = hashComment("");
    expect(hashComment(null)).toBe(empty);
    expect(hashComment(undefined)).toBe(empty);
    expect(hashComment("   ")).toBe(empty);
  });

  it("produces different hashes for different content", () => {
    expect(hashComment("a")).not.toBe(hashComment("b"));
  });
});

describe("buildReviewsSummary", () => {
  const mkRows = (n: number, ratings: number[], projectFn: (i: number) => string) =>
    Array.from({ length: n }, (_, i) => ({
      project_id: projectFn(i),
      rating: ratings[i % ratings.length],
      created_at: new Date(2026, 0, i + 1).toISOString(),
    }));

  it("returns zero-count non-suppressed buckets on empty input", () => {
    const s = buildReviewsSummary([]);
    expect(s.total_reviews).toEqual({ count: 0, suppressed: false });
    expect(s.projects_with_reviews).toEqual({ count: 0, suppressed: false });
    expect(s.avg_rating).toBeNull();
  });

  it("suppresses sub-k totals and drops avg", () => {
    const s = buildReviewsSummary(mkRows(3, [5], (i) => `p${i}`));
    expect(s.total_reviews.suppressed).toBe(true);
    expect(s.projects_with_reviews.suppressed).toBe(true);
    expect(s.avg_rating).toBeNull();
  });

  it("exposes aggregate at or above k", () => {
    const rows = mkRows(6, [4, 5, 3, 4, 5, 5], (i) => `p${i}`);
    const s = buildReviewsSummary(rows);
    expect(s.total_reviews).toEqual({ count: 6, suppressed: false });
    expect(s.projects_with_reviews).toEqual({ count: 6, suppressed: false });
    expect(s.avg_rating).toBe(4.3);
  });

  it("counts distinct projects, not rows", () => {
    const rows = mkRows(8, [5], (i) => (i < 5 ? "shared" : `p${i}`));
    const s = buildReviewsSummary(rows);
    expect(s.total_reviews).toEqual({ count: 8, suppressed: false });
    expect(s.projects_with_reviews).toEqual({ count: null, suppressed: true });
  });

  it("skips out-of-range and non-numeric ratings", () => {
    const rows = [
      { project_id: "p1", rating: 5, created_at: "2026-01-01" },
      { project_id: "p2", rating: 6, created_at: "2026-01-02" },
      { project_id: "p3", rating: 0, created_at: "2026-01-03" },
      { project_id: "p4", rating: Number.NaN as unknown as number, created_at: "2026-01-04" },
      { project_id: "p5", rating: 4, created_at: "2026-01-05" },
      { project_id: "", rating: 3, created_at: "2026-01-06" },
    ];
    const s = buildReviewsSummary(rows, 2);
    expect(s.total_reviews).toEqual({ count: 2, suppressed: false });
    expect(s.projects_with_reviews).toEqual({ count: 2, suppressed: false });
    expect(s.avg_rating).toBe(4.5);
  });

  it("respects a custom k threshold", () => {
    const rows = mkRows(3, [5], (i) => `p${i}`);
    const s = buildReviewsSummary(rows, 3);
    expect(s.total_reviews.suppressed).toBe(false);
    expect(s.avg_rating).toBe(5);
  });
});
