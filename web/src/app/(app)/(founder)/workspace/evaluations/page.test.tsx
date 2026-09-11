import type React from "react";
import { renderToReadableStream } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Render test for /workspace/evaluations (T0270) with the data layer mocked.
// Pins: the table (name / stage+SVI / consent chip / added date / actions),
// the "x of N used" plan banner, the empty-state copy, the founder-claim
// branch for a non-evaluator arriving via ?claim=, and the login redirect.
// T0271: the "Run Trust BizReport" button per row, "Re-score" only when a
// report exists, "Last report: <date> · SVI n" + tbr/PDF links, the included
// reports counter in the banner, and the confirm dialog's cost copy.
// T0273: the Progress column (Δ with ▲/▼ + inline SVG sparkline, stage change,
// deadline badge from funding_matches), the Progress Radar panel (movers +
// next deadlines) for money_radar plans, and the Scout-trial teaser without.
// T0272: the Program gate (lp_export / accelerator.cohort from getEntitlements)
// turns on the row checkboxes + "Batch score" button and the Cohorts section
// (batches with progress + cohort / CSV / LP links); Scout / Firm get neither.

vi.mock("@/components/workspace/workspace-layout", () => ({
  WorkspaceLayout: ({ children }: { children: React.ReactNode }) => <div data-shell>{children}</div>,
}));

const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});
vi.mock("next/navigation", () => ({
  redirect: (url: string) => redirectMock(url),
  useRouter: () => ({ refresh: () => undefined, push: () => undefined }),
  usePathname: () => "/workspace/evaluations",
}));

const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUserMock() }));

vi.mock("@/lib/projects", () => ({ getCurrentProjectIsSandbox: async () => false }));

const isEvaluatorUserMock = vi.fn();
const listEvaluationsMock = vi.fn();
const getEvaluationQuotaMock = vi.fn();
vi.mock("@/lib/evaluations", () => ({
  isEvaluatorUser: (u: unknown) => isEvaluatorUserMock(u),
  listEvaluations: (id: string) => listEvaluationsMock(id),
  getEvaluationQuota: (u: unknown) => getEvaluationQuotaMock(u),
}));

const listLastReportsMock = vi.fn();
const getReportQuotaMock = vi.fn();
vi.mock("@/lib/evaluations/report-quota", () => ({
  listLastEvaluationReports: (id: string) => listLastReportsMock(id),
  getReportQuota: (u: unknown) => getReportQuotaMock(u),
}));

const buildProgressMock = vi.fn();
vi.mock("@/lib/evaluations/progress-radar", () => ({
  buildEvaluatorProgress: (o: unknown) => buildProgressMock(o),
}));
const getEntitlementsMock = vi.fn();
vi.mock("@/lib/entitlements", () => ({ getEntitlements: (plan: string, id: string) => getEntitlementsMock(plan, id) }));
const listBatchesMock = vi.fn();
vi.mock("@/lib/evaluations/batch", () => ({ listBatches: (id: string) => listBatchesMock(id) }));
// S13-A checklist inputs (thesis step).
const getPrefsMock = vi.fn();
const getVisibilityMock = vi.fn();
vi.mock("@/lib/investor-portal", () => ({
  getInvestorPreferences: (id: string) => getPrefsMock(id),
  getInvestorVisibility: (id: string) => getVisibilityMock(id),
}));

const SCOUT_FLAGS = ["watchlist", "svi.feed", "investor.dealflow", "grant_finder", "money_radar"];
const PROGRAM_FLAGS = [...SCOUT_FLAGS, "advisor.cohort", "portfolio", "api.access", "lp_export", "lp_report"];
const BATCHES = [
  { id: "b-1", userId: "u-1", name: "Cohort 4 intake", rubricWeights: {}, status: "running", total: 12, doneCount: 5, failedCount: 1, createdAt: "2026-09-10T00:00:00Z", startedAt: "2026-09-10T12:00:00Z", finishedAt: null },
  { id: "b-0", userId: "u-1", name: "Spring round", rubricWeights: {}, status: "done", total: 3, doneCount: 3, failedCount: 0, createdAt: "2026-09-01T00:00:00Z", startedAt: null, finishedAt: "2026-09-01T13:00:00Z" },
];

