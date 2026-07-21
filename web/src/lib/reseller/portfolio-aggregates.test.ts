import { describe, it, expect } from "vitest";
import {
  applyComplementarySuppression,
  buildPortfolioSummary,
  buildSignupWeekly,
  buildSviBands,
  isoWeek,
  K_ANONYMITY_THRESHOLD,
  type KAnonBucket,
} from "./portfolio-aggregates";

describe("isoWeek", () => {
  it("returns padded YYYY-Www for a mid-year Wednesday", () => {
    // 2026-07-21 is a Tuesday → ISO week 30 of 2026.
    expect(isoWeek(new Date("2026-07-21T00:00:00Z"))).toBe("2026-W30");
  });

  it("rolls late-December dates into the next year's ISO week when Thursday lands there", () => {
    // 2025-12-30 (Tue) belongs to ISO week 2026-W01 because Thursday of that
    // week is 2026-01-01. This is the standard ISO-8601 rule.
    expect(isoWeek(new Date("2025-12-30T00:00:00Z"))).toBe("2026-W01");
  });

  it("zero-pads single-digit weeks", () => {
    expect(isoWeek(new Date("2026-01-05T00:00:00Z"))).toBe("2026-W02");
  });
});

describe("buildSignupWeekly", () => {
  const now = new Date("2026-07-21T00:00:00Z");

  it("suppresses weeks with fewer than K signups", () => {
    // Week A: 6 signups (visible); Week B: 4 signups (suppressed).
    const pad = (n: number) => String(n).padStart(2, "0");
    const customers = [
      ...Array.from({ length: 6 }, (_, i) => ({ created_at: `2026-07-${pad(i + 6)}T00:00:00Z` })), // W28
      ...Array.from({ length: 4 }, (_, i) => ({ created_at: `2026-07-${pad(i + 13)}T00:00:00Z` })), // W29
    ];
    const out = buildSignupWeekly(customers);
    const w28 = out.find((b) => b.iso_week === "2026-W28");
    const w29 = out.find((b) => b.iso_week === "2026-W29");
    expect(w28).toEqual({ iso_week: "2026-W28", count: 6, suppressed: false });
    expect(w29).toEqual({ iso_week: "2026-W29", count: null, suppressed: true });
    void now;
  });

  it("ignores unparseable timestamps without throwing", () => {
    const out = buildSignupWeekly([
      { created_at: "not-a-date" },
      { created_at: "2026-07-21T00:00:00Z" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].iso_week).toBe("2026-W30");
  });

  it("returns weeks sorted ascending", () => {
    const customers = Array.from({ length: 20 }, (_, i) => ({
      // spread across 3 different weeks
      created_at: `2026-06-${String((i % 20) + 1).padStart(2, "0")}T00:00:00Z`,
    }));
    const out = buildSignupWeekly(customers, 1);
    expect(out.length).toBeGreaterThan(1);
    for (let i = 1; i < out.length; i++) {
      expect(out[i - 1].iso_week.localeCompare(out[i].iso_week)).toBeLessThan(0);
    }
  });

  it("uses the configured k threshold", () => {
    const pad = (n: number) => String(n).padStart(2, "0");
    const customers = Array.from({ length: 3 }, (_, i) => ({
      created_at: `2026-07-${pad(i + 13)}T00:00:00Z`,
    }));
    // Default k=5 → suppressed.
    expect(buildSignupWeekly(customers)[0].suppressed).toBe(true);
    // k=1 → visible.
    expect(buildSignupWeekly(customers, 1)[0]).toEqual({
      iso_week: "2026-W29",
      count: 3,
      suppressed: false,
    });
  });
});

describe("buildPortfolioSummary", () => {
  const now = new Date("2026-07-21T00:00:00Z");
  const iso = (d: string) => d + "T00:00:00Z";

  it("counts total, active-last-7d, and onboarded independently", () => {
    const customers = [
      { created_at: iso("2026-01-01"), last_login_at: iso("2026-07-20"), onboarding_completed: true },
      { created_at: iso("2026-01-02"), last_login_at: iso("2026-07-19"), onboarding_completed: true },
      { created_at: iso("2026-01-03"), last_login_at: iso("2026-07-18"), onboarding_completed: true },
      { created_at: iso("2026-01-04"), last_login_at: iso("2026-07-17"), onboarding_completed: true },
      { created_at: iso("2026-01-05"), last_login_at: iso("2026-07-16"), onboarding_completed: true },
      { created_at: iso("2026-01-06"), last_login_at: iso("2026-05-01"), onboarding_completed: false },
    ];
    const summary = buildPortfolioSummary({ customers, now });
    expect(summary.attributed_total).toEqual({ count: 6, suppressed: false });
    expect(summary.active_last_week).toEqual({ count: 5, suppressed: false });
    // onboarded=5 → visible; if it were 4 it would suppress independently of total.
    expect(summary.onboarded).toEqual({ count: 5, suppressed: false });
  });

  it("suppresses each counter below k independently", () => {
    const customers = [
      { created_at: iso("2026-07-20"), last_login_at: iso("2026-07-20"), onboarding_completed: true },
      { created_at: iso("2026-07-20"), last_login_at: null, onboarding_completed: false },
      { created_at: iso("2026-07-20"), last_login_at: null, onboarding_completed: false },
    ];
    const summary = buildPortfolioSummary({ customers, now });
    expect(summary.attributed_total.suppressed).toBe(true);
    expect(summary.active_last_week.suppressed).toBe(true);
    expect(summary.onboarded.suppressed).toBe(true);
  });

  it("respects a custom k threshold", () => {
    const customers = [
      { created_at: iso("2026-07-20"), last_login_at: iso("2026-07-20"), onboarding_completed: true },
      { created_at: iso("2026-07-20"), last_login_at: iso("2026-07-20"), onboarding_completed: true },
    ];
    const summary = buildPortfolioSummary({ customers, now, k: 2 });
    expect(summary.attributed_total).toEqual({ count: 2, suppressed: false });
  });

  it("treats malformed last_login_at as inactive without throwing", () => {
    const customers = Array.from({ length: 6 }, () => ({
      created_at: iso("2026-01-01"),
      last_login_at: "not-a-date",
      onboarding_completed: false,
    }));
    const summary = buildPortfolioSummary({ customers, now });
    expect(summary.attributed_total.count).toBe(6);
    expect(summary.active_last_week.count).toBe(null);
  });
});

describe("buildSviBands", () => {
  it("buckets latest score per project into five bands with k-anonymity", () => {
    // Six projects with distinct latest scores across bands.
    const svi = [
      { project_id: "p1", score: 10, created_at: "2026-06-01T00:00:00Z" }, // 0-20
      { project_id: "p2", score: 15, created_at: "2026-06-01T00:00:00Z" }, // 0-20
      { project_id: "p3", score: 15, created_at: "2026-06-01T00:00:00Z" }, // 0-20
      { project_id: "p4", score: 15, created_at: "2026-06-01T00:00:00Z" }, // 0-20
      { project_id: "p5", score: 15, created_at: "2026-06-01T00:00:00Z" }, // 0-20
      { project_id: "p6", score: 55, created_at: "2026-06-01T00:00:00Z" }, // 41-60 — only 1 → suppressed
    ];
    const bands = buildSviBands(svi);
    expect(bands.find((b) => b.band === "0-20")).toEqual({ band: "0-20", count: 5, suppressed: false });
    expect(bands.find((b) => b.band === "41-60")).toEqual({ band: "41-60", count: null, suppressed: true });
    // Empty bands are suppressed too (count 0 < K).
    expect(bands.find((b) => b.band === "81-100")).toEqual({ band: "81-100", count: null, suppressed: true });
  });

  it("uses the newest analysis per project", () => {
    const svi = [
      { project_id: "p1", score: 10, created_at: "2026-01-01T00:00:00Z" }, // stale
      { project_id: "p1", score: 90, created_at: "2026-07-01T00:00:00Z" }, // latest → 81-100
      { project_id: "p2", score: 85, created_at: "2026-07-02T00:00:00Z" },
      { project_id: "p3", score: 88, created_at: "2026-07-03T00:00:00Z" },
      { project_id: "p4", score: 82, created_at: "2026-07-04T00:00:00Z" },
      { project_id: "p5", score: 95, created_at: "2026-07-05T00:00:00Z" },
    ];
    const bands = buildSviBands(svi);
    expect(bands.find((b) => b.band === "81-100")?.count).toBe(5);
    expect(bands.find((b) => b.band === "0-20")?.count).toBe(null);
  });

  it("skips rows with null score or missing project_id", () => {
    const svi = [
      { project_id: "", score: 50, created_at: "2026-07-01T00:00:00Z" },
      { project_id: "p1", score: null, created_at: "2026-07-01T00:00:00Z" },
    ];
    const bands = buildSviBands(svi);
    for (const b of bands) expect(b.count).toBe(null);
  });
});

describe("applyComplementarySuppression", () => {
  const bucket = (count: number | null, suppressed = count === null): KAnonBucket => ({ count, suppressed });

  it("suppresses the smallest surviving bucket when exactly one is suppressed", () => {
    const before: KAnonBucket[] = [bucket(20), bucket(6), bucket(15), bucket(null)];
    const after = applyComplementarySuppression(before);
    // The 6-count bucket is smallest and gets nulled too.
    expect(after.map((b) => b.count)).toEqual([20, null, 15, null]);
    expect(after.filter((b) => b.suppressed).length).toBe(2);
  });

  it("is a no-op when zero buckets are suppressed", () => {
    const before: KAnonBucket[] = [bucket(20), bucket(15), bucket(6)];
    expect(applyComplementarySuppression(before)).toEqual(before);
  });

  it("is a no-op when two or more buckets are already suppressed", () => {
    const before: KAnonBucket[] = [bucket(20), bucket(null), bucket(null), bucket(6)];
    expect(applyComplementarySuppression(before)).toEqual(before);
  });

  it("preserves bucket-shape extra fields (e.g. iso_week / band labels)", () => {
    const input = [
      { iso_week: "2026-W28", count: 8, suppressed: false },
      { iso_week: "2026-W29", count: 3, suppressed: false },
      { iso_week: "2026-W30", count: null, suppressed: true },
    ];
    const after = applyComplementarySuppression(input);
    expect(after[1]).toEqual({ iso_week: "2026-W29", count: null, suppressed: true });
    // Untouched non-smallest bucket keeps its label.
    expect(after[0].iso_week).toBe("2026-W28");
  });
});

describe("K_ANONYMITY_THRESHOLD", () => {
  it("is 5 per U.15.3", () => {
    expect(K_ANONYMITY_THRESHOLD).toBe(5);
  });
});
