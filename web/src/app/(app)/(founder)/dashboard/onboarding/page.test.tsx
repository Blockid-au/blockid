// Render test for /dashboard/onboarding — hydration safety (release QA-2 F9).
//
// The WelcomeWizard renders the founder's email; QA-2 saw React #418 here
// because Cloudflare Email Obfuscation rewrote it (fixed in the root
// layout). Pins that the wizard's own server markup is hydratable and
// deterministic, plus the two redirects the page owns.

import { describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "@/test/fake-supabase";
import { renderPage } from "@/test/founder-page-harness";
import { assertDeterministicRender, assertHydratableNesting } from "@/test/hydration-guard";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

const auth = vi.hoisted(() => ({ user: null as null | Record<string, unknown> }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => auth.user }));

const db = vi.hoisted(() => ({ sb: null as unknown }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => db.sb }));

const USER = {
  id: "u1",
  email: "qa-founder@blockid.au",
  displayName: "Fran",
  role: "user",
  plan: "free",
  startupName: null,
  startupStage: null,
  industry: null,
  onboardingCompleted: false,
};

async function html(): Promise<string> {
  const { default: Page } = await import("./page");
  return renderPage(Page());
}

describe("/dashboard/onboarding — hydration safety", () => {
  it("renders the wizard for a fresh founder: hydratable + deterministic", async () => {
    auth.user = USER;
    db.sb = fakeSupabase({ app_users: [{ onboarding_completed: false }] });
    const out = await assertDeterministicRender(html);
    expect(out.length).toBeGreaterThan(500);
    assertHydratableNesting(out, "/dashboard/onboarding");
  });

  it("anonymous → login with next=", async () => {
    auth.user = null;
    await expect(html()).rejects.toThrow("REDIRECT:/auth/login?next=/dashboard/onboarding");
  });

  it("already onboarded → /dashboard", async () => {
    auth.user = USER;
    db.sb = fakeSupabase({ app_users: [{ onboarding_completed: true }] });
    await expect(html()).rejects.toThrow("REDIRECT:/dashboard");
  });
});
