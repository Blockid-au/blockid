// Colocated vitest for the pure directory helpers behind /funding/grants and
// /funding/programs (T0241): filter parsing, live counts, eligibility label
// mapping, loose-date parsing, the twelve-month intake calendar and the
// JSON-LD builders.

import { describe, expect, it } from "vitest";
import type { AuGrantRow, AuProgramRow } from "./seed-map";
import {
  applyGrantFilters,
  applyProgramFilters,
  buildGrantJsonLd,
  buildIntakeCalendar,
  buildProgramEventsJsonLd,
  buildProgramJsonLd,
  capitalFromSlug,
  capitalSlug,
  countByCapital,
  distinct,
  eligibilityRequirements,
  filterHref,
  formatAudCompact,
  formatAudRange,
  formatLooseDate,
  fundingTypeLabel,
  grantStats,
  humanize,
  isoDateOrNull,
  latestVerifiedAt,
  parseGrantFilters,
  parseLooseDate,
  parseProgramFilters,
  sortByStatusThenName,
  stageLabel,
  statusDetail,
} from "./directory";

function grant(over: Partial<AuGrantRow> = {}): AuGrantRow {
  return {
    id: "g1",
    name: "Grant One",
    provider: "Dept",
    level: "federal",
    state: "national",
    funding_type: "grant",
    amount_min_aud: null,
    amount_max_aud: 50000,
    amount_note: null,
    co_contribution: null,
    stage_tags: ["mvp"],
    industry_tags: [],
    demographic_tags: [],
    eligibility: {},
    application_window: "rolling",
    opens_at: null,
    closes_at: null,
    lodgement_deadline: null,
    next_round_note: null,
    status: "open",
    superseded_by: null,
    exclude_from_matching: false,
    official_url: "https://example.gov.au/grant",
    source_url: null,
    summary: "One-line summary.",
    how_to_apply: null,
    evidence_needed: [],
    last_verified_at: "2026-09-10",
    verified_by: "seed",
    status_confidence: "high",
    sources: null,
    ...over,
  };
}

function program(over: Partial<AuProgramRow> = {}): AuProgramRow {
  return {
    id: "p1",
    name: "Program One",
    operator: "Op",
    program_type: "accelerator",
    city: "Sydney",
    capital: "Sydney",
    state: "NSW",
    venue: null,
    stage_tags: ["mvp"],
    industry_tags: [],
    demographic_tags: [],
    length_weeks: 12,
    intake_months: [],
    applications_open: null,
    applications_close: null,
    next_cohort_start: null,
    benefits: [],
    funding_aud: null,
    equity_pct: null,
    cost_to_founder: "free",
    eligibility: {},
    status: "open",
    official_url: "https://example.com/program",
    summary: null,
    last_verified_at: "2026-09-10",
    verified_by: "seed",
    status_confidence: "high",
    ...over,
  };
}

describe("labels", () => {
  it("humanize turns snake_case into a sentence", () => {
    expect(humanize("pre_revenue_prototype")).toBe("Pre revenue prototype");
    expect(humanize("")).toBe("");
  });
  it("curated labels win, unknown keys humanize", () => {
    expect(fundingTypeLabel("tax_offset_refundable")).toBe("Refundable tax offset");
    expect(fundingTypeLabel("mystery_kind")).toBe("Mystery kind");
    expect(stageLabel("early_revenue")).toBe("Early revenue");
  });
});

describe("money", () => {
  it("formats compact AUD with en-AU grouping and no decimals", () => {
    expect(formatAudCompact(25000)).toBe("A$25,000");
    expect(formatAudCompact(1234567.9)).toBe("A$1,234,568");
  });
  it("renders min–max, up to, from, note and fallback", () => {
    expect(formatAudRange(10000, 50000)).toBe("A$10,000 – A$50,000");
    expect(formatAudRange(null, 50000)).toBe("up to A$50,000");
    expect(formatAudRange(10000, null)).toBe("from A$10,000");
    expect(formatAudRange(null, null, "Investor-side offset")).toBe("Investor-side offset");
    expect(formatAudRange(null, null)).toBe("Amount varies");
    expect(formatAudRange(5000, 5000)).toBe("A$5,000");
  });
});

describe("grantStats", () => {
  it("counts open rows and sums their amount_max_aud, skipping excluded rows", () => {
    const rows = [
      grant({ id: "a", status: "open", amount_max_aud: 100 }),
      grant({ id: "b", status: "open", amount_max_aud: null }),
      grant({ id: "c", status: "closed", amount_max_aud: 1000 }),
      grant({ id: "d", status: "open", amount_max_aud: 50, exclude_from_matching: true }),
    ];
    expect(grantStats(rows)).toEqual({ total: 3, open: 2, openMaxAud: 100 });
  });
});

