// Colocated tests for lib/funding/tile-data (T0248, plan §4i D-2): the five
// tile states from fixtures (nothing_due picks the next public event for the
// founder's capital), the D-2 → RDStatus chip mapping, the never-blank
// counts + event rule, and the loader against a mocked data layer
// (entitlement, latest report, funding_matches, prefill, calendar token).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ScoredGrant, ScoredProgram, TimelineItem } from "@/lib/agents/grant-advisor";
import { mapGrantSeeds, mapProgramSeeds, type AuGrantRow, type AuProgramRow } from "./seed-map";

vi.mock("server-only", () => ({}));

const db = vi.hoisted(() => ({
  matches: [] as Array<Record<string, unknown>>,
  calendarToken: "tok_abc" as string | null,
  can: true,
  report: null as null | Record<string, unknown>,
  prefill: {} as Record<string, unknown>,
}));

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      const q = {
        select: () => q,
        eq: () => q,
        is: () => q,
        order: () => q,
        limit: async () => (table === "funding_matches" ? { data: db.matches, error: null } : { data: [], error: null }),
        then: (res: (v: unknown) => void) => res({ data: [], error: null }),
        maybeSingle: async () => ({ data: null, error: null }),
      };
      return q;
    },
  }),
}));
vi.mock("@/lib/entitlements", () => ({ can: async () => db.can }));
vi.mock("./workspace", () => ({
  intakePrefillFor: async () => db.prefill,
  latestFundingReportForUser: async () => db.report,
  CAPITAL_MAP_TYPES: ["angel_group", "vc", "rd_advance_loan", "advisory"],
}));
vi.mock("./calendar-token", () => ({ getOrMintCalendarToken: async () => db.calendarToken }));
vi.mock("./data", () => ({ listGrants: async () => GRANTS, listPrograms: async () => PROGRAMS }));

import {
  buildMoneyRadarTileData,
  collectDeadlines,
  getMoneyRadarTileData,
  industryLabelFor,
  nextPublicEvent,
  tileHeadline,
  tileRung,
  type MoneyRadarTileSources,
} from "./tile-data";

const DATA_DIR = resolve(__dirname, "../../../content/data");
const SEED_GRANTS = mapGrantSeeds((JSON.parse(readFileSync(resolve(DATA_DIR, "grants-au.seed.json"), "utf8")) as { grants: unknown[] }).grants);
const SEED_PROGRAMS = mapProgramSeeds(
  (JSON.parse(readFileSync(resolve(DATA_DIR, "programs-au.seed.json"), "utf8")) as { programs: unknown[] }).programs,
);

const TODAY = new Date(Date.UTC(2026, 8, 10)); // 10 Sep 2026

function grant(over: Partial<AuGrantRow> = {}): AuGrantRow {
  return {
    id: "g1", name: "MVP Ventures", provider: null, level: "state", state: "NSW", funding_type: "matched_grant",
    amount_min_aud: 25000, amount_max_aud: 75000, amount_note: null, co_contribution: null, stage_tags: ["mvp"],
    industry_tags: [], demographic_tags: [], eligibility: {}, application_window: null, opens_at: null,
    closes_at: "2026-09-22", lodgement_deadline: null, next_round_note: null, status: "open", superseded_by: null,
    exclude_from_matching: false, official_url: "https://www.investment.nsw.gov.au/mvp", source_url: null, summary: "s",
    how_to_apply: null, evidence_needed: [], last_verified_at: "2026-09-10", verified_by: "seed", status_confidence: "high",
    sources: null,
    ...over,
  };
}

function program(over: Partial<AuProgramRow> = {}): AuProgramRow {
  return {
    id: "p1", name: "Plus Eight", operator: "Spacecubed", program_type: "accelerator", city: "Perth", capital: "Perth", state: "WA",
    venue: null, stage_tags: ["mvp"], industry_tags: [], demographic_tags: [], length_weeks: 12, intake_months: [2],
    applications_open: null, applications_close: "2026-11-30", next_cohort_start: null, benefits: [], funding_aud: 100000,
    equity_pct: null, cost_to_founder: null, eligibility: {}, status: "open", official_url: "https://plus8.co", summary: "s",
    last_verified_at: "2026-09-10", verified_by: "seed", status_confidence: "high",
    ...over,
  };
}

