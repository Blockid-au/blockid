// gather (S-R3, spec §C.3): the un-stubbed GATHER stage with every I/O
// injected — audits behind a 20 s timeout and a 24 h URL cache, connector
// pulls from the last sync, cap-table + grants reads, the CFO valuation
// inputs — and every result as an EvidenceRow with source + observedAt.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CriterionKey } from "@/lib/evaluation-criteria";
import { CRITERION_KEYS } from "@/lib/evaluation-criteria";
import type { CriterionData, ReportContext } from "./types";
import { GATHER_RESEARCH_CALLS, GatherTimeoutError, gatherData, gatherEvidenceId, loadDimensionEvidenceRows, parseGitHubRepo, resetGatherCache, withTimeout, type GatherDb, type GatherDeps, type GatherQuery } from "./gather";
import { itemsFromEvidenceRows } from "./auto-cite";
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
    retrievePublicSources: vi.fn(async task => ({ version: "public-sources-v1", task, status: "not_run", sources: [], discovery: { status: "not_run", reason: "fixture" }, limits: { requested: task.sources.length, attempted: 0, maxSources: 5, targetAlternatives: 5, verifiedAlternatives: 0 }, instruction: "fixture" })),
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
  it("with no links / db it returns research, evidence quality and a valuation gap (never throws)", async () => {
    const d = deps();
    const out = await gatherData(ctx(), callAI, { deps: d });
    expect(d.researchMarket).toHaveBeenCalledTimes(1);
    expect(out.results.competitiveResearch).toEqual({ trends: ["t"], positioning: "p" });
    expect(out.results.evidenceQuality).toMatchObject({ totalCriteria: 13 });
    expect(out.results.diagnostics?.techAudit).toMatchObject({ status: "skipped", note: "no website link" });
    expect(out.results.diagnostics?.repoAudit?.status).toBe("skipped");
    expect(out.results.diagnostics?.connectors).toMatchObject({ status: "skipped" });
    const kinds = out.evidenceRows.map((r) => r.label);
    expect(kinds).not.toContain("Market & competitive research (AI agent, this run)");
    expect(out.results.publicResearch?.status).toBe("not_run");
    expect(d.retrievePublicSources).toHaveBeenCalledWith({
      criterion: "market", question: "Who are the main competitors?",
      businessScope: { name: "Acme", projectId: "proj-1" }, sources: [],
    });
    expect(JSON.stringify(vi.mocked(d.retrievePublicSources!).mock.calls)).not.toContain("MRR");
    expect(kinds).toContain("Valuation needs revenue information");
    // Every row carries source + observedAt.
    expect(out.evidenceRows.every((r) => r.source && r.observedAt)).toBe(true);
    expect(out.valuation.vc).toBeNull();
    expect(out.results.revenueQualification).toMatchObject({ reasons: ["founder_revenue_provenance_missing"] });
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

  it("connector pulls read the LAST sync only (svi_signals + connected revenue), scoped to the owner + project, and keep unqualified money out of valuation and citable numeric facts", async () => {
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
    expect(out.results.connectorSignals).toMatchObject({ providers: ["stripe", "ga4"], revenue: [{ provider: "stripe", qualification: "unqualified" }] });
    const stripe = out.evidenceRows.find((r) => r.label === "STRIPE signals (last sync)")!;
    expect(stripe).toMatchObject({ source: "stripe", status: "partial", observedAt: "2026-09-10T00:00:00.000Z", value: expect.stringContaining("Unqualified financial observation") });
    const ga4 = out.evidenceRows.find((r) => r.label === "GA4 signals (last sync)")!;
    expect(ga4.dims).toEqual(["tre", "mpc"]);
    const rev = out.evidenceRows.find((r) => r.label === "Stripe revenue (last sync)")!;
    expect(rev.value).toContain("not usable as MRR");
    expect(out.valuation.vc).toBeNull();
    expect(out.valuation.revenueEvidenceIds).toEqual([]);
    expect(JSON.stringify(out.results.connectorSignals)).not.toContain("12400");
    const citable = itemsFromEvidenceRows(out.evidenceRows.filter((r) => r.source === "stripe"));
    expect(JSON.stringify(citable)).not.toContain("12400");
    expect(citable.every((item) => item.text.includes("Unqualified"))).toBe(true);

  });

  it("stale connected revenue (> 90 days) is ignored for the valuation input", async () => {
    const db = fakeDb({});
    const revenue: GatherDeps["loadConnectedRevenue"] = async () => [{ provider: "xero" as const, mrrAud: 50_000, capturedAt: "2026-01-01T00:00:00.000Z" }];
    const out = await gatherData(ctx(), callAI, { deps: deps({ db, loadConnectedRevenue: revenue, loadCapTable: async () => null, loadGrants: async () => null, now: () => Date.parse("2026-09-16T00:00:00.000Z") }) });
    expect(out.valuation.vc).toBeNull();
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
    expect((withData.results.valuation as { inputs: Row }).inputs).toMatchObject({ estimatedRdtiRefundAud: 87_000, hasEsopPool: true });

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
    // G19-S43: the skip is no longer silent — one `missing` row with the "verify your ABN" CTA (project settings) on LCO / IRI / TRE.
    const abnRows = none.evidenceRows.filter((r) => r.source === "external");
    expect(abnRows).toHaveLength(1);
    expect(abnRows[0]).toMatchObject({ status: "missing", dims: ["lco", "iri", "tre"], cta: { label: "Verify your ABN", href: "/workspace/settings/project", lift: 8 } });
  });

  it("an expired deadline skips every source deterministically", async () => {
    const d = deps({ deepTechAudit: vi.fn() });
    const c = ctx({ criteriaData: criteria({ website: { links: [{ url: "https://acme.com", label: "s" }] } }) });
    const out = await gatherData(c, callAI, { deps: d, deadline: { expired: () => true } });
    expect(d.researchMarket).not.toHaveBeenCalled();
    expect(d.deepTechAudit).not.toHaveBeenCalled();
    expect(out.results.diagnostics?.research).toMatchObject({ status: "skipped", note: "deadline" });
    expect(out.results.diagnostics?.techAudit).toMatchObject({ status: "skipped", note: "deadline" });
    // Unqualified financial inputs do not unlock a valuation.
    expect(out.valuation.vc).toBeNull();
  });

  it("a throwing source is isolated (error diagnostics), never a thrown gather", async () => {
    const d = deps({ researchMarket: vi.fn(async () => { throw new Error("provider down"); }) });
    const out = await gatherData(ctx(), callAI, { deps: d });
    expect(out.results.diagnostics?.research).toMatchObject({ status: "error", note: "provider down" });
    expect(out.results.competitiveResearch).toBeUndefined();
  });
});

