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
import {
  harnessSkipReason,
  loadResellerHarness,
  loadTempReseller,
  tempResellerSkipReason,
  type TempResellerFixture,
} from "../fixtures/reseller";

// Mirrors web/src/lib/reseller/report-storage.ts::monthKeyOffset(now, 0)
// without importing the .ts across the Playwright/browser bundle boundary.
// Current UTC month is always inside the 12-month RETENTION_EXPOSED_MONTHS
// window so the isMonthExposed gate at route.ts:59-61 always passes for it.
// Duplicated from reports-signed-url-authz.spec.ts (row 159 landing) — the
// helper is intentionally re-inlined per file so a spec never reaches across
// the Playwright/browser boundary to import from a sibling spec.
function currentUtcMonthKey(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

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

// Wave-4 row 160 landed (tick 167) — paired in-window vs expired assertion
// for the retention-window gate. The two tests above use loadResellerHarness's
// single-admin fallback to exercise the harness-only invalid_month + not_
// exposed branches BEFORE any real reseller_report_files SELECT can fire (both
// bail at route.ts:55-61 in the same request). This block pairs the two sides
// of isMonthExposed against loadTempReseller("active_wholesale") +
// fixture.attachReportRow(currentMonth) so a route refactor that flipped the
// isMonthExposed comparator or dropped the retention gate surfaces as either
// (a) the current-month happy row 200 → some other code (a regression that
// tightened the exposed window past the current month) or (b) the expired
// row 403 not_exposed → 200 (a regression that widened the exposed window
// past 12 months). The in-window row also proves that attachReportRow's
// (reseller_id, month_key) tuple actually resolves the route's SELECT +
// storage.createSignedUrl chain end-to-end when isMonthExposed passes — a
// stricter round-trip than row 159's authz spec which only asserts the
// happy 200 shape without a paired negative anchor.
//
// Fixture wiring (wave-4 prep, tick 165):
//   - loadTempReseller("active_wholesale") reads the QAPROBEWHOLESALEACTIVE
//     seed row + resolves adminEmail via QA_RESELLER_ADMIN_EMAIL_ACTIVE_
//     WHOLESALE (default qa-reseller-wholesale-active@blockid.au).
//   - fixture.attachReportRow(monthKey) inserts a reseller_report_files row
//     + uploads a fixture CSV to reseller-reports/<resellerId>/<monthKey>.csv
//     when the row does not exist; returns {created:false} when a pre-existing
//     seed row is reused.
//   - loginAs(page, fixture.adminEmail) signs the reseller admin in via the
//     QA login endpoint; scopedReseller resolves and the current-month GET
//     reads the just-inserted metadata row.
//   - fixture.cleanup() in the try/finally removes the fixture-minted
//     metadata row + storage object when attachReportRow returned
//     {created:true}; no-op when the row was reused.
//
// Skip discipline mirrors reveal-email-authz row 148 + reports-signed-url-authz
// row 159: three skip points around loadTempReseller null vs throw,
// attachReportRow null (variant guard or REPORT_MONTH_RE reject — neither
// should fire on active_wholesale + a computed UTC monthKey), and loginAs
// throw. Each skip carries tempResellerSkipReason("active_wholesale") so a
// fresh CI host sees the exact seeder command to run.
//
// Paired-assertion posture: BOTH GETs fire inside the SAME test.beforeAll +
// single test block so the (current-month 200) and (expired 403) side effects
// see the SAME reseller session + the SAME attachReportRow row. This catches
// a regression where a route refactor accidentally coupled the retention
// window check to a per-request cache or a session-level flag (either state
// would drift between the two requests when they run in separate tests but
// stays consistent when they share one session).
//
// The current-month GET writes ONE reseller_audit_log(action='download_report')
// row per request (route.ts:105-125) — append-only per migration 0093 so no
// cleanup needed. The expired-month GET short-circuits at route.ts:59-61 so
// it writes nothing at all — no metadata SELECT, no storage sign, no audit
// row. Net side-effect budget for the block: 0 or 1 reseller_report_files
// insert + 1 reseller_audit_log row, mirroring row 159.
test.describe("Reseller reports signed-url paired retention — P10 wave-4 row 160", () => {
  test("active_wholesale — in-window month → 200 + expired month → 403 not_exposed", async ({
    page,
  }) => {
    let fixture: TempResellerFixture | null;
    try {
      fixture = await loadTempReseller("active_wholesale");
    } catch (err) {
      test.skip(
        true,
        `loadTempReseller('active_wholesale') threw: ${(err as Error).message}. ` +
          tempResellerSkipReason("active_wholesale"),
      );
      return;
    }
    if (!fixture) {
      test.skip(true, tempResellerSkipReason("active_wholesale"));
      return;
    }

    const monthKey = currentUtcMonthKey();
    let attached = false;
    try {
      const attach = await fixture.attachReportRow(monthKey);
      if (!attach) {
        test.skip(
          true,
          `attachReportRow('${monthKey}') returned null — variant guard or ` +
            "REPORT_MONTH_RE reject. Neither should fire on active_wholesale + " +
            "a computed UTC monthKey; investigate the fixture. " +
            tempResellerSkipReason("active_wholesale"),
        );
        return;
      }
      attached = attach.created;

      try {
        await loginAs(page, fixture.adminEmail);
      } catch (err) {
        test.skip(
          true,
          `loginAs(${fixture.adminEmail}) threw: ${(err as Error).message}. ` +
            tempResellerSkipReason("active_wholesale"),
        );
        return;
      }

      // Paired assertion — first the in-window month proves the retention
      // gate accepts a current UTC month AND the metadata row resolves the
      // route's SELECT + storage.createSignedUrl chain (a 404 not_found or
      // 500 lookup_failed here would indicate attachReportRow did not
      // persist the row against the resolved reseller_id / month_key tuple).
      const inWindowResp = await page.request.get(
        `/api/reseller/reports/${monthKey}/signed-url`,
      );
      expect(
        inWindowResp.status(),
        `in-window returned ${inWindowResp.status()} — expected 200 after ` +
          `scopedReseller passes, isMonthExposed accepts the current UTC month, ` +
          `the reseller_report_files row resolves via attachReportRow, ` +
          `storage.createSignedUrl mints a URL, and reseller_audit_log ` +
          `(download_report) writes. Body: ${await inWindowResp.text()}`,
      ).toBe(200);
      const inWindowBody = (await inWindowResp.json()) as {
        ok?: unknown;
        month?: unknown;
        reason?: unknown;
      };
      expect(
        inWindowBody.ok,
        `in-window body.ok should be true: ${JSON.stringify(inWindowBody).slice(0, 200)}`,
      ).toBe(true);
      expect(inWindowBody.month).toBe(monthKey);

      // Then the expired month proves the retention gate rejects a month
      // outside the 12-month exposed window BEFORE the reseller_report_files
      // SELECT runs (route.ts:59-61 short-circuits before route.ts:68-83).
      // Uses the SAME reseller session as the in-window request so a
      // regression that coupled isMonthExposed to a per-session cache or a
      // per-request memoisation surfaces here (either state would drift
      // between two separate tests but stays consistent when they share one
      // session/request/page fixture).
      const expiredResp = await page.request.get(
        `/api/reseller/reports/${NOT_EXPOSED_MONTH_SEGMENT}/signed-url`,
      );
      expect(
        expiredResp.status(),
        `expired returned ${expiredResp.status()} — expected 403 not_exposed ` +
          `before getSupabaseAdmin, reseller_report_files SELECT, storage sign, ` +
          `or reseller_audit_log write. Body: ${await expiredResp.text()}`,
      ).toBe(403);
      const expiredBody = (await expiredResp.json()) as {
        ok?: unknown;
        reason?: unknown;
      };
      expect(
        expiredBody.ok,
        `expired body.ok should be false: ${JSON.stringify(expiredBody).slice(0, 200)}`,
      ).toBe(false);
      expect(expiredBody.reason).toBe("not_exposed");
    } finally {
      if (attached) {
        await fixture.cleanup();
      }
    }
  });
});
