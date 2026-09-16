// S7-A — SSR render test: a workspace page that does NOT pass `currentPhase`
// must show the same sidebar groups as /dashboard (which passes it) for the
// same founder, because both now read the one founder nav phase — the
// `(founder)` layout's `FounderNavContextProvider` for the former, the
// explicit prop for the latter. Also pins the pre-S7-A shape (no context,
// no prop → phase 0) so the fix is visible in the diff, and the fallback
// order prop > context > 0 at the component level.
//
// The visibility rules themselves are untouched; the chrome around the nav
// (topbar widgets, banners, paywall) is stubbed because it does network /
// browser work that has nothing to do with group gating.

import type React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/workspace/equity",
  useRouter: () => ({ push: () => undefined, refresh: () => undefined, replace: () => undefined }),
  useSearchParams: () => new URLSearchParams(),
}));

// Founder on the Growth plan: every tier gate passes, so the only thing
// that can hide a "now" group is the phase.
vi.mock("@/hooks/useEntitlement", () => ({
  useEntitlement: () => ({
    user: { id: "u-1", plan: "founder_growth", segment: "founder" },
    entitlements: [],
    trial: null,
    loading: false,
    can: () => true,
    refresh: () => undefined,
  }),
}));

// vi.mock factories are hoisted above these bindings — use vi.hoisted so
// the stubs exist when the factories run.
const { Stub, PassThrough } = vi.hoisted(() => ({
  Stub: () => null,
  PassThrough: ({ children }: { children?: React.ReactNode }) => children ?? null,
}));
vi.mock("@/components/ui/credit-balance", () => ({ CreditBalance: Stub }));
vi.mock("@/components/workspace/credit-badge", () => ({ CreditBadge: Stub }));
vi.mock("@/components/ui/project-switcher", () => ({ ProjectSwitcher: Stub }));
vi.mock("@/components/ui/theme-toggle", () => ({ ThemeToggle: Stub }));
vi.mock("@/components/wallet/connect-wallet-button", () => ({ ConnectWalletButton: Stub }));
vi.mock("@/components/ui/feedback-widget", () => ({ FeedbackWidget: Stub }));
vi.mock("@/components/ui/upgrade-prompt", () => ({ UpgradePrompt: Stub }));
vi.mock("@/components/notifications/notification-bell", () => ({ NotificationBell: Stub }));
vi.mock("@/components/workspace/trial-banner", () => ({ TrialBanner: Stub }));
vi.mock("@/components/workspace/product-tour", () => ({ ProductTour: Stub }));
vi.mock("@/components/product-tour/feature-spotlight", () => ({ FeatureSpotlight: Stub }));
vi.mock("@/components/workspace/reseller-pill", () => ({ ResellerPill: Stub }));
vi.mock("@/components/workspace/sandbox-banner", () => ({ SandboxBanner: Stub }));
vi.mock("@/components/upsell/trial-day-watcher", () => ({ TrialDayWatcher: Stub }));
vi.mock("@/components/upsell/upgrade-modal", () => ({ UpgradeModal: Stub }));
vi.mock("@/components/upsell/upgrade-banner", () => ({ UpgradeBanner: Stub }));
vi.mock("@/components/sales/paywall-nudge", () => ({ PaywallProvider: PassThrough }));
vi.mock("@/components/sales/trial-countdown-banner", () => ({ TrialCountdownBanner: Stub }));
vi.mock("@/components/auth/LogoutButton", () => ({ LogoutButton: Stub }));
vi.mock("@/components/brand/logo", () => ({ Logo: Stub }));

import { WorkspaceLayout, resolveNavGroup } from "./workspace-layout";
import { NAV_GROUPS_BY_ID } from "./nav-groups";
import { FounderNavContextProvider } from "./founder-nav-context";
import { resolveFounderNavPhase, type FounderNavContextValue } from "@/lib/nav/founder-phase";
import { PERSONAS } from "@/lib/nav/persona";

const USER = { email: "founder@example.com", displayName: "Founder", role: "user" };

