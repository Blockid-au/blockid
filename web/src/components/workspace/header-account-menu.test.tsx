// Lane-1 F4 (live QA 2026-09-13) — the mobile account menu that replaces the
// 574 px inline cluster below `sm`. renderToStaticMarkup (no testing-library
// here): the closed state renders only the trigger; `initialOpen` exercises
// the open branch — name, credit balance, wallet, theme toggle, Sign out.

import type React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/credit-balance", () => ({ CreditBalance: () => <span data-stub="credit-balance" /> }));
vi.mock("@/components/ui/theme-toggle", () => ({ ThemeToggle: () => <button data-stub="theme-toggle" aria-label="Switch to dark mode" /> }));
vi.mock("@/components/wallet/connect-wallet-button", () => ({ ConnectWalletButton: () => <span data-stub="wallet" /> }));
vi.mock("@/components/auth/LogoutButton", () => ({
  LogoutButton: ({ children, className }: { children?: React.ReactNode; className?: string }) => (
    <button data-stub="logout" className={className}>{children}</button>
  ),
}));

import { HeaderAccountMenu, HeaderAvatar } from "./header-account-menu";

const USER = { email: "founder@example.com", displayName: "Founder" };

describe("HeaderAccountMenu (lane-1 F4)", () => {
  it("is a below-sm element: the wrapper is sm:hidden and the trigger is a labelled menu button", () => {
    const html = renderToStaticMarkup(<HeaderAccountMenu user={USER} />);
    expect(html).toContain('data-testid="header-account-menu"');
    expect(html).toMatch(/class="[^"]*\bsm:hidden\b[^"]*"[^>]*data-testid="header-account-menu"/);
    expect(html).toContain('aria-label="Account menu"');
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain('aria-expanded="false"');
    // Closed: none of the widgets are mounted (no duplicate fetches at rest).
    expect(html).not.toContain('data-testid="header-account-menu-panel"');
    expect(html).not.toContain('data-stub="credit-balance"');
    expect(html).not.toContain('data-stub="theme-toggle"');
    expect(html).not.toContain('data-stub="logout"');
  });

  it("open: the panel carries the name, credit balance, wallet, theme toggle and Sign out, right-aligned and capped to the viewport", () => {
    const html = renderToStaticMarkup(<HeaderAccountMenu user={USER} initialOpen />);
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('data-testid="header-account-menu-panel"');
    expect(html).toContain('role="menu"');
    expect(html).toContain("Founder");
    expect(html).toContain("founder@example.com");
    expect(html).toContain('data-stub="credit-balance"');
    expect(html).toContain('data-stub="wallet"');
    expect(html).toContain('data-stub="theme-toggle"');
    expect(html).toContain('data-stub="logout"');
    expect(html).toContain("Sign out");
    // Anchored to the right edge under the trigger, never wider than the viewport minus the gutters.
    expect(html).toMatch(/class="[^"]*\bright-0\b[^"]*\btop-full\b[^"]*"[^>]*data-testid="header-account-menu-panel"|data-testid="header-account-menu-panel"[^>]*class="[^"]*\bright-0\b/);
    expect(html).toContain("max-w-[calc(100vw-2rem)]");
  });

  it("HeaderAvatar: image when present, else the initial", () => {
    expect(renderToStaticMarkup(<HeaderAvatar user={{ email: "x@y.z", avatarUrl: "https://img/a.png" }} />)).toContain('src="https://img/a.png"');
    expect(renderToStaticMarkup(<HeaderAvatar user={{ email: "zed@y.z" }} />)).toContain(">Z<");
    expect(renderToStaticMarkup(<HeaderAvatar user={USER} />)).toContain(">F<");
  });
});
