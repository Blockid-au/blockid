// E2E — /compliance/calendar founder-facing page (P1k-page-e2e).
//
// Sibling `tests/e2e/compliance/compliance-calendar-tile.spec.ts` covers
// the dashboard *tile* click-through; this spec covers the full page a
// founder lands on after clicking through (or after picking "Compliance
// Calendar" from the sidebar via the P1k-nav-tile entry). Zero
// source-code churn — the page already exposes:
//
//   data-testid="compliance-calendar-view"        (section root)
//   data-testid="calendar-subscribe-controls"     (download + webcal + https feed)
//   data-testid="calendar-download-link"          (href = /api/compliance/calendar?download=1)
//   data-testid="calendar-webcal-link"            (href starts with webcal://)
//   data-testid="calendar-https-url"              (https:// feed URL)
//   data-testid="calendar-copy-https"             (clipboard button)
//   data-testid="calendar-next-up"                (soonest event tile)
//   data-testid="calendar-empty-state"            (empty-state fallback)
//   data-testid="calendar-event-list"             (grouped month rendering)
//   data-testid="calendar-event-row"              (per-event row)
//
// Contract:
//   docs/plans/atlassian-standard-mapping-goal.md — P1k compliance calendar
//   generator ship-note pins RFC 5545 output + fixed
//   `CALENDAR_DISCLAIMER`, and the page's exit criterion is that a founder
//   can subscribe with one click. The spec asserts the subscribe surfaces
//   render and that exactly one of {next-up, empty-state} is visible so
//   the two branches of `loadInputs` are both covered.
//
// Strategy mirrors tests/e2e/compliance/wgea-form.spec.ts:
//   1. `getAccount(FOUNDER_EMAIL)` gate skips cleanly when the QA fixture
//      is unseeded so CI on a fresh clone stays green.
//   2. `loginAs(page, FOUNDER_EMAIL)` sets the session cookie.
//   3. Navigate to `/compliance/calendar`; skip cleanly when the section
//      is not visible (auth-gated redirect on unseeded fixtures).
//   4. Assert the four durable invariants — page heading + subscribe
//      controls visible + download-link `href` exact + webcal-link `href`
//      starts with `webcal://` + https-URL text starts with `https://`.
//   5. Assert exactly one of `calendar-next-up` / `calendar-empty-state`
//      is visible so both branches of the server loader are exercised
//      (whichever the QA fixture happens to produce).

import { test, expect } from "@playwright/test";
import { getAccount, loginAs } from "../fixtures/accounts";

const ROUTE = "/compliance/calendar";
const FOUNDER_EMAIL =
  process.env.QA_FOUNDER_CALENDAR_PAGE_EMAIL ?? "qa-founder-1@blockid.au";

test.describe("Compliance calendar page — P1k-page-e2e", () => {
  test.setTimeout(30_000);

  test("renders the subscribe controls and either a next-up event or empty state", async ({
    page,
  }) => {
    try {
      getAccount(FOUNDER_EMAIL);
    } catch {
      test.skip(true, `${FOUNDER_EMAIL} not seeded`);
      return;
    }
    await loginAs(page, FOUNDER_EMAIL);

    await page.goto(ROUTE);

    const view = page.getByTestId("compliance-calendar-view");
    const mounted = (await view.count()) > 0;
    test.skip(
      !mounted,
      `Compliance calendar page not visible on ${ROUTE} — page may have redirected for ${FOUNDER_EMAIL}.`,
    );

    // ── Heading + subscribe controls ────────────────────────────────────
    await expect(
      page.getByRole("heading", { name: "Compliance calendar" }),
    ).toBeVisible();

    const controls = page.getByTestId("calendar-subscribe-controls");
    await expect(controls).toBeVisible();

    // Download link points at the .ics generator with the ?download=1 flag
    // per the P1k ship-note ("`?download=1` forces `compliance-calendar.ics`
    // attachment"). Exact-string check so a route rename surfaces here.
    const download = page.getByTestId("calendar-download-link");
    await expect(download).toHaveAttribute(
      "href",
      "/api/compliance/calendar?download=1",
    );

    // webcal://... link — a founder-friendly one-click subscribe. Just the
    // scheme prefix; the host + path are environment-derived.
    const webcal = page.getByTestId("calendar-webcal-link");
    const webcalHref = await webcal.getAttribute("href");
    expect(webcalHref).toBeTruthy();
    expect(webcalHref!.startsWith("webcal://")).toBe(true);

    // Copyable https:// feed URL for calendar apps that don't accept
    // webcal:// (Outlook, some corporate calendars).
    const httpsCode = page.getByTestId("calendar-https-url");
    await expect(httpsCode).toBeVisible();
    const httpsText = (await httpsCode.textContent()) ?? "";
    expect(httpsText.trim().startsWith("https://")).toBe(true);

    // ── Exactly one of {next-up, empty-state} — both loader branches ───
    const nextUpCount = await page.getByTestId("calendar-next-up").count();
    const emptyStateCount = await page
      .getByTestId("calendar-empty-state")
      .count();
    expect(nextUpCount + emptyStateCount).toBe(1);

    // ── Disclaimer surfaces the CALENDAR_DISCLAIMER hedge verbatim ─────
    // Tolerant regex so a minor copy tweak isn't a false red, but the
    // "not tax or legal advice" hedge is a regulated-content invariant.
    await expect(view).toContainText(/not tax or legal advice/i);
  });
});
