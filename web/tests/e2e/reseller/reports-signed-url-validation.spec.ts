// GET /api/reseller/reports/[month]/signed-url input-validation contract —
// P10 dry-run per plan § P7_kpi_reports (P7.2_signed_url_storage), § C.6
// (retention window = last 12 months exposed / 24 months hard-kept), § U.15.13
// (D3-CISO-01 scopedReseller chokepoint) and § J.2 (Playwright must cover the
// reseller-admin endpoints so a regression in the month regex or the
// isMonthExposed retention gate surfaces before the endpoint runs the
// reseller_report_files SELECT, storage.createSignedUrl, or the
// reseller_audit_log(download_report) write).
//
// Track A P7.2 shipped tick 33 (see reseller-module-goal.md
// P7.2_signed_url_storage). reports-signed-url-authz.spec.ts already probes
// the pre-scope auth chain (unauthenticated + non_reseller_admin returning
// 401 unauthorised / 403 no_membership). This tick lands the sibling
// validation-branch spec that mirrors reveal-email-validation (tick 117),
// drawer-validation (tick 118), credit-grant-validation and
// requests-validation — the two post-scope branches surfaced BEFORE the
// reseller_report_files SELECT, the storage-sign call, and the audit-log
// write, both exercised behind the QA_RESELLER_ADMIN_EMAIL harness so the
// reseller session is a real scope-passing account.
//
// Two branches are harness-only and safe against staging (no
// reseller_report_files SELECT fires, no storage.createSignedUrl call, no
// reseller_audit_log(download_report) row is written — the route short-
// circuits at route.ts:55-61 BEFORE getSupabaseAdmin, the metadata SELECT,
// the signed-URL mint, or the audit-log write):
//
//   1. invalid_month — [month] path segment fails MONTH_RE     → 400 { ok:false, reason:"invalid_month" }
//                      (MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
//                      "2026-13" passes the four-digit-dash-two-digit
//                      shape but fails the month-value alternation so
//                      Next.js dynamic segment matching still routes
//                      the request to the handler — the regex is the
//                      real gate, not the router.)
//   2. not_exposed   — [month] is valid MONTH_RE but older than the      → 403 { ok:false, reason:"not_exposed" }
//                      12-month exposed window per
//                      RETENTION_EXPOSED_MONTHS in
//                      web/src/lib/reseller/report-storage.ts.
//                      isMonthExposed compares monthKeyToInt(month) to
//                      monthKeyOffset(now, 11); "2024-01" is
//                      astronomically far outside the window so the
//                      row stays deterministic regardless of when the
//                      spec runs (it would only flip in ~2035 when
//                      2024-01 rejoins the last 12 months, which
//                      cannot happen).
//
// Route reference: web/src/app/api/reseller/reports/[month]/signed-url/route.ts
//   Line 40-43: getCurrentUser null                             → 401 { reason: "unauthorised" }
//   Line 45-53: scopedReseller throws                           → 403 { reason: err.code }
//   Line 55-58: MONTH_RE.test(month) false                      → 400 { reason: "invalid_month" }
//   Line 59-61: isMonthExposed(month) false                     → 403 { reason: "not_exposed" }
//   Line 63-66: getSupabaseAdmin() null                         → 503 { reason: "not_configured" }
//   Line 68-83: reseller_report_files SELECT + maybeSingle      → 500 lookup_failed / 404 not_found
//   Line 92-103: storage.createSignedUrl                        → 500 sign_failed
//   Line 105-125: db.auditLog(action='download_report')         → 500 audit_failed
//   Line 127-137: 200 { ok:true, signed_url, filename, month, expires_at, ttl_seconds, bucket }
//
// Rows 1-2 cover Line 55-61 exclusively. These are the two branches the
// reports-signed-url-authz.spec.ts header (tick, "Deliberately out of scope")
// explicitly listed as needing the reseller QA harness — this spec closes
// them.
//
// Deliberately out of scope (needs per-test seeding which plan §J.2 forbids
// or would break sibling specs sharing the same worker):
//   - not_configured (503) — needs SUPABASE_URL/SERVICE_ROLE unset which
//     would break every other Playwright spec in the same worker.
//   - not_found (404) — needs isMonthExposed to pass but the
//     reseller_report_files SELECT to return no row for the harness
//     reseller + a valid recent month. Requires per-test app_users +
//     reseller_report_files tampering plan §J.2 forbids.
//   - lookup_failed (500) — needs the reseller_report_files SELECT to
//     error, which requires per-test tampering plan §J.2 forbids.
//   - sign_failed (500) — needs a broken Storage client which requires
//     per-test tampering plan §J.2 forbids.
//   - audit_failed (500) — needs the reseller_audit_log INSERT to fail,
//     which requires per-test tampering plan §J.2 forbids.
//   - Happy path (200 with signed_url + filename + expires_at + bucket)
//     — mints a real signed URL against reseller-reports bucket + writes a
//     reseller_audit_log(action='download_report') row against the harness
//     reseller for a month with an actual CSV upserted by the monthly cron.
//     Belongs to the temp-reseller mint fixture follow-up alongside the
//     deferred happy-path rows from credit-grant / requests / drawer /
//     reveal-email / create-startup / sandbox-setup / me / admin-* specs
//     (ticks 94..118).

