import type React from "react";
import { renderToReadableStream } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Render test for /workspace/investors — the Matches tab (S-IA2), which took
// the T0251 investor reverse-match over from the /workspace/funding tabs.
// Pins: login redirect with next=; Starter sees the locked Growth card (and
// no match / report / SVI lookups); Growth sees the ranked investors built
// from the project + latest report intake + SVI, with a support-only mailto
// intro; the never-blank empty state links to the programs directory for
// the founder's capital.

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
  usePathname: () => "/workspace/investors",
}));

const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUserMock() }));

const PROJECT = { id: "proj-1", userId: "u-1", name: "Acme Agtech", slug: "acme", description: "Soil sensors", industry: "AgTech", stage: 2, isDefault: true, archivedAt: null, createdAt: "", updatedAt: "", growth_phase_current: null };
vi.mock("@/lib/projects", () => ({
  getCurrentProjectIsSandbox: async () => false,
  getActiveProject: async () => PROJECT,
}));
vi.mock("@/lib/nav/founder-phase", () => ({ getFounderNavContext: async () => ({ navPhase: 2 }) }));

const growthMock = vi.fn();
vi.mock("@/lib/funding/growth-extras", () => ({ hasGrowthExtras: () => growthMock() }));
const investorsMock = vi.fn();
vi.mock("@/lib/funding/investor-match", () => ({ matchInvestorsForProject: (p: unknown) => investorsMock(p) }));
const taxonomyMock = vi.fn();
vi.mock("@/lib/taxonomy/store", () => ({ getTaxonomy: (id: string) => taxonomyMock(id) }));

const latestReportMock = vi.fn();
const sviMock = vi.fn();
vi.mock("@/lib/funding/workspace", () => ({
  intakePrefillFor: async () => ({ description: "Acme Agtech — Soil sensors", state: "NSW", stage: "mvp", industry_tags: ["agtech_food"] }),
  latestFundingReportForUser: (u: string, p: string | null) => latestReportMock(u, p),
  latestSviTotalFor: () => sviMock(),
}));

const USER = {
  id: "u-1", email: "f@acme.io", displayName: "Fi", role: "user", plan: "founder_starter",
  createdAt: "", lastLoginAt: null, googleId: null, avatarUrl: null, discountPct: null,
  startupName: null, startupStage: null, industry: null, onboardingCompleted: true, startupGoals: null,
};

const ROW = {
  id: "11111111-1111-4111-8111-111111111111",
  user_id: "u-1",
  guest_email: null,
  project_id: "proj-1",
  intake: { description: "Soil sensors for grain farmers", state: "NSW", stage: "mvp", city: "Sydney" },
  grant_matches: [],
  program_matches: [],
  timeline: [],
  narrative_md: null,
  credits_cost: 0,
  paid_via: "plan",
  stripe_session_id: null,
  status: "ready",
  meta: { today: "2026-09-10" },
  created_at: "2026-09-10T00:00:00Z",
  updated_at: "2026-09-10T00:00:00Z",
};

const MATCH = {
  investor_id: "inv-1", name: "Sydney Seed Fund", firm: "Sydney Angels", thesis: "Pre-seed agtech in ANZ", plan: "investor_angel", score: 100,
  reasons: ["Your SVI 62 clears their 50 floor", "Invests in agtech"], gaps: [], sectors: ["agtech"], stages: ["seed"], geos: ["AU"],
  cheque_band: "100k_500k", min_svi: 50,
  intro_href: "mailto:admin@blockid.au?subject=Intro%20request%3A%20Acme%20Agtech%20%E2%86%92%20Sydney%20Seed%20Fund",
};

async function html(): Promise<string> {
  const { default: Page } = await import("./page");
  const el = await Page();
  const stream = await renderToReadableStream(el);
  await stream.allReady;
  return (await new Response(stream).text()).replace(/<!-- -->/g, "");
}

beforeEach(() => {
  getCurrentUserMock.mockReset().mockResolvedValue(USER);
  redirectMock.mockClear();
  growthMock.mockReset().mockResolvedValue(false);
  investorsMock.mockReset().mockResolvedValue([]);
  latestReportMock.mockReset().mockResolvedValue(ROW);
  sviMock.mockReset().mockResolvedValue(62);
  taxonomyMock.mockReset().mockResolvedValue(null);
});

