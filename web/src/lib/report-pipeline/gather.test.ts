// gather (S-R3, spec §C.3): the un-stubbed GATHER stage with every I/O
// injected — audits behind a 20 s timeout and a 24 h URL cache, connector
// pulls from the last sync, cap-table + grants reads, the CFO valuation
// inputs — and every result as an EvidenceRow with source + observedAt.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CriterionKey } from "@/lib/evaluation-criteria";
import { CRITERION_KEYS } from "@/lib/evaluation-criteria";
import type { CriterionData, ReportContext } from "./types";
import { GATHER_RESEARCH_CALLS, GatherTimeoutError, gatherData, gatherEvidenceId, parseGitHubRepo, resetGatherCache, withTimeout, type GatherDb, type GatherDeps, type GatherQuery } from "./gather";
import { signalsForAbn } from "@/lib/signals/external-signals";

type Row = Record<string, unknown>;

function criteria(partial: Partial<Record<CriterionKey, Partial<CriterionData>>> = {}): Record<CriterionKey, CriterionData> {
  const out: Record<string, CriterionData> = {};
  for (const key of CRITERION_KEYS) {
    const p = partial[key];
    out[key] = { textInput: p?.textInput ?? "", files: p?.files ?? [], links: p?.links ?? [], qualityLevel: p?.qualityLevel ?? "incomplete" };
  }
  return out as Record<CriterionKey, CriterionData>;
}

function ctx(overrides: Partial<ReportContext> = {}): ReportContext {
  return {
    accountId: "acc-1",
    userId: "user-1",
    projectId: "proj-1",
    startupName: "Acme",
    rawText: "Acme sells widgets. MRR is A$8,000.",
    sviAnalysis: { totalSVI: 118, stageLabel: "Early Traction", stage: 3, sector: "saas", sectorLabel: "SaaS", subs: [], signals: { mrrAud: 8000, raiseAskAud: 1_000_000, statedCapAud: 6_000_000, statedCapKind: "cap", hasVesting: true } } as unknown as ReportContext["sviAnalysis"],
    evidenceItems: [],
    criteriaData: criteria(),
    stage: 3,
    locale: "en",
    gatherResults: {},
    criterionResults: new Map(),
    ...overrides,
  };
}

/** Tiny thenable query builder over a table → rows map. */
function fakeDb(tables: Record<string, Row[]>, opts: { failTables?: string[]; upserts?: Row[] } = {}): GatherDb {
  const mk = (table: string): GatherQuery => {
    let rows = tables[table] ?? [];
    const q: GatherQuery = {
      eq: (col, v) => {
        rows = rows.filter((r) => r[col] === v);
        return q;
      },
      is: (col, v) => {
        rows = rows.filter((r) => r[col] === v);
        return q;
      },
      order: () => q,
      limit: () => q,
      maybeSingle: async () => {
        if (opts.failTables?.includes(table)) throw new Error(`relation "${table}" does not exist`);
        return { data: rows[0] ?? null, error: null };
      },
      then: (onfulfilled, onrejected) => {
        const p = opts.failTables?.includes(table) ? Promise.reject(new Error(`relation "${table}" does not exist`)) : Promise.resolve({ data: rows, error: null });
        return p.then(onfulfilled, onrejected);
      },
    };
    return q;
  };
  return {
    from: (table) => ({
      select: () => mk(table),
      upsert: async (row) => {
        if (opts.failTables?.includes(table)) return { error: { message: `relation "${table}" does not exist` } };
        opts.upserts?.push({ table, ...row });
        return { error: null };
      },
    }),
  };
}

const vcStub: GatherDeps["buildValuation"] = (input) => ({
  blended: { lowAud: 4_000_000, midAud: 6_000_000, highAud: 9_000_000, confidence: 60 },
  methods: [],
  scenarios: { bear: 3_000_000, base: 6_000_000, bull: 12_000_000 },
  injection: { raiseAud: 1_200_000, preMoneyAud: 6_000_000 },
  sectorMultiples: { sector: "saas", low: 3, median: 5, high: 7, sourceLabel: "BlockID static table (2026-06)", sourceDate: "2026-06" },
  inputs: input as never,
});

const callAI = vi.fn(async () => "AI");