import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/accounts";
import { harnessSkipReason, loadResellerHarness } from "../fixtures/reseller";

// "2026-13" passes the four-digit-dash-two-digit shape at Next.js dynamic
// segment level so it reaches the handler, then fails MONTH_RE's month
// alternation (0[1-9]|1[0-2]) → 400 invalid_month. Using an out-of-range
// month value rather than a lexically bad string (e.g. "not-a-month") keeps
// the URL well-formed against Next.js router expectations and mirrors the
// convention used by reveal-email-validation / drawer-validation for their
// INVALID_ID sentinels — the actual gate is the route's own validator, not
// the router.
const INVALID_MONTH_SEGMENT = "2026-13";

// "2024-01" is far outside the 12-month exposed window (exposedMinKey today
// = ~2025-08 for a 2026-07 run). Choosing a month this deep in the past
// means the row stays deterministic even if the CI clock drifts by a few
// months — the retention gate will keep rejecting it for another eight-plus
// years. If the spec is still running past ~2034 someone should re-anchor
// this sentinel; a comment near the constant is a cheaper insurance policy
// than a computed helper because Playwright specs favour static URLs.
const NOT_EXPOSED_MONTH_SEGMENT = "2024-01";

test.describe("Reseller reports signed-url input validation — P10 dry-run", () => {
  const harness = loadResellerHarness();
  test.skip(!harness, harnessSkipReason());

  test("invalid_month — [month] path segment fails MONTH_RE returns 400 invalid_month", async ({
    page,
  }) => {
    await loginAs(page, harness!.admin.email);
    const resp = await page.request.get(
      `/api/reseller/reports/${INVALID_MONTH_SEGMENT}/signed-url`,
    );
    expect(
      resp.status(),
      `invalid_month returned ${resp.status()} — expected 400 before isMonthExposed, getSupabaseAdmin, reseller_report_files SELECT, storage sign, or reseller_audit_log write. Body: ${await resp.text()}`,
    ).toBe(400);
    const body = (await resp.json()) as { ok: boolean; reason?: string };
    expect(
      body.ok,
      `invalid_month body.ok should be false: ${JSON.stringify(body)}`,
    ).toBe(false);
    expect(body.reason).toBe("invalid_month");
  });

  test("not_exposed — [month] older than 12-month exposed window returns 403 not_exposed", async ({
    page,
  }) => {
    await loginAs(page, harness!.admin.email);
    const resp = await page.request.get(
      `/api/reseller/reports/${NOT_EXPOSED_MONTH_SEGMENT}/signed-url`,
    );
    expect(
      resp.status(),
      `not_exposed returned ${resp.status()} — expected 403 before getSupabaseAdmin, reseller_report_files SELECT, storage sign, or reseller_audit_log write. Body: ${await resp.text()}`,
    ).toBe(403);
    const body = (await resp.json()) as { ok: boolean; reason?: string };
    expect(
      body.ok,
      `not_exposed body.ok should be false: ${JSON.stringify(body)}`,
    ).toBe(false);
    expect(body.reason).toBe("not_exposed");
  });
});
