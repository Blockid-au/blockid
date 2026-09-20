import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Render test for /workspace/investors/access — the Access tab (S-IA2) that
// composes five former pages. Pins: login redirect with next=; the four
// always-on sections render in spec order with their anchors + h2s
// (investor-links → data-room → advisor → mentor-access); the Mentor invite
// section is omitted without a magic-link param and rendered (with the
// "invalid link" state when the request cannot be resolved) for
// ?grant_request= / ?upgrade= / ?renew= / ?cohort=; investor-link stat cards
// + status derivation; mentor grants split into active + history.

vi.mock("server-only", () => ({}));
vi.mock("@/components/workspace/workspace-layout", () => ({
  WorkspaceLayout: ({ children }: { children: React.ReactNode }) => <div data-shell>{children}</div>,
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
  useRouter: () => ({ refresh: () => undefined, push: () => undefined }),
}));

const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUserMock() }));
vi.mock("@/lib/projects", () => ({ getCurrentProjectIsSandbox: async () => false }));

// No DB in the test: the data-room + mentor-invite loaders degrade to empty /
// invalid, and the investor-links + mentor grants come from the mocks below.
vi.mock("@/lib/supabase", () => ({ isSupabaseConfigured: () => true, getSupabaseAdmin: () => null }));

const linksMock = vi.fn();
vi.mock("@/lib/investor-links", () => ({ listInvestorLinksForFounder: (...a: unknown[]) => linksMock(...a) }));
const grantsMock = vi.fn();
vi.mock("@/lib/mentor/access-tiers-server", () => ({ loadAllGrantsForFounder: (id: string) => grantsMock(id) }));

// Client islands + the shared tiles are stubbed — they are covered elsewhere.
vi.mock("./investor-links-client", () => ({
  InvestorLinksClient: ({ links }: { links: Array<{ status: string }> }) => <div data-links-client={links.map((l) => l.status).join(",")} />,
}));
vi.mock("./advisor-client", () => ({ AdvisorClient: () => <div data-advisor-client /> }));
vi.mock("./revoke-button", () => ({ RevokeButton: ({ grantId }: { grantId: string }) => <button data-revoke={grantId} /> }));
vi.mock("./form", () => ({ MentorInviteForm: () => <form data-invite-form /> }));
vi.mock("@/components/role/role-landing-intro", () => ({ RoleLandingIntro: ({ role }: { role: string }) => <div data-role-intro={role} /> }));
vi.mock("@/components/dashboard/sbom-license-risk-tile", () => ({ SbomLicenseRiskTile: () => <div data-sbom-tile /> }));
vi.mock("@/components/mentor/access-tier-badge", () => ({ AccessTierBadge: ({ tier }: { tier: string }) => <span data-tier={tier} /> }));

import { renderPage } from "@/test/founder-page-harness";

const USER = {
  id: "u-1", email: "f@acme.io", displayName: "Fi", role: "user", plan: "founder_starter",
  createdAt: "", lastLoginAt: null, googleId: null, avatarUrl: null, discountPct: null,
  startupName: null, startupStage: null, industry: null, onboardingCompleted: true, startupGoals: null,
};

const LINK = {
  id: "l1", token: "tok-1", slug: null, founderId: "u-1", label: "Blackbird", viewCount: 4, revokedAt: null, expiresAt: null, createdAt: "2026-09-01T00:00:00Z",
};

const GRANT = {
  id: "g1", mentor_user_id: "m1", reseller_id: "r1", founder_user_id: "u-1", project_id: null, tier: "attributed_only",
  granted_at: "2026-08-01T00:00:00Z", expires_at: null, revoked_at: null,
};

async function html(search: Record<string, string> = {}): Promise<string> {
  const { default: Page } = await import("./page");
  return renderPage(Page({ searchParams: Promise.resolve(search) }));
}

beforeEach(() => {
  getCurrentUserMock.mockReset().mockResolvedValue(USER);
  linksMock.mockReset().mockResolvedValue([]);
  grantsMock.mockReset().mockResolvedValue([]);
});

