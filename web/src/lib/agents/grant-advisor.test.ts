// Colocated vitest for the grant-advisor agent (T0240). Runs the REAL seed
// files (web/content/data/*.seed.json) through mapGrantSeeds/mapProgramSeeds
// so a research merge that flips a status or drops a gate key fails here.
// `callAI` is mocked — nothing in this file talks to a provider.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai-client", () => ({
  callAI: vi.fn(),
}));

import { callAI } from "@/lib/ai-client";
import { mapGrantSeeds, mapProgramSeeds, CAPITALS, type Capital } from "@/lib/funding/seed-map";
import { regionIsNational } from "./grant-advisor-rules";
import {
  buildTimeline,
  generateFundingReport,
  matchGrants,
  matchPrograms,
  nextEsicReportDeadline,
  nextRdtiRegistrationDeadline,
  previewFundingReport,
  screenGrants,
  screenPrograms,
  FUNDING_DISCLAIMER,
  type GrantProfile,
  type ProfileState,
} from "./grant-advisor";

const mockCallAI = vi.mocked(callAI);

const DATA_DIR = resolve(__dirname, "../../../content/data");
const grants = mapGrantSeeds(
  (JSON.parse(readFileSync(resolve(DATA_DIR, "grants-au.seed.json"), "utf8")) as { grants: unknown[] }).grants,
);
const programs = mapProgramSeeds(
  (JSON.parse(readFileSync(resolve(DATA_DIR, "programs-au.seed.json"), "utf8")) as { programs: unknown[] }).programs,
);

/** Plan date (docs/plans/money-finder-2026-09-10.md) — pins "between rounds" maths. */
const TODAY = new Date(Date.UTC(2026, 8, 10));

const NSW_AI: GrantProfile = {
  state: "NSW",
  city: "Sydney",
  stage: "pre_revenue_prototype",
  entity_type: "pty_ltd",
  incorporated_at: "2025-11-01",
  turnover_aud: 0,
  headcount: 2,
  industry_tags: ["ai_ml", "software_saas"],
  rd_spend_aud: 0,
  funding_need_aud: 100_000,
};

const QLD_WOMEN_MVP: GrantProfile = {
  state: "QLD",
  city: "Brisbane",
  stage: "mvp",
  entity_type: "pty_ltd",
  incorporated_at: "2025-01-01",
  turnover_aud: 50_000,
  prior_year_expenses_aud: 120_000,
  prior_year_income_aud: 20_000,
  headcount: 4,
  founder_demographics: ["women_owned_51"],
  industry_tags: ["software_saas"],
  funding_need_aud: 150_000,
  rd_spend_aud: 0,
};

const PERTH_IDEA: GrantProfile = {
  state: "WA",
  city: "Perth",
  stage: "idea",
  industry_tags: ["software_saas"],
  turnover_aud: 0,
};

const ids = (rows: Array<{ ref_id: string }>) => rows.map((r) => r.ref_id);

describe("seed sanity (guards the assumptions below)", () => {
  it("loads both seeds", () => {
    expect(grants.length).toBeGreaterThanOrEqual(50);
    expect(programs.length).toBeGreaterThanOrEqual(150);
  });
});