/** Group labels rendered inside the workspace nav landmark, in order (near groups only — the Later-phases panel is closed on first paint). */
function visibleGroups(html: string): string[] {
  const start = html.indexOf('aria-label="Workspace navigation"');
  const end = html.indexOf("</nav>", start);
  const nav = html.slice(start, end);
  return [...nav.matchAll(/data-group-label="([^"]+)"/g)].map((m) => m[1]);
}

/** Sidebar links inside the nav landmark (footer Settings / Back to Home sit outside it). */
function navLinks(html: string): string[] {
  const start = html.indexOf('aria-label="Workspace navigation"');
  const end = html.indexOf("</nav>", start);
  const nav = html.slice(start, end);
  return [...nav.matchAll(/<a [^>]*href="([^"]+)"/g)].map((m) => m[1]);
}

function renderDashboardStyle(phase: number): string[] {
  // /dashboard passes the resolved phase explicitly.
  return visibleGroups(
    renderToStaticMarkup(
      <WorkspaceLayout user={USER} currentPhase={phase}>
        <div />
      </WorkspaceLayout>,
    ),
  );
}

function renderWorkspacePageStyle(ctx: FounderNavContextValue | null): string[] {
  // Any other founder page: no prop, wrapped by the (founder) layout's provider.
  const page = (
    <WorkspaceLayout user={USER}>
      <div />
    </WorkspaceLayout>
  );
  return visibleGroups(
    renderToStaticMarkup(ctx ? <FounderNavContextProvider value={ctx}>{page}</FounderNavContextProvider> : page),
  );
}

// A phase-3 founder: SVI 78 (band 3) with a declared legal_equity phase (3).
const PHASE_3: FounderNavContextValue = {
  navPhase: resolveFounderNavPhase({ svi: 78, growthPhaseId: "legal_equity" }),
  svi: 78,
  growthPhaseId: "legal_equity",
};

describe("WorkspaceLayout — one founder phase for every page (S7-A)", () => {
  it("phase-3 context resolves to 3", () => {
    expect(PHASE_3.navPhase).toBe(3);
  });

  it("a workspace page without the prop shows the same groups as /dashboard for the same founder", () => {
    const dashboard = renderDashboardStyle(3);
    const equityPage = renderWorkspacePageStyle(PHASE_3);
    expect(equityPage).toEqual(dashboard);
    // Nav v4: phase 3 opens Home · Prove · Money · Company (Company unlocks at band 2).
    expect(dashboard).toEqual(["Home", "Prove", "Money", "Company"]);
  });

  it("before S7-A the same page rendered the phase-0 menu (Company folded under Later phases)", () => {
    const legacy = renderWorkspacePageStyle(null);
    expect(legacy).not.toContain("Company");
    expect(legacy).toEqual(["Home", "Prove", "Money"]);
    expect(legacy).toEqual(renderDashboardStyle(0));
    expect(legacy).not.toEqual(renderWorkspacePageStyle(PHASE_3));
  });

  it("an explicit prop still wins over the context", () => {
    const withProp = visibleGroups(
      renderToStaticMarkup(
        <FounderNavContextProvider value={PHASE_3}>
          <WorkspaceLayout user={USER} currentPhase={0}>
            <div />
          </WorkspaceLayout>
        </FounderNavContextProvider>,
      ),
    );
    expect(withProp).toEqual(renderDashboardStyle(0));
  });

  it("the same founder gets the same menu on every phase, prop or context", () => {
    for (let phase = 0; phase <= 5; phase += 1) {
      const ctx: FounderNavContextValue = { navPhase: phase as FounderNavContextValue["navPhase"], svi: null, growthPhaseId: null };
      expect(renderWorkspacePageStyle(ctx), `phase ${phase}`).toEqual(renderDashboardStyle(phase));
    }
  });
});

