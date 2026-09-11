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
// S16-A — `?draft=<programId>&kind=program` opens the same editor for the
// program's prompts (intake window, program title, program_id lookup) and an
// unknown id renders the "not in the catalogue" note (no stub any more), and
// the Investors / Expert update tabs show locked cards for Starter and the
// live data for Growth.

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
const getProgramMock = vi.fn();
vi.mock("@/lib/funding/data", () => ({
  listGrants: async () => [{ id: "g1", last_verified_at: "2026-09-10" }, { id: "g2", last_verified_at: "2026-09-01" }],
  listPrograms: async () => [{ id: "p1", last_verified_at: "2026-09-05" }],
  getGrant: (id: string) => getGrantMock(id),
  getProgram: (id: string) => getProgramMock(id),
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
vi.mock("@/lib/funding/application-drafts", () => ({ latestDraftFor: (...a: unknown[]) => latestDraftMock(...a) }));

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

function programRow() {
  return {
    id: "p1", name: "Startmate Accelerator", operator: "Startmate", program_type: "accelerator", city: "Sydney", capital: "Sydney", state: "NSW",
    venue: null, stage_tags: ["mvp"], industry_tags: [], demographic_tags: [], length_weeks: 12, intake_months: [1, 7],
    applications_open: "2026-09", applications_close: "2026-11-08", next_cohort_start: "2027-01-25", benefits: ["4,000+ mentor network"],
    funding_aud: 120000, equity_pct: "≤8%", cost_to_founder: "free", eligibility: {}, status: "open",
    official_url: "https://www.startmate.com/accelerator", summary: "s", last_verified_at: "2026-09-10", verified_by: "seed", status_confidence: "high",
    application_prompts: [
      { id: "one_liner", question: "Describe your company in one sentence.", max_words: 40 },
      { id: "why_startmate", question: "Why Startmate, and why now?", max_words: 150 },
      { id: "milestones", question: "What are your goals for the next 12 months?", max_words: 150 },
    ],
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
  getProgramMock.mockReset().mockResolvedValue(programRow());
  growthMock.mockReset().mockResolvedValue(false);
  investorsMock.mockReset().mockResolvedValue([]);
  refreshMock.mockReset().mockResolvedValue(null);
  latestDraftMock.mockReset().mockResolvedValue(null);
});

// The first test pays the cold transform of the whole workspace import graph
// (tabs, drafts, investor match, radar tile); under parallel load that alone
// exceeds the 5 s default, so the suite gets a wider per-test budget.
describe("/workspace/funding (T0244)", { timeout: 20_000 }, () => {
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

  it("S8-B a11y: ARIA tabs with a roving tabindex (one tab stop), aria-selected on the active tab, a focusable named tabpanel", async () => {
    const out = await html({ tab: "timeline" });
    expect(out).toContain('role="tablist" aria-label="Money Radar"');
    expect((out.match(/role="tab"/g) ?? []).length).toBe(8);
    expect((out.match(/aria-selected="true"/g) ?? []).length).toBe(1);
    expect(out).toMatch(/id="funding-tab-btn-timeline" tabindex="0"/);
    expect((out.match(/role="tab"[^>]*tabindex="-1"/g) ?? []).length).toBe(7);
    expect(out).toMatch(/<div id="funding-tab-timeline" role="tabpanel" aria-labelledby="funding-tab-btn-timeline" tabindex="0"/);
    // Tabs are ≥ 44px tall touch targets and show a focus ring.
    expect(out).toContain("min-h-11");
    expect(out).toContain("focus-visible:outline-action");
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
    expect(latestDraftMock).toHaveBeenCalledWith("u-1", "proj-1", { kind: "grant", id: "g1" });
    expect(getProgramMock).not.toHaveBeenCalled();

    growthMock.mockResolvedValue(true);
    const growth = await html({ draft: "g1", kind: "grant" });
    expect(growth).toContain('data-cost="0"');
    expect(growth).toContain('data-unlimited="1"');
    expect(growth).toContain("Application drafts are unlimited on your plan.");
    expect(growth).toContain("Generate draft — included");
  });

  it("?draft=<programId>&kind=program opens the editor for the program's prompts — title, intake window, program_id lookup, no stub (S16-A)", async () => {
    const program = await html({ draft: "p1", kind: "program" });
    expect(program).not.toContain("data-draft-stub");
    expect(program).toContain("data-grant-draft-editor");
    expect(program).toContain('data-kind="program"');
    expect(program).toContain('data-program="p1"');
    expect(program).toContain("Application draft — Startmate Accelerator");
    expect(program).toContain("Applications open Sep 2026, close 8 Nov 2026; next cohort 25 Jan 2027.");
    expect(program).toContain('href="https://www.startmate.com/accelerator"');
    expect(program).toContain("Official program page");
    // Seeded prompts, not the generic set; Starter price on the button.
    expect(program).not.toContain("data-draft-generic");
    expect(program).toContain('data-prompt="one_liner"');
    expect(program).toContain('data-prompt="why_startmate"');
    expect(program).toContain('data-prompt="milestones"');
    expect(program).toContain("Generate draft — 2 credits");
    expect(getProgramMock).toHaveBeenCalledWith("p1");
    expect(getGrantMock).not.toHaveBeenCalled();
    expect(latestDraftMock).toHaveBeenCalledWith("u-1", "proj-1", { kind: "program", id: "p1" });

    // Unseeded program → generic 6-question accelerator set + fallback note.
    getProgramMock.mockResolvedValueOnce({ ...programRow(), application_prompts: [] });
    const generic = await html({ draft: "p1", kind: "program" });
    expect(generic).toContain("data-draft-generic");
    expect(generic).toContain('data-prompt="why_program"');
    expect(generic).toContain("six questions every accelerator form asks");

    // Growth → included.
    growthMock.mockResolvedValue(true);
    const growth = await html({ draft: "p1", kind: "program" });
    expect(growth).toContain('data-unlimited="1"');
    expect(growth).toContain("Generate draft — included");
  });

  it("an unknown grant or program id renders the 'not in the catalogue' note instead of an editor (stub removed)", async () => {
    getGrantMock.mockResolvedValueOnce(null);
    const unknownGrant = await html({ draft: "zzz", kind: "grant" });
    expect(unknownGrant).not.toContain("data-draft-stub");
    expect(unknownGrant).not.toContain("data-grant-draft-editor");
    expect(unknownGrant).toContain('data-draft-missing="zzz"');
    expect(unknownGrant).toContain("Nothing to draft yet.");

    getProgramMock.mockResolvedValueOnce(null);
    const unknownProgram = await html({ draft: "zzz", kind: "program" });
    expect(unknownProgram).toContain('data-draft-missing="zzz"');
    expect(unknownProgram).not.toContain("data-grant-draft-editor");
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
        investor_id: "inv-1", name: "Sydney Seed Fund", firm: "Sydney Angels", thesis: "Pre-seed agtech in ANZ", plan: "investor_angel", score: 100,
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
    expect(empty).toContain("No opted-in investors match yet. We add investors every week — your profile is already in the queue.");
  });

  it("Investors card (T0251 follow-up): shows name, firm, thesis + preference axes — never an email; the only mailto is support", async () => {
    growthMock.mockResolvedValue(true);
    investorsMock.mockResolvedValue([
      {
        investor_id: "inv-1", name: "Ann Angel", firm: "Sydney Angels", thesis: "Pre-seed agtech in ANZ, A$50k first cheques", plan: "investor_angel", score: 90,
        reasons: ["No SVI floor", "Invests in agtech", "Backs seed rounds", "Invests in AU"], gaps: [], sectors: ["agtech"], stages: ["seed"], geos: ["AU"],
        cheque_band: "25k_100k", min_svi: null,
        intro_href: "mailto:support@blockid.au?subject=Intro%20request%3A%20Acme%20Agtech%20%E2%86%92%20Ann%20Angel",
        // A leaked field must never reach the markup even if a store ever returned it.
        email: "ann@example.com",
      },
    ]);
    const out = await html({ tab: "investors" });
    expect(out).toContain('data-investor-name');
    expect(out).toContain("Ann Angel");
    expect(out).toContain('data-investor-firm');
    expect(out).toContain("Sydney Angels");
    expect(out).toContain('data-investor-thesis');
    expect(out).toContain("Pre-seed agtech in ANZ, A$50k first cheques");
    expect(out).toContain("Backs seed rounds");
    expect(out).toContain("Cheque: 25k 100k");
    expect(out).not.toContain("ann@example.com");
    // Every mailto on the tab routes to support, never to the investor.
    const mailtos = out.match(/href="mailto:[^"]+"/g) ?? [];
    expect(mailtos.length).toBeGreaterThan(0);
    for (const m of mailtos) expect(m).toMatch(/^href="mailto:support@blockid\.au\?/);
  });

  it("Investors empty state (T0251 follow-up): queue copy + programs link for the founder's capital (never blank)", async () => {
    growthMock.mockResolvedValue(true);
    investorsMock.mockResolvedValue([]);
    const out = await html({ tab: "investors" });
    expect(out).toContain('data-count="0"');
    expect(out).toContain("data-no-investors");
    expect(out).toContain("No opted-in investors match yet. We add investors every week — your profile is already in the queue.");
    expect(out).toContain("data-no-investors-programs");
    // ROW.intake.city = Sydney → /funding/programs/sydney.
    expect(out).toContain('href="/funding/programs/sydney"');
    expect(out).toContain("Meet investors at programs near you");
    expect(out).not.toContain("data-request-intro");
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

  // S11-A — the activation nudge (in-app + radar_setup drips) lands on
  // ?from=radar_setup: the 3-question intake moves to the top of the page,
  // open, with its first field focused. Server prop only — no client state.
  it("?from=radar_setup puts the intake first and autofocuses its first question (paid founder with no report)", async () => {
    latestReportMock.mockResolvedValue(null);
    const out = await html({ from: "radar_setup" });
    expect(out).toContain('data-from="radar_setup"');
    expect(out).toContain('data-intake-position="top"');
    expect(out).toContain('data-intake-autofocus="1"');
    expect(out).toMatch(/<textarea[^>]*id="fi-description"[^>]*autofocus/i);
    // Intake precedes the tile and the workspace prompt.
    expect(out.indexOf("data-funding-intake")).toBeLessThan(out.indexOf("data-money-radar-tile"));
    expect(out.indexOf("data-funding-intake")).toBeLessThan(out.indexOf("data-funding-workspace"));
    // Exactly one intake on the page.
    expect(out.match(/data-funding-intake/g)).toHaveLength(1);
  });

  it("without ?from= (or with another value) the intake stays under the tabs, unfocused", async () => {
    for (const search of [{}, { from: "email" }]) {
      const out = await html(search);
      expect(out).not.toContain('data-from="radar_setup"');
      expect(out).toContain('data-intake-position="bottom"');
      expect(out).not.toContain("data-intake-autofocus");
      expect(out).not.toMatch(/<textarea[^>]*autofocus/i);
      expect(out.indexOf("data-funding-workspace")).toBeLessThan(out.indexOf("data-funding-intake"));
    }
    // Free founder: the intake is the page, and the nudge still focuses it.
    canMock.mockResolvedValue(false);
    const free = await html({ from: "radar_setup" });
    expect(free).toContain('data-intake-autofocus="1"');
    expect(free).toContain("data-paywall-hint");
  });
});