function deps(extra: Partial<GatherDeps> = {}): GatherDeps {
  return {
    researchMarket: vi.fn(async () => ({ trends: ["t"], positioning: "p" })),
    db: null,
    buildValuation: vcStub,
    ...extra,
  };
}

beforeEach(() => {
  resetGatherCache();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("helpers", () => {
  it("withTimeout rejects with GatherTimeoutError after the budget and clears its timer on success", async () => {
    vi.useFakeTimers();
    const hung = new Promise<never>(() => {});
    const p = withTimeout("techAudit", hung, 20_000);
    const rejected = p.catch((e) => e);
    await vi.advanceTimersByTimeAsync(20_001);
    const err = await rejected;
    expect(err).toBeInstanceOf(GatherTimeoutError);
    expect((err as GatherTimeoutError).source).toBe("techAudit");
    await expect(withTimeout("x", Promise.resolve(1), 1000)).resolves.toBe(1);
  });

  it("parseGitHubRepo accepts URLs and bare owner/repo, rejects other hosts", () => {
    expect(parseGitHubRepo("https://github.com/acme/widgets")).toBe("acme/widgets");
    expect(parseGitHubRepo("https://github.com/acme/widgets.git")).toBe("acme/widgets");
    expect(parseGitHubRepo("https://github.com/acme/widgets/tree/main")).toBe("acme/widgets");
    expect(parseGitHubRepo("acme/widgets")).toBe("acme/widgets");
    expect(parseGitHubRepo("https://gitlab.com/acme/widgets")).toBeNull();
  });

  it("gatherEvidenceId is deterministic and uuid-shaped", () => {
    expect(gatherEvidenceId("tech_audit", "https://acme.com")).toBe(gatherEvidenceId("tech_audit", "https://acme.com"));
    expect(gatherEvidenceId("tech_audit", "https://acme.com")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(GATHER_RESEARCH_CALLS).toBe(2);
  });
});

describe("gatherData — sources", () => {
  it("with no links / db it still returns research, evidence quality and the valuation row (never throws)", async () => {
    const d = deps();
    const out = await gatherData(ctx(), callAI, { deps: d });
    expect(d.researchMarket).toHaveBeenCalledTimes(1);
    expect(out.results.competitiveResearch).toEqual({ trends: ["t"], positioning: "p" });
    expect(out.results.evidenceQuality).toMatchObject({ totalCriteria: 13 });
    expect(out.results.diagnostics?.techAudit).toMatchObject({ status: "skipped", note: "no website link" });
    expect(out.results.diagnostics?.repoAudit?.status).toBe("skipped");
    expect(out.results.diagnostics?.connectors).toMatchObject({ status: "skipped" });
    const kinds = out.evidenceRows.map((r) => r.label);
    expect(kinds).toContain("Market & competitive research (AI agent, this run)");
    expect(kinds.some((k) => k.startsWith("CFO 5-method valuation"))).toBe(true);
    // Every row carries source + observedAt.
    expect(out.evidenceRows.every((r) => r.source && r.observedAt)).toBe(true);
    // Valuation inputs: founder-stated MRR, ask from signals.
    expect(out.valuation.vc?.inputs).toMatchObject({ mrrAud: 8000, arrAud: 96000, sector: "saas", stage: "seed", raiseAud: 1_000_000, hasFounderVesting: true, revenueSource: "founder-stated" });
    // G19-S42: the SVI stage 0–7 travels with the row so the CFO picks the exact stage baseline.
    expect(typeof (out.valuation.vc?.inputs as Row).sviStage).toBe("number");
    expect(out.valuation.ask).toEqual({ statedCapAud: 6_000_000, statedCapKind: "cap", raiseAud: 1_000_000 });
    expect(out.valuation.revenueEvidenceIds).toEqual([]);
  });

  it("skipResearch (partial re-run) never calls the LLM research agent", async () => {
    const d = deps();
    const out = await gatherData(ctx(), callAI, { deps: d, skipResearch: true });
    expect(d.researchMarket).not.toHaveBeenCalled();
    expect(out.results.diagnostics?.research).toMatchObject({ status: "skipped" });
  });

  it("tech audit: runs deepTechAudit on the website link, caches by URL for 24 h (memory when tech_audits is missing) and yields an evidenced url row", async () => {
    const audit = vi.fn(async (url: string) => ({ url, auditedAt: "2026-09-15T00:00:00.000Z", overallGrade: "B", security: { grade: "B", headerCount: 4, ssl: { valid: true } }, performance: { grade: "A", ttfbMs: 210, compressed: true }, productMaturity: { hasAuth: true, hasPricing: false }, signalBoosts: { ptdBoost: 3, svmBoost: 1, treBoost: 0, lcoBoost: 1 }, evidenceLabels: ["HTTPS valid", "CSP present"] }));
    const c = ctx({ criteriaData: criteria({ website: { links: [{ url: "https://acme.com", label: "site" }] } }) });
    const db = fakeDb({}, { failTables: ["tech_audits"] });
    const first = await gatherData(c, callAI, { deps: deps({ deepTechAudit: audit, db }) });
    expect(audit).toHaveBeenCalledTimes(1);
    expect(first.results.techAudit).toMatchObject({ url: "https://acme.com", status: "audited", cached: false, overallGrade: "B", performance_ttfbMs: 210, signalBoosts_ptdBoost: 3 });
    const row = first.evidenceRows.find((r) => r.label === "Technical audit: https://acme.com")!;
    expect(row).toMatchObject({ source: "url", status: "evidenced", observedAt: "2026-09-15T00:00:00.000Z", dims: ["ptd", "svm", "lco"] });
    expect(row.value).toMatch(/grade B; TTFB 210 ms; security B; HTTPS valid; CSP present/);
    expect(first.results.diagnostics?.techAudit?.status).toBe("ok");

    const second = await gatherData(c, callAI, { deps: deps({ deepTechAudit: audit, db }) });
    expect(audit).toHaveBeenCalledTimes(1);
    expect(second.results.techAudit).toMatchObject({ cached: true });
    expect(second.results.diagnostics?.techAudit?.status).toBe("cached");
  });

  it("tech audit: reads a fresh tech_audits row instead of auditing, writes the row after a live audit, ignores an expired row", async () => {
    const audit = vi.fn(async (url: string) => ({ url, auditedAt: "2026-09-16T00:00:00.000Z", overallGrade: "A", evidenceLabels: [] }));
    const now = Date.parse("2026-09-16T12:00:00.000Z");
    const c = ctx({ criteriaData: criteria({ website: { links: [{ url: "https://fresh.example", label: "s" }] } }) });
    const upserts: Row[] = [];
    const fresh = fakeDb({ tech_audits: [{ url: "https://fresh.example", kind: "tech", result: { url: "https://fresh.example", overallGrade: "C", auditedAt: "2026-09-16T01:00:00.000Z" }, created_at: "2026-09-16T01:00:00.000Z" }] }, { upserts });
    const out = await gatherData(c, callAI, { deps: deps({ deepTechAudit: audit, db: fresh, now: () => now }) });
    expect(audit).not.toHaveBeenCalled();
    expect(out.results.techAudit).toMatchObject({ overallGrade: "C", cached: true });

    resetGatherCache();
    const stale = fakeDb({ tech_audits: [{ url: "https://fresh.example", kind: "tech", result: { overallGrade: "C" }, created_at: "2026-09-14T01:00:00.000Z" }] }, { upserts });
    const out2 = await gatherData(c, callAI, { deps: deps({ deepTechAudit: audit, db: stale, now: () => now }) });
    expect(audit).toHaveBeenCalledTimes(1);
    expect(out2.results.techAudit).toMatchObject({ overallGrade: "A", cached: false });
    expect(upserts).toContainEqual(expect.objectContaining({ table: "tech_audits", url: "https://fresh.example", kind: "tech" }));
  });

  it("a hung audit hits the 20 s timeout: diagnostics say timeout, the report keeps going, no evidence row is minted", async () => {
    vi.useFakeTimers();
    const hung = vi.fn(() => new Promise<Row>(() => {}));
    const c = ctx({ criteriaData: criteria({ website: { links: [{ url: "https://slow.example", label: "s" }] } }) });
    const run = gatherData(c, callAI, { deps: deps({ deepTechAudit: hung }) });
    await vi.advanceTimersByTimeAsync(20_050);
    const out = await run;
    expect(out.results.techAudit).toBeUndefined();
    expect(out.results.diagnostics?.techAudit).toMatchObject({ status: "timeout" });
    expect(out.evidenceRows.some((r) => r.label.startsWith("Technical audit"))).toBe(false);
  });

  it("repo audit: needs the owner's GitHub token — without one it yields a `missing` github row that says what to connect; with one it audits owner/repo", async () => {
    const c = ctx({ criteriaData: criteria({ code_git: { links: [{ url: "https://github.com/acme/widgets", label: "repo" }] } }) });
    const noToken = await gatherData(c, callAI, { deps: deps({ githubToken: async () => null }) });
    const missing = noToken.evidenceRows.find((r) => r.label === "GitHub repository acme/widgets")!;
    expect(missing).toMatchObject({ source: "github", status: "missing", dims: ["ptd", "ftv"] });
    expect(missing.value).toMatch(/Connect GitHub/);
    expect(noToken.results.repoAudit).toBeUndefined();
    expect(noToken.results.diagnostics?.repoAudit).toMatchObject({ status: "skipped", note: "no GitHub token" });

    const repoAudit = vi.fn(async (name: string) => ({ repoFullName: name, auditedAt: "2026-09-10T00:00:00.000Z", overallGrade: "B", activity: { totalCommits: 412, recentWeeklyAvg: 9, contributors: 3, isActivelyMaintained: true }, testing: { hasTests: true, estimatedTestMaturity: "moderate" }, cicd: { hasCI: true, hasCD: false }, documentation: { hasReadme: true }, signalBoosts: { ptdBoost: 4, ftvBoost: 2, treBoost: 1, svmBoost: 1 } }));
    const withToken = await gatherData(c, callAI, { deps: deps({ githubToken: async () => "gh-token", auditGitHubRepo: repoAudit }) });
    expect(repoAudit).toHaveBeenCalledWith("acme/widgets", "gh-token");
    expect(withToken.results.repoAudit).toMatchObject({ repoFullName: "acme/widgets", status: "audited", activity_totalCommits: 412, testing_hasTests: true, cicd_hasCI: true });
    const row = withToken.evidenceRows.find((r) => r.label === "GitHub repository audit: acme/widgets")!;
    expect(row).toMatchObject({ source: "github", status: "evidenced", observedAt: "2026-09-10T00:00:00.000Z" });
    expect(row.value).toMatch(/412 commits; 3 contributors; tests true; CI true/);
  });

  it("connector pulls read the LAST sync only (svi_signals + connected revenue), scoped to the owner + project, and feed the valuation MRR with the evidence ids", async () => {
    const db = fakeDb({
      svi_signals: [
        { user_id: "owner-9", project_id: "proj-1", provider: "stripe", signal_key: "mrr_aud", signal_value_num: 12400, signal_value_text: null, captured_at: "2026-09-10T00:00:00.000Z" },
        { user_id: "owner-9", project_id: "proj-1", provider: "ga4", signal_key: "sessions_30d", signal_value_num: 5400, signal_value_text: null, captured_at: "2026-09-11T00:00:00.000Z" },
        { user_id: "someone-else", project_id: "proj-1", provider: "github", signal_key: "public_repos", signal_value_num: 99, signal_value_text: null, captured_at: "2026-09-11T00:00:00.000Z" },
      ],
    });
    const revenue: GatherDeps["loadConnectedRevenue"] = vi.fn(async () => [{ provider: "stripe" as const, mrrAud: 12400, capturedAt: "2026-09-10T00:00:00.000Z", priorMrrAud: 9000, priorCapturedAt: "2026-06-12T00:00:00.000Z", churnRate90dPct: 2.5 }]);
    const now = Date.parse("2026-09-16T00:00:00.000Z");
    const out = await gatherData(ctx(), callAI, { ownerUserId: "owner-9", projectId: "proj-1", deps: deps({ db, loadConnectedRevenue: revenue, loadCapTable: async () => null, loadGrants: async () => null, now: () => now }) });
    expect(revenue).toHaveBeenCalledWith(db, { userId: "owner-9", projectId: "proj-1", accountId: "acc-1" });
    expect(out.results.connectorSignals).toMatchObject({ providers: ["stripe", "ga4"], revenue: [{ provider: "stripe", mrrAud: 12400, priorMrrAud: 9000 }] });
    const stripe = out.evidenceRows.find((r) => r.label === "STRIPE signals (last sync)")!;
    expect(stripe).toMatchObject({ source: "stripe", status: "evidenced", observedAt: "2026-09-10T00:00:00.000Z", value: "mrr_aud = 12400" });
    const ga4 = out.evidenceRows.find((r) => r.label === "GA4 signals (last sync)")!;
    expect(ga4.dims).toEqual(["tre", "mpc"]);
    const rev = out.evidenceRows.find((r) => r.label === "Stripe revenue (last sync)")!;
    expect(rev.value).toBe("mrr_aud = 12400; prior_mrr_aud = 9000; churn_90d_pct = 2.5");
    // Connected MRR beats the founder-stated 8,000; growth derived from the prior snapshot.
    expect(out.valuation.vc?.inputs).toMatchObject({ mrrAud: 12400, revenueSource: "stripe (last sync 2026-09-10)" });
    expect((out.valuation.vc?.inputs as Row).monthlyGrowthRatePct).toBeGreaterThan(0);
    expect(out.valuation.revenueEvidenceIds).toEqual([gatherEvidenceId("connected_revenue", "stripe")]);
    expect(out.evidenceRows.find((r) => r.label.startsWith("CFO 5-method valuation"))!.status).toBe("evidenced");
  });

  it("stale connected revenue (> 90 days) is ignored for the valuation input", async () => {
    const db = fakeDb({});
    const revenue: GatherDeps["loadConnectedRevenue"] = async () => [{ provider: "xero" as const, mrrAud: 50_000, capturedAt: "2026-01-01T00:00:00.000Z" }];
    const out = await gatherData(ctx(), callAI, { deps: deps({ db, loadConnectedRevenue: revenue, loadCapTable: async () => null, loadGrants: async () => null, now: () => Date.parse("2026-09-16T00:00:00.000Z") }) });
    expect(out.valuation.vc?.inputs).toMatchObject({ mrrAud: 8000, revenueSource: "founder-stated" });
    expect(out.valuation.revenueEvidenceIds).toEqual([]);
  });

  it("cap-table register + grants match become evidence rows (evidenced / partial) and `missing` rows tell the founder what to add", async () => {
    const db = fakeDb({});
    const withData = await gatherData(ctx(), callAI, {
      deps: deps({
        db,
        loadConnectedRevenue: async () => [],
        loadCapTable: async () => ({ holders: 3, issuedShares: 900_000, poolShares: 100_000, fullyDilutedShares: 1_000_000, founderPct: 80, esopPct: 10, investorPct: 10, vestingFlag: true }),
        loadGrants: async () => ({ grants: [{ id: "g1", name: "R&D Tax Incentive", amountAud: null, fit: 82 }], programs: [{ id: "p1", name: "Startmate", amountAud: 120_000, fit: 61 }], profileState: "NSW", rdSpendAud: 200_000 }),
      }),
    });
    expect(withData.results.capTable).toMatchObject({ holders: 3, founderPct: 80, esopPct: 10 });
    const cap = withData.evidenceRows.find((r) => r.label.startsWith("Cap-table register"))!;
    expect(cap).toMatchObject({ source: "upload", status: "evidenced", dims: ["cgh", "iri", "lco"] });
    expect(cap.value).toBe("holders = 3; founders_pct = 80; esop_pct = 10; investors_pct = 10; vesting = true");
    expect(withData.results.grants).toMatchObject({ state: "NSW", matched: 2 });
    const grants = withData.evidenceRows.find((r) => r.label.startsWith("Grants & programs match"))!;
    expect(grants).toMatchObject({ source: "connector_other", status: "partial" });
    expect(grants.value).toBe("R&D Tax Incentive (fit 82); Startmate (fit 61)");
    // RDTI estimate from the grant profile's R&D spend (43.5 %) + ESOP pool from the register.
    expect(withData.valuation.vc?.inputs).toMatchObject({ estimatedRdtiRefundAud: 87_000, hasEsopPool: true });

    const empty = await gatherData(ctx(), callAI, { deps: deps({ db, loadConnectedRevenue: async () => [], loadCapTable: async () => null, loadGrants: async () => null }) });
    expect(empty.evidenceRows.find((r) => r.label === "Cap-table register")).toMatchObject({ status: "missing" });
    expect(empty.evidenceRows.find((r) => r.label === "Grant profile")).toMatchObject({ status: "missing" });
  });

  it("S-R5: founder signals (LinkedIn) + the GA4 90-day snapshot become evidence rows and gather results; URL-only is partial, nothing is missing-free", async () => {
    const db = fakeDb({});
    const founder = { source: "linkedin_pdf", profileUrl: null, founderName: "Jane Doe", headline: "Co-founder & CEO", currentRole: "Co-founder & CEO at Acme Health", yearsExperience: 13.6, yearsInDomain: 8.7, priorCompanies: ["Atlassian", "ClinicFlow"], exits: 1, teamSizeOnPage: 14, confidence: 1, parsedAt: "2026-09-16T00:00:00.000Z" };
    const ga4 = { windowDays: 90, sessions: 2000, newUsers: 1000, returningUsers: 300, returningShare: 0.231, conversions: 90, conversionRate: 0.045, engagedSessions: 1300, engagementRate: 0.65, avgSessionDurationSec: 84, topChannels: [{ channel: "Organic Search", sessions: 900, share: 0.45 }, { channel: "Direct", sessions: 600, share: 0.3 }], funnel: { acquisition: 2000, activation: 1300, retention: 300, revenue: 90, referral: null }, takenAt: "2026-09-15T00:00:00.000Z" };
    const out = await gatherData(ctx(), callAI, {
      ownerUserId: "owner-9",
      projectId: "proj-1",
      deps: deps({ db, loadConnectedRevenue: async () => [], loadCapTable: async () => null, loadGrants: async () => null, loadFounderSignals: async () => founder, loadGa4Snapshot: async () => ga4 }),
    });
    expect(out.results.founderSignals).toMatchObject({ source: "linkedin_pdf", yearsExperience: 13.6, yearsInDomain: 8.7, priorCompanies: 2, exits: 1, teamSizeOnPage: 14 });
    const fRow = out.evidenceRows.find((r) => r.label.startsWith("LinkedIn PDF export"))!;
    expect(fRow).toMatchObject({ source: "linkedin", status: "evidenced", dims: ["ftv", "cgh"], observedAt: "2026-09-16T00:00:00.000Z" });
    expect(fRow.value).toBe("years_experience = 13.6; years_in_domain = 8.7; prior_companies = 2; exits = 1; team_size_on_page = 14");
    expect(out.results.ga4).toMatchObject({ sessions: 2000, engagedSessions: 1300, returningUsers: 300, conversions: 90, funnel: { acquisition: 2000 } });
    const gRow = out.evidenceRows.find((r) => r.label.startsWith("GA4 90-day snapshot"))!;
    expect(gRow).toMatchObject({ source: "ga4", status: "evidenced", dims: ["tre", "mpc"], observedAt: "2026-09-15T00:00:00.000Z" });
    expect(gRow.value).toContain("sessions = 2000; engaged_sessions = 1300; returning_users = 300; conversions = 90");
    expect(gRow.value).toContain("channels = Organic Search 45 %, Direct 30 %");
    expect(out.results.diagnostics?.founderSignals?.status).toBe("ok");
    expect(out.results.diagnostics?.ga4?.status).toBe("ok");

    const urlOnly = await gatherData(ctx(), callAI, { projectId: "proj-1", deps: deps({ db, loadConnectedRevenue: async () => [], loadCapTable: async () => null, loadGrants: async () => null, loadFounderSignals: async () => ({ ...founder, source: "linkedin_url", profileUrl: "https://www.linkedin.com/in/jane-doe-au", yearsExperience: null, yearsInDomain: null, priorCompanies: [], exits: 0, teamSizeOnPage: null, confidence: 0.2 }), loadGa4Snapshot: async () => null }) });
    expect(urlOnly.evidenceRows.find((r) => r.label.startsWith("LinkedIn profile URL"))).toMatchObject({ status: "partial", value: "profile_url = https://www.linkedin.com/in/jane-doe-au" });
    expect(urlOnly.results.ga4).toBeUndefined();
    expect(urlOnly.results.diagnostics?.ga4).toMatchObject({ status: "skipped", note: "no snapshot" });

    const none = await gatherData(ctx(), callAI, { projectId: "proj-1", deps: deps({ db, loadConnectedRevenue: async () => [], loadCapTable: async () => null, loadGrants: async () => null, loadFounderSignals: async () => null, loadGa4Snapshot: async () => null }) });
    expect(none.evidenceRows.find((r) => r.label === "Founder profile (LinkedIn export / URL)")).toMatchObject({ status: "missing", dims: ["ftv"] });
  });

  it("G14-S37: the founder execution rubric becomes an FTV evidence row (source founder_profile; partial while self-declared, evidenced once the cap lifted) and a gather result", async () => {
    const db = fakeDb({});
    const base = {
      executionScore: 70,
      rawScore: 96,
      capped: true,
      capReason: "Self-reported profile — capped at 70 until an evaluator checks references or the LinkedIn export confirms years / employers.",
      structured: true,
      breakdown: [
        { key: "exits", label: "Prior exits", points: 30, max: 30, evidence: "Loom (acquisition 2020)", source: "founder" },
        { key: "years_in_domain", label: "Years in domain", points: 20, max: 20, evidence: "12 years in domain", source: "founder" },
      ],
      sources: ["founder"],
      rubricVersion: "1.0",
      observedAt: "2026-09-17T00:00:00.000Z",
    };
    const common = { db, loadConnectedRevenue: async () => [], loadCapTable: async () => null, loadGrants: async () => null, loadFounderSignals: async () => null, loadGa4Snapshot: async () => null };
    const selfDeclared = await gatherData(ctx(), callAI, { ownerUserId: "owner-9", projectId: "proj-1", deps: deps({ ...common, loadFounderExecution: async () => base }) });
    expect(selfDeclared.results.founderExecution).toMatchObject({ executionScore: 70, rawScore: 96, capped: true, structured: true, rubricVersion: "1.0" });
    const row = selfDeclared.evidenceRows.find((r) => r.source === "founder_profile")!;
    expect(row).toMatchObject({ status: "partial", dims: ["ftv"], observedAt: "2026-09-17T00:00:00.000Z" });
    expect(row.label).toContain("Founder execution profile");
    expect(row.label).toContain("self-declared");
    expect(row.value).toContain("execution_score = 70; raw = 96; capped = true; confidence = self_declared");
    expect(row.value).toContain("exits = 30/30");
    expect(selfDeclared.results.diagnostics?.founderExecution?.status).toBe("ok");

    const lifted = await gatherData(ctx(), callAI, { ownerUserId: "owner-9", projectId: "proj-1", deps: deps({ ...common, loadFounderExecution: async () => ({ ...base, executionScore: 96, capped: false, capReason: undefined, capLiftedBy: "references_checked" as const }) }) });
    const liftedRow = lifted.evidenceRows.find((r) => r.source === "founder_profile")!;
    expect(liftedRow).toMatchObject({ status: "evidenced" });
    expect(liftedRow.label).toContain("references checked by an evaluator");
    expect(liftedRow.value).toContain("confidence = document_uploaded");

    const none = await gatherData(ctx(), callAI, { ownerUserId: "owner-9", projectId: "proj-1", deps: deps({ ...common, loadFounderExecution: async () => null }) });
    expect(none.results.founderExecution).toBeUndefined();
    expect(none.evidenceRows.find((r) => r.source === "founder_profile")).toMatchObject({ status: "missing", label: "Founder execution profile", dims: ["ftv"] });
  });

  it("S40: open AU register signals for the verified ABN become evidence rows (source external, LCO / IRI / TRE) + gather results; no ABN → skipped with a note", async () => {
    const db = fakeDb({ projects: [{ id: "proj-1", abn: "95608464535" }] });
    const ext = await signalsForAbn("95608464535", {
      from: () => {
        const chain = {
          select: () => chain,
          eq: () => chain,
          order: () => chain,
          limit: () => Promise.resolve({
            data: [
              { source_id: "abr-bulk", entity_abn: "95608464535", signal_type: "abr_entity", value: { abn_status: "ACT", abn_status_from: "2019-03-01", entity_type: "Australian Private Company", state: "NSW", gst_status: "ACT", gst_from: "2019-03-01" }, as_of: "2025-06-14", fetched_at: "2026-09-10T00:00:00Z", source_url: "https://abr.business.gov.au/ABN/View?abn=95608464535", match_confidence: "high" },
              { source_id: "business-gov-grants", entity_abn: "95608464535", signal_type: "grant_award", value: { ga_id: "GA1", agency: "DISR", program: "Accelerating Commercialisation", amount_aud: 486500, approval_date: "2025-03-15" }, as_of: "2025-03-15", source_url: "https://www.grants.gov.au/Ga/List", match_confidence: "high" },
              { source_id: "rdti-transparency", entity_abn: "95608464535", signal_type: "rdti_registration", value: { rd_expenditure_aud: 449266, income_year: "2022-23" }, as_of: "2023-06-30", source_url: "https://data.gov.au/data/dataset/research-and-development-tax-incentive", match_confidence: "high" },
            ],
            error: null,
          }),
        };
        return chain;
      },
    }, { now: Date.parse("2026-09-17T00:00:00Z") });
    const out = await gatherData(ctx(), callAI, {
      projectId: "proj-1",
      deps: deps({ db, loadConnectedRevenue: async () => [], loadCapTable: async () => null, loadGrants: async () => null, loadFounderSignals: async () => null, loadGa4Snapshot: async () => null, loadExternalSignals: async () => ({ abn: "95608464535", rows: ext }) }),
    });
    expect(out.results.diagnostics?.externalSignals?.status).toBe("ok");
    expect(out.results.externalSignals).toMatchObject({ abn: "95608464535", count: 3, byType: { abr_entity: 1, grant_award: 1, rdti_registration: 1 }, origin: "connector", confidence: "connected_source" });
    const external = out.evidenceRows.filter((r) => r.source === "external");
    expect(external).toHaveLength(3);
    expect(external.map((r) => r.dims)).toEqual([["lco"], ["iri", "cgh"], ["tre"]]);
    expect(external.every((r) => r.observedAt && !("origin" in r))).toBe(true); // provenance stays in results, rows are schema-shaped
    expect(external.find((r) => r.dims[0] === "tre")?.value).toContain("R&D expenditure band");

    // Default loader: projects.abn null → skipped, no rows, no error.
    const none = await gatherData(ctx(), callAI, { projectId: "proj-1", deps: deps({ db: fakeDb({}), loadConnectedRevenue: async () => [], loadCapTable: async () => null, loadGrants: async () => null, loadFounderSignals: async () => null, loadGa4Snapshot: async () => null }) });
    expect(none.results.diagnostics?.externalSignals).toMatchObject({ status: "skipped", note: "no verified ABN" });
    expect(none.results.externalSignals).toBeUndefined();
    expect(none.evidenceRows.filter((r) => r.source === "external")).toHaveLength(0);
  });

  it("an expired deadline skips every source deterministically", async () => {
    const d = deps({ deepTechAudit: vi.fn() });
    const c = ctx({ criteriaData: criteria({ website: { links: [{ url: "https://acme.com", label: "s" }] } }) });
    const out = await gatherData(c, callAI, { deps: d, deadline: { expired: () => true } });
    expect(d.researchMarket).not.toHaveBeenCalled();
    expect(d.deepTechAudit).not.toHaveBeenCalled();
    expect(out.results.diagnostics?.research).toMatchObject({ status: "skipped", note: "deadline" });
    expect(out.results.diagnostics?.techAudit).toMatchObject({ status: "skipped", note: "deadline" });
    // The valuation is deterministic and still runs.
    expect(out.valuation.vc).not.toBeNull();
  });

  it("a throwing source is isolated (error diagnostics), never a thrown gather", async () => {
    const d = deps({ researchMarket: vi.fn(async () => { throw new Error("provider down"); }) });
    const out = await gatherData(ctx(), callAI, { deps: d });
    expect(out.results.diagnostics?.research).toMatchObject({ status: "error", note: "provider down" });
    expect(out.results.competitiveResearch).toBeUndefined();
  });
});