describe("WorkspaceLayout — topbar fits 390 px (live QA lane 1 F4)", () => {
  const html = () =>
    renderToStaticMarkup(
      <WorkspaceLayout user={USER} currentPhase={0}>
        <div />
      </WorkspaceLayout>,
    );

  function header(): string {
    const out = html();
    const start = out.indexOf('data-testid="workspace-header"');
    const end = out.indexOf("</header>", start);
    expect(start).toBeGreaterThan(-1);
    return out.slice(start, end);
  }

  /** The class attribute of the first element carrying `data-testid="<id>"`. */
  function classesOf(fragment: string, id: string): string {
    const m = new RegExp(`<[a-z]+[^>]*class="([^"]*)"[^>]*data-testid="${id}"|<[a-z]+[^>]*data-testid="${id}"[^>]*class="([^"]*)"`).exec(fragment);
    expect(m, id).not.toBeNull();
    return (m?.[1] ?? m?.[2] ?? "").trim();
  }

  it("the left cluster can shrink (min-w-0) and the right cluster does not (shrink-0)", () => {
    const h = header();
    expect(h).toMatch(/class="[^"]*\bmin-w-0\b[^"]*"/);
    expect(classesOf(h, "header-actions")).toMatch(/\bshrink-0\b/);
  });

  it("below sm the inline wallet / credits / theme cluster is hidden; the avatar account menu renders at every width (D5)", () => {
    const h = header();
    const desktopActions = classesOf(h, "header-actions-desktop");
    expect(desktopActions).toMatch(/\bhidden\b/);
    expect(desktopActions).toMatch(/\bsm:flex\b/);
    // The old sm+ "name · Sign out" cluster is gone — the avatar menu is the one account surface.
    expect(h).not.toContain('data-testid="header-account-desktop"');
    expect(classesOf(h, "header-account-menu")).not.toMatch(/\bsm:hidden\b/);
    expect(h).toContain('aria-label="Account menu"');
    expect((h.match(/aria-label="Account menu"/g) ?? []).length).toBe(1);
  });

  it("every workspace page shares this header (the shell is the single source), so the fix applies to /workspace/* and /dashboard/*", () => {
    // Pages never render their own topbar — the shell is the only `workspace-header`.
    expect((html().match(/data-testid="workspace-header"/g) ?? []).length).toBe(1);
  });
});

