import { describe, it, expect } from "vitest";
import {
  SEED_COMPETITOR_RELEASES,
  filterReleases,
  mergeReleases,
  renderMarkdownDigest,
  summariseByCompetitor,
  threatScore,
  topRecentReleases,
  type CompetitorRelease,
} from "./cmo-competitor-tracker";

describe("cmo-competitor-tracker — seed dataset", () => {
  it("ships at least a handful of releases with sane fields", () => {
    expect(SEED_COMPETITOR_RELEASES.length).toBeGreaterThanOrEqual(5);
    for (const r of SEED_COMPETITOR_RELEASES) {
      expect(r.competitor.length).toBeGreaterThan(0);
      expect(r.title.length).toBeGreaterThan(0);
      expect(r.summary.length).toBeGreaterThan(0);
      expect(Number.isFinite(Date.parse(r.shippedOn))).toBe(true);
      expect(["watch", "moderate", "high", "critical"]).toContain(r.threat);
    }
  });

  it("has no exact-duplicate entries in the seed dataset", () => {
    const keys = SEED_COMPETITOR_RELEASES.map((r) => `${r.competitor}|${r.shippedOn}|${r.title}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("cmo-competitor-tracker — threatScore", () => {
  it("orders tiers monotonically", () => {
    expect(threatScore("watch")).toBeLessThan(threatScore("moderate"));
    expect(threatScore("moderate")).toBeLessThan(threatScore("high"));
    expect(threatScore("high")).toBeLessThan(threatScore("critical"));
  });
});

describe("cmo-competitor-tracker — topRecentReleases", () => {
  it("returns at most N items sorted newest-first", () => {
    const top = topRecentReleases(3);
    expect(top.length).toBeLessThanOrEqual(3);
    for (let i = 1; i < top.length; i++) {
      expect(Date.parse(top[i - 1].shippedOn)).toBeGreaterThanOrEqual(Date.parse(top[i].shippedOn));
    }
  });

  it("breaks date ties by higher threat first, then title alphabetical", () => {
    const rows: CompetitorRelease[] = [
      { competitor: "A", shippedOn: "2026-01-01", title: "beta", summary: "b", category: "valuation", threat: "high" },
      { competitor: "B", shippedOn: "2026-01-01", title: "alpha", summary: "a", category: "valuation", threat: "high" },
      { competitor: "C", shippedOn: "2026-01-01", title: "zed", summary: "z", category: "valuation", threat: "critical" },
    ];
    const top = topRecentReleases(3, rows);
    expect(top[0].title).toBe("zed");
    expect(top[1].title).toBe("alpha");
    expect(top[2].title).toBe("beta");
  });

  it("clamps a negative N to zero", () => {
    expect(topRecentReleases(-5).length).toBe(0);
  });
});

describe("cmo-competitor-tracker — filterReleases", () => {
  it("filters by category exactly", () => {
    const rows = filterReleases(SEED_COMPETITOR_RELEASES, { category: "esop" });
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.category).toBe("esop");
  });

  it("filters by minimum threat tier", () => {
    const rows = filterReleases(SEED_COMPETITOR_RELEASES, { minThreat: "high" });
    for (const r of rows) expect(threatScore(r.threat)).toBeGreaterThanOrEqual(threatScore("high"));
  });

  it("filters by sinceDate inclusively", () => {
    const rows = filterReleases(SEED_COMPETITOR_RELEASES, { sinceDate: "2026-07-01" });
    for (const r of rows) expect(Date.parse(r.shippedOn)).toBeGreaterThanOrEqual(Date.parse("2026-07-01"));
  });

  it("filters by tag substring (case-insensitive)", () => {
    const rows = filterReleases(SEED_COMPETITOR_RELEASES, { tag: "AU" });
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect((r.tags ?? []).some((t) => t.toLowerCase().includes("au"))).toBe(true);
    }
  });

  it("no filter is a no-op besides sorting newest-first", () => {
    const rows = filterReleases(SEED_COMPETITOR_RELEASES);
    expect(rows.length).toBe(SEED_COMPETITOR_RELEASES.length);
    for (let i = 1; i < rows.length; i++) {
      expect(Date.parse(rows[i - 1].shippedOn)).toBeGreaterThanOrEqual(Date.parse(rows[i].shippedOn));
    }
  });
});

describe("cmo-competitor-tracker — summariseByCompetitor", () => {
  it("aggregates releases per competitor and sorts by weighted threat desc", () => {
    const summary = summariseByCompetitor();
    expect(summary.length).toBeGreaterThan(0);
    for (let i = 1; i < summary.length; i++) {
      expect(summary[i - 1].weightedThreat).toBeGreaterThanOrEqual(summary[i].weightedThreat);
    }
    // Cake Equity ships two releases in the seed dataset — should aggregate.
    const cake = summary.find((s) => s.competitor === "Cake Equity");
    expect(cake).toBeDefined();
    expect(cake!.releaseCount).toBeGreaterThanOrEqual(2);
  });

  it("carries latest shipped date and unique category list", () => {
    const rows: CompetitorRelease[] = [
      { competitor: "X", shippedOn: "2026-01-01", title: "a", summary: ".", category: "valuation", threat: "high" },
      { competitor: "X", shippedOn: "2026-06-01", title: "b", summary: ".", category: "valuation", threat: "moderate" },
      { competitor: "X", shippedOn: "2026-03-01", title: "c", summary: ".", category: "esop", threat: "watch" },
    ];
    const [entry] = summariseByCompetitor(rows);
    expect(entry.competitor).toBe("X");
    expect(entry.releaseCount).toBe(3);
    expect(entry.latestShippedOn).toBe("2026-06-01");
    expect(entry.categories.sort()).toEqual(["esop", "valuation"].sort());
    expect(entry.weightedThreat).toBe(threatScore("high") + threatScore("moderate") + threatScore("watch"));
  });
});

describe("cmo-competitor-tracker — mergeReleases", () => {
  it("de-duplicates by competitor+shippedOn+title and lets incoming override base", () => {
    const base: CompetitorRelease[] = [
      { competitor: "A", shippedOn: "2026-01-01", title: "t", summary: "old", category: "valuation", threat: "watch" },
    ];
    const incoming: CompetitorRelease[] = [
      { competitor: "A", shippedOn: "2026-01-01", title: "t", summary: "new", category: "valuation", threat: "high" },
      { competitor: "B", shippedOn: "2026-02-01", title: "u", summary: "fresh", category: "esop", threat: "moderate" },
    ];
    const merged = mergeReleases(base, incoming);
    expect(merged.length).toBe(2);
    const a = merged.find((r) => r.competitor === "A");
    expect(a?.summary).toBe("new");
    expect(a?.threat).toBe("high");
  });
});

describe("cmo-competitor-tracker — renderMarkdownDigest", () => {
  it("returns an empty-state string when there are no releases", () => {
    expect(renderMarkdownDigest([], 5)).toMatch(/no recent/i);
  });

  it("renders one bullet per release and includes competitor + title", () => {
    const md = renderMarkdownDigest(SEED_COMPETITOR_RELEASES, 3);
    expect(md).toMatch(/^### Competitor releases/);
    const bullets = md.split("\n").filter((l) => l.startsWith("- "));
    expect(bullets.length).toBe(3);
    for (const b of bullets) expect(b).toMatch(/\*\*.+\*\*/);
  });
});
