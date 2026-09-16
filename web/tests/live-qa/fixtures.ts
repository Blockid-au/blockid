/**
 * Shared fixtures for the live-QA specs.
 *
 *   qa      — the run state (email, ids, plan, scratch) — read fresh per test
 *   api     — page.request bound to the founder session (storage state)
 *   guard() — attach a ConsoleGuard to a page and get its report later
 *   credits — { before(), assertUnchanged(label) } for the credits discipline
 *   growth  — skip the test unless the account has been elevated to Growth
 */
/* eslint-disable react-hooks/rules-of-hooks -- Playwright fixtures name their callback `use`; nothing here is React */
import { test as base, expect, type APIRequestContext, type Page } from "@playwright/test";
import { ConsoleGuard, type GuardOptions, type GuardReport } from "./lib/console-guard";
import { creditBalance, evidence, gotoWithSwapRetry } from "./lib/api";
import { readRunState, type RunState } from "./lib/run-state";
import { env } from "./lib/env";

interface Fixtures {
  qa: RunState;
  api: APIRequestContext;
  guard: (page: Page, opts?: GuardOptions) => { report: (label: string) => GuardReport };
  credits: {
    snapshot: () => Promise<number>;
    /** Assert the balance equals `before` and attach both numbers as evidence. */
    assertUnchanged: (before: number, label: string) => Promise<number>;
  };
  /** Marks the test Growth-only: skipped (not failed) when the plan was not elevated. */
  growth: void;
  /** Navigate and wait for the workspace shell; tolerates one deploy-swap 5xx. */
  visit: (path: string, opts?: { waitUntil?: "domcontentloaded" | "load" | "networkidle" }) => Promise<void>;
}

export const test = base.extend<Fixtures>({
  qa: async ({}, use) => {
    await use(readRunState());
  },
  api: async ({ page }, use) => {
    await use(page.request);
  },
  guard: async ({}, use) => {
    await use((page, opts) => {
      const g = new ConsoleGuard(page, opts);
      return { report: (label: string) => g.report(label) };
    });
  },
  credits: async ({ page }, use, testInfo) => {
    await use({
      snapshot: () => creditBalance(page.request),
      assertUnchanged: async (before, label) => {
        const after = await creditBalance(page.request);
        await evidence(testInfo, `credits — ${label}`, { before, after, spendOk: env.spendOk });
        expect(after, `credit balance must not change on ${label}`).toBe(before);
        return after;
      },
    });
  },
  growth: [
    async ({ qa }, use) => {
      test.skip(!qa.elevated, "Growth-gated journey — run with LIVE_QA_ELEVATE=1 LIVE_QA_ALLOW_DB=1 to cover it");
      await use();
    },
    { auto: false },
  ],
  visit: async ({ page }, use) => {
    await use(async (path, opts) => {
      const res = await gotoWithSwapRetry(page, path, opts);
      expect(res, `document response for ${path}`).not.toBeNull();
      expect(res!.status(), `HTTP status for ${path}`).toBeLessThan(500);
    });
  },
});

export { expect };

/** Public pages the suite visits for the per-page console / layout sweeps. */
export const WORKSPACE_PAGES = [
  "/workspace/finance/revenue",
  "/workspace/finance/dividends",
  "/workspace/raise/round",
  "/workspace/equity/cap-table",
  "/workspace/raise/term-sheet",
  "/workspace/exit",
  "/workspace/valuation",
  "/workspace/equity/secondary",
  "/workspace/investors",
  "/workspace/finance/expenses",
  "/workspace/exit/listing",
  "/workspace/exit/clean-room",
] as const;

/** Pages that redirect to /pricing unless the plan is Growth+. */
export const GROWTH_GATED_PAGES = new Set<string>([
  "/workspace/equity/cap-table",
  "/workspace/exit/listing",
  "/workspace/exit/clean-room",
  // requireTierForPage({ feature: "data_room.access" }) — Free → /pricing (S30-B).
  "/workspace/documents/data-room",
]);

/**
 * S30-B: money / third-party-data surfaces added to the per-page console +
 * network sweep (20-cross-cutting). Marketing pages here are public, so they
 * are NOT part of the logged-out 307 check (WORKSPACE_PAGES stays as is).
 * `/settings` does not exist (404) — Account settings live at /workspace/settings.
 * QA audit 2026-09-14 F2: `/`, `/showcase/atlassian/svi-report`, `/tools/funding-plan`
 * and `/tools/cap-table` joined so a React #418 (SVG `<title>` with array
 * children SSRs empty) is caught as a `pageerror` on the next sweep; `/analyze`
 * (F4, now inside MarketingShell) is swept for the same reason.
 */
export const SWEEP_EXTRA_PAGES = [
  "/",
  "/showcase/atlassian/svi-report",
  "/tools/funding-plan",
  "/tools/cap-table",
  "/analyze",
  "/funding",
  "/funding/grants",
  "/pricing",
  "/compare",
  "/solutions/advisor",
  "/workspace/evidence/connectors",
  "/workspace/documents/data-room",
  "/workspace/settings/audit",
  "/workspace/settings",
] as const;

/** Everything the console/network sweep visits. */
export const SWEEP_PAGES = [...WORKSPACE_PAGES, ...SWEEP_EXTRA_PAGES] as const;
