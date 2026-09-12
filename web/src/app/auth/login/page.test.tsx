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

// 20 s budget: this file is the first to import the full page (real Navbar +
// Footer + LoginForm) and the double deterministic render sits at ~0.7 s
// alone but tripped the 5 s default under a 45-file parallel run.
describe("/auth/login — hydration safety", { timeout: 20_000 }, () => {
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

// Release QA-1 #6 / #16 (2026-09-12): pa11y flagged the email + password
// inputs as having no accessible name (H91.InputEmail.Name /
// H91.InputPassword.Name / F68 — placeholder-only) and the page had no <h1>.
describe("/auth/login — accessible names + heading (release QA-1 #6/#16)", () => {
  it("signed out: exactly one <h1>, and every input sits inside a <label> with visible text", async () => {
    auth.user = null;
    const out = await html();
    expect(out.match(/<h1\b/g)?.length).toBe(1);
    expect(out).toMatch(/<h1[^>]*>Sign in to BlockID<\/h1>/);
    // Every <input> on the page is wrapped by a <label> whose first child is
    // the visible caption <span>, so its accessible name never depends on a
    // placeholder. `<label …><span …>Email address</span><input …>`.
    const inputs = out.match(/<input\b[^>]*>/g) ?? [];
    expect(inputs.length).toBeGreaterThanOrEqual(2);
    for (const tag of inputs) {
      const idx = out.indexOf(tag);
      const before = out.slice(Math.max(0, idx - 400), idx);
      const lastLabel = before.lastIndexOf("<label");
      const lastClose = before.lastIndexOf("</label>");
      expect(lastLabel, `input without a wrapping <label>: ${tag.slice(0, 80)}`).toBeGreaterThan(lastClose);
      expect(before.slice(lastLabel)).toMatch(/<span[^>]*>[^<]+<\/span>/);
    }
    // The old placeholder-only inputs are gone.
    expect(out).not.toMatch(/<input[^>]*placeholder="Email address"/);
    expect(out).not.toMatch(/<input[^>]*placeholder="Password"/);
    // Divider copy no longer uses the 1.48:1 surface-400 tint.
    expect(out).toMatch(/text-ink-500[^>]*>or continue with email/);
  });
});