const PROGRESS = {
  userId: "u-1",
  periodStart: "2026-09-07T00:00:00.000Z",
  periodEnd: "2026-09-13T23:30:00.000Z",
  items: [
    {
      evaluationId: "e-1", projectId: "p-1", projectSlug: "acme-robotics", name: "Acme Robotics", label: "Cohort 4",
      sviNow: 71.4, sviPrev: 62, delta: 9.4, stageNow: 4, stagePrev: 3, stageChanged: true, newEvidence: 2,
      lastReport: { at: "2026-09-09T00:00:00Z", svi: 71, kind: "full" },
      money: {
        nextDeadline: { evaluationId: "e-1", projectId: "p-1", startup: "Acme Robotics", refKind: "grant", refId: "g-mvp", name: "MVP Ventures", closesAt: "2026-09-27", daysLeft: 14, url: "https://www.nsw.gov.au/mvp" },
        deadlinesAhead: 2, newMatches: 1,
      },
      scoreHistory: [50, 55, 58, 62, 71.4],
    },
    {
      evaluationId: "e-2", projectId: "p-2", projectSlug: "beta-health", name: "Beta Health", label: null,
      sviNow: null, sviPrev: null, delta: null, stageNow: 1, stagePrev: null, stageChanged: false, newEvidence: 0, lastReport: null,
      money: { nextDeadline: null, deadlinesAhead: 0, newMatches: 0 }, scoreHistory: [],
    },
  ],
  movers: [] as unknown[],
  deadlines: [] as unknown[],
  newMatches: 1,
  newEvidence: 2,
  digest_ready: true,
};
PROGRESS.movers = [PROGRESS.items[0]];
PROGRESS.deadlines = [PROGRESS.items[0].money.nextDeadline];

const USER = {
  id: "u-1", email: "scout@fund.vc", displayName: "Sam", role: "user", plan: "investor_angel",
  createdAt: "", lastLoginAt: null, googleId: null, avatarUrl: null, discountPct: null,
  startupName: null, startupStage: null, industry: null, onboardingCompleted: true, startupGoals: null,
};

const ROWS = [
  {
    id: "e-1", evaluatorUserId: "u-1", projectId: "p-1", ownerKind: "founder_invited", consentTier: "attributed_only",
    founderEmail: "jo@acme.io", founderUserId: null, inviteToken: "tok", invitedAt: "2026-09-10T00:00:00Z", claimedAt: null,
    label: "Cohort 4", notes: null, website: "https://acme.io", state: "NSW",
    createdAt: "2026-09-08T00:00:00Z", updatedAt: "2026-09-08T00:00:00Z",
    projectName: "Acme Robotics", projectSlug: "acme-robotics", projectIndustry: "DeepTech", projectStage: 3,
    projectDescription: null, latestSvi: 71.4, latestSviAt: "2026-09-09T00:00:00Z",
  },
  {
    id: "e-2", evaluatorUserId: "u-1", projectId: "p-2", ownerKind: "founder_claimed", consentTier: "reports_shared",
    founderEmail: "kim@beta.co", founderUserId: "u-f", inviteToken: "tok2", invitedAt: null, claimedAt: "2026-09-09T00:00:00Z",
    label: null, notes: null, website: null, state: null,
    createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z",
    projectName: "Beta Health", projectSlug: "beta-health", projectIndustry: null, projectStage: 1,
    projectDescription: null, latestSvi: null, latestSviAt: null,
  },
];

async function html(search: Record<string, string> = {}): Promise<string> {
  const { default: Page } = await import("./page");
  const el = await Page({ searchParams: Promise.resolve(search) });
  const stream = await renderToReadableStream(el);
  await stream.allReady;
  // Strip React SSR text-boundary markers so assertions read like the DOM.
  return (await new Response(stream).text()).replace(/<!-- -->/g, "");
}

