import type React from "react";
import { renderToReadableStream } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Render test for /workspace/funding (T0244 + T0251) with the data layer mocked.
// Pins: login redirect; the free variant (prefilled intake + A$3 / Starter
// paywall hint, no tabs); the paid variant (eight tabs, latest report on the
// Grants tab, `?tab=` picks the initial tab, Events from program_type=event,
// Capital map sections + article links, Alerts kinds); the "no report yet"
// prompt for a paid founder without a row; T0251 — `?draft=<grantId>&kind=grant`
// opens the draft editor (Starter: 2 credits on the button; Growth: included),
// `kind=program` keeps the stub, and the Investors / Expert update tabs show
// locked cards for Starter and the live data for Growth.

vi.mock("server-only", () => ({}));
vi.mock("@/components/workspace/workspace-layout", () => ({
  WorkspaceLayout: ({ children }: { children: React.ReactNode }) => <div data-shell>{children}</div>,
}));

const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});
vi.mock("next/navigation", () => ({
  redirect: (url: string) => redirectMock(url),
  useRouter: () => ({ refresh: () => undefined, push: () => undefined }),
  usePathname: () => "/workspace/funding",
}));

const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUserMock() }));

const canMock = vi.fn();
vi.mock("@/lib/entitlements", () => ({ can: (u: unknown, f: string) => canMock(u, f) }));

const PROJECT = { id: "proj-1", userId: "u-1", name: "Acme Agtech", slug: "acme", description: "Soil sensors", industry: "AgTech", stage: 2, isDefault: true, archivedAt: null, createdAt: "", updatedAt: "", growth_phase_current: null };
vi.mock("@/lib/projects", () => ({
  getCurrentProjectIsSandbox: async () => false,
  getActiveProject: async () => PROJECT,
}));

const getGrantMock = vi.fn();
vi.mock("@/lib/funding/data", () => ({
  listGrants: async () => [{ id: "g1", last_verified_at: "2026-09-10" }, { id: "g2", last_verified_at: "2026-09-01" }],
  listPrograms: async () => [{ id: "p1", last_verified_at: "2026-09-05" }],
  getGrant: (id: string) => getGrantMock(id),
}));

// T0251 Growth extras — plan gate, investor reverse-match, quarterly note, draft row.
const growthMock = vi.fn();
vi.mock("@/lib/funding/growth-extras", () => ({ hasGrowthExtras: () => growthMock() }));
const investorsMock = vi.fn();
vi.mock("@/lib/funding/investor-match", () => ({ matchInvestorsForProject: (p: unknown) => investorsMock(p) }));
const refreshMock = vi.fn();
vi.mock("@/lib/funding/analysis-refresh", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/funding/analysis-refresh")>();
  return { ...orig, latestAnalysisRefresh: (u: string, p: string | null) => refreshMock(u, p) };
});
const latestDraftMock = vi.fn();
vi.mock("@/lib/funding/application-drafts", () => ({ latestGrantDraft: (...a: unknown[]) => latestDraftMock(...a) }));

const latestReportMock = vi.fn();
const eventsMock = vi.fn();
vi.mock("@/lib/funding/workspace", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/funding/workspace")>();
  return {
    ...orig,
    intakePrefillFor: async () => ({ description: "Acme Agtech — Soil sensors", state: "NSW", stage: "mvp", industry_tags: ["agtech_food"] }),
    latestFundingReportForUser: (u: string, p: string | null) => latestReportMock(u, p),
    listEventPrograms: (c: string | null) => eventsMock(c),
    latestSviTotalFor: async () => 62,
    listCapitalMapRows: async () => ({
      angel_group: [{ id: "a1", name: "Sydney Angels", program_type: "angel_group", city: "Sydney", official_url: "https://sydneyangels.net.au", funding_aud: 500000 }],
      vc: [],
      rd_advance_loan: [],
      advisory: [],
    }),
  };
});

// The client tab component is exercised through SSR (initial tab only).
const USER = {
  id: "u-1", email: "f@acme.io", displayName: "Fi", role: "user", plan: "founder_starter",
  createdAt: "", lastLoginAt: null, googleId: null, avatarUrl: null, discountPct: null,
  startupName: null, startupStage: null, industry: null, onboardingCompleted: true, startupGoals: null,
};