// G13-W1-IA1 (D5) — nav v4 size contract (spec §A.1 / §A.2): a phase-0
// founder sees 3 groups / 10 links, a phase-5 founder 4 groups / 20 links,
// Company folds under "Later phases" below band 2, Account is not a group
// (Settings is a footer link outside the nav landmark) and nothing from the
// evaluator catalogue leaks into the founder sidebar.
describe("WorkspaceLayout — nav v4 size + persona contract", () => {
  const render = (phase: number) =>
    renderToStaticMarkup(
      <WorkspaceLayout user={USER} currentPhase={phase}>
        <div />
      </WorkspaceLayout>,
    );

  it("a phase-0 founder sees exactly Home · Prove · Money and ≤ 10 links (was 20+)", () => {
    const html = render(0);
    expect(visibleGroups(html)).toEqual(["Home", "Prove", "Money"]);
    const links = navLinks(html);
    expect(links.length).toBeLessThanOrEqual(10);
    expect(links).toEqual([
      "/dashboard", "/workspace/projects", "/analyze", "/workspace/reports",
      "/dashboard/svi", "/workspace/evidence", "/workspace/roadmap", "/startup-package",
      "/workspace/funding", "/workspace/investors",
    ]);
    // Company is previewed under the Later-phases disclosure, not rendered in place.
    expect(html).toMatch(/Later phases \(\d+\)/);
    expect(html).toContain('aria-controls="later-phases-panel"');
    expect(html).toContain('data-persona="founder"');
  });

  it("a phase-5 founder sees 4 groups / 20 links and no Later-phases disclosure", () => {
    const html = render(5);
    expect(visibleGroups(html)).toEqual(["Home", "Prove", "Money", "Company"]);
    expect(navLinks(html)).toHaveLength(20);
    expect(html).not.toContain("Later phases (");
  });

  it("groups unlock in catalogue order and never exceed 4 (Miller 7±2 guard)", () => {
    const order = PERSONAS.founder.navGroups;
    for (let phase = 0; phase <= 5; phase += 1) {
      const groups = visibleGroups(render(phase));
      expect(groups.length, `phase ${phase}`).toBeLessThanOrEqual(4);
      expect(groups[0]).toBe("Home");
      const ids = groups.map((g) => g.toLowerCase());
      expect(ids).toEqual(order.filter((id) => ids.includes(id)));
    }
  });

  it("Account is not a sidebar group: Settings is a footer link outside the nav landmark; no evaluator leaf leaks in", () => {
    const html = render(5);
    expect(visibleGroups(html)).not.toContain("Account");
    expect(navLinks(html)).not.toContain("/workspace/settings");
    const footerStart = html.indexOf('data-testid="sidebar-footer"');
    expect(footerStart).toBeGreaterThan(-1);
    expect(html.slice(footerStart)).toContain('href="/workspace/settings"');
    for (const leak of ["/workspace/investor/dealflow", "/workspace/evaluations", "/startup-index", "/workspace/investor/mandate"]) {
      expect(navLinks(html), leak).not.toContain(leak);
    }
  });

  it("resolveNavGroup: plan-locked rows name the plan (§D.1 rule 6), add-on rows lock instead of hiding, phase-gated leaves hide", () => {
    const free = { planId: "founder_free", segment: "founder" as const, currentPhase: 5, hasFeature: () => false };
    const company = resolveNavGroup(NAV_GROUPS_BY_ID.company, free);
    const esop = company.find((r) => r.item.href === "/workspace/esop")!;
    expect(esop.locked).toBe(true);
    expect(esop.addOn).toBe(true);
    expect(esop.lockTier).toBe("Starter");
    const exit = company.find((r) => r.item.href === "/workspace/exit")!;
    expect(exit.locked).toBe(true);
    expect(exit.lockTier).toBe("Growth");
    // Growth plan with the add-on flag: nothing in Company is locked.
    const growth = { planId: "founder_growth", segment: "founder" as const, currentPhase: 5, hasFeature: () => true };
    expect(resolveNavGroup(NAV_GROUPS_BY_ID.company, growth).every((r) => !r.locked)).toBe(true);
    // Phase gate: at band 0 Money shows 2 leaves, at band 4 all 6; preview shows all 6 regardless.
    expect(resolveNavGroup(NAV_GROUPS_BY_ID.money, { ...growth, currentPhase: 0 })).toHaveLength(2);
    expect(resolveNavGroup(NAV_GROUPS_BY_ID.money, { ...growth, currentPhase: 4 })).toHaveLength(6);
    expect(resolveNavGroup(NAV_GROUPS_BY_ID.money, { ...growth, currentPhase: 0 }, { preview: true })).toHaveLength(6);
    // Segment gate: a founder never resolves an evaluator leaf; an angel resolves 3 in Home.
    expect(resolveNavGroup(NAV_GROUPS_BY_ID["evaluator-home"], growth)).toHaveLength(0);
    expect(resolveNavGroup(NAV_GROUPS_BY_ID["evaluator-home"], { ...growth, segment: "investor_angel" })).toHaveLength(3);
    // The rendered free-tier markup names the plan, never a generic "Upgrade required".
    expect(render(5)).not.toContain("Upgrade required");
  });

  it("resolveNavGroup: while the plan is unknown (server render / entitlement still loading) nothing is plan-locked — real hrefs, no billing links", () => {
    const pending = { planId: "free", segment: "founder" as const, currentPhase: 5, hasFeature: () => false, planUnknown: true };
    const company = resolveNavGroup(NAV_GROUPS_BY_ID.company, pending);
    expect(company.length).toBeGreaterThan(0);
    expect(company.every((r) => !r.locked && !r.addOn && r.lockTier === null)).toBe(true);
    const money = resolveNavGroup(NAV_GROUPS_BY_ID.money, pending);
    expect(money.find((r) => r.item.href === "/dashboard/valuation")?.locked).toBe(false);
    // Phase and segment gates still apply — only the plan is deferred.
    expect(resolveNavGroup(NAV_GROUPS_BY_ID.money, { ...pending, currentPhase: 0 })).toHaveLength(2);
    expect(resolveNavGroup(NAV_GROUPS_BY_ID["evaluator-home"], pending)).toHaveLength(0);
  });
});
