// Colocated vitest for the seed → au_grants / au_programs mappers (T0239).
// Runs the real seed files through the mappers so a bad research merge (dup
// id, unknown enum, non-ISO date) fails here before it reaches Postgres.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AU_STATES,
  CAPITALS,
  capitalForCity,
  mapGrantSeed,
  mapGrantSeeds,
  mapProgramSeed,
  mapProgramSeeds,
} from "./seed-map";

const DATA_DIR = resolve(__dirname, "../../../content/data");
const grantsSeed = JSON.parse(readFileSync(resolve(DATA_DIR, "grants-au.seed.json"), "utf8")) as {
  grants: Record<string, unknown>[];
};
const programsSeed = JSON.parse(readFileSync(resolve(DATA_DIR, "programs-au.seed.json"), "utf8")) as {
  programs: Record<string, unknown>[];
  program_type_enum: string[];
};

describe("capitalForCity", () => {
  it("maps satellites to their capital page (G11-5)", () => {
    expect(capitalForCity("Gold Coast", "QLD")).toBe("Brisbane");
    expect(capitalForCity("Sunshine Coast", "QLD")).toBe("Brisbane");
    expect(capitalForCity("Regional QLD", "QLD")).toBe("Brisbane");
    expect(capitalForCity("Wollongong", "NSW")).toBe("Sydney");
    expect(capitalForCity("Geelong", "VIC")).toBe("Melbourne");
    expect(capitalForCity("Launceston", "TAS")).toBe("Hobart");
  });

  it("keeps capitals as-is and is case/whitespace-insensitive", () => {
    for (const c of ["Sydney", "Melbourne", "Brisbane", "Perth", "Adelaide", "Canberra", "Hobart", "Darwin"]) {
      expect(capitalForCity(c)).toBe(c);
      expect(capitalForCity(`  ${c.toUpperCase()} `)).toBe(c);
    }
  });

  it("maps Remote / national to Remote", () => {
    expect(capitalForCity("Remote", "national")).toBe("Remote");
    expect(capitalForCity("Online")).toBe("Remote");
    expect(capitalForCity(null, "national")).toBe("Remote");
  });

  it("falls back to the state's capital for an unknown city", () => {
    expect(capitalForCity("Newcastle", "NSW")).toBe("Sydney");
    expect(capitalForCity("Townsville", "qld")).toBe("Brisbane");
    expect(capitalForCity("Bunbury", "WA")).toBe("Perth");
    expect(capitalForCity("Alice Springs", "NT")).toBe("Darwin");
  });

  it("falls back to Remote when nothing is known", () => {
    expect(capitalForCity(undefined, undefined)).toBe("Remote");
    expect(capitalForCity("Atlantis", "ZZ")).toBe("Remote");
  });
});

describe("mapGrantSeed", () => {
  const base = {
    id: "test-grant",
    name: "Test Grant",
    provider: "Test Dept",
    level: "state",
    state: "nsw",
    funding_type: "voucher",
    amount_min_aud: "1000",
    amount_max_aud: 50000,
    stage_tags: ["mvp"],
    eligibility: { has_abn: true },
    opens_at: "2026-10-01",
    closes_at: "Nov 2026",
    status: "open",
    official_url: "https://example.gov.au/grant",
    last_verified_at: "2026-09-10",
    verified_by: "seed",
    status_confidence: "medium",
  };

  it("maps and coerces a well-formed row", () => {
    const row = mapGrantSeed(base);
    expect(row.id).toBe("test-grant");
    expect(row.state).toBe("NSW");
    expect(row.amount_min_aud).toBe(1000);
    expect(row.amount_max_aud).toBe(50000);
    expect(row.opens_at).toBe("2026-10-01");
    expect(row.closes_at).toBeNull(); // non-ISO text never reaches a date column
    expect(row.stage_tags).toEqual(["mvp"]);
    expect(row.industry_tags).toEqual([]);
    expect(row.eligibility).toEqual({ has_abn: true });
    expect(row.exclude_from_matching).toBe(false);
    expect(row.sources).toBeNull();
    expect(row.status_confidence).toBe("medium");
  });

  it("defaults unknown enum values instead of throwing", () => {
    const row = mapGrantSeed({ ...base, status: "weird", verified_by: "bot", status_confidence: "??", state: "Mars" });
    expect(row.status).toBe("open");
    expect(row.verified_by).toBe("seed");
    expect(row.status_confidence).toBe("medium");
    expect(row.state).toBe("national");
  });

  it("flags the registry row and keeps its sources", () => {
    const row = mapGrantSeed({
      ...base,
      id: "data-sources-registry",
      name: "__data_sources__",
      sources: [{ name: "GrantConnect", url: "https://www.grants.gov.au/go/list" }],
    });
    expect(row.exclude_from_matching).toBe(true);
    expect(row.sources).toHaveLength(1);
  });

  it("throws on missing id / name / official_url", () => {
    expect(() => mapGrantSeed({ ...base, id: "" })).toThrow(/missing id/);
    expect(() => mapGrantSeed({ ...base, name: null })).toThrow(/missing name/);
    expect(() => mapGrantSeed({ ...base, official_url: undefined })).toThrow(/missing official_url/);
  });
});