describe("matchGrants — NSW pre-revenue AI startup, A$0 turnover", () => {
  const matched = matchGrants(NSW_AI, grants, TODAY);
  const matchedIds = ids(matched);

  it("ranks MVP Ventures and CSIRO Kick-Start", () => {
    expect(matchedIds).toContain("nsw-mvp-ventures");
    expect(matchedIds).toContain("csiro-kick-start");
  });

  it("never returns IGP (paused), Boosting Female Founders (closed) or Growing Regions (excluded)", () => {
    expect(matchedIds).not.toContain("igp-early-stage");
    expect(matchedIds).not.toContain("igp-commercialisation-growth");
    expect(matchedIds).not.toContain("boosting-female-founders");
    expect(matchedIds).not.toContain("growing-regions-program");
    expect(matchedIds).not.toContain("data-sources-registry");
  });

  it("records a reason for every excluded row", () => {
    const { excluded } = screenGrants(NSW_AI, grants, TODAY);
    const byId = Object.fromEntries(excluded.map((e) => [e.ref_id, e.reason]));
    expect(byId["igp-early-stage"]).toMatch(/paused/);
    expect(byId["boosting-female-founders"]).toMatch(/closed/);
    expect(byId["growing-regions-program"]).toBe("exclude_from_matching");
    expect(byId["rdti"]).toMatch(/R&D spend/);
  });

  it("is sorted by score desc with scores in 0–100", () => {
    for (let i = 1; i < matched.length; i++) expect(matched[i - 1].score).toBeGreaterThanOrEqual(matched[i].score);
    for (const m of matched) {
      expect(m.score).toBeGreaterThanOrEqual(0);
      expect(m.score).toBeLessThanOrEqual(100);
      const b = m.breakdown;
      expect(b.stage + b.industry + b.amount + b.demographic + b.timing).toBe(m.score);
    }
  });

  it("marks MVP Ventures as between rounds (seed status closed, multi_round) rather than open", () => {
    const mvp = matched.find((m) => m.ref_id === "nsw-mvp-ventures")!;
    expect(mvp.timing).toBe("between_rounds");
    expect(mvp.effective_status).toBe("upcoming");
    expect(mvp.grant.status).toBe("closed");
    expect(mvp.eligibility_checklist.some((c) => c.label === "HQ state" && c.status === "pass")).toBe(true);
  });

  it("scores CSIRO Kick-Start on sector + stage and flags the research partner as unknown", () => {
    const ks = matched.find((m) => m.ref_id === "csiro-kick-start")!;
    expect(ks.breakdown.stage).toBe(30);
    expect(ks.breakdown.industry).toBe(25);
    expect(ks.eligibility_checklist.find((c) => /Research partner/.test(c.label))?.status).toBe("unknown");
  });

  it("excludes R&DTI when R&D spend is below the minimum, and estimates it when it is not", () => {
    expect(matchedIds).not.toContain("rdti");
    const withRd = matchGrants({ ...NSW_AI, rd_spend_aud: 80_000 }, grants, TODAY);
    const rdti = withRd.find((m) => m.ref_id === "rdti")!;
    expect(rdti).toBeDefined();
    expect(rdti.estimate_aud).toBe(34_800); // 43.5% refundable on A$80k
    expect(rdti.estimate_note).toMatch(/refundable/);
  });

  it("leaves R&DTI / ESIC estimates undefined with an unknown checklist when inputs are missing", () => {
    const sparse = matchGrants({ state: "NSW", stage: "mvp" }, grants, TODAY);
    const rdti = sparse.find((m) => m.ref_id === "rdti")!;
    expect(rdti.estimate_aud).toBeUndefined();
    expect(rdti.eligibility_checklist.find((c) => /R&DTI estimate/.test(c.label))?.status).toBe("unknown");
    const esic = sparse.find((m) => m.ref_id === "esic")!;
    expect(esic.estimate_aud).toBeUndefined();
    expect(esic.eligibility_checklist.find((c) => /ESIC early-stage/.test(c.label))?.status).toBe("unknown");
  });
});