function grantRow() {
  return {
    id: "g1", name: "MVP Ventures", provider: null, level: "state", state: "NSW", funding_type: "matched_grant",
    amount_min_aud: 25000, amount_max_aud: 75000, amount_note: null, co_contribution: "1:1", stage_tags: ["mvp"],
    industry_tags: [], demographic_tags: [], eligibility: {}, application_window: null, opens_at: null,
    closes_at: "2026-11-30", lodgement_deadline: null, next_round_note: null, status: "open", superseded_by: null,
    exclude_from_matching: false, official_url: "https://www.investment.nsw.gov.au/mvp", source_url: null,
    summary: "s", how_to_apply: null, evidence_needed: [], last_verified_at: "2026-09-10", verified_by: "seed",
    status_confidence: "high", sources: null,
  };
}

const ROW = {
  id: "11111111-1111-4111-8111-111111111111",
  user_id: "u-1",
  project_id: "proj-1",
  intake: { description: "Soil sensors for grain farmers", state: "NSW", stage: "mvp", city: "Sydney" },
  grant_matches: [
    {
      kind: "grant", ref_id: "g1", name: "MVP Ventures", score: 82,
      breakdown: { stage: 30, industry: 20, amount: 12, demographic: 0, timing: 20 }, timing: "open_now",
      effective_status: "open", next_window: { kind: "dated", closes_at: "2026-11-30", days_until_close: 81, label: "closes 30 Nov 2026" },
      eligibility_checklist: [{ label: "HQ state", status: "pass" }], why: ["Fits MVP stage in NSW."], grant: grantRow(),
    },
  ],
  program_matches: [],
  timeline: [{ month: "2026-10", kind: "grant", ref_id: "g1", name: "MVP Ventures", action: "Lodge the EOI", lead_time_days: 30, deadline: "2026-11-30", why: "x" }],
  narrative_md: null,
  status: "ready",
  meta: { today: "2026-09-10", actions: ["Lodge the MVP Ventures EOI"] },
  created_at: "2026-09-10T00:00:00Z",
  updated_at: "2026-09-10T00:00:00Z",
};

const EVENT = {
  id: "e1", name: "Sydney Startup Pitch Night", operator: "Fishburners", program_type: "event", city: "Sydney", capital: "Sydney", state: "NSW",
  venue: null, stage_tags: [], industry_tags: [], demographic_tags: [], length_weeks: null, intake_months: [], applications_open: null,
  applications_close: "2026-10-15", next_cohort_start: null, benefits: [], funding_aud: null, equity_pct: null, cost_to_founder: null,
  eligibility: {}, status: "open", official_url: "https://fishburners.org/pitch", summary: "Monthly pitch night.", last_verified_at: "2026-09-10",
  verified_by: "seed", status_confidence: "high", created_at: "", updated_at: "",
};

async function html(search: Record<string, string> = {}): Promise<string> {
  const { default: Page } = await import("./page");
  const el = await Page({ searchParams: Promise.resolve(search) });
  const stream = await renderToReadableStream(el);
  await stream.allReady;
  return (await new Response(stream).text()).replace(/<!-- -->/g, "");
}

beforeEach(() => {
  getCurrentUserMock.mockReset().mockResolvedValue(USER);
  canMock.mockReset().mockResolvedValue(true);
  latestReportMock.mockReset().mockResolvedValue(ROW);
  eventsMock.mockReset().mockResolvedValue([EVENT]);
  redirectMock.mockClear();
  getGrantMock.mockReset().mockResolvedValue(grantRow());
  growthMock.mockReset().mockResolvedValue(false);
  investorsMock.mockReset().mockResolvedValue([]);
  refreshMock.mockReset().mockResolvedValue(null);
  latestDraftMock.mockReset().mockResolvedValue(null);
});