beforeEach(() => {
  getCurrentUserMock.mockReset();
  isEvaluatorUserMock.mockReset();
  listEvaluationsMock.mockReset();
  getEvaluationQuotaMock.mockReset();
  redirectMock.mockClear();
  getCurrentUserMock.mockResolvedValue(USER);
  isEvaluatorUserMock.mockResolvedValue(true);
  listEvaluationsMock.mockResolvedValue(ROWS);
  getEvaluationQuotaMock.mockResolvedValue({ used: 2, limit: 25 });
  listLastReportsMock.mockReset();
  getReportQuotaMock.mockReset();
  listLastReportsMock.mockResolvedValue({
    "e-1": {
      evaluationId: "e-1", kind: "full", createdAt: "2026-09-09T00:00:00Z", sviTotal: 71,
      shareToken: "tok-abc", reportUrl: "/tbr/tok-abc", pdfUrl: "/api/svi/report/pdf?token=tok-abc",
    },
  });
  getReportQuotaMock.mockResolvedValue({ limit: 10, used: 3, remaining: 7, unlimited: false });
  buildProgressMock.mockReset();
  getEntitlementsMock.mockReset();
  listBatchesMock.mockReset();
  buildProgressMock.mockResolvedValue(PROGRESS);
  getEntitlementsMock.mockResolvedValue(SCOUT_FLAGS);
  listBatchesMock.mockResolvedValue([]);
  getPrefsMock.mockReset();
  getVisibilityMock.mockReset();
  // Default fixture: 2 evaluations + 1 report, no thesis → 3 of 4 (checklist visible).
  getPrefsMock.mockResolvedValue({ sectors: [], stages: [], geos: [], cheque_band: "any", min_svi: null, updated_at: null });
  getVisibilityMock.mockResolvedValue({ evaluator: true, discoverable: false });
});