describe("matchGrants — state HQ gate", () => {
  it("a WA founder never sees NSW-HQ grants", () => {
    const wa = matchGrants({ ...NSW_AI, state: "WA", city: "Perth" }, grants, TODAY);
    for (const m of wa) {
      expect(["national", "WA"]).toContain(m.grant.state);
      const hq = m.grant.eligibility.hq_required ?? m.grant.eligibility.hq_or_rd_in;
      if (typeof hq === "string") expect(hq).toBe("WA");
    }
    expect(ids(wa)).not.toContain("nsw-mvp-ventures");
    expect(ids(wa)).not.toContain("nsw-sbir");
  });

  it("entity and listing gates exclude trusts and listed companies from company-only schemes", () => {
    const trust = screenGrants({ ...NSW_AI, entity_type: "trust", rd_spend_aud: 50_000 }, grants, TODAY);
    expect(ids(trust.matched)).not.toContain("rdti");
    expect(trust.excluded.find((e) => e.ref_id === "rdti")?.reason).toMatch(/company/i);
    const listed = screenGrants({ ...NSW_AI, listed: true, prior_year_expenses_aud: 1000, prior_year_income_aud: 0 }, grants, TODAY);
    expect(ids(listed.matched)).not.toContain("esic");
  });

  it("turnover / headcount caps exclude oversize applicants", () => {
    const big = matchGrants({ ...NSW_AI, turnover_aud: 900_000, headcount: 40 }, grants, TODAY);
    expect(ids(big)).not.toContain("nsw-mvp-ventures"); // turnover ≤ A$400k, ≤ 10 FTE
    expect(ids(big)).not.toContain("digital-solutions-asbas"); // ≤ 20 FTE
  });
});

describe("matchGrants — women-led QLD MVP", () => {
  const matched = matchGrants(QLD_WOMEN_MVP, grants, TODAY);

  it("ranks the Female Founders Co-Investment Fund above every generic (non-demographic) row", () => {
    const fund = matched.find((m) => m.ref_id === "qld-female-founders-coinvestment");
    expect(fund).toBeDefined();
    expect(fund!.breakdown.demographic).toBe(10);
    const generic = matched.filter((m) => m.grant.demographic_tags.length === 0);
    expect(generic.length).toBeGreaterThan(0);
    for (const g of generic) expect(fund!.score).toBeGreaterThan(g.score);
  });

  it("keeps demographic-only rows out for founders outside the group", () => {
    const generic = matchGrants({ ...QLD_WOMEN_MVP, founder_demographics: [] }, grants, TODAY);
    expect(ids(generic)).not.toContain("qld-female-founders-coinvestment");
    expect(ids(generic)).not.toContain("qld-accelerating-female-founders");
    expect(ids(generic)).not.toContain("qld-deadly-deals");
    // MVP Ventures lists demographic tags for Stream 2 but Stream 1 is open to all.
    const nsw = matchGrants({ ...QLD_WOMEN_MVP, state: "NSW", city: "Sydney", founder_demographics: [] }, grants, TODAY);
    expect(ids(nsw)).toContain("nsw-mvp-ventures");
  });

  it("estimates the ESIC investor offset from the funding need when the early-stage limb passes", () => {
    const esic = matched.find((m) => m.ref_id === "esic")!;
    expect(esic.estimate_aud).toBe(30_000); // 20% of A$150k
    expect(esic.eligibility_checklist.find((c) => /innovation test/.test(c.label))?.status).toBe("unknown");
  });
});