const GRANTS: AuGrantRow[] = [
  grant(),
  grant({ id: "g2", name: "Ignite Ideas", state: "QLD", closes_at: "2026-10-05", amount_max_aud: 200000 }),
  grant({ id: "g3", name: "R&D Tax Incentive", state: "national", closes_at: null, amount_max_aud: null, funding_type: "tax_offset" }),
  grant({ id: "g4", name: "Old one", state: "NSW", status: "closed", closes_at: "2026-01-01" }),
];
const PROGRAMS: AuProgramRow[] = [
  program(),
  program({ id: "e1", name: "Sydney Startup Pitch Night", program_type: "event", city: "Sydney", capital: "Sydney", state: "NSW", applications_open: "2026-09-15", applications_close: null }),
  program({ id: "e2", name: "West Tech Fest", program_type: "event", city: "Perth", capital: "Perth", state: "WA", applications_open: null, next_cohort_start: "2026-12-01", applications_close: null }),
  program({ id: "e3", name: "Past event", program_type: "event", city: "Sydney", capital: "Sydney", state: "NSW", applications_open: "2026-01-01", applications_close: null }),
  program({ id: "a1", name: "Sydney Angels", program_type: "angel_group", city: "Sydney", capital: "Sydney", state: "NSW", applications_close: null }),
  program({ id: "v1", name: "Blackbird", program_type: "vc", city: "Sydney", capital: "Sydney", state: "NSW", applications_close: null }),
];

function scoredGrant(row: AuGrantRow, score = 80): ScoredGrant {
  return {
    kind: "grant", ref_id: row.id, name: row.name, score,
    breakdown: { stage: 30, industry: 20, amount: 10, demographic: 0, timing: 20 } as ScoredGrant["breakdown"],
    timing: "open_now" as ScoredGrant["timing"], effective_status: "open",
    next_window: row.closes_at ? { kind: "dated", closes_at: row.closes_at, label: `closes ${row.closes_at}` } : { kind: "rolling", label: "Rolling" },
    eligibility_checklist: [], why: ["Fits MVP stage in NSW."], grant: row,
  };
}
function scoredProgram(row: AuProgramRow, score = 70): ScoredProgram {
  return {
    kind: "program", ref_id: row.id, name: row.name, score,
    breakdown: { stage: 30, industry: 20, amount: 10, demographic: 0, timing: 10 } as ScoredProgram["breakdown"],
    timing: "open_now" as ScoredProgram["timing"], effective_status: "open",
    next_window: row.applications_close ? { kind: "dated", closes_at: row.applications_close, label: "closes" } : { kind: "rolling", label: "Rolling" },
    eligibility_checklist: [], why: ["Takes MVP founders in Perth."], program: row,
  };
}

const REPORT = {
  id: "rep-1",
  grants: [scoredGrant(GRANTS[0]), scoredGrant(GRANTS[1], 75), scoredGrant(GRANTS[2], 60)],
  programs: [scoredProgram(PROGRAMS[0])],
  timeline: [{ month: "2026-09", kind: "grant", ref_id: "g1", name: "MVP Ventures", action: "Lodge", lead_time_days: 30, deadline: "2026-09-22", why: "x" }] as TimelineItem[],
  today: "2026-09-10",
};

function sources(over: Partial<MoneyRadarTileSources> = {}): MoneyRadarTileSources {
  return {
    today: TODAY,
    hasMoneyRadar: false,
    profile: { state: "NSW", stage: "mvp", industry_tags: ["agtech_food"], city: "Sydney" },
    report: null,
    matches: [],
    grants: GRANTS,
    programs: PROGRAMS,
    nextStepTitle: null,
    calendarToken: null,
    ...over,
  };
}

describe("tileRung — D-2 thresholds on the RDStatus ladder", () => {
  it("green > 30 d, amber 4–30 d, red ≤ 3 d, overdue < 0, undated keeps the ladder verdict", () => {
    expect(tileRung(45, "open")).toBe("open");
    expect(tileRung(31, "closing_soon")).toBe("open");
    expect(tileRung(30, "last_call")).toBe("closing_soon");
    expect(tileRung(14, "last_call")).toBe("closing_soon");
    expect(tileRung(4, "last_call")).toBe("closing_soon");
    expect(tileRung(3, "last_call")).toBe("last_call");
    expect(tileRung(0, "last_call")).toBe("last_call");
    expect(tileRung(-1, "overdue")).toBe("overdue");
    expect(tileRung(null, "future")).toBe("future");
  });
});