describe("/workspace/investors/access (S-IA2)", { timeout: 20_000 }, () => {
  it("anonymous → login with next", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    await expect(html()).rejects.toThrow("REDIRECT:/auth/login?next=/workspace/investors/access");
  });

  it("renders the four always-on sections in order with anchors + h2s, and no Mentor invite without a magic-link param", async () => {
    const out = await html();
    expect(out).toContain("data-shell");
    expect(out).toContain("data-workspace-investors-access");
    expect(out).toContain('data-mentor-invite="0"');
    const order = ["investor-links", "data-room", "advisor", "mentor-access"].map((id) => out.indexOf(`<section id="${id}"`));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    for (const [id, heading] of [
      ["investor-links", "Investor links"],
      ["data-room", "Data room access"],
      ["advisor", "Advisor portal"],
      ["mentor-access", "Mentor access"],
    ] as const) {
      expect(out).toMatch(new RegExp(`<h2 id="${id}-heading"[^>]*>\\s*${heading}\\s*</h2>`));
    }
    expect(out).not.toContain('<section id="mentor-invite"');
    expect(out).not.toContain("data-invite-form");
    // Section bodies: empty-state copy + the stubbed islands.
    expect(out).toContain('href="#investor-links"');
    expect(out).toContain('data-links-client=""');
    expect(out).toContain("No shared score links yet.");
    expect(out).toContain("data-sbom-tile");
    expect(out).toContain('data-role-intro="advisor"');
    expect(out).toContain("data-advisor-client");
    expect(out).toContain("No mentors have access.");
    expect(linksMock).toHaveBeenCalledWith("u-1", "f@acme.io");
    expect(grantsMock).toHaveBeenCalledWith("u-1");
  });

  it("investor links: stat cards + status derivation (active / revoked / expired)", async () => {
    linksMock.mockResolvedValue([
      LINK,
      { ...LINK, id: "l2", token: "tok-2", revokedAt: "2026-09-02T00:00:00Z", viewCount: 1 },
      { ...LINK, id: "l3", token: "tok-3", expiresAt: "2020-01-01T00:00:00Z", viewCount: 0 },
    ]);
    const out = await html();
    expect(out).toContain('data-links-client="active,revoked,expired"');
    expect(out).toMatch(/Total Links<\/p><p[^>]*>3</);
    expect(out).toMatch(/Active<\/p><p[^>]*>1</);
    expect(out).toMatch(/Total Views<\/p><p[^>]*>5</);
    expect(out).toMatch(/Revoked<\/p><p[^>]*>1</);
  });

  it("mentor access: active grants get the revoke button + tier links; revoked ones go to History", async () => {
    grantsMock.mockResolvedValue([GRANT, { ...GRANT, id: "g2", revoked_at: "2026-09-01T00:00:00Z" }]);
    const out = await html();
    expect(out).toContain('data-revoke="g1"');
    expect(out).not.toContain('data-revoke="g2"');
    expect(out).toContain('href="/workspace/investors/access?upgrade=g1"');
    expect(out).toContain("data-mentor-access-history");
    expect(out).toContain("revoked ");
  });

  it("mentor invite: rendered last for ?grant_request= (invalid-link state when unresolvable), and for upgrade / renew / cohort", async () => {
    const out = await html({ grant_request: "req-1" });
    expect(out).toContain('data-mentor-invite="1"');
    expect(out).toContain('<section id="mentor-invite"');
    expect(out).toMatch(/<h2 id="mentor-invite-heading"[^>]*>\s*Mentor invite\s*<\/h2>/);
    expect(out.indexOf('<section id="mentor-invite"')).toBeGreaterThan(out.indexOf('<section id="mentor-access"'));
    expect(out).toContain('href="#mentor-invite"');
    // No DB → the request cannot be resolved → the invalid-link state (never a crash).
    expect(out).toContain("This invite link is not valid.");
    expect(out).toContain('href="/workspace/investors/access#mentor-access"');
    for (const key of ["upgrade", "renew", "cohort"]) {
      expect(await html({ [key]: "x" })).toContain('<section id="mentor-invite"');
    }
  });
});
