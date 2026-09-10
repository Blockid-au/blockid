import type React from "react";
import { renderToReadableStream } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Render test for /workspace/investor/preferences (T0251 follow-up): the
// "Let matching founders see me" opt-in switch (investor_discoverable) is
// rendered ONLY for evaluator personas, off by default, with the exact
// consent copy; founders never see it. Firm / thesis prefill from
// investor_prefs. Data layer mocked — the lib is covered in
// lib/investor-portal.test.ts and the route in api/investor/preferences.

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
  usePathname: () => "/workspace/investor/preferences",
}));

const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUserMock() }));

vi.mock("@/lib/projects", () => ({ getCurrentProjectIsSandbox: async () => false }));

const visibilityMock = vi.fn();
const prefsMock = vi.fn();
vi.mock("@/lib/investor-portal", () => ({
  FIRM_MAX_LEN: 80,
  THESIS_MAX_LEN: 200,
  getInvestorVisibility: (u: string) => visibilityMock(u),
  getInvestorPreferences: (u: string) => prefsMock(u),
}));

const USER = {
  id: "u-inv", email: "angel@example.com", displayName: "Ann Angel", role: "user", plan: "investor_angel",
  createdAt: "", lastLoginAt: null, googleId: null, avatarUrl: null, discountPct: null,
  startupName: null, startupStage: null, industry: null, onboardingCompleted: true, startupGoals: null,
};

const PREFS = { sectors: ["agtech"], stages: ["seed"], geos: ["AU"], cheque_band: "100k_500k", min_svi: 50, updated_at: null, firm: "Sydney Angels", thesis: "Pre-seed agtech in ANZ" };

async function html(): Promise<string> {
  const { default: Page } = await import("./page");
  const el = await Page();
  const stream = await renderToReadableStream(el);
  await stream.allReady;
  return (await new Response(stream).text()).replace(/<!-- -->/g, "");
}

beforeEach(() => {
  getCurrentUserMock.mockReset().mockResolvedValue(USER);
  visibilityMock.mockReset().mockResolvedValue({ evaluator: true, discoverable: false });
  prefsMock.mockReset().mockResolvedValue(PREFS);
  redirectMock.mockClear();
});

describe("/workspace/investor/preferences — investor_discoverable opt-in", () => {
  it("redirects signed-out visitors to login with next=", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    await expect(html()).rejects.toThrow("REDIRECT:/auth/login?next=/workspace/investor/preferences");
  });

  it("evaluator persona: renders the switch OFF by default with the consent copy and the never-share-email line", async () => {
    const out = await html();
    expect(out).toContain("data-investor-visibility");
    expect(out).toContain('data-discoverable="0"');
    expect(out).toContain('role="switch"');
    expect(out).toContain('aria-checked="false"');
    expect(out).toContain("Let matching founders see me");
    expect(out).toContain(
      "Growth founders whose sector, stage and location fit your preferences can see your name, firm and thesis and ask us for an intro. We never share your email.",
    );
    expect(visibilityMock).toHaveBeenCalledWith("u-inv");
    expect(prefsMock).toHaveBeenCalledWith("u-inv");
  });

  it("evaluator persona already opted in: switch renders ON with firm + thesis prefilled from investor_prefs", async () => {
    visibilityMock.mockResolvedValue({ evaluator: true, discoverable: true });
    const out = await html();
    expect(out).toContain('data-discoverable="1"');
    expect(out).toContain('aria-checked="true"');
    expect(out).toContain('value="Sydney Angels"');
    expect(out).toContain('value="Pre-seed agtech in ANZ"');
    expect(out).toContain('maxLength="80"');
    expect(out).toContain('maxLength="200"');
  });

  it("founder persona: no switch, no prefs read, the rest of the page still renders", async () => {
    visibilityMock.mockResolvedValue({ evaluator: false, discoverable: false });
    const out = await html();
    expect(out).not.toContain("data-investor-visibility");
    expect(out).not.toContain("Let matching founders see me");
    expect(out).not.toContain('role="switch"');
    expect(prefsMock).not.toHaveBeenCalled();
    expect(out).toContain("Investment preferences");
    expect(out).toContain("Fields covered");
  });

  it("the investor's email never lands in the markup", async () => {
    const out = await html();
    expect(out).not.toContain("angel@example.com");
  });
});
