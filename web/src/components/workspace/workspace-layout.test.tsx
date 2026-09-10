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
vi.mock("@/components/workspace/recommended-next-step-tile", () => ({ RecommendedNextStepTile: Stub }));
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
vi.mock("@/components/workspace/onboarding-progress-bar", () => ({ OnboardingProgressBar: Stub }));
vi.mock("@/components/brand/logo", () => ({ Logo: Stub }));

import { WorkspaceLayout } from "./workspace-layout";
import { FounderNavContextProvider } from "./founder-nav-context";
import { resolveFounderNavPhase, type FounderNavContextValue } from "@/lib/nav/founder-phase";

const USER = { email: "founder@example.com", displayName: "Founder", role: "user" };

/** Group labels rendered inside the workspace nav landmark, in order. */
function visibleGroups(html: string): string[] {
  const start = html.indexOf('aria-label="Workspace navigation"');
  const end = html.indexOf("</nav>", start);
  const nav = html.slice(start, end);
  return [...nav.matchAll(/data-group-label="([^"]+)"/g)].map((m) => m[1]);
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
    // Phase 3 opens Validate (0) / Build (2) / Fundraise (3); Scale & Exit
    // (minPhase 4) is still hidden by decideGroupVisibility rule 2.
    expect(dashboard).toEqual(["Home", "Validate", "Build", "Fundraise", "Roles", "Account"]);
  });

  it("before S7-A the same page rendered the phase-0 menu (Build / Fundraise hidden)", () => {
    const legacy = renderWorkspacePageStyle(null);
    expect(legacy).not.toContain("Build");
    expect(legacy).not.toContain("Fundraise");
    expect(legacy).toContain("Validate");
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
