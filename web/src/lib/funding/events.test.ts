// Colocated vitest for lib/funding/events.ts (T0246).
// Pins: only program_type=event rows map; closed (SXSW Sydney) and paused
// rows are skipped; YYYY-MM dates become the 1st with a "to be confirmed"
// note; no date + intake_months → next occurrence; stage_tags → 0-4;
// empty industry_tags → sector-agnostic (matches any sector filter); cost
// wording → free/paid/invite; the merged recommender de-dupes by name with
// the seed winning and degrades to the seed when the catalogue read fails.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuProgramRow } from "./seed-map";

vi.mock("server-only", () => ({}));
const { listProgramsMock, seedMock } = vi.hoisted(() => ({ listProgramsMock: vi.fn(), seedMock: vi.fn() }));
vi.mock("./data", () => ({ listPrograms: (...a: unknown[]) => listProgramsMock(...a) }));
vi.mock("@/lib/conferences", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/conferences")>();
  return { ...real, loadConferenceSeed: () => seedMock() };
});

import {
  programEventsAsConferences,
  programEventDate,
  programStagesToConference,
  programCostToConference,
  mergeConferenceSources,
  recommendConferencesWithProgramEvents,
} from "./events";
import type { Conference } from "@/lib/conferences";

const NOW = new Date("2026-09-14T00:00:00.000Z");

function program(over: Partial<AuProgramRow> & { id: string }): AuProgramRow {
  return {
    name: over.id,
    operator: null,
    program_type: "event",
    city: "Sydney",
    capital: "Sydney",
    state: "NSW",
    venue: null,
    stage_tags: [],
    industry_tags: [],
    demographic_tags: [],
    length_weeks: null,
    intake_months: [],
    applications_open: null,
    applications_close: null,
    next_cohort_start: null,
    benefits: [],
    funding_aud: 0,
    equity_pct: null,
    cost_to_founder: null,
    eligibility: {},
    status: "open",
    official_url: `https://${over.id}.example`,
    summary: null,
    last_verified_at: null,
    verified_by: "seed",
    status_confidence: "high",
    ...over,
  };
}

beforeEach(() => {
  listProgramsMock.mockReset().mockResolvedValue([]);
  seedMock.mockReset().mockResolvedValue([]);
});

describe("programEventsAsConferences", () => {
  it("maps open events, skips closed / paused / non-event / undated rows", () => {
    const rows = [
      program({ id: "spark", name: "Spark Festival", next_cohort_start: "2026-09-21", stage_tags: ["idea", "mvp"], cost_to_founder: "free", benefits: ["Pitch night"], summary: "Grassroots festival" }),
      program({ id: "sxsw", name: "SXSW Sydney", status: "closed", intake_months: [10], cost_to_founder: "ticketed" }),
      program({ id: "pause", name: "Pause Fest", status: "paused", next_cohort_start: "2026-11-01" }),
      program({ id: "startmate", name: "Startmate", program_type: "accelerator", next_cohort_start: "2026-10-01" }),
      program({ id: "nodate", name: "No Date", next_cohort_start: null, intake_months: [] }),
      program({ id: "wtf", name: "West Tech Fest", city: "Perth", next_cohort_start: "2026-12", industry_tags: ["FinTech"], cost_to_founder: "festival pass", stage_tags: ["scaling", "export_ready", "bogus"] }),
    ];
    const out = programEventsAsConferences(rows, { now: NOW });
    expect(out.map((c) => c.slug)).toEqual(["program-spark", "program-wtf"]);
    expect(out[0]).toEqual({
      slug: "program-spark",
      name: "Spark Festival",
      date: "2026-09-21",
      city: "Sydney",
      country: "AU",
      url: "https://spark.example",
      audience: ["founder"],
      stages: [0, 2],
      sectors: [],
      cost: "free",
      pitchCompetition: true,
      notes: "Grassroots festival",
    });
    expect(out[1]).toMatchObject({ date: "2026-12-01", stages: [4], sectors: ["fintech"], cost: "paid", pitchCompetition: false, notes: "Date to be confirmed — December 2026" });
  });
});

describe("programEventDate / stages / cost", () => {
  it("resolves exact, month-only, and intake-month dates relative to now", () => {
    expect(programEventDate({ next_cohort_start: "2026-09-21", intake_months: [] }, NOW)).toEqual({ date: "2026-09-21", approximate: false });
    expect(programEventDate({ next_cohort_start: "2027-03", intake_months: [] }, NOW)).toEqual({ date: "2027-03-01", approximate: true });
    expect(programEventDate({ next_cohort_start: null, intake_months: [3, 10] }, NOW)).toEqual({ date: "2026-10-01", approximate: true });
    expect(programEventDate({ next_cohort_start: null, intake_months: [3] }, NOW)).toEqual({ date: "2027-03-01", approximate: true });
    expect(programEventDate({ next_cohort_start: "soon", intake_months: [13, 0] }, NOW)).toBeNull();
  });

  it("stage + cost vocab", () => {
    expect(programStagesToConference(["export_ready", "idea", "idea", "pre_revenue_prototype"])).toEqual([0, 1, 4]);
    expect(programStagesToConference(null)).toEqual([]);
    expect(programCostToConference("free")).toBe("free");
    expect(programCostToConference("mostly free; keynotes ticketed")).toBe("free");
    expect(programCostToConference("invite only")).toBe("invite");
    expect(programCostToConference("ticketed")).toBe("paid");
    expect(programCostToConference(null)).toBe("paid");
    expect(programCostToConference("n/a")).toBe("paid");
  });
});

describe("mergeConferenceSources + recommendConferencesWithProgramEvents", () => {
  const seedConf: Conference = {
    slug: "spark-2026",
    name: "Spark Festival",
    date: "2026-09-21",
    city: "Sydney",
    country: "AU",
    url: "https://spark.org.au",
    audience: ["founder"],
    stages: [0, 1],
    sectors: ["saas"],
    cost: "free",
    pitchCompetition: false,
  };

  it("de-dupes by name with the seed winning", () => {
    const fromPrograms = programEventsAsConferences([program({ id: "spark", name: "spark festival ", next_cohort_start: "2026-09-21" }), program({ id: "wtf", name: "West Tech Fest", next_cohort_start: "2026-12-07" })], { now: NOW });
    const merged = mergeConferenceSources([seedConf], fromPrograms);
    expect(merged.map((c) => c.slug)).toEqual(["spark-2026", "program-wtf"]);
  });

  it("runs the recommender over seed + live events; a sector filter still finds sector-agnostic events", async () => {
    seedMock.mockResolvedValue([seedConf]);
    listProgramsMock.mockResolvedValue([
      program({ id: "wtf", name: "West Tech Fest", city: "Perth", next_cohort_start: "2026-12-07" }),
      program({ id: "sxsw", name: "SXSW Sydney", status: "closed", intake_months: [10] }),
    ]);
    const out = await recommendConferencesWithProgramEvents({ now: NOW, region: "AU", sector: "fintech", limit: 10 });
    expect(out.map((c) => c.slug)).toEqual(["program-wtf"]);
    const all = await recommendConferencesWithProgramEvents({ now: NOW, limit: 10 });
    expect(all.map((c) => c.slug)).toEqual(["spark-2026", "program-wtf"]);
  });

  it("degrades to the seed alone when the catalogue read fails", async () => {
    seedMock.mockResolvedValue([seedConf]);
    listProgramsMock.mockRejectedValue(new Error("db down"));
    const out = await recommendConferencesWithProgramEvents({ now: NOW, limit: 10 });
    expect(out.map((c) => c.slug)).toEqual(["spark-2026"]);
  });
});