describe("matchPrograms", () => {
  it("a Perth founder gets Perth + remote / Australia-wide programs, never Sydney-only ones", () => {
    const matched = matchPrograms(PERTH_IDEA, programs, TODAY);
    expect(matched.length).toBeGreaterThan(5);
    for (const m of matched) {
      const national = m.program.capital === "Remote" || m.program.state === "national" || regionIsNational(m.program.eligibility.region);
      expect(national || m.program.capital === "Perth", m.ref_id).toBe(true);
    }
    expect(ids(matched)).not.toContain("syd-antler-residency");
    expect(ids(matched)).not.toContain("syd-fishburners");
    expect(ids(matched)).toContain("per-startupwa-morning-startup");
  });

  it("affiliation gates hide university accelerators unless the founder is affiliated", () => {
    const unaffiliated = matchPrograms({ ...PERTH_IDEA, stage: "mvp" }, programs, TODAY);
    expect(ids(unaffiliated)).not.toContain("per-curtin-accelerate");
    const curtin = matchPrograms({ ...PERTH_IDEA, stage: "mvp", university_affiliations: ["Curtin University"] }, programs, TODAY);
    expect(ids(curtin)).toContain("per-curtin-accelerate");
    const unsw = matchPrograms({ ...NSW_AI, stage: "mvp", university_affiliations: ["University of New South Wales"] }, programs, TODAY);
    expect(ids(unsw)).toContain("syd-unsw-10x");
  });

  it("drops permanently closed / paused rows and dead programs with reasons", () => {
    const { matched, excluded } = screenPrograms({ ...NSW_AI, stage: "mvp" }, programs, TODAY);
    expect(ids(matched)).not.toContain("syd-techstars-sydney");
    expect(ids(matched)).not.toContain("syd-sxsw-sydney");
    expect(ids(matched)).not.toContain("nat-startmate-women-fellowship");
    expect(excluded.find((e) => e.ref_id === "syd-techstars-sydney")?.reason).toMatch(/closed/);
  });

  it("keeps between-cohort programs with a known future window (Curtin Ignition) as upcoming", () => {
    const m = matchPrograms(PERTH_IDEA, programs, TODAY).find((x) => x.ref_id === "per-curtin-ignition")!;
    expect(m).toBeDefined();
    expect(m.program.status).toBe("closed");
    expect(m.effective_status).toBe("upcoming");
    expect(m.next_window.kind).toBe("dated");
    expect(m.next_window.closes_at).toBe("2027-06-11");
  });

  it("derives next_window from intake_months when no dates are published", () => {
    const m = matchPrograms({ ...QLD_WOMEN_MVP, stage: "early_revenue" }, programs, TODAY).find((x) => x.ref_id === "bne-ignite-plus-commercialisation");
    expect(m).toBeDefined();
    expect(m!.next_window.kind).toBe("estimated");
    expect(m!.next_window.cohort_start).toBe("2027-02-01");
  });

  it("collapses Australia-wide duplicates (Startmate Sydney vs Melbourne) to one row", () => {
    const { matched, excluded } = screenPrograms({ ...NSW_AI, stage: "mvp" }, programs, TODAY);
    const startmate = matched.filter((m) => /^Startmate Accelerator/.test(m.name));
    expect(startmate).toHaveLength(1);
    expect(startmate[0].ref_id).toBe("syd-startmate-accelerator");
    expect(excluded.find((e) => e.ref_id === "mel-startmate")?.reason).toMatch(/duplicate/);
  });

  it("demographic-only programs are gated; open programs with priority tags are not", () => {
    const male = ids(matchPrograms({ ...NSW_AI, stage: "idea" }, programs, TODAY));
    expect(male).not.toContain("syd-unsw-new-wave"); // women_led gate
    expect(male).not.toContain("syd-first-nations-economics-women");
    const women = ids(matchPrograms({ ...NSW_AI, stage: "idea", founder_demographics: ["women_led"] }, programs, TODAY));
    expect(women).toContain("syd-unsw-new-wave");
  });
});