describe("parseGrantFilters / applyGrantFilters", () => {
  it("normalises state case, keeps national, drops junk tokens", () => {
    expect(parseGrantFilters({ state: "nsw", type: "grant", stage: "mvp", status: "open" })).toEqual({
      state: "NSW",
      type: "grant",
      stage: "mvp",
      status: "open",
    });
    expect(parseGrantFilters({ state: "National" }).state).toBe("national");
    expect(parseGrantFilters({ state: ["VIC", "NSW"] }).state).toBe("VIC");
    expect(parseGrantFilters({ type: "<script>", status: "weird" })).toEqual({
      state: null,
      type: null,
      stage: null,
      status: null,
    });
    expect(parseGrantFilters(undefined)).toEqual({ state: null, type: null, stage: null, status: null });
  });

  it("a state filter keeps national rows alongside that state; national-only excludes states", () => {
    const rows = [
      grant({ id: "nat", state: "national" }),
      grant({ id: "nsw", state: "NSW" }),
      grant({ id: "vic", state: "VIC" }),
      grant({ id: "x", state: "NSW", exclude_from_matching: true }),
    ];
    expect(applyGrantFilters(rows, parseGrantFilters({ state: "NSW" })).map((r) => r.id)).toEqual(["nat", "nsw"]);
    expect(applyGrantFilters(rows, parseGrantFilters({ state: "national" })).map((r) => r.id)).toEqual(["nat"]);
    expect(applyGrantFilters(rows, parseGrantFilters({})).map((r) => r.id)).toEqual(["nat", "nsw", "vic"]);
  });

  it("type and stage filters are exact / membership matches", () => {
    const rows = [
      grant({ id: "a", funding_type: "voucher", stage_tags: ["idea", "mvp"] }),
      grant({ id: "b", funding_type: "grant", stage_tags: ["scaling"] }),
    ];
    expect(applyGrantFilters(rows, parseGrantFilters({ type: "voucher" })).map((r) => r.id)).toEqual(["a"]);
    expect(applyGrantFilters(rows, parseGrantFilters({ stage: "scaling" })).map((r) => r.id)).toEqual(["b"]);
    expect(applyGrantFilters(rows, parseGrantFilters({ stage: "idea", type: "grant" }))).toEqual([]);
  });
});

describe("parseProgramFilters / applyProgramFilters", () => {
  it("resolves capital slugs case-insensitively and rejects unknown capitals", () => {
    expect(parseProgramFilters({ capital: "brisbane" }).capital).toBe("Brisbane");
    expect(parseProgramFilters({ capital: "REMOTE" }).capital).toBe("Remote");
    expect(parseProgramFilters({ capital: "gold-coast" }).capital).toBeNull();
  });
  it("filters by capital, type, stage", () => {
    const rows = [
      program({ id: "a", capital: "Sydney", program_type: "accelerator", stage_tags: ["mvp"] }),
      program({ id: "b", capital: "Perth", program_type: "incubator", stage_tags: ["idea"] }),
    ];
    expect(applyProgramFilters(rows, parseProgramFilters({ capital: "perth" })).map((r) => r.id)).toEqual(["b"]);
    expect(applyProgramFilters(rows, parseProgramFilters({ type: "accelerator" })).map((r) => r.id)).toEqual(["a"]);
    expect(applyProgramFilters(rows, parseProgramFilters({ stage: "idea" })).map((r) => r.id)).toEqual(["b"]);
  });
});

describe("filterHref / distinct / sort", () => {
  it("builds chip hrefs by patching one key and dropping nulls", () => {
    expect(filterHref("/funding/grants", { state: "NSW", type: null }, { type: "grant" })).toBe(
      "/funding/grants?state=NSW&type=grant",
    );
    expect(filterHref("/funding/grants", { state: "NSW" }, { state: null })).toBe("/funding/grants");
  });
  it("distinct keeps first-seen order", () => {
    expect(distinct(["b", "a", "b", "", "c", "a"])).toEqual(["b", "a", "c"]);
  });
  it("sorts open → upcoming → paused → closed then A–Z", () => {
    const rows = [
      program({ id: "z", name: "Zed", status: "closed" }),
      program({ id: "b", name: "Beta", status: "open" }),
      program({ id: "u", name: "Up", status: "upcoming" }),
      program({ id: "p", name: "Paused", status: "paused" }),
      program({ id: "a", name: "Alpha", status: "open" }),
    ];
    expect(sortByStatusThenName(rows).map((r) => r.id)).toEqual(["a", "b", "u", "p", "z"]);
  });
});