describe("buildMoneyRadarTileData — the five states", () => {
  it("no_profile: counts for {industry} in {state} + next event, Match me only", () => {
    const d = buildMoneyRadarTileData(sources({ profile: null }));
    expect(d.state).toBe("no_profile");
    expect(d.counts).toEqual({ grants: 3, programs: 1, capital: 2 });
    expect(d.industry_label).toBe("Australian");
    expect(d.state_label).toBe("Australia");
    expect(d.top3).toEqual([]);
    expect(d.next_public_event?.name).toBe("Sydney Startup Pitch Night");
    expect(tileHeadline(d)).toBe("We found 3 grants and 1 programs for Australian startups in Australia. Answer 3 questions to see yours.");
    expect(d.next_step).toBe("Answer 3 questions to match grants and programs");
  });

  it("no_profile with a state but nothing matchable narrows the counts to that state", () => {
    const d = buildMoneyRadarTileData(sources({ profile: { state: "QLD", stage: null, industry_tags: [], city: null }, grants: GRANTS.map((g) => ({ ...g, exclude_from_matching: true })) }));
    expect(d.state).toBe("no_profile");
    expect(d.counts.grants).toBe(0);
    expect(d.state_label).toBe("QLD");
  });

  it("free_previewed: runs the free matcher on the real seeds — top-3 names, next deadline, no report", () => {
    const d = buildMoneyRadarTileData(sources({ grants: SEED_GRANTS, programs: SEED_PROGRAMS, profile: { state: "NSW", stage: "mvp", industry_tags: ["software_saas"], city: "Sydney" } }));
    expect(d.state).toBe("free_previewed");
    expect(d.top3.length).toBe(3);
    expect(d.counts.grants).toBeGreaterThan(0);
    expect(d.report_id).toBeNull();
    expect(d.industry_label).toBe("Software / SaaS");
    expect(tileHeadline(d)).toBe("Your top matches are in — amounts and deadlines unlock with the full report.");
    for (const dl of d.next_deadlines) expect(dl.days_until).toBeGreaterThanOrEqual(0);
  });

  it("buyer: ready report, top-3 by score with A$ + chips, next deadline, report link", () => {
    const d = buildMoneyRadarTileData(sources({ report: REPORT }));
    expect(d.state).toBe("buyer");
    expect(d.report_id).toBe("rep-1");
    expect(d.top3.map((m) => m.name)).toEqual(["MVP Ventures", "Ignite Ideas", "Plus Eight"]);
    expect(d.top3[0].amount_max_aud).toBe(75000);
    expect(d.top3[0].deadline).toEqual({ days_until: 12, status: "closing_soon", date_label: "22 Sep 2026 (AEST)" });
    expect(d.next_deadlines[0]).toMatchObject({ ref_id: "g1", days_until: 12, status: "closing_soon" });
    expect(tileHeadline(d)).toBe("Deadlines move — get alerts");
    expect(d.next_step).toBe("Start your MVP Ventures application — closes in 12 days");
    expect(d.calendar_href).toBeNull();
  });

  it("subscriber: funding_matches drive the T-N chips, new-this-week count, computeNextSteps line, ICS href", () => {
    const d = buildMoneyRadarTileData(
      sources({
        hasMoneyRadar: true,
        report: REPORT,
        calendarToken: "tok_abc",
        nextStepTitle: "Upload your cap table",
        matches: [
          { ref_kind: "grant", ref_id: "g1", closes_at: "2026-09-22", first_seen_at: "2026-09-08T00:00:00Z", score: 80 },
          { ref_kind: "grant", ref_id: "g2", closes_at: "2026-09-12", first_seen_at: "2026-08-01T00:00:00Z", score: 70 },
          { ref_kind: "program", ref_id: "p1", closes_at: "2026-11-30", first_seen_at: "2026-09-09T00:00:00Z", score: 65 },
          { ref_kind: "grant", ref_id: "g4", closes_at: "2026-01-01", first_seen_at: "2026-01-01T00:00:00Z", score: 10 },
        ],
      }),
    );
    expect(d.state).toBe("subscriber");
    expect(d.next_deadlines.map((x) => [x.ref_id, x.days_until, x.status])).toEqual([
      ["g2", 2, "last_call"],
      ["g1", 12, "closing_soon"],
    ]);
    expect(d.new_matches_week).toBe(2);
    expect(tileHeadline(d)).toBe("2 new matches this week");
    expect(d.next_step).toBe("Upload your cap table");
    expect(d.calendar_href).toBe("/api/funding/calendar.ics?token=tok_abc");
    expect(d.next_deadlines[0].date_label).toBe("12 Sep 2026 (AEST)");
  });

  it("subscriber with WA profile renders AWST dates", () => {
    const d = buildMoneyRadarTileData(
      sources({
        hasMoneyRadar: true,
        profile: { state: "WA", stage: "mvp", industry_tags: [], city: "Perth" },
        matches: [{ ref_kind: "program", ref_id: "p1", closes_at: "2026-09-30", first_seen_at: "2026-01-01T00:00:00Z", score: 65 }],
      }),
    );
    expect(d.state).toBe("subscriber");
    expect(d.next_deadlines[0].date_label).toBe("30 Sep 2026 (AWST)");
  });

  it("nothing_due: money_radar but no deadline inside 30 days → next public event for the founder's capital", () => {
    const d = buildMoneyRadarTileData(
      sources({
        hasMoneyRadar: true,
        calendarToken: "tok_abc",
        matches: [{ ref_kind: "program", ref_id: "p1", closes_at: "2026-11-30", first_seen_at: "2026-09-09T00:00:00Z", score: 65 }],
      }),
    );
    expect(d.state).toBe("nothing_due");
    expect(d.next_public_event).toMatchObject({ ref_id: "e1", name: "Sydney Startup Pitch Night", city: "Sydney", date: "2026-09-15", date_label: "15 Sep 2026" });
    expect(tileHeadline(d)).toBe("No deadlines in the next 30 days. Next up: Sydney Startup Pitch Night opens 15 Sep 2026.");
    // The 81-day program still shows as the upcoming chip (green).
    expect(d.next_deadlines[0]).toMatchObject({ ref_id: "p1", status: "open" });
    expect(d.calendar_href).toBe("/api/funding/calendar.ics?token=tok_abc");
  });

  it("nothing_due picks the founder's capital first, then anywhere, and never the past", () => {
    const wa = buildMoneyRadarTileData(sources({ hasMoneyRadar: true, profile: { state: "WA", stage: "mvp", industry_tags: [], city: "Perth" } }));
    expect(wa.next_public_event?.ref_id).toBe("e2");
    const tas = buildMoneyRadarTileData(sources({ hasMoneyRadar: true, profile: { state: "TAS", stage: "mvp", industry_tags: [], city: null } }));
    expect(tas.next_public_event?.ref_id).toBe("e1");
    const none = buildMoneyRadarTileData(sources({ hasMoneyRadar: true, programs: PROGRAMS.filter((p) => p.program_type !== "event") }));
    expect(none.next_public_event).toBeNull();
    expect(tileHeadline(none)).toBe("No deadlines in the next 30 days. Your next re-match runs on Sunday.");
  });

  it("subscriber with no funding_matches yet falls back to the report's deadlines", () => {
    const d = buildMoneyRadarTileData(sources({ hasMoneyRadar: true, report: REPORT }));
    expect(d.state).toBe("subscriber");
    expect(d.next_deadlines[0].ref_id).toBe("g1");
  });

  it("never blank: every state carries counts and (when one exists) the next public event", () => {
    const states = [
      buildMoneyRadarTileData(sources({ profile: null })),
      buildMoneyRadarTileData(sources({ grants: SEED_GRANTS, programs: SEED_PROGRAMS })),
      buildMoneyRadarTileData(sources({ report: REPORT })),
      buildMoneyRadarTileData(sources({ hasMoneyRadar: true, report: REPORT })),
      buildMoneyRadarTileData(sources({ hasMoneyRadar: true })),
    ];
    expect(states.map((s) => s.state)).toEqual(["no_profile", "free_previewed", "buyer", "subscriber", "nothing_due"]);
    for (const s of states) {
      expect(s.counts.grants + s.counts.programs + s.counts.capital).toBeGreaterThan(0);
      expect(tileHeadline(s).length).toBeGreaterThan(0);
      expect(s.next_step.length).toBeGreaterThan(0);
    }
    expect(states[0].next_public_event).not.toBeNull();
  });
});