describe("/workspace/investors — Matches (S-IA2, T0251)", { timeout: 20_000 }, () => {
  it("redirects signed-out visitors to login with next=", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    await expect(html()).rejects.toThrow("REDIRECT:/auth/login?next=/workspace/investors");
  });

  it("Starter sees the locked card pointing at Growth; Growth sees the ranked investors with a support-mailto intro", async () => {
    const starter = await html();
    expect(starter).toContain("data-shell");
    expect(starter).toContain('data-workspace-investors');
    expect(starter).toContain('data-growth="0"');
    expect(starter).toContain("data-investors");
    expect(starter).toContain("data-growth-locked");
    expect(starter).toContain("Investor matching is a Growth feature. Upgrade to see the investors whose thesis fits your startup.");
    expect(starter).toContain('href="/pricing?feature=report.premium&amp;from=/workspace/investors"');
    expect(investorsMock).not.toHaveBeenCalled();
    expect(latestReportMock).not.toHaveBeenCalled();
    expect(sviMock).not.toHaveBeenCalled();

    growthMock.mockResolvedValue(true);
    investorsMock.mockResolvedValue([MATCH]);
    const growth = await html();
    expect(growth).toContain('data-growth="1"');
    expect(growth).toContain('data-count="1"');
    expect(growth).toContain('data-investor="inv-1"');
    expect(growth).toContain("Sydney Seed Fund");
    expect(growth).toContain("Fit 100");
    expect(growth).toContain("Invests in agtech");
    expect(growth).toContain("data-request-intro");
    expect(growth).toContain('href="mailto:admin@blockid.au?subject=Intro%20request');
    expect(growth).not.toContain("data-growth-locked");
    // The match is built from the project + report intake + SVI.
    expect(latestReportMock).toHaveBeenCalledWith("u-1", "proj-1");
    expect(investorsMock).toHaveBeenCalledWith(expect.objectContaining({ id: "proj-1", name: "Acme Agtech", industry: "AgTech", stage: "mvp", state: "NSW", svi: 62, taxonomy: null }));
    // G13 S-T2: the startup_taxonomy row rides along for the mandate direction (fit-v2).
    taxonomyMock.mockResolvedValue({ industry: "agtech_food", industry_secondary: null, business_model: "hardware_devices", customer_types: ["b2b"], stage_key: "seed", hq_state: "NSW", hq_country: "AU", geo_scope: "national", tags: [] });
    await html();
    expect(taxonomyMock).toHaveBeenCalledWith("proj-1");
    expect(investorsMock).toHaveBeenLastCalledWith(expect.objectContaining({ taxonomy: expect.objectContaining({ industry: "agtech_food", stage_key: "seed" }) }));

    investorsMock.mockResolvedValue([]);
    const empty = await html();
    expect(empty).toContain("data-no-investors");
    expect(empty).toContain("No opted-in investors match yet. We add investors every week — your profile is already in the queue.");
  });

  it("card shows name, firm, thesis + preference axes — never an email; the only mailto is support", async () => {
    growthMock.mockResolvedValue(true);
    investorsMock.mockResolvedValue([
      {
        investor_id: "inv-1", name: "Ann Angel", firm: "Sydney Angels", thesis: "Pre-seed agtech in ANZ, A$50k first cheques", plan: "investor_angel", score: 90,
        reasons: ["No SVI floor", "Invests in agtech", "Backs seed rounds", "Invests in AU"], gaps: [], sectors: ["agtech"], stages: ["seed"], geos: ["AU"],
        cheque_band: "25k_100k", min_svi: null,
        intro_href: "mailto:admin@blockid.au?subject=Intro%20request%3A%20Acme%20Agtech%20%E2%86%92%20Ann%20Angel",
        // A leaked field must never reach the markup even if a store ever returned it.
        email: "ann@example.com",
      },
    ]);
    const out = await html();
    expect(out).toContain("data-investor-name");
    expect(out).toContain("Ann Angel");
    expect(out).toContain("data-investor-firm");
    expect(out).toContain("Sydney Angels");
    expect(out).toContain("data-investor-thesis");
    expect(out).toContain("Pre-seed agtech in ANZ, A$50k first cheques");
    expect(out).toContain("Backs seed rounds");
    expect(out).toContain("Cheque: 25k 100k");
    expect(out).not.toContain("ann@example.com");
    // Every mailto on the page routes to support, never to the investor.
    const mailtos = out.match(/href="mailto:[^"]+"/g) ?? [];
    expect(mailtos.length).toBeGreaterThan(0);
    for (const m of mailtos) expect(m).toMatch(/^href="mailto:support@blockid\.au\?/);
  });

  it("empty state: queue copy + programs link for the founder's capital (never blank)", async () => {
    growthMock.mockResolvedValue(true);
    investorsMock.mockResolvedValue([]);
    const out = await html();
    expect(out).toContain('data-count="0"');
    expect(out).toContain("data-no-investors");
    expect(out).toContain("No opted-in investors match yet. We add investors every week — your profile is already in the queue.");
    expect(out).toContain("data-no-investors-programs");
    // ROW.intake.city = Sydney → /funding/programs/sydney.
    expect(out).toContain('href="/funding/programs/sydney"');
    expect(out).toContain("Meet investors at programs near you");
    expect(out).not.toContain("data-request-intro");
  });

  it("no report yet: falls back to the intake prefill's state and the project's numeric stage; the state alone still resolves a capital", async () => {
    growthMock.mockResolvedValue(true);
    latestReportMock.mockResolvedValue(null);
    const out = await html();
    expect(investorsMock).toHaveBeenCalledWith(expect.objectContaining({ id: "proj-1", industry: "AgTech", stage: 2, state: "NSW", svi: 62 }));
    // NSW alone still resolves a capital (Sydney) for the programs link.
    expect(out).toContain('href="/funding/programs/sydney"');
  });
});