describe("buildTimeline", () => {
  it("Perth idea-stage founder starts with community / pre-accelerator programs and reaches Plus Eight Sprint + Curtin Ignition", () => {
    const g = matchGrants(PERTH_IDEA, grants, TODAY);
    const p = matchPrograms(PERTH_IDEA, programs, TODAY);
    const t = buildTimeline(PERTH_IDEA, g, p, TODAY);
    expect(t.length).toBeGreaterThan(5);
    expect(t[0].month).toBe("2026-09");
    expect(t[0].kind).toBe("program");
    const first = p.find((x) => x.ref_id === t[0].ref_id)!;
    expect(["community", "pre_accelerator"]).toContain(first.program.program_type);
    expect(ids(t)).toContain("per-plus-eight-sprint");
    expect(ids(t)).toContain("per-curtin-ignition");
    const ignition = t.find((x) => x.ref_id === "per-curtin-ignition")!;
    expect(ignition.deadline).toBe("2027-06-11");
    expect(ignition.month).toBe("2027-05");
    expect(ignition.lead_time_days).toBe(30);
  });

  it("is ordered by month and stays within 12 months", () => {
    const g = matchGrants(NSW_AI, grants, TODAY);
    const p = matchPrograms(NSW_AI, programs, TODAY);
    const t = buildTimeline(NSW_AI, g, p, TODAY);
    for (let i = 1; i < t.length; i++) expect(t[i - 1].month <= t[i].month).toBe(true);
    for (const item of t) {
      expect(item.month >= "2026-09" && item.month <= "2027-08").toBe(true);
      expect(item.month).toMatch(/^\d{4}-\d{2}$/);
    }
  });

  it("includes the R&DTI 30 Apr registration item only when rd_spend_aud > 0", () => {
    const without = buildTimeline(PERTH_IDEA, matchGrants(PERTH_IDEA, grants, TODAY), matchPrograms(PERTH_IDEA, programs, TODAY), TODAY);
    expect(without.find((x) => x.kind === "tax" && x.ref_id === "rdti")).toBeUndefined();

    const rd: GrantProfile = { ...PERTH_IDEA, rd_spend_aud: 30_000, entity_type: "pty_ltd" };
    const withRd = buildTimeline(rd, matchGrants(rd, grants, TODAY), matchPrograms(rd, programs, TODAY), TODAY);
    const item = withRd.find((x) => x.kind === "tax" && x.ref_id === "rdti")!;
    expect(item).toBeDefined();
    expect(item.deadline).toBe("2027-04-30");
    expect(item.month).toBe("2027-03");
    expect(item.lead_time_days).toBe(60);
  });

  it("adds the ESIC 31 Jul report only when the early-stage limb passes", () => {
    const t = buildTimeline(QLD_WOMEN_MVP, matchGrants(QLD_WOMEN_MVP, grants, TODAY), matchPrograms(QLD_WOMEN_MVP, programs, TODAY), TODAY);
    const esic = t.find((x) => x.kind === "tax" && x.ref_id === "esic")!;
    expect(esic.deadline).toBe("2027-07-31");
    const old: GrantProfile = { ...QLD_WOMEN_MVP, incorporated_at: "2015-01-01" };
    const t2 = buildTimeline(old, matchGrants(old, grants, TODAY), matchPrograms(old, programs, TODAY), TODAY);
    expect(t2.find((x) => x.kind === "tax" && x.ref_id === "esic")).toBeUndefined();
  });

  it("never contains a permanently closed row and uses 60–90 day lead times for grants / accelerators", () => {
    const g = matchGrants(QLD_WOMEN_MVP, grants, TODAY);
    const p = matchPrograms(QLD_WOMEN_MVP, programs, TODAY);
    const t = buildTimeline(QLD_WOMEN_MVP, g, p, TODAY);
    const closedGrantIds = new Set(grants.filter((r) => r.application_window === "closed_permanently" || r.status === "paused").map((r) => r.id));
    const deadProgramIds = new Set(["syd-techstars-sydney", "syd-sxsw-sydney", "bne-river-city-labs", "nat-techstars-au"]);
    for (const item of t) {
      expect(closedGrantIds.has(item.ref_id)).toBe(false);
      expect(deadProgramIds.has(item.ref_id)).toBe(false);
      if (item.kind === "grant") expect(item.lead_time_days).toBeGreaterThanOrEqual(60);
      if (item.kind === "grant") expect(item.lead_time_days).toBeLessThanOrEqual(90);
    }
    const accel = t.filter((x) => p.find((pp) => pp.ref_id === x.ref_id)?.program.program_type === "accelerator");
    expect(accel.length).toBeGreaterThan(0);
    for (const a of accel) expect(a.lead_time_days).toBe(90);
  });

  it("early-revenue founders get angels 2–4 months after the accelerator step", () => {
    const er: GrantProfile = { ...NSW_AI, stage: "early_revenue", turnover_aud: 120_000, incorporated_at: "2024-06-01" };
    const g = matchGrants(er, grants, TODAY);
    const p = matchPrograms(er, programs, TODAY);
    const t = buildTimeline(er, g, p, TODAY);
    const angels = t.find((x) => x.ref_id === "syd-sydney-angels");
    const accel = t.find((x) => x.ref_id === "syd-startmate-accelerator");
    expect(angels).toBeDefined();
    expect(accel).toBeDefined();
    expect(angels!.month > accel!.month).toBe(true);
  });

  it("tax deadline helpers roll over correctly", () => {
    expect(nextRdtiRegistrationDeadline(new Date(Date.UTC(2026, 8, 10))).toISOString().slice(0, 10)).toBe("2027-04-30");
    expect(nextRdtiRegistrationDeadline(new Date(Date.UTC(2027, 3, 30))).toISOString().slice(0, 10)).toBe("2028-04-30");
    expect(nextRdtiRegistrationDeadline(new Date(Date.UTC(2027, 3, 1))).toISOString().slice(0, 10)).toBe("2027-04-30");
    expect(nextEsicReportDeadline(new Date(Date.UTC(2026, 8, 10))).toISOString().slice(0, 10)).toBe("2027-07-31");
    expect(nextEsicReportDeadline(new Date(Date.UTC(2027, 6, 1))).toISOString().slice(0, 10)).toBe("2027-07-31");
  });
});