describe("/workspace/funding (T0244)", () => {
  it("redirects signed-out visitors to login with next=", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    await expect(html()).rejects.toThrow("REDIRECT:/auth/login?next=/workspace/funding");
  });

  it("free founder: prefilled intake + A$3 / Starter hint, no tabs, no report lookup", async () => {
    canMock.mockResolvedValue(false);
    const out = await html();
    expect(canMock).toHaveBeenCalledWith(expect.objectContaining({ id: "u-1", plan: "founder_starter" }), "grant_finder");
    expect(out).toContain('data-plan-included="0"');
    expect(out).toContain("data-paywall-hint");
    expect(out).toContain("<strong>A$3</strong>");
    expect(out).toContain("Starter A$29/mo");
    expect(out).not.toContain("data-funding-workspace");
    expect(out).toContain("data-funding-intake");
    expect(out).toContain("Acme Agtech — Soil sensors");
    expect(out).toContain('value="NSW" selected');
    expect(out).toContain('name="stage" checked="" value="mvp"');
    expect(out).toContain("We prefilled what we know about this startup");
    expect(out).toContain("2 grants and 1 programs are open");
    expect(latestReportMock).not.toHaveBeenCalled();
    expect(out).toContain('data-surface="funding_directory"');
  });

  it("paid founder: eight tabs with the latest report on Grants, plus the intake to re-run", async () => {
    const out = await html();
    expect(out).toContain('data-plan-included="1"');
    expect(out).toContain('data-funding-workspace');
    expect(out).toContain('data-tab="grants"');
    for (const t of ["Grants", "Programs", "Events", "Timeline", "Capital map", "Investors", "Expert update", "Alerts"]) {
      expect(out).toContain(`>${t}</button>`);
    }
    expect(latestReportMock).toHaveBeenCalledWith("u-1", "proj-1");
    expect(out).toContain('data-grant="g1"');
    expect(out).toContain("MVP Ventures");
    expect(out).toContain('data-deadline-status="open"');
    expect(out).toContain("Draft application (credits)");
    expect(out).toContain(`href="/funding/report/${ROW.id}"`);
    expect(out).toContain("data-funding-intake");
    expect(out).not.toContain("data-paywall-hint");
    // Events are looked up for the report's capital.
    expect(eventsMock).toHaveBeenCalledWith("Sydney");
  });

  it("?tab= selects the initial tab — Timeline renders the Gantt, Events the event cards, Capital map the sections, Alerts the kinds", async () => {
    const timeline = await html({ tab: "timeline" });
    expect(timeline).toContain('data-tab="timeline"');
    expect(timeline).toContain("data-timeline-gantt");
    expect(timeline).toContain("Lodge the MVP Ventures EOI");

    const events = await html({ tab: "events" });
    expect(events).toContain('data-event="e1"');
    expect(events).toContain("Sydney Startup Pitch Night");
    expect(events).toContain('href="/funding/programs/sydney"');

    const capital = await html({ tab: "capital" });
    expect(capital).toContain("data-capital-map");
    expect(capital).toContain('data-capital-section="angel_group"');
    expect(capital).toContain("Sydney Angels");
    expect(capital).toContain('data-capital-section="rbf"');
    expect(capital).toContain('href="/insights/non-dilutive-funding-strategies-australia"');
    expect(capital).toContain('href="/insights/australian-vc-landscape-2026-who-is-investing"');

    const alerts = await html({ tab: "alerts" });
    expect(alerts).toContain("Coming with Money Radar");
    expect(alerts).toContain('data-alert-kind="deadline_14d"');
    expect(alerts).toContain('data-alert-kind="weekly_digest"');
    expect(alerts).toContain('href="/workspace/notifications"');

    const bogus = await html({ tab: "nope" });
    expect(bogus).toContain('data-tab="grants"');
  });

  it("mounts the compact MoneyRadarTile above the tabs for a paid founder (T0248), never for the free variant", async () => {
    const paid = await html();
    expect(paid).toContain("data-money-radar-tile");
    expect(paid).toContain('data-compact="1"');
    // money_radar resolves true from the mocked can() → subscriber (deadline inside 30 d? no: 81 d) → nothing_due.
    expect(canMock).toHaveBeenCalledWith(expect.objectContaining({ id: "u-1" }), "money_radar");
    expect(paid).toMatch(/data-state="(subscriber|nothing_due)"/);
    expect(paid.indexOf("data-money-radar-tile")).toBeLessThan(paid.indexOf("data-funding-workspace"));

    canMock.mockResolvedValue(false);
    const free = await html();
    expect(free).not.toContain("data-money-radar-tile");
  });

  it("?draft=<grantId>&kind=grant opens the draft editor — Starter shows the 2-credit price, Growth 'included' (T0251)", async () => {
    const starter = await html({ draft: "g1", kind: "grant" });
    expect(starter).toContain("data-grant-draft-editor");
    expect(starter).toContain('data-grant="g1"');
    expect(starter).toContain('data-cost="2"');
    expect(starter).toContain('data-unlimited="0"');
    expect(starter).toContain("Draft application: MVP Ventures");
    expect(starter).toContain("Drafting this application costs 2 credits. You confirm before we spend them.");
    expect(starter).toContain("Generate draft — 2 credits");
    expect(starter).not.toContain("data-draft-stub");
    // Seeded prompt from the fixture grant would be generic (no application_prompts) → generic note + 4 questions.
    expect(starter).toContain("data-draft-generic");
    expect(starter).toContain('data-prompt="project"');
    expect(starter).toContain('data-prompt="outcomes"');
    expect(latestDraftMock).toHaveBeenCalledWith("u-1", "proj-1", "g1");

    growthMock.mockResolvedValue(true);
    const growth = await html({ draft: "g1", kind: "grant" });
    expect(growth).toContain('data-cost="0"');
    expect(growth).toContain('data-unlimited="1"');
    expect(growth).toContain("Application drafts are unlimited on your plan.");
    expect(growth).toContain("Generate draft — included");
  });

  it("?draft=<ref>&kind=program keeps the acknowledgement stub; an unknown grant id falls back to the stub too", async () => {
    const program = await html({ draft: "p1", kind: "program" });
    expect(program).toContain("data-draft-stub");
    expect(program).toContain("Draft application for p1");
    expect(program).not.toContain("data-grant-draft-editor");

    getGrantMock.mockResolvedValueOnce(null);
    const unknown = await html({ draft: "zzz", kind: "grant" });
    expect(unknown).toContain("data-draft-stub");
  });

  it("prompts to run a match when no report exists", async () => {
    latestReportMock.mockResolvedValue(null);
    const none = await html();
    expect(none).toContain("data-no-report");
    expect(none).toContain("Run my match");
    expect(none).toContain("data-funding-intake");
  });

  it("Investors tab: Starter sees the locked card; Growth sees the ranked investors with a support-mailto intro (T0251)", async () => {
    const starter = await html({ tab: "investors" });
    expect(starter).toContain('data-growth="0"');
    expect(starter).toContain("data-investors");
    expect(starter).toContain("data-growth-locked");
    expect(starter).toContain("Investor matching is a Growth feature. Upgrade to see the investors whose thesis fits your startup.");
    expect(starter).toContain('href="/pricing"');
    expect(investorsMock).not.toHaveBeenCalled();

    growthMock.mockResolvedValue(true);
    investorsMock.mockResolvedValue([
      {
        investor_id: "inv-1", name: "Sydney Seed Fund", plan: "investor_angel", score: 100,
        reasons: ["Your SVI 62 clears their 50 floor", "Invests in agtech"], gaps: [], sectors: ["agtech"], stages: ["seed"], geos: ["AU"],
        cheque_band: "100k_500k", min_svi: 50,
        intro_href: "mailto:support@blockid.au?subject=Intro%20request%3A%20Acme%20Agtech%20%E2%86%92%20Sydney%20Seed%20Fund",
      },
    ]);
    const growth = await html({ tab: "investors" });
    expect(growth).toContain('data-growth="1"');
    expect(growth).toContain('data-count="1"');
    expect(growth).toContain('data-investor="inv-1"');
    expect(growth).toContain("Sydney Seed Fund");
    expect(growth).toContain("Fit 100");
    expect(growth).toContain("Invests in agtech");
    expect(growth).toContain("data-request-intro");
    expect(growth).toContain('href="mailto:support@blockid.au?subject=Intro%20request');
    expect(growth).not.toContain("data-growth-locked");
    // The match is built from the project + report + SVI.
    expect(investorsMock).toHaveBeenCalledWith(expect.objectContaining({ id: "proj-1", name: "Acme Agtech", industry: "AgTech", state: "NSW", svi: 62 }));

    investorsMock.mockResolvedValue([]);
    const empty = await html({ tab: "investors" });
    expect(empty).toContain("data-no-investors");
    expect(empty).toContain("No opted-in investor matches your profile yet.");
  });

  it("Expert update tab: locked for Starter; Growth sees the next-date note or the latest markdown (T0251)", async () => {
    const starter = await html({ tab: "refresh" });
    expect(starter).toContain("data-refresh");
    expect(starter).toContain("data-growth-locked");
    expect(starter).toContain("The quarterly expert update is a Growth feature.");
    expect(refreshMock).not.toHaveBeenCalled();

    growthMock.mockResolvedValue(true);
    const none = await html({ tab: "refresh" });
    expect(none).toContain("data-no-refresh");
    expect(none).toContain("Your first quarterly update lands on the 1st of next quarter.");
    expect(none).toMatch(/Next update: \d{4}-\d{2}-01/);

    refreshMock.mockResolvedValue({
      id: "r1", user_id: "u-1", project_id: "proj-1", quarter: "2026-Q3", changes: 3,
      body_md: "# What changed for Acme Agtech — 2026-Q3\n\n## 1. Your SVI\nSVI moved **54 → 61** (+7).\n", meta: {}, created_at: "2026-10-01T06:00:00Z",
    });
    const note = await html({ tab: "refresh" });
    expect(note).toContain('data-quarter="2026-Q3"');
    expect(note).toContain("3 changes");
    expect(note).toContain("data-refresh-body");
    expect(note).toContain("What changed for Acme Agtech — 2026-Q3");
    expect(note).toContain("<strong>54 → 61</strong>");
    expect(refreshMock).toHaveBeenCalledWith("u-1", "proj-1");
  });
});
