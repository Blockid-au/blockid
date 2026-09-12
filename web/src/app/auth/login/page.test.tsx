// Render test for /auth/login — hydration safety (release QA-2 F9).
//
// QA-2 saw React #418 (text) here. Root cause was Cloudflare Email
// Obfuscation rewriting the footer's support@blockid.au into a data-cfemail
// <span> — fixed at the root layout (components/site/cloudflare-email-off).
// This test pins the page's own contribution: the full server markup
// (real Navbar + Footer + LoginForm, signed-out and signed-in) has no
// nesting the browser parser would relocate and renders identically twice
// under a fixed clock.

import { describe, expect, it, vi } from "vitest";
import { renderPage } from "@/test/founder-page-harness";
import { assertDeterministicRender, assertHydratableNesting } from "@/test/hydration-guard";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("next=%2Fdashboard&plan=growth"),
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
  usePathname: () => "/auth/login",
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

const auth = vi.hoisted(() => ({ user: null as null | Record<string, unknown> }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => auth.user }));

async function html(): Promise<string> {
  const { default: Page } = await import("./page");
  return renderPage(Page({ searchParams: Promise.resolve({ next: "/dashboard", plan: "growth" }) }));
}

describe("/auth/login — hydration safety", () => {
  it("signed out: form + footer email render, no relocated nesting, deterministic", async () => {
    auth.user = null;
    const out = await assertDeterministicRender(html);
    expect(out).toContain("Sign in to BlockID");
    expect(out).toContain('href="mailto:support@blockid.au"');
    assertHydratableNesting(out, "/auth/login signed-out");
  });

  it("already signed in: identity card + continue link, no relocated nesting", async () => {
    auth.user = { id: "u1", email: "founder@blockid.au", displayName: "Fran", plan: "growth" };
    const out = await html();
    expect(out).toContain("already signed in");
    expect(out).toContain('href="/dashboard"');
    assertHydratableNesting(out, "/auth/login signed-in");
  });
});