describe("/workspace/evaluations", () => {
  it("redirects anonymous users to login", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    await expect(html()).rejects.toThrow("REDIRECT:/auth/login?next=/workspace/evaluations");
  });

  it("renders the table with stage / SVI, consent chips, added date and actions", async () => {
    const out = await html();
    expect(out).toContain("Startups I&#x27;m evaluating");
    expect(out).toContain("Acme Robotics");
    expect(out).toContain("Beta Health");
    expect(out).toContain("MVP");
    expect(out).toContain("SVI <strong");
    expect(out).toContain("71");
    expect(out).toContain("Not scored yet");
    expect(out).toContain("Attributed only");
    expect(out).toContain("Reports shared");
    expect(out).toContain("Invite sent to jo@acme.io");
    expect(out).toContain("Founder claimed");
    expect(out).toContain("Cohort 4");
    expect(out).toMatch(/8 Sept? 2026/);
    expect(out).toContain("/workspace/projects/acme-robotics/analyze");
    expect(out).toContain("Stop evaluating Acme Robotics");
    expect(out).toContain("Add a startup");
    expect((out.match(/data-testid="evaluation-row"/g) ?? []).length).toBe(2);
    expect(listEvaluationsMock).toHaveBeenCalledWith("u-1");
  });

  it("shows the plan-limit banner as x of N used and the upgrade link at the cap", async () => {
    let out = await html();
    expect(out).toContain("<strong>2 of 25</strong>");
    expect(out).not.toContain("Upgrade to track more");

    getEvaluationQuotaMock.mockResolvedValue({ used: 25, limit: 25 });
    out = await html();
    expect(out).toContain("<strong>25 of 25</strong>");
    expect(out).toContain("Upgrade to track more");
    expect(out).toContain("/pricing?segment=evaluator");
  });

  it("renders the empty state copy when nothing is tracked yet", async () => {
    listEvaluationsMock.mockResolvedValue([]);
    getEvaluationQuotaMock.mockResolvedValue({ used: 0, limit: 25 });
    const out = await html();
    expect(out).toContain("Add the first startup you&#x27;re evaluating — every one gets the same 8-dimension rubric.");
    expect(out).toContain("<strong>0 of 25</strong>");
  });

  it("T0271: Run Trust BizReport on every row, Re-score only where a report exists, last-report line + links", async () => {
    const out = await html();
    expect(out).toContain("Run Trust BizReport for Acme Robotics");
    expect(out).toContain("Run Trust BizReport for Beta Health");
    expect(out).toContain("Re-score Acme Robotics");
    expect(out).not.toContain("Re-score Beta Health");
    expect((out.match(/data-testid="last-report"/g) ?? []).length).toBe(1);
    expect(out).toMatch(/Last report: 9 Sept? 2026 · SVI 71/);
    expect(out).toContain('href="/tbr/tok-abc"');
    expect(out).toContain('href="/api/svi/report/pdf?token=tok-abc"');
    expect(listLastReportsMock).toHaveBeenCalledWith("u-1");
    expect(getReportQuotaMock).toHaveBeenCalledWith(USER);
  });

  it("T0271: banner shows the included reports left this month (or pay-as-you-go when the plan has none)", async () => {
    let out = await html();
    expect(out).toContain("7 of 10 included Trust BizReports left this month");

    getReportQuotaMock.mockResolvedValue({ limit: 0, used: 0, remaining: 0, unlimited: false });
    out = await html();
    expect(out).toContain("Trust BizReport A$3 · re-score A$1");

    getReportQuotaMock.mockResolvedValue({ limit: Number.MAX_SAFE_INTEGER, used: 40, remaining: Number.MAX_SAFE_INTEGER, unlimited: true });
    out = await html();
    expect(out).toContain("Unlimited Trust BizReports");
  });

  it("T0271: the confirm dialog states the cost before anything runs", async () => {
    const { describeCost } = await import("./report-dialog");
    const quota = { via: "quota" as const, credits: 0, list_credits: 3, balance: 0, remaining_quota: 6, quota: { limit: 10, used: 3, remaining: 7, unlimited: false } };
    expect(describeCost("full", quota)).toBe("Uses 1 of your 10 included reports this month (6 left after this). No credits will be charged.");
    const credits = { ...quota, via: "credits" as const, credits: 3, balance: 5, remaining_quota: 0, quota: { limit: 10, used: 10, remaining: 0, unlimited: false } };
    expect(describeCost("full", credits)).toContain("charged to credits: 3 credits (A$3.00). Balance 5.00 → 2.00 after.");
    expect(describeCost("rescore", { ...credits, list_credits: 1, credits: 1 })).toContain("Re-scores are always pay-as-you-go: 1 credit (A$1.00)");
    const none = { ...credits, via: "none" as const, balance: 1 };
    expect(describeCost("full", none)).toContain("your balance is 1.00");
  });

  it("S7-C: a trialing evaluator sees the trial strip (days left, used count, cancel date, Manage billing) and the trial quota wording", async () => {
    const endsAt = new Date(Date.now() + 5 * 86_400_000 + 60_000).toISOString();
    const trial = { active: true, ends_at: endsAt, started_at: "2026-09-10T00:00:00.000Z", allowance: 1, used: 0, plan_id: "investor_angel" };
    getReportQuotaMock.mockResolvedValue({ limit: 1, used: 0, remaining: 1, unlimited: false, configured: true, trial });
    const { formatTrialEndDate, buildTrialReportBannerCopy } = await import("./trial-report-banner");
    const endDate = formatTrialEndDate(endsAt);

    let out = await html();
    expect(out).toContain('data-testid="trial-report-banner"');
    expect(out).toContain("Trial: 6 days left");
    expect(out).toContain("1 full Trust BizReport included (0/1 used)");
    expect(out).toContain(`Scout continues at A$79/mo on ${endDate} unless you cancel`);
    expect(out).toContain("Manage billing");
    expect(out).toContain("1 of 1 included Trust BizReport left in your trial, then 3 credits each");
    expect(out).not.toContain("left this month");

    // Used → 0 left; the pure builder is what the strip renders.
    getReportQuotaMock.mockResolvedValue({ limit: 1, used: 1, remaining: 0, unlimited: false, configured: true, trial: { ...trial, used: 1 } });
    out = await html();
    expect(out).toContain("1 full Trust BizReport included (1/1 used)");
    expect(out).toContain("0 of 1 included Trust BizReport left in your trial");
    const copy = buildTrialReportBannerCopy({ ...trial, used: 1, ends_at: "2026-09-17T00:00:00.000Z" }, new Date("2026-09-16T12:00:00.000Z"));
    expect(copy.segments).toEqual([
      "Trial: 1 day left",
      "1 full Trust BizReport included (1/1 used)",
      "Scout continues at A$79/mo on Thu 17 Sep unless you cancel",
    ]);
    expect(copy.text).toBe(copy.segments.join(" · "));

    // Not trialing → no strip, monthly wording back.
    getReportQuotaMock.mockResolvedValue({ limit: 10, used: 3, remaining: 7, unlimited: false, configured: true, trial: { ...trial, active: false } });
    out = await html();
    expect(out).not.toContain('data-testid="trial-report-banner"');
    expect(out).toContain("7 of 10 included Trust BizReports left this month");
  });

  it("S7-C: the confirm dialog says Included in your trial, then charged to credits once the 1 is used", async () => {
    const { describeCost, describeResult } = await import("./report-dialog");
    const trial = { active: true, ends_at: "2026-09-17T00:00:00.000Z", allowance: 1, used: 0 };
    const included = { via: "quota" as const, credits: 0, list_credits: 3, balance: 0, remaining_quota: 0, quota: { limit: 1, used: 0, remaining: 1, unlimited: false }, trial };
    expect(describeCost("full", included)).toBe("Included in your trial — 1 full Trust BizReport free, 0 left after this. No credits will be charged.");
    const spent = { ...included, via: "credits" as const, credits: 3, balance: 5, quota: { limit: 1, used: 1, remaining: 0, unlimited: false }, trial: { ...trial, used: 1 } };
    expect(describeCost("full", spent)).toBe("Your trial's 1 included report is used, so this run is charged to credits: 3 credits (A$3.00). Balance 5.00 → 2.00 after.");
    expect(describeCost("rescore", { ...spent, list_credits: 1, credits: 1 })).toContain("Re-scores are always pay-as-you-go: 1 credit (A$1.00)");
    expect(describeCost("full", { ...spent, via: "none" as const, balance: 1 })).toBe("This needs 3 credits (A$3.00); your balance is 1.00 and your trial's included report is used.");
    // Converted → the ordinary monthly wording.
    expect(describeCost("full", { ...included, remaining_quota: 6, quota: { limit: 10, used: 3, remaining: 7, unlimited: false }, trial: { ...trial, active: false } })).toBe(
      "Uses 1 of your 10 included reports this month (6 left after this). No credits will be charged.",
    );
    const base = { kind: "full" as const, credits_spent: 0, balance: 0, svi: 70, report_url: null, pdf_url: null, share_token: null };
    expect(describeResult({ ...base, via: "quota", remaining_quota: 0, trial })).toBe("Used your included trial report — further reports cost 3 credits (A$3) each.");
    expect(describeResult({ ...base, via: "quota", remaining_quota: 6 })).toBe("Used 1 included report (6 left this month).");
    expect(describeResult({ ...base, via: "credits", credits_spent: 3, balance: 2, remaining_quota: 0, trial })).toBe("3 credits charged (balance 2.00).");
  });

  it("T0273: Progress column shows Δ with ▲, a sparkline, the stage change and the deadline badge per startup", async () => {
    const out = await html();
    expect(out).toContain(">Progress</th>");
    expect((out.match(/data-testid="progress-cell"/g) ?? []).length).toBe(2);
    expect(out).toContain("▲ +9.4");
    expect(out).toContain('data-testid="sparkline"');
    expect(out).toContain("SVI trend 50 to 71.4");
    expect(out).toContain("Stage 3 → 4");
    expect(out).toContain("2 new evidence items");
    expect(out).toContain('data-testid="deadline-badge"');
    expect(out).toContain("2 deadlines · next in 14 days");
    expect(out).toContain("1 new match this week");
    // Beta has one/no snapshot → "New", no sparkline, no badge.
    expect(out).toContain(">New<");
    expect((out.match(/data-testid="sparkline"/g) ?? []).length).toBe(2); // row + panel mover
    expect((out.match(/data-testid="deadline-badge"/g) ?? []).length).toBe(1);
    expect(buildProgressMock).toHaveBeenCalledWith({ userId: "u-1" });
    expect(getEntitlementsMock).toHaveBeenCalledWith("investor_angel", "u-1");
  });

  it("T0273: Progress Radar panel lists movers + next deadlines for money_radar plans", async () => {
    const out = await html();
    expect(out).toContain('data-testid="progress-radar-panel"');
    expect(out).not.toContain('data-testid="progress-radar-teaser"');
    expect(out).toContain("1 of 2 startups moved this week");
    expect(out).toContain("1 new match");
    expect((out.match(/data-testid="mover"/g) ?? []).length).toBe(1);
    expect((out.match(/data-testid="panel-deadline"/g) ?? []).length).toBe(1);
    expect(out).toContain('href="https://www.nsw.gov.au/mvp"');
    expect(out).toContain("MVP Ventures");
    expect(out).toContain("Acme Robotics · in 14 days (2026-09-27)");
  });

  it("T0273: without money_radar the panel is the Scout 7-day trial teaser → /pricing?segment=evaluator", async () => {
    getEntitlementsMock.mockResolvedValue(SCOUT_FLAGS.filter((f) => f !== "money_radar"));
    const out = await html();
    expect(out).toContain('data-testid="progress-radar-teaser"');
    expect(out).not.toContain('data-testid="progress-radar-panel"');
    expect(out).toContain("Progress Radar is included in Scout — 7-day trial");
    expect(out).toContain("/pricing?segment=evaluator");
    // The Δ column still renders — the computation is free for every evaluator.
    expect(out).toContain("▲ +9.4");
  });

  it("T0273: a failed progress build degrades to dashes, never a crash", async () => {
    buildProgressMock.mockRejectedValue(new Error("boom"));
    const out = await html();
    expect(out).toContain("Acme Robotics");
    expect(out).toContain('data-testid="progress-radar-panel"');
    expect(out).toContain("0 of 0 startups moved this week");
    expect(out).not.toContain('data-testid="sparkline"');
  });

  it("T0272: Scout / Firm get no checkboxes, no Batch score button and no Cohorts section", async () => {
    const out = await html();
    expect(out).not.toContain('data-testid="batch-score-button"');
    expect(out).not.toContain("Select all startups");
    expect(out).not.toContain('data-testid="cohorts-section"');
    expect(listBatchesMock).toHaveBeenCalledWith("u-1");
  });

  it("T0272: Program gets row multi-select + Batch score and the Cohorts section with progress + links", async () => {
    getEntitlementsMock.mockResolvedValue(PROGRAM_FLAGS);
    listBatchesMock.mockResolvedValue(BATCHES);
    const out = await html();
    expect(out).toContain('data-testid="batch-score-button"');
    expect(out).toContain("Batch score");
    expect(out).toContain("Select all startups");
    expect(out).toContain("Select Acme Robotics for batch scoring");
    expect(out).toContain('data-testid="cohorts-section"');
    expect((out.match(/data-testid="cohort-batch"/g) ?? []).length).toBe(2);
    expect(out).toContain("Cohort 4 intake");
    expect(out).toContain("Scoring…");
    expect(out).toContain("5 of 12 scored · 1 failed");
    expect(out).toContain("Spring round");
    expect(out).toContain("3 of 3 scored");
    expect(out).toContain("/workspace/evaluations/cohort/b-1");
    expect(out).toContain("/api/evaluations/batch/b-1/export.csv");
    expect(out).toContain("/api/reports/quarterly?batch=b-1");
    expect(out).toContain("width:50%");
  });

  it("T0272: Program with no batches yet still sees the Cohorts section with its empty hint", async () => {
    getEntitlementsMock.mockResolvedValue(PROGRAM_FLAGS);
    const out = await html();
    expect(out).toContain('data-testid="cohorts-section"');
    expect(out).toContain("No batches yet");
  });

  it("does not load data for a non-evaluator and shows the claiming state when ?claim= is present", async () => {
    isEvaluatorUserMock.mockResolvedValue(false);
    const out = await html({ claim: "tok" });
    expect(listEvaluationsMock).not.toHaveBeenCalled();
    expect(listLastReportsMock).not.toHaveBeenCalled();
    expect(buildProgressMock).not.toHaveBeenCalled();
    expect(out).toContain("Claiming your startup");
    expect(out).not.toContain("data-testid=\"plan-limit-banner\"");
    expect(out).not.toContain("Add a startup");

    const plain = await html();
    expect(plain).toContain("This workspace is for evaluators.");
  });

  // ── S13-A: activation checklist under the trial strip + reminder deep link ──

  it("S13-A: a fresh trialing evaluator sees the checklist directly under the trial strip — 0 of 4, days left, 4 steps", async () => {
    listEvaluationsMock.mockResolvedValue([]);
    listLastReportsMock.mockResolvedValue({});
    getEvaluationQuotaMock.mockResolvedValue({ used: 0, limit: 25 });
    const endsAt = new Date(Date.now() + 5 * 86_400_000 + 60_000).toISOString();
    const trial = { active: true, ends_at: endsAt, started_at: "2026-09-10T00:00:00.000Z", allowance: 1, used: 0, plan_id: "investor_angel" };
    getReportQuotaMock.mockResolvedValue({ limit: 1, used: 0, remaining: 1, unlimited: false, configured: true, trial });

    const out = await html();
    expect(out).toContain('data-testid="evaluator-activation-checklist"');
    expect(out).toContain('data-completed="0"');
    expect(out).toContain("0 of 4 done");
    expect(out).toContain("6 days left in your trial");
    expect((out.match(/data-testid="evaluator-checklist-step"/g) ?? []).length).toBe(4);
    expect(out).toContain("Add the first startup you&#x27;re evaluating");
    expect(out).toContain("Run your included Trust BizReport");
    expect(out).toContain("Set your thesis so matching founders can find you");
    expect(out).toContain("Add a startup to your watchlist / cohort");
    expect(out).toContain('href="/workspace/investor/preferences"');
    // Placement: banner first, checklist next, then the plan-limit banner. The banner is not duplicated.
    const banner = out.indexOf('data-testid="trial-report-banner"');
    const checklist = out.indexOf('data-testid="evaluator-activation-checklist"');
    const planLimit = out.indexOf('data-testid="plan-limit-banner"');
    expect(banner).toBeGreaterThan(-1);
    expect(checklist).toBeGreaterThan(banner);
    expect(planLimit).toBeGreaterThan(checklist);
    expect((out.match(/data-testid="trial-report-banner"/g) ?? []).length).toBe(1);
    expect(getPrefsMock).toHaveBeenCalledWith("u-1");
    expect(getVisibilityMock).toHaveBeenCalledWith("u-1");
  });

  it("S13-A: progress derives from live data — 2 evaluations + 1 report + no thesis = 3 of 4; thesis set → hidden", async () => {
    let out = await html();
    expect(out).toContain('data-completed="3"');
    expect(out).toContain("3 of 4 done");
    expect(out).toMatch(/data-step="3" data-done="0"/);
    expect(out).not.toContain("left in your trial"); // not trialing → no days chip

    getPrefsMock.mockResolvedValue({ sectors: ["fintech"], stages: [], geos: [], cheque_band: "any", min_svi: null, updated_at: null });
    getVisibilityMock.mockResolvedValue({ evaluator: true, discoverable: true });
    out = await html();
    expect(out).not.toContain('data-testid="evaluator-activation-checklist"');

    // Sectors without discoverability is NOT done.
    getVisibilityMock.mockResolvedValue({ evaluator: true, discoverable: false });
    out = await html();
    expect(out).toContain('data-completed="3"');
  });

  it("S13-A: a failed prefs / visibility read degrades to 'thesis not set' rather than a crash", async () => {
    getPrefsMock.mockRejectedValue(new Error("db down"));
    getVisibilityMock.mockRejectedValue(new Error("db down"));
    const out = await html();
    expect(out).toContain('data-testid="evaluator-activation-checklist"');
    expect(out).toContain('data-completed="3"');
  });

  it("S13-A: founder personas never see the checklist and the thesis lookups are not made", async () => {
    isEvaluatorUserMock.mockResolvedValue(false);
    const out = await html();
    expect(out).not.toContain('data-testid="evaluator-activation-checklist"');
    expect(getPrefsMock).not.toHaveBeenCalled();
    expect(getVisibilityMock).not.toHaveBeenCalled();
  });

  it("S13-A: ?from=trial_reminder opens the Trust BizReport dialog on the first evaluation", async () => {
    const out = await html({ from: "trial_reminder" });
    expect(out).toContain('data-from="trial_reminder"');
    expect(out).toContain('data-testid="report-dialog"');
    expect(out).toContain("Acme Robotics"); // first row is the dialog's startup
    expect((out.match(/data-testid="report-dialog"/g) ?? []).length).toBe(1);
  });

  it("S13-A: without ?from= (or another value / no evaluations / founder) the dialog stays closed", async () => {
    for (const search of [{}, { from: "email" }]) {
      const out = await html(search);
      expect(out).not.toContain('data-from="trial_reminder"');
      expect(out).not.toContain('data-testid="report-dialog"');
    }
    listEvaluationsMock.mockResolvedValue([]);
    expect(await html({ from: "trial_reminder" })).not.toContain('data-testid="report-dialog"');
    listEvaluationsMock.mockResolvedValue(ROWS);
    isEvaluatorUserMock.mockResolvedValue(false);
    expect(await html({ from: "trial_reminder" })).not.toContain('data-testid="report-dialog"');
  });
});