describe("capitals", () => {
  it("slug round-trips every capital", () => {
    for (const c of ["Sydney", "Melbourne", "Brisbane", "Perth", "Adelaide", "Canberra", "Hobart", "Darwin", "Remote"] as const) {
      expect(capitalFromSlug(capitalSlug(c))).toBe(c);
    }
    expect(capitalFromSlug("")).toBeNull();
  });
  it("counts programs per capital, open separately", () => {
    const counts = countByCapital([
      program({ id: "a", capital: "Sydney", status: "open" }),
      program({ id: "b", capital: "Sydney", status: "closed" }),
      program({ id: "c", capital: "Remote", status: "open" }),
    ]);
    expect(counts.Sydney).toEqual({ total: 2, open: 1 });
    expect(counts.Remote).toEqual({ total: 1, open: 1 });
    expect(counts.Darwin).toEqual({ total: 0, open: 0 });
  });
});

describe("eligibilityRequirements", () => {
  it("maps curated keys to labels with formatted values", () => {
    const out = eligibilityRequirements({
      is_company_acn: true,
      incorporated_years_max: 3,
      prior_year_income_max: 200000,
      not_listed: true,
      innovation_test: "100-point or principles-based",
      women_owned_min_pct: 51,
      runway_months_min: 1,
    });
    expect(out).toEqual([
      { key: "is_company_acn", label: "Incorporated company (ACN)", value: "Yes" },
      { key: "incorporated_years_max", label: "Incorporated within the last", value: "3 years" },
      { key: "prior_year_income_max", label: "Prior-year assessable income at most", value: "A$200,000" },
      { key: "not_listed", label: "Not listed on a stock exchange", value: "Yes" },
      { key: "innovation_test", label: "Innovation test", value: "100-point or principles-based" },
      { key: "women_owned_min_pct", label: "Women ownership at least", value: "51%" },
      { key: "runway_months_min", label: "Runway at least", value: "1 month" },
    ]);
  });
  it("humanizes unknown keys, keeps false gates, drops null/empty, joins arrays", () => {
    const out = eligibilityRequirements({
      some_new_gate: false,
      empty: "",
      nothing: null,
      streams: ["stream_a", "stream_b"],
      region: "AU/NZ",
    });
    expect(out).toEqual([
      { key: "some_new_gate", label: "Some new gate", value: "No" },
      { key: "streams", label: "Streams", value: "Stream a, Stream b" },
      { key: "region", label: "Region", value: "AU/NZ" },
    ]);
    expect(eligibilityRequirements(null)).toEqual([]);
  });
});

describe("dates", () => {
  it("parses full and month-only ISO strings, rejects prose", () => {
    expect(parseLooseDate("2026-11-08")).toEqual({ year: 2026, month: 11, day: 8 });
    expect(parseLooseDate("2027-07")).toEqual({ year: 2027, month: 7, day: null });
    expect(parseLooseDate("Nov 2026")).toBeNull();
    expect(parseLooseDate("2026-13")).toBeNull();
    expect(parseLooseDate(null)).toBeNull();
  });
  it("formats loosely and passes prose through", () => {
    expect(formatLooseDate("2026-11-08")).toBe("8 Nov 2026");
    expect(formatLooseDate("2027-07")).toBe("Jul 2027");
    expect(formatLooseDate("rolling")).toBe("rolling");
    expect(isoDateOrNull("2026-11-08")).toBe("2026-11-08");
    expect(isoDateOrNull("2026-11")).toBeNull();
  });
  it("statusDetail: open shows close date; upcoming prefers the note; closed says nothing", () => {
    expect(statusDetail({ status: "open", closes_at: "2026-11-08" })).toBe("closes 8 Nov 2026");
    expect(statusDetail({ status: "upcoming", next_round_note: "Round 5 expected 2027", closes_at: "2027-01-01" })).toBe(
      "Round 5 expected 2027",
    );
    expect(statusDetail({ status: "upcoming", applications_close: "2027-03" })).toBe("applications close Mar 2027");
    expect(statusDetail({ status: "closed", closes_at: "2026-01-01" })).toBeNull();
  });
  it("latestVerifiedAt picks the max ISO date", () => {
    expect(latestVerifiedAt([{ last_verified_at: "2026-08-01" }, { last_verified_at: "2026-09-10" }, { last_verified_at: null }])).toBe(
      "2026-09-10",
    );
    expect(latestVerifiedAt([])).toBeNull();
  });
});