describe("previewFundingReport", () => {
  const STATE_FOR_CAPITAL: Record<Capital, ProfileState> = {
    Sydney: "NSW",
    Melbourne: "VIC",
    Brisbane: "QLD",
    Perth: "WA",
    Adelaide: "SA",
    Canberra: "ACT",
    Hobart: "TAS",
    Darwin: "NT",
    Remote: "NSW",
  };

  it("counts are non-zero for every capital", () => {
    for (const capital of CAPITALS) {
      if (capital === "Remote") continue;
      const preview = previewFundingReport(
        { state: STATE_FOR_CAPITAL[capital], city: capital, stage: "mvp", entity_type: "pty_ltd", turnover_aud: 20_000, industry_tags: ["software_saas"] },
        grants,
        programs,
        TODAY,
      );
      expect(preview.grant_count, capital).toBeGreaterThan(0);
      expect(preview.program_count, capital).toBeGreaterThan(0);
      expect(preview.timeline_count, capital).toBeGreaterThan(0);
      expect(preview.top_grants.length).toBeLessThanOrEqual(3);
      expect(preview.top_programs.length).toBeLessThanOrEqual(3);
      expect(preview.total_amount_max_aud).toBeGreaterThan(0);
      expect(preview.top_grants_amount_max_aud).toBeLessThanOrEqual(preview.total_amount_max_aud);
    }
  });
});

describe("generateFundingReport", () => {
  // Block body on purpose: `mockReset()` returns the mock, and vitest would
  // treat a returned function as a cleanup hook and call the mock after the test.
  beforeEach(() => {
    mockCallAI.mockReset();
  });

  it("orchestrates matches, timeline, tax and summary without calling the LLM by default", async () => {
    const report = await generateFundingReport({ profile: QLD_WOMEN_MVP, grants, programs, today: TODAY });
    expect(mockCallAI).not.toHaveBeenCalled();
    expect(report.today).toBe("2026-09-10");
    expect(report.grants.length).toBeGreaterThan(0);
    expect(report.programs.length).toBeGreaterThan(0);
    expect(report.timeline.length).toBeGreaterThan(0);
    expect(report.excluded.grants.length).toBeGreaterThan(0);
    expect(report.tax.esic?.earlyStage.passes).toBe(true);
    expect(report.summary.grant_count).toBe(report.grants.length);
    expect(report.disclaimer).toBe(FUNDING_DISCLAIMER);
    expect(report.narrative_md).toBeUndefined();
  });

  it("falls back to the template narrative when callAI throws", async () => {
    mockCallAI.mockRejectedValue(new Error("provider down"));
    const report = await generateFundingReport({ profile: NSW_AI, grants, programs, today: TODAY, withNarrative: true });
    expect(report.narrative_source).toBe("template");
    expect(report.narrative_md).toContain("## Next actions");
    expect(report.actions).toHaveLength(3);
    expect(report.narrative_md).toContain("[csiro-kick-start]");
  });
});
