// Render guard for NavV2's two skins (G13-W5-IA5). renderToStaticMarkup —
// the auth hook is stubbed to each of its three states so the signed-in
// menu (the shared lib/nav/user-menu.ts rows) and the skeleton both render.

import type React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { userMenuItems } from "@/lib/nav/user-menu";

const auth = vi.hoisted(() => ({ user: undefined as unknown }));
vi.mock("@/hooks/useAuthUser", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/hooks/useAuthUser")>();
  return { ...mod, useAuthUser: () => auth.user };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }), usePathname: () => "/" }));
vi.mock("@/components/auth/LogoutButton", () => ({
  LogoutButton: ({ children, className }: { children?: React.ReactNode; className?: string }) => (
    <button data-stub="logout" className={className}>{children}</button>
  ),
}));

import { NavV2 } from "./nav-v2";

beforeEach(() => {
  auth.user = undefined;
});

describe("NavV2 — one header, two skins", () => {
  it("default = dark island: one <header data-theme=dark> + nav[aria-label=Primary], skeleton while auth resolves", () => {
    const html = renderToStaticMarkup(<NavV2 />);
    expect((html.match(/<header\b/g) ?? []).length).toBe(1);
    expect(html).toMatch(/<header[^>]*data-theme="dark"[^>]*data-nav-variant="dark"/);
    expect(html).toContain('aria-label="Primary"');
    expect(html).toContain('data-testid="nav-v2-auth-skeleton"');
    expect(html).toMatch(/<header[^>]*class="[^"]*bg-brand-navy\/85/);
  });

  it("variant=light: same landmarks, light scope, semantic tokens on the bar", () => {
    const html = renderToStaticMarkup(<NavV2 variant="light" />);
    expect((html.match(/<header\b/g) ?? []).length).toBe(1);
    expect(html).toMatch(/<header[^>]*data-theme="light"[^>]*data-nav-variant="light"/);
    expect(html).toMatch(/<header[^>]*class="[^"]*bg-surface\/90/);
    expect(html).not.toMatch(/<header[^>]*class="[^"]*bg-brand-navy/);
    expect(html).toContain('aria-label="Primary"');
    // Same menu, same CTA — a skin never changes the IA.
    for (const label of ["Product", "For Programs", "For Investors", "For Founders", "Methodology", "Startup Index", "Pricing"]) {
      expect(html).toContain(label);
    }
  });

  it("signed out: Sign in + the Start a cohort CTA (G25); signed in: My workspace + the shared user-menu rows for the persona", () => {
    auth.user = null;
    const out = renderToStaticMarkup(<NavV2 />);
    expect(out).toContain('href="/auth/login"');
    expect(out).toMatch(
      /<a[^>]*data-cta-id="start_cohort"[^>]*href="\/signup\?segment=evaluator&amp;plan=accelerator_starter&amp;trial=1&amp;interval=annual"|<a[^>]*href="\/signup\?segment=evaluator&amp;plan=accelerator_starter&amp;trial=1&amp;interval=annual"[^>]*data-cta-id="start_cohort"/,
    );
    expect(out).toContain("Start a cohort");
    expect(out).not.toMatch(/pilot/i);
    expect(out).not.toContain("Score a startup");
    expect(out).not.toContain("Do you need money?");
    // No dropdown trigger in the bar any more — seven plain links.
    expect(out).not.toMatch(/aria-haspopup="menu"/);
    expect(out).not.toContain(">Solutions<");

    auth.user = { id: "u1", email: "vc@fund.test", displayName: "Val", plan: "investor_vc", persona: "investor_vc" };
    const html = renderToStaticMarkup(<NavV2 />);
    expect(html).toContain("My workspace");
    // The mobile sheet is closed and the desktop menu is closed at rest, so
    // the rows are not in the static markup — but the component must derive
    // them from the shared list for this persona (Dashboard → /workspace/investor).
    expect(userMenuItems("investor_vc").find((i) => i.key === "dashboard")?.href).toBe("/workspace/investor");
    expect(html).not.toContain('data-testid="nav-v2-auth-skeleton"');
  });
});