describe("buildIntakeCalendar", () => {
  const now = new Date(Date.UTC(2026, 8, 10)); // 10 Sep 2026

  it("spans twelve months from the current month and wraps the year", () => {
    const months = buildIntakeCalendar([], now);
    expect(months).toHaveLength(12);
    expect(months[0]!.key).toBe("2026-09");
    expect(months[0]!.label).toBe("September 2026");
    expect(months[11]!.key).toBe("2027-08");
  });

  it("places applications_close, next_cohort_start and usual intake months; dated months are not doubled", () => {
    const rows = [
      program({
        id: "startmate",
        name: "Startmate",
        intake_months: [1, 7],
        applications_close: "2026-11-08",
        next_cohort_start: "2027-01-25",
      }),
    ];
    const months = buildIntakeCalendar(rows, now);
    const byKey = Object.fromEntries(months.map((m) => [m.key, m.events]));
    expect(byKey["2026-11"]).toEqual([
      expect.objectContaining({ programId: "startmate", kind: "applications_close", day: 8 }),
    ]);
    // January has the concrete cohort start — the recurring "usual intake" is suppressed.
    expect(byKey["2027-01"]).toEqual([expect.objectContaining({ kind: "cohort_start", day: 25 })]);
    // July only has the recurring intake.
    expect(byKey["2027-07"]).toEqual([expect.objectContaining({ kind: "usual_intake", day: null })]);
    expect(byKey["2026-09"]).toEqual([]);
  });

  it("skips closed programs and events outside the window; orders dated before undated", () => {
    const rows = [
      program({ id: "dead", name: "Dead", status: "closed", intake_months: [10], applications_close: "2026-10-01" }),
      program({ id: "late", name: "Late", applications_close: "2028-01-01" }),
      program({ id: "z-undated", name: "Zulu", intake_months: [10] }),
      program({ id: "a-undated", name: "Alpha", intake_months: [10] }),
      program({ id: "dated", name: "Mid", applications_close: "2026-10-15" }),
    ];
    const months = buildIntakeCalendar(rows, now);
    const oct = months.find((m) => m.key === "2026-10")!;
    expect(oct.events.map((e) => e.programId)).toEqual(["dated", "a-undated", "z-undated"]);
    expect(months.flatMap((m) => m.events).some((e) => e.programId === "dead" || e.programId === "late")).toBe(false);
  });
});

describe("JSON-LD builders", () => {
  it("grant → GovernmentService with A$ price spec, official sameAs and state areaServed", () => {
    const data = buildGrantJsonLd(grant({ id: "mvp-ventures", state: "NSW", amount_min_aud: 25000, amount_max_aud: 200000, closes_at: "2027-04-10" }));
    expect(data["@type"]).toBe("GovernmentService");
    expect(data.url).toBe("https://blockid.au/funding/grants/mvp-ventures");
    expect(data.sameAs).toBe("https://example.gov.au/grant");
    expect(data.areaServed).toEqual(expect.objectContaining({ "@type": "State", name: "New South Wales" }));
    expect(data.offers).toEqual(
      expect.objectContaining({
        priceSpecification: expect.objectContaining({ minPrice: 25000, maxPrice: 200000, priceCurrency: "AUD" }),
        validThrough: "2027-04-10",
      }),
    );
    expect(JSON.stringify(data)).not.toContain("undefined");
  });

  it("program → Service; Event only for rows with a day-level next_cohort_start that are not closed", () => {
    const svc = buildProgramJsonLd(program({ id: "x", funding_aud: 120000, equity_pct: "≤8%" }));
    expect(svc["@type"]).toBe("Service");
    expect(svc.url).toBe("https://blockid.au/funding/programs/sydney/x");
    expect(JSON.stringify(svc)).toContain("A$120,000");

    const events = buildProgramEventsJsonLd([
      program({ id: "dated", next_cohort_start: "2027-01-25", venue: "Hub" }),
      program({ id: "month-only", next_cohort_start: "2027-07" }),
      program({ id: "closed", next_cohort_start: "2027-01-25", status: "closed" }),
      program({ id: "remote", capital: "Remote", city: "Remote", next_cohort_start: "2026-10-06" }),
    ]);
    expect(events.map((e) => e.startDate)).toEqual(["2027-01-25", "2026-10-06"]);
    expect(events[0]!.location).toEqual(expect.objectContaining({ "@type": "Place", name: "Hub" }));
    expect(events[1]!.location).toEqual(expect.objectContaining({ "@type": "VirtualLocation" }));
    expect(events[1]!.url).toBe("https://blockid.au/funding/programs/remote/remote");
  });
});