describe("helpers", () => {
  it("collectDeadlines dedupes and sorts ascending; industryLabelFor maps the first tag", () => {
    const ds = collectDeadlines(
      sources({
        matches: [
          { ref_kind: "grant", ref_id: "g1", closes_at: "2026-09-22", first_seen_at: "", score: 1 },
          { ref_kind: "grant", ref_id: "g1", closes_at: "2026-09-22", first_seen_at: "", score: 1 },
          { ref_kind: "grant", ref_id: "g2", closes_at: null, first_seen_at: "", score: 1 },
        ],
      }),
    );
    expect(ds.map((d) => d.ref_id)).toEqual(["g1", "g2"]); // g2 closes_at from the catalogue (2026-10-05)
    expect(industryLabelFor(["fintech"])).toBe("Fintech");
    expect(industryLabelFor([])).toBe("Australian");
    expect(nextPublicEvent(sources({ profile: null }))?.ref_id).toBe("e1");
  });
});

describe("getMoneyRadarTileData — loader", () => {
  const USER = { id: "u-1", email: "f@acme.io", plan: "founder_starter" };
  const PROJECT = { id: "proj-1", userId: "u-1", name: "Acme", slug: "acme", description: null, industry: "AgTech", stage: 2, isDefault: true, archivedAt: null, createdAt: "", updatedAt: "", growth_phase_current: null };

  beforeEach(() => {
    db.matches = [];
    db.calendarToken = "tok_abc";
    db.can = true;
    db.report = null;
    db.prefill = {};
  });

  it("subscriber path: entitlement + funding_matches + calendar token", async () => {
    db.matches = [{ ref_kind: "grant", ref_id: "g1", closes_at: "2026-09-22", first_seen_at: "2026-09-09T00:00:00Z", score: 80 }];
    db.prefill = { state: "NSW", stage: "mvp", industry_tags: ["agtech_food"] };
    const d = await getMoneyRadarTileData(USER, PROJECT, { today: TODAY });
    expect(d.state).toBe("subscriber");
    expect(d.next_deadlines[0].name).toBe("MVP Ventures");
    expect(d.calendar_href).toContain("/api/funding/calendar.ics?token=tok_abc");
    expect(d.new_matches_week).toBe(1);
  });

  it("buyer path: the stored report intake wins over the prefill, no token minted without money_radar", async () => {
    db.can = false;
    db.report = {
      id: "rep-1", status: "ready", intake: { description: "Soil sensors for grain farmers", state: "WA", stage: "early_revenue", city: "Perth" },
      grant_matches: REPORT.grants, program_matches: REPORT.programs, timeline: REPORT.timeline, meta: { today: "2026-09-10" },
    };
    db.prefill = { state: "NSW", stage: "mvp" };
    const d = await getMoneyRadarTileData(USER, PROJECT, { today: TODAY });
    expect(d.state).toBe("buyer");
    expect(d.user_state).toBe("WA");
    expect(d.calendar_href).toBeNull();
    expect(d.today).toBe("2026-09-10");
  });

  it("preloaded values skip the reads; a free founder with no data lands on no_profile", async () => {
    db.can = false;
    const d = await getMoneyRadarTileData(USER, null, { today: TODAY, hasMoneyRadar: false, report: null, grants: GRANTS, programs: PROGRAMS });
    expect(d.state).toBe("no_profile");
    expect(d.counts.grants).toBe(3);
  });

  it("free founder whose project prefill is enough gets free_previewed", async () => {
    db.can = false;
    db.prefill = { state: "NSW", stage: "mvp", industry_tags: ["software_saas"] };
    const d = await getMoneyRadarTileData(USER, PROJECT, { today: TODAY, grants: SEED_GRANTS, programs: SEED_PROGRAMS });
    expect(d.state).toBe("free_previewed");
    expect(d.top3.length).toBe(3);
  });
});
