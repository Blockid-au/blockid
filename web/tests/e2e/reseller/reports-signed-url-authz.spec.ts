// GET /api/reseller/reports/[month]/signed-url pre-read authorization contract —
// P10 dry-run per plan § P7_kpi_reports (P7.2_signed_url_storage), § C.6
// (retention window), § U.15.13 (D3-CISO-01), and § J.2 (Playwright must
// cover the reseller-admin endpoints so a regression in the auth → scope
// gate ordering surfaces before the endpoint mints a signed URL or writes
// the reseller_audit_log(download_report) row).
//
// Unlike the mutation routes under /api/reseller/** which run through
// gateRequireFeature("reseller.console") FIRST, this GET path uses
// getCurrentUser + scopedReseller directly (see route.ts:40-53). This
// matches the /api/reseller/customers/[id]/{reveal-email,drawer} pattern
// and the /api/reseller/credits/grant pattern — they all layer auth →
// scope BEFORE any per-endpoint validation. The response envelope is
// therefore { ok:false, reason:"unauthorised" } for the unauth row
// (route.ts:41-43) and { ok:false, reason:"no_membership" } for the
// non-reseller row (route.ts:48-52 folding ResellerScopeError.code).
//
// Two branches are harness-free and safe against staging (no month regex
// runs, no isMonthExposed check, no reseller_report_files SELECT, no
// storage.createSignedUrl call, no reseller_audit_log row written):
//
//   1. unauthenticated       — GET with no session          → 401 { ok:false, reason:"unauthorised" }
//                              (getCurrentUser null → returns BEFORE
//                              scopedReseller, month regex, isMonthExposed,
//                              reseller_report_files SELECT, storage sign,
//                              or reseller_audit_log write)
//   2. non_reseller_admin    — GET as a founder QA account  → 403 { ok:false, reason:"no_membership" }
//                              (scopedReseller finds no active row in
//                              reseller_admins for the founder's user_id →
//                              throws ResellerScopeError("no_membership") →
//                              route returns 403 BEFORE month regex,
//                              isMonthExposed, reseller_report_files SELECT,
//                              storage sign, or reseller_audit_log write)
//
// Route reference: web/src/app/api/reseller/reports/[month]/signed-url/route.ts
//   Line 40-43: getCurrentUser null            → 401 { reason: "unauthorised" }
//   Line 45-53: scopedReseller throws          → 403 { reason: err.code }
//                                                (no_membership | no_reseller | revoked)
//   Line 55-58: MONTH_RE.test(month) false     → 400 { reason: "invalid_month" }
//   Line 59-61: isMonthExposed(month) false    → 403 { reason: "not_exposed" }
//   Line 63-66: getSupabaseAdmin() null        → 503 { reason: "not_configured" }
//   Line 68-83: reseller_report_files lookup   → 500 lookup_failed / 404 not_found
//   Line 85-96: storage.createSignedUrl        → 500 sign_failed
//   Line 105-125: auditLog write               → 500 audit_failed
//   Line 127-137: 200 { ok:true, signed_url, filename, month, expires_at, ttl_seconds, bucket }
//
// Skips:
//   Row 2 skips at test-scope if the qa-founder-1 account is not seeded
//   (loginAs throws). Row 1 always runs — no harness required — so this
//   spec lights up in CI on the next `npx playwright test` pass alongside
//   admin-reseller-patch-authz.spec.ts, me-attribution.spec.ts,
//   drawer-authz.spec.ts, reveal-email-authz.spec.ts,
//   sandbox-setup-authz.spec.ts, and billing-authz.spec.ts.
//
// Deliberately out of scope (needs the reseller QA harness or per-test
// seeding which plan §J.2 forbids):
//   - invalid_month (400) — sits BEHIND scopedReseller (route.ts:55 vs :47),
//     so surfacing it needs a real reseller session PLUS a malformed
//     `[month]` segment (e.g. `2026-13`, `abc`).
//   - not_exposed (403) — sits BEHIND scopedReseller, needs a reseller
//     session PLUS a month outside the 12-month exposed window per
//     RETENTION_EXPOSED_MONTHS in web/src/lib/reseller/report-storage.ts.
//   - not_found (404) — needs a reseller session PLUS a valid month with
//     no reseller_report_files row (i.e. the monthly cron never ran for
//     that reseller/month tuple).
//   - not_configured (503) — needs SUPABASE_URL/SERVICE_ROLE unset which
//     would break every other Playwright spec in the same worker.
//   - sign_failed (500) — needs a broken Storage client which requires
//     per-test tampering plan §J.2 forbids.
//   - audit_failed (500) — needs the reseller_audit_log INSERT to fail
//     which requires per-test tampering plan §J.2 forbids.
//   - Happy path (200 with signed_url + filename + expires_at) — mints a
//     real signed URL against reseller-reports bucket + writes a
//     reseller_audit_log(action='download_report') row against the harness
//     reseller; folded into the temp-reseller mint fixture follow-up
//     alongside the deferred rows from ticks 94/95/96/97/98/99/100/101/102/103.
//
// Placeholder month used in the URL path: "2026-07" (valid MONTH_RE shape
// even though the month regex never runs for either row — row 1 bails in
// getCurrentUser, row 2 bails in scopedReseller). Using a valid-shape
// placeholder keeps the URL well-formed against Next.js dynamic segment
// matching and mirrors the exact YYYY-MM contract enforced by
// buildDownloadFilename / isMonthExposed in
// web/src/lib/reseller/report-storage.ts.

import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/accounts";

const NON_RESELLER_FOUNDER_EMAIL =
  process.env.QA_UNATTRIBUTED_FOUNDER_EMAIL ?? "qa-founder-1@blockid.au";

const PLACEHOLDER_MONTH = "2026-07";
const ROUTE = `/api/reseller/reports/${PLACEHOLDER_MONTH}/signed-url`;

test.describe("Reseller reports signed-url pre-read authorization — P10 dry-run", () => {
  test("unauthenticated — GET with no session returns 401 unauthorised", async ({
    request,
  }) => {
    const resp = await request.get(ROUTE);
    expect(
      resp.status(),
      `unauthenticated returned ${resp.status()} — expected 401 before scopedReseller, month regex, isMonthExposed, reseller_report_files SELECT, storage sign, or reseller_audit_log write. Body: ${await resp.text()}`,
    ).toBe(401);
    const body = (await resp.json()) as { ok: boolean; reason?: string };
    expect(
      body.ok,
      `unauthenticated body.ok should be false: ${JSON.stringify(body)}`,
    ).toBe(false);
    expect(body.reason).toBe("unauthorised");
  });

  test("non_reseller_admin — GET as a founder QA account returns 403 no_membership", async ({
    page,
  }) => {
    try {
      await loginAs(page, NON_RESELLER_FOUNDER_EMAIL);
    } catch (err) {
      test.skip(
        true,
        `Non-reseller founder account not seeded: ${(err as Error).message}. ` +
          `Run scripts/seed-test-users.mjs to populate /tmp/blockid-qa-accounts.txt.`,
      );
      return;
    }
    const resp = await page.request.get(ROUTE);
    expect(
      resp.status(),
      `non_reseller_admin returned ${resp.status()} — expected 403 no_membership before month regex, isMonthExposed, reseller_report_files SELECT, storage sign, or reseller_audit_log write. Body: ${await resp.text()}`,
    ).toBe(403);
    const body = (await resp.json()) as { ok: boolean; reason?: string };
    expect(
      body.ok,
      `non_reseller_admin body.ok should be false: ${JSON.stringify(body)}`,
    ).toBe(false);
    expect(body.reason).toBe("no_membership");
  });
});
