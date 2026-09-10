import type React from "react";
import { renderToReadableStream } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Render test for /workspace/funding (T0244) with the data layer mocked.
// Pins: login redirect; the free variant (prefilled intake + A$3 / Starter
// paywall hint, no tabs); the paid variant (six tabs, latest report on the
// Grants tab, `?tab=` picks the initial tab, `?draft=` stub, Events from
// program_type=event, Capital map sections + article links, Alerts kinds);
// and the "no report yet" prompt for a paid founder without a row.

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

vi.mock("@/lib/funding/data", () => ({
  listGrants: async () => [{ id: "g1", last_verified_at: "2026-09-10" }, { id: "g2", last_verified_at: "2026-09-01" }],
  listPrograms: async () => [{ id: "p1", last_verified_at: "2026-09-05" }],
}));

const latestReportMock = vi.fn();
const eventsMock = vi.fn();
vi.mock("@/lib/funding/workspace", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/funding/workspace")>();
  return {
    ...orig,
    intakePrefillFor: async () => ({ description: "Acme Agtech — Soil sensors", state: "NSW", stage: "mvp", industry_tags: ["agtech_food"] }),
    latestFundingReportForUser: (u: string, p: string | null) => latestReportMock(u, p),
    listEventPrograms: (c: string | null) => eventsMock(c),
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

  it("paid founder: six tabs with the latest report on Grants, plus the intake to re-run", async () => {
    const out = await html();
    expect(out).toContain('data-plan-included="1"');
    expect(out).toContain('data-funding-workspace');
    expect(out).toContain('data-tab="grants"');
    for (const t of ["Grants", "Programs", "Events", "Timeline", "Capital map", "Alerts"]) {
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

  it("acknowledges ?draft= as a stub and prompts to run a match when no report exists", async () => {
    const drafted = await html({ draft: "g1" });
    expect(drafted).toContain("data-draft-stub");
    expect(drafted).toContain("Draft application for g1");

    latestReportMock.mockResolvedValue(null);
    const none = await html();
    expect(none).toContain("data-no-report");
    expect(none).toContain("Run my match");
    expect(none).toContain("data-funding-intake");
  });
});