describe("gatherData — G19-S43 CTAs + Evidence Hub", () => {
  const quiet = (extra: Partial<GatherDeps> = {}) => deps({ db: fakeDb({}), loadConnectedRevenue: async () => [], loadCapTable: async () => null, loadGrants: async () => null, loadFounderSignals: async () => null, loadFounderExecution: async () => null, loadGa4Snapshot: async () => null, loadExternalSignals: async () => ({ abn: null, rows: [] }), loadDimensionEvidence: async () => [], ...extra });

  it("every `missing` row carries a linked CTA (GitHub / cap table / founder signals / founder profile / grant profile / ABN) with the catalogue lift", async () => {
    const c = ctx({ criteriaData: criteria({ code_git: { links: [{ url: "https://github.com/acme/widgets", label: "repo" }] } }) });
    const out = await gatherData(c, callAI, { deps: quiet({ githubToken: async () => null }) });
    const missing = out.evidenceRows.filter((r) => r.status === "missing" && r.label !== "Valuation needs revenue information");
    expect(missing.length).toBe(6);
    for (const r of missing) expect(r.cta?.href).toMatch(/^\/workspace\//);
    const byLabel = Object.fromEntries(missing.map((r) => [r.label, r.cta]));
    expect(byLabel["GitHub repository acme/widgets"]).toEqual({ label: "Connect GitHub to audit the repository", href: "/workspace/evidence/connectors", lift: 6 });
    expect(byLabel["Cap-table register"]).toEqual({ label: "Add shareholders to the cap table", href: "/workspace/equity", lift: 8 });
    expect(byLabel["Founder profile (LinkedIn export / URL)"]).toEqual({ label: "Upload your LinkedIn export", href: "/workspace/settings/founder", lift: 5 });
    expect(byLabel["Founder execution profile"]).toEqual({ label: "Complete your founder profile", href: "/workspace/settings/founder", lift: 3 });
    expect(byLabel["Grant profile"]).toEqual({ label: "Complete your grant profile", href: "/workspace/funding" });
    expect(byLabel["ABN verification (ABR / GrantConnect / R&DTI registers)"]).toEqual({ label: "Verify your ABN", href: "/workspace/settings/project", lift: 8 });
    // Evidenced rows never carry a cta.
    expect(out.evidenceRows.filter((r) => r.status !== "missing").every((r) => !r.cta)).toBe(true);
  });

  it("Evidence Hub rows (svi_dimension_evidence) become per-dimension rows with the origin-capped confidence: a TRE hub upload changes the TRE evidence; rejected rows are dropped; a missing table reads as no rows", async () => {
    const hub = [
      { dimension: "tre", evidence_type: "revenue_proof", evidence_label: "Bank statements Q2", evidence_value_or_url: "q2.pdf", confidence_level: "third_party_verified", is_verified: false, review_status: "pending", created_at: "2026-09-01T00:00:00.000Z" },
      { dimension: "lco", evidence_type: "ip_assignment", evidence_label: "IP deed", confidence_level: "third_party_verified", is_verified: true, verified_at: "2026-09-05T00:00:00.000Z", review_status: "approved" },
      { dimension: "cgh", evidence_type: "board_minutes", evidence_label: "Minutes", confidence_level: "document_uploaded", review_status: "rejected" },
    ];
    const out = await gatherData(ctx(), callAI, { deps: quiet({ loadDimensionEvidence: async () => hub }) });
    expect(out.results.diagnostics?.evidenceHub?.status).toBe("ok");
    expect(out.results.evidenceHub).toMatchObject({ count: 2, byDim: { tre: 1, lco: 1 }, verified: 1 });
    const tre = out.evidenceRows.filter((r) => r.dims.includes("tre") && r.label.includes("Evidence Hub"));
    expect(tre).toHaveLength(1);
    expect(tre[0]).toMatchObject({ source: "upload", status: "partial", confidence: "self_declared", label: "Financial submission — Evidence Hub, source qualification pending", observedAt: "2026-09-01T00:00:00.000Z" });
    const lco = out.evidenceRows.find((r) => r.label.startsWith("IP deed"))!;
    expect(lco).toMatchObject({ dims: ["lco"], confidence: "third_party_verified", status: "evidenced", observedAt: "2026-09-05T00:00:00.000Z" });
    expect(out.evidenceRows.some((r) => r.label.startsWith("Minutes"))).toBe(false);

    // Default loader over a db without the table → error diagnostics, no rows, never a thrown gather.
    const none = await gatherData(ctx(), callAI, { deps: quiet({ loadDimensionEvidence: undefined, db: fakeDb({}, { failTables: ["svi_dimension_evidence"] }) }) });
    expect(none.results.diagnostics?.evidenceHub?.status).toBe("error");
    expect(none.evidenceRows.some((r) => r.label.includes("Evidence Hub"))).toBe(false);
    // Default loader over a db with rows → read project-scoped.
    const rows = await loadDimensionEvidenceRows(fakeDb({ svi_dimension_evidence: [{ project_id: "proj-1", dimension: "ftv", evidence_type: "founder_linkedin", evidence_label: "LinkedIn", confidence_level: "public_url", is_verified: false }, { project_id: "other", dimension: "ftv", evidence_type: "founder_bio" }] }), "proj-1");
    expect(rows).toEqual([{ dimension: "ftv", evidence_type: "founder_linkedin", evidence_label: "LinkedIn", evidence_value_or_url: null, confidence_level: "public_url", is_verified: false, verified_at: null, review_status: null, created_at: null, updated_at: null }]);
  });

it("gather does not reintroduce pending Hub financial numbers as report evidence", async () => {
  const original = { dimension: "tre", evidence_type: "revenue_proof", evidence_label: "MRR A$77,777", evidence_value_or_url: "ARR A$933,324", confidence_level: "document_uploaded", review_status: "pending" };
  const out = await gatherData(ctx(), callAI, { deps: quiet({ loadDimensionEvidence: async () => [original] }) });
  const projected = itemsFromEvidenceRows(out.evidenceRows);
  expect(JSON.stringify(projected)).not.toMatch(/77,777|933,324/);
  expect(out.evidenceRows.find(r => r.label.includes("Evidence Hub"))).toMatchObject({ status: "partial", value: expect.stringContaining("unverified assertions") });
  expect(out.valuation.status).toBe("unavailable");
  expect(original.evidence_value_or_url).toBe("ARR A$933,324");
});

});

describe("G30 valuation revenue presence", () => {
  function withoutRevenue() {
    const context = ctx();
    context.rawText = "Business information; revenue not supplied.";
    context.sviAnalysis = { ...context.sviAnalysis, signals: { raiseAskAud: 1_000_000 } } as ReportContext["sviAnalysis"];
    return context;
  }
  const clock = Date.parse("2026-09-16T00:00:00.000Z");
  function connectorDeps(revenue: Awaited<ReturnType<NonNullable<GatherDeps["loadConnectedRevenue"]>>>) {
    return deps({ db: fakeDb({}), loadConnectedRevenue: async () => revenue, loadCapTable: async () => null, loadGrants: async () => null, now: () => clock });
  }

  it("withholds numerical valuation for missing revenue while preserving the ask and a visible gap", async () => {
    const buildValuation = vi.fn(vcStub!);
    const out = await gatherData(withoutRevenue(), callAI, { deps: deps({ buildValuation }) });
    expect(buildValuation).not.toHaveBeenCalled();
    expect(out.valuation).toMatchObject({ status: "unavailable", reason: expect.stringContaining("No explicitly labelled revenue statement"), missingInputs: expect.arrayContaining(["current_revenue", "independent_financial_validation"]), vc: null, ask: { statedCapAud: null, statedCapKind: null, raiseAud: 1_000_000 }, revenueEvidenceIds: [] });
    expect(out.results.valuation).toMatchObject({ status: "unavailable", inputs: { mrrAud: null, arrAud: null } });
    expect(out.results.diagnostics?.valuation).toMatchObject({ status: "skipped", note: "missing_or_invalid_revenue" });
    expect(out.evidenceRows.some((r) => r.label.startsWith("CFO 5-method"))).toBe(false);
    expect(out.evidenceRows.find((r) => r.label === "Valuation needs revenue information")).toMatchObject({ status: "missing", value: expect.stringContaining("Provide dated revenue records identifying the business") });
  });

  it("does not label visual revenue as an exact submitted financial quotation", async () => {
    const context = withoutRevenue();
    context.rawText = `${context.startupName}: MRR AUD 12,000 as of 2026-08-31`;
    const out = await gatherData(context, callAI, { scoringSourceText: "", deps: deps() });
    expect(out.valuation.reason).not.toContain(context.rawText);
    expect(out.valuation.vc).toBeNull();
  });

  it("carries exact submitted quotations to canonical unavailable output without admitting reported money", async () => {
    const context = withoutRevenue();
    context.rawText = `${context.startupName}: MRR AUD 12,000 as of 2026-08-31`;
    const buildValuation = vi.fn(vcStub!);
    const out = await gatherData(context, callAI, { deps: deps({ buildValuation }) });
    expect(buildValuation).not.toHaveBeenCalled();
    expect(out.valuation.reason).toContain(context.rawText);
    expect(out.valuation.reason).toContain("not independently verified");
    expect(out.results.submittedFinancial).toMatchObject({ valuationEligible: false, verification: "reported_not_independently_verified" });
    expect(out.results.valuation).toMatchObject({ inputs: { mrrAud: null, arrAud: null } });
    expect(out.valuation.revenueEvidenceIds).toEqual([]);
    expect(out.valuation.missingInputs).toContain("independent_financial_validation");
  });

  it.each([NaN, Infinity, -1])("does not turn invalid stated MRR %s into a zero-valued input", async (value) => {
    const context = withoutRevenue();
    context.sviAnalysis.signals.mrrAud = value;
    const buildValuation = vi.fn(vcStub!);
    const out = await gatherData(context, callAI, { deps: deps({ buildValuation }) });
    expect(buildValuation).not.toHaveBeenCalled();
    expect(out.valuation.vc).toBeNull();
  });

  it("does not qualify bare founder zero or fall through to bare positive ARR", async () => {
    const context = withoutRevenue();
    context.sviAnalysis.signals.mrrAud = 0;
    context.sviAnalysis.signals.arrAud = 120000;
    const out = await gatherData(context, callAI, { deps: deps() });
    expect(out.valuation.status).toBe("unavailable");
    expect(out.valuation.vc).toBeNull();
  });

  it("does not accept spoofed complete zero provenance or fall through to positive unqualified revenue", async () => {
    const out = await gatherData(ctx(), callAI, { deps: connectorDeps([
      { provider: "stripe", mrrAud: 0, capturedAt: "2026-09-10T00:00:00Z", qualification: {
        version: 1, producer: "stripe-source-verified", producerVersion: 1, status: "qualified", metric: "mrr", currency: "AUD", basis: "recurring_contracts", amountAud: 0,
        asOf: "2026-09-10T00:00:00Z", capturedAt: "2026-09-10T00:00:00Z", complete: true,
        ownerUserId: "user-1", projectId: "proj-1", businessName: "Acme", entityId: "acme-legal", sourceEntityId: "acme-legal", sourceId: "fixture-only", sourceProvider: "stripe", derivation: "native_aud_complete_recurring_contracts",
      } },
      { provider: "xero", mrrAud: 9000, capturedAt: "2026-09-10T00:00:00Z" },
    ]) });
    expect(out.valuation.vc).toBeNull();
    expect(out.valuation.revenueEvidenceIds).toEqual([]);
    expect(out.results.revenueQualification).toMatchObject({ reasons: expect.arrayContaining(["trusted_producer_unavailable"]) });
  });

  it("rejects otherwise plausible source records with wrong currency, entity, period, date or completeness before the builder", async () => {
    const qualification = {
      version: 1, producer: "stripe-source-verified", producerVersion: 1, status: "qualified", metric: "mrr", currency: "AUD", basis: "recurring_contracts", amountAud: 77777,
      asOf: "2026-09-10", capturedAt: "2026-09-11", complete: true, ownerUserId: "user-1", projectId: "proj-1",
      businessName: "Acme", entityId: "acme", sourceEntityId: "acme", sourceId: "fixture", sourceProvider: "stripe",
      derivation: "native_aud_complete_recurring_contracts",
    };
    for (const change of [{ currency: "USD" }, { metric: "accounting_revenue" }, { sourceEntityId: "other" }, { complete: false }, { asOf: "2025-01-01" }]) {
      const buildValuation = vi.fn(vcStub!);
      const d = connectorDeps([{ provider: "stripe", mrrAud: 77777, capturedAt: "2026-09-11", qualification: { ...qualification, ...change } }]);
      const out = await gatherData(withoutRevenue(), callAI, { deps: { ...d, buildValuation } });
      expect(buildValuation).not.toHaveBeenCalled();
      expect(out.valuation.status).toBe("unavailable");
      expect(JSON.stringify(itemsFromEvidenceRows(out.evidenceRows))).not.toContain("77777");
    }
  });

  it.each(["not-a-date", "2026-09-17T00:00:00Z", "2026-01-01T00:00:00Z"])("rejects unusable connected capture time %s for valuation", async (capturedAt) => {
    const out = await gatherData(withoutRevenue(), callAI, { deps: connectorDeps([{ provider: "stripe", mrrAud: 5000, capturedAt }]) });
    expect(out.valuation.vc).toBeNull();
    expect(out.valuation.revenueEvidenceIds).toEqual([]);
  });

  it.each(["bad", "2026-09-10T00:00:00Z", "2026-09-11T00:00:00Z"])("does not invent a growth interval for prior timestamp %s", async (priorCapturedAt) => {
    const out = await gatherData(ctx(), callAI, { deps: connectorDeps([{ provider: "stripe", mrrAud: 10000, capturedAt: "2026-09-10T00:00:00Z", priorMrrAud: 5000, priorCapturedAt }]) });
    expect(out.valuation.vc?.inputs?.monthlyGrowthRatePct).toBeUndefined();
  });
});
