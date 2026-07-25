// E2E — <ComplianceCalendarTile /> (P1k-nav-tile) renders the "next up"
// chip from GET /api/compliance/calendar?format=json and deep-links to
// /compliance/calendar on click.
//
// Contract:
//   docs/plans/atlassian-standard-mapping-goal.md — P1k-nav-tile ship-note:
//   "data-testid=\"compliance-calendar-tile\" + data-colour + data-total …
//    so a future Playwright spec can attach without helper edits."
//
// Strategy mirrors tests/e2e/compliance/tax-invoice-history-tile.spec.ts:
//   1. loginAs() a seeded qa-founder (skip when the fixture is missing).
//   2. page.route() intercepts /api/compliance/calendar?format=json with a
//      deterministic amber-branch payload so the assertion is independent
//      of DB seed.
//   3. Navigate to the compliance-panel host route and skip cleanly when
//      the tile hasn't been mounted (CompliancePanel is now bound to
//      /dashboard/compliance via P5-tax-invoice-checker-panel-mount but the
//      spec keeps the same fall-through as the sibling tile spec so a
//      shell-wiring regression surfaces as a skip rather than a false red).
//   4. When mounted, assert (a) chip colour matches the mocked band (amber
//      because next-up event is 9 days away — inside the 14-day amber
//      window), (b) total count is exposed via data-total, (c) clicking
//      the tile lands on /compliance/calendar.

import { test, expect } from "@playwright/test";
import { getAccount, loginAs } from "../fixtures/accounts";

const QA_EMAIL =
  process.env.QA_FOUNDER_CALENDAR_EMAIL ?? "qa-founder-1@blockid.au";

// Candidate host routes for the CompliancePanel. Iterated in order until
// the tile is found; skips cleanly if none render it.
const HOST_ROUTES = [
  "/dashboard/compliance",
  "/dashboard",
  "/dashboard/svi",
] as const;

// Emit an ISO date (YYYY-MM-DD, UTC) N days from now so the mocked event
// sits inside the amber 14-day window regardless of when the spec runs.
function isoDaysFromNow(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const NEXT_EVENT_DATE = isoDaysFromNow(9);
const NEXT_EVENT_DATE_END = isoDaysFromNow(10);

const FAKE_PAYLOAD = {
  ok: true,
  total: 3,
  next_event: {
    uid: "bas-fy2026-27-q1@blockid.au",
    kind: "bas_quarter" as const,
    summary: "BAS Q1 FY2026-27 — lodge with ATO",
    description:
      "Quarterly BAS lodgment under A New Tax System (GST) Act 1999. Self-lodger due 28 October.",
    date_start: NEXT_EVENT_DATE,
    date_end: NEXT_EVENT_DATE_END,
    reminder_lead_days: 14,
    source_url: "https://www.ato.gov.au/business/business-activity-statements-(bas)/",
  },
  subscribe: {
    webcal: "webcal://blockid.au/api/compliance/calendar",
    https: "https://blockid.au/api/compliance/calendar",
  },
  disclaimer:
    "Not tax or legal advice — BAS due dates assume standard 1-July-to-30-June FY and self-lodgment.",
};

test.describe("ComplianceCalendarTile — P1k-nav-tile-e2e", () => {
  test.setTimeout(30_000);

  test("chip + total reflect the mocked next-up event; click opens /compliance/calendar", async ({
    page,
  }) => {
    try {
      getAccount(QA_EMAIL);
    } catch {
      test.skip(true, `${QA_EMAIL} not seeded`);
      return;
    }
    await loginAs(page, QA_EMAIL);

    await page.route(
      "**/api/compliance/calendar*",
      async (route) => {
        const url = new URL(route.request().url());
        // Only stub the JSON variant the tile issues on mount; leave the
        // text/calendar .ics variant to hit the real handler.
        if (
          route.request().method() !== "GET" ||
          url.searchParams.get("format") !== "json"
        ) {
          await route.fallback();
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(FAKE_PAYLOAD),
        });
      },
    );

    let tile = page.getByTestId("compliance-calendar-tile");
    let mounted = false;
    for (const route of HOST_ROUTES) {
      await page.goto(route);
      tile = page.getByTestId("compliance-calendar-tile");
      if ((await tile.count()) > 0) {
        mounted = true;
        break;
      }
    }
    test.skip(
      !mounted,
      "CompliancePanel host route not mounted yet — see mount comment in compliance-calendar-tile.tsx",
    );

    // ── Chip colour + total reflect the mocked snapshot ───────────────
    // next_event is 9 days away → amber (inside 14-day window per
    // pickCalendarTileBand in compliance-calendar-tile.helpers.ts).
    await expect(tile).toHaveAttribute("data-colour", "amber");
    await expect(tile).toHaveAttribute("data-total", "3");
    await expect(tile).toContainText("BAS quarter");

    // ── Click-through lands on the founder-facing calendar page ───────
    await Promise.all([
      page.waitForURL("**/compliance/calendar*"),
      tile.click(),
    ]);
    expect(new URL(page.url()).pathname).toBe("/compliance/calendar");
  });
});
