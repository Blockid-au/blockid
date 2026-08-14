import { describe, expect, it } from "vitest";
import { recommendConferences, type Conference } from "./conferences";

const NOW = new Date("2026-06-01T00:00:00Z");

const SEED: Conference[] = [
  {
    slug: "past-event",
    name: "Past Event",
    date: "2026-01-15",
    city: "Sydney",
    country: "AU",
    url: "https://example.com/a",
    audience: ["founder"],
    stages: [1, 2],
    sectors: ["saas"],
    cost: "paid",
    pitchCompetition: false,
  },
  {
    slug: "au-saas-later",
    name: "AU SaaS Later",
    date: "2026-11-01",
    city: "Melbourne",
    country: "AU",
    url: "https://example.com/b",
    audience: ["founder"],
    stages: [2, 3],
    sectors: ["saas"],
    cost: "paid",
    pitchCompetition: true,
  },
  {
    slug: "au-saas-soon",
    name: "AU SaaS Soon",
    date: "2026-07-01",
    city: "Sydney",
    country: "AU",
    url: "https://example.com/c",
    audience: ["founder"],
    stages: [2, 3],
    sectors: ["saas"],
    cost: "free",
    pitchCompetition: false,
  },
  {
    slug: "sg-fintech",
    name: "SG FinTech",
    date: "2026-08-15",
    city: "Singapore",
    country: "SG",
    url: "https://example.com/d",
    audience: ["founder"],
    stages: [3, 4],
    sectors: ["fintech"],
    cost: "paid",
    pitchCompetition: false,
  },
  {
    slug: "us-ai",
    name: "US AI",
    date: "2026-09-01",
    city: "SF",
    country: "US",
    url: "https://example.com/e",
    audience: ["founder"],
    stages: [1, 2, 3, 4],
    sectors: ["ai"],
    cost: "paid",
    pitchCompetition: false,
  },
];

describe("recommendConferences", () => {
  it("excludes past events", async () => {
    const out = await recommendConferences({ source: SEED, now: NOW });
    expect(out.find((c) => c.slug === "past-event")).toBeUndefined();
  });

  it("sorts by date ascending (upcoming first)", async () => {
    const out = await recommendConferences({ source: SEED, now: NOW, limit: 10 });
    const dates = out.map((c) => c.date);
    const sorted = [...dates].sort();
    expect(dates).toEqual(sorted);
  });

  it("matches by stage", async () => {
    const out = await recommendConferences({ source: SEED, now: NOW, stage: 4, limit: 10 });
    expect(out.every((c) => c.stages.includes(4))).toBe(true);
    expect(out.map((c) => c.slug)).toContain("sg-fintech");
    expect(out.map((c) => c.slug)).not.toContain("au-saas-soon");
  });

  it("matches by sector (case-insensitive)", async () => {
    const out = await recommendConferences({ source: SEED, now: NOW, sector: "SaaS", limit: 10 });
    expect(out.every((c) => c.sectors.includes("saas"))).toBe(true);
    expect(out.map((c) => c.slug)).toEqual(["au-saas-soon", "au-saas-later"]);
  });

  it("filters by APAC region", async () => {
    const out = await recommendConferences({ source: SEED, now: NOW, region: "APAC", limit: 10 });
    expect(out.every((c) => ["AU", "SG"].includes(c.country))).toBe(true);
    expect(out.map((c) => c.slug)).not.toContain("us-ai");
  });

  it("filters by AU country code", async () => {
    const out = await recommendConferences({ source: SEED, now: NOW, region: "AU", limit: 10 });
    expect(out.every((c) => c.country === "AU")).toBe(true);
  });

  it("returns empty when nothing matches", async () => {
    const out = await recommendConferences({
      source: SEED,
      now: NOW,
      sector: "healthtech",
      region: "AU",
    });
    expect(out).toEqual([]);
  });

  it("respects limit", async () => {
    const out = await recommendConferences({ source: SEED, now: NOW, limit: 2 });
    expect(out.length).toBe(2);
  });

  it("filters by budget", async () => {
    const out = await recommendConferences({ source: SEED, now: NOW, budget: "free", limit: 10 });
    expect(out.every((c) => c.cost === "free")).toBe(true);
    expect(out.map((c) => c.slug)).toEqual(["au-saas-soon"]);
  });

  it("loads the real seed JSON when no source is provided", async () => {
    const out = await recommendConferences({ now: new Date("2026-01-01T00:00:00Z"), limit: 5 });
    expect(out.length).toBeGreaterThan(0);
    expect(out.length).toBeLessThanOrEqual(5);
  });
});
