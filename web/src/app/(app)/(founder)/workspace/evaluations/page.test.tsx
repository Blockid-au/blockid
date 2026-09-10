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

  it("does not load data for a non-evaluator and shows the claiming state when ?claim= is present", async () => {
    isEvaluatorUserMock.mockResolvedValue(false);
    const out = await html({ claim: "tok" });
    expect(listEvaluationsMock).not.toHaveBeenCalled();
    expect(listLastReportsMock).not.toHaveBeenCalled();
    expect(out).toContain("Claiming your startup");
    expect(out).not.toContain("data-testid=\"plan-limit-banner\"");
    expect(out).not.toContain("Add a startup");

    const plain = await html();
    expect(plain).toContain("This workspace is for evaluators.");
  });
});
