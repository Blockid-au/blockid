// Lane-1 F4 (live QA 2026-09-13) — the account menu that replaces the 574 px
// inline cluster below `sm`. G13-W1-IA1 (D5): it now renders at every width
// (Account left the sidebar). G13-W5-IA5: its rows are the shared
// `lib/nav/user-menu.ts` list — the same rows the marketing header's avatar
// menu renders — with Billing kept as the "View billing" row under Credits.
// renderToStaticMarkup (no testing-library here): the closed state renders
// only the trigger; `initialOpen` exercises the open branch — name, the
// below-sm widgets, the account rows, Sign out.

import type React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/credit-balance", () => ({ CreditBalance: () => <span data-stub="credit-balance" /> }));
vi.mock("@/components/wallet/connect-wallet-button", () => ({ ConnectWalletButton: () => <span data-stub="wallet" /> }));
vi.mock("@/components/auth/LogoutButton", () => ({
  LogoutButton: ({ children, className }: { children?: React.ReactNode; className?: string }) => (
    <button data-stub="logout" className={className}>{children}</button>
  ),
}));

import { HeaderAccountMenu, HeaderAvatar, USER_MENU_ITEMS, headerMenuItems } from "./header-account-menu";
import { userMenuItems } from "@/lib/nav/user-menu";

const USER = { email: "founder@example.com", displayName: "Founder" };

describe("HeaderAccountMenu (lane-1 F4)", () => {
  it("renders at every width (no sm:hidden on the wrapper) and the trigger is a labelled menu button", () => {
    const html = renderToStaticMarkup(<HeaderAccountMenu user={USER} />);
    expect(html).toContain('data-testid="header-account-menu"');
    expect(html).not.toMatch(/class="[^"]*\bsm:hidden\b[^"]*"[^>]*data-testid="header-account-menu"/);
    expect(html).toContain('aria-label="Account menu"');
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain('aria-expanded="false"');
    // Closed: none of the widgets are mounted (no duplicate fetches at rest).
    expect(html).not.toContain('data-testid="header-account-menu-panel"');
    expect(html).not.toContain('data-stub="credit-balance"');
    expect(html).not.toContain("theme-toggle");
    expect(html).not.toContain('data-stub="logout"');
  });

  it("open: the panel carries the name, the below-sm widgets, the account rows and Sign out, right-aligned and capped to the viewport", () => {
    const html = renderToStaticMarkup(<HeaderAccountMenu user={USER} initialOpen />);
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('data-testid="header-account-menu-panel"');
    expect(html).toContain('role="menu"');
    expect(html).toContain("Founder");
    expect(html).toContain("founder@example.com");
    // Credits / wallet live in the menu only below sm (inline from sm up). G26: no theme toggle — light only.
    expect(html).toMatch(/class="sm:hidden"[^>]*data-testid="header-account-menu-mobile-widgets"|data-testid="header-account-menu-mobile-widgets"[^>]*class="sm:hidden"/);
    expect(html).toContain('data-stub="credit-balance"');
    expect(html).toContain('data-stub="wallet"');
    expect(html).not.toContain("Theme");
    expect(html).toContain('data-stub="logout"');
    expect(html).toContain("Sign out");
    // S-IA5 — the shared list: New analysis · My score · My reports · Dashboard · Settings.
    expect(USER_MENU_ITEMS.map((i) => i.label)).toEqual(["New analysis", "My score", "My reports", "Dashboard", "Settings"]);
    for (const item of USER_MENU_ITEMS) {
      expect(html).toContain(`href="${item.href}"`);
      expect(html).toContain(`>${item.label}<`);
      expect(html).toContain(`data-user-menu-item="${item.key}"`);
    }
    // Billing stays one click away (D5) as the "View billing" row under Credits.
    expect(html).toContain('href="/workspace/billing"');
    expect(html).toContain("View billing");
    expect((html.match(/role="menuitem"/g) ?? []).length).toBe(USER_MENU_ITEMS.length + 1);
    // Anchored to the right edge under the trigger, never wider than the viewport minus the gutters.
    expect(html).toMatch(/class="[^"]*\bright-0\b[^"]*\btop-full\b[^"]*"[^>]*data-testid="header-account-menu-panel"|data-testid="header-account-menu-panel"[^>]*class="[^"]*\bright-0\b/);
    expect(html).toContain("max-w-[calc(100vw-2rem)]");
  });

  // S-IA5: one list for both avatar menus — the workspace rows ARE the shared rows.
  it("renders exactly the shared user-menu rows (lib/nav/user-menu.ts), Dashboard = persona landing", () => {
    expect([...USER_MENU_ITEMS]).toEqual(userMenuItems("founder"));
    expect(headerMenuItems("investor_vc")).toEqual(userMenuItems("investor_vc"));
    const html = renderToStaticMarkup(<HeaderAccountMenu user={USER} persona="accelerator" initialOpen />);
    expect(html).toContain('href="/workspace/accelerator"');
    expect(html).not.toContain('href="/dashboard"');
    const founder = renderToStaticMarkup(<HeaderAccountMenu user={USER} initialOpen />);
    expect(founder).toContain('href="/dashboard"');
    expect(founder).toContain('href="/analyze"');
    expect(founder).not.toContain('href="/score"');
  });

  it("HeaderAvatar: image when present, else the initial", () => {
    expect(renderToStaticMarkup(<HeaderAvatar user={{ email: "x@y.z", avatarUrl: "https://img/a.png" }} />)).toContain('src="https://img/a.png"');
    expect(renderToStaticMarkup(<HeaderAvatar user={{ email: "zed@y.z" }} />)).toContain(">Z<");
    expect(renderToStaticMarkup(<HeaderAvatar user={USER} />)).toContain(">F<");
  });
});