describe("mapProgramSeed", () => {
  const base = {
    id: "syd-test",
    name: "Test Accelerator",
    operator: "Test Co",
    program_type: "accelerator",
    city: "Wollongong",
    state: "NSW",
    length_weeks: "12",
    intake_months: [1, "7", 2.5],
    benefits: ["mentors", ""],
    funding_aud: null,
    equity_pct: "≤8%",
    status: "upcoming",
    official_url: "https://example.com",
    last_verified_at: "2026-09-10",
    verified_by: "seed",
    status_confidence: "high",
  };

  it("derives capital from city and coerces numerics", () => {
    const row = mapProgramSeed(base);
    expect(row.city).toBe("Wollongong");
    expect(row.capital).toBe("Sydney");
    expect(row.length_weeks).toBe(12);
    expect(row.intake_months).toEqual([1, 7]);
    expect(row.benefits).toEqual(["mentors"]);
    expect(row.funding_aud).toBeNull();
    expect(row.status).toBe("upcoming");
  });

  it("uses Remote for national rows without a city", () => {
    const row = mapProgramSeed({ ...base, city: null, state: "national" });
    expect(row.city).toBe("Remote");
    expect(row.capital).toBe("Remote");
    expect(row.state).toBe("national");
  });
});

describe("real seed files", () => {
  it("maps every grant (56 incl. registry) with unique ids and valid enums", () => {
    const rows = mapGrantSeeds(grantsSeed.grants);
    expect(rows).toHaveLength(grantsSeed.grants.length);
    expect(rows.length).toBeGreaterThanOrEqual(56);
    const excluded = rows.filter((r) => r.exclude_from_matching).map((r) => r.id);
    expect(excluded).toContain("data-sources-registry");
    for (const r of rows) {
      expect(AU_STATES).toContain(r.state);
      expect(["open", "closed", "paused", "upcoming"]).toContain(r.status);
      expect(["high", "medium", "low"]).toContain(r.status_confidence);
      expect(r.official_url).toMatch(/^https?:\/\//);
      if (r.closes_at) expect(r.closes_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("maps every program (199) with a capital and a program_type from the seed enum", () => {
    const rows = mapProgramSeeds(programsSeed.programs);
    expect(rows).toHaveLength(programsSeed.programs.length);
    expect(rows.length).toBeGreaterThanOrEqual(199);
    for (const r of rows) {
      expect(CAPITALS).toContain(r.capital);
      expect(programsSeed.program_type_enum).toContain(r.program_type);
      expect(AU_STATES).toContain(r.state);
    }
    // G11-5 grouping: satellites folded into their capital page.
    const byCapital = rows.reduce<Record<string, number>>((acc, r) => {
      acc[r.capital] = (acc[r.capital] ?? 0) + 1;
      return acc;
    }, {});
    expect(Object.keys(byCapital).sort()).toEqual([...CAPITALS].sort());
    expect(rows.filter((r) => r.city === "Gold Coast").every((r) => r.capital === "Brisbane")).toBe(true);
    expect(rows.filter((r) => r.city === "Remote").every((r) => r.capital === "Remote")).toBe(true);
  });

  it("rejects duplicate ids", () => {
    const dup = [grantsSeed.grants[0], grantsSeed.grants[0]];
    expect(() => mapGrantSeeds(dup)).toThrow(/duplicate grant seed id/);
  });
});
