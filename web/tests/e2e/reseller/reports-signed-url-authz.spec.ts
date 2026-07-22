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
import {
  loadTempReseller,
  tempResellerSkipReason,
  type TempResellerFixture,
} from "../fixtures/reseller";

const NON_RESELLER_FOUNDER_EMAIL =
  process.env.QA_UNATTRIBUTED_FOUNDER_EMAIL ?? "qa-founder-1@blockid.au";

const PLACEHOLDER_MONTH = "2026-07";
const ROUTE = `/api/reseller/reports/${PLACEHOLDER_MONTH}/signed-url`;

// Mirrors web/src/lib/reseller/report-storage.ts::monthKeyOffset(now, 0)
// without the .ts import — Playwright specs stay import-free of app/lib code
// so the runtime sits alongside the browser bundle boundary. Current UTC
// month is always inside the 12-month RETENTION_EXPOSED_MONTHS window so the
// isMonthExposed gate at route.ts:59-61 always passes here.
function currentUtcMonthKey(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

// buildDownloadFilename() at web/src/lib/reseller/report-storage.ts:20-31
// slugifies the reseller display_name (fallback: code, fallback: "reseller")
// to `blockid-<slug>-<monthKey>.csv`. Duplicated here as a validator for the
// route response — the spec asserts filename === expected shape rather than
// deep-equality of a specific value because the shared fixture rotates the
// display_name across seed re-runs.
function slugifyForFilename(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

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

// Wave-4 row 159 landed (tick 166) — happy path for the reseller-admin
// signed-url mint. Uses loadTempReseller("active_wholesale") +
// fixture.attachReportRow(currentMonth) to seed a reseller_report_files row
// + the sibling storage object BEFORE the request, so the route's
// (reseller_id, month_key) SELECT at route.ts:68-73 resolves and the
// storage.createSignedUrl call at :92-96 mints a real URL. `loginAs(page,
// fixture.adminEmail)` opens the reseller-admin session so scopedReseller
// at :45-53 resolves to the wholesale-active variant. Asserts the full
// response envelope shape from route.ts:129-137 including the constant
// contract (ttl_seconds === SIGNED_URL_TTL_SECONDS === 86400 and bucket ===
// REPORT_BUCKET === 'reseller-reports') so a route refactor that drops or
// renames any envelope key surfaces here.
//
// Fixture wiring (wave-4 prep, tick 165):
//   - loadTempReseller("active_wholesale") reads the QAPROBEWHOLESALEACTIVE
//     seed row + resolves adminEmail via QA_RESELLER_ADMIN_EMAIL_ACTIVE_WHOLESALE
//     (default qa-reseller-wholesale-active@blockid.au). Returns null when
//     SUPABASE_URL/SERVICE_ROLE unset or the seed row is missing.
//   - fixture.attachReportRow(monthKey) inserts a reseller_report_files row
//     + uploads a fixture CSV to reseller-reports/<resellerId>/<monthKey>.csv
//     when the row does not exist; returns {created:false} when a pre-existing
//     seed row is reused (e.g. seed-qa-reseller-storage.mjs already ran).
//   - loginAs(page, fixture.adminEmail) signs the reseller admin in via the QA
//     login endpoint; scopedReseller then resolves and the route reads the
//     just-inserted metadata row.
//   - fixture.cleanup() in finally removes the fixture-minted metadata row +
//     storage object when attachReportRow returned {created:true}; no-op
//     when the row was reused. Runs even if the request fails so leaked
//     rows do not poison the next spec.
//
// Skip conditions (mirrors wave-2 me-attribution / wave-4 code-validate posture):
//   - loadTempReseller returns null when SUPABASE_URL/SERVICE_ROLE_KEY unset
//     or the QAPROBEWHOLESALEACTIVE seed row is missing.
//   - attachReportRow returns null when variant !== "active_wholesale" (guard
//     redundancy — loadTempReseller already scoped to that variant) or when
//     the monthKey fails REPORT_MONTH_RE (never fires here — the helper below
//     builds a well-formed YYYY-MM from `new Date()`).
//   - loginAs throws when /tmp/blockid-qa-accounts.txt has no row for the
//     resolved adminEmail (seed-test-users.mjs delta not run against this host).
//
// Side-effect discipline: the route writes ONE reseller_audit_log(action=
// 'download_report') row per happy request (route.ts:105-125). That row is
// APPEND-ONLY per the reseller_audit_log mutation-trigger contract from
// migration 0093, so the spec neither cleans it up nor asserts its
// contents — the reveal-email happy path (row 148) follows the same
// discipline. If a future audit-anomaly-scan spec needs to pin the row,
// filter reseller_audit_log by (action='download_report', route=<ROUTE>,
// actor_user_id=fixture.adminUserId, metadata->>month_key=monthKey).
test.describe("Reseller reports signed-url — P10 wave-4 row 159 happy path", () => {
  test("active_wholesale — GET returns 200 with signed_url + filename + month + expires_at + ttl_seconds + bucket", async ({
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

      const url = `/api/reseller/reports/${monthKey}/signed-url`;
      const resp = await page.request.get(url);
      expect(
        resp.status(),
        `happy returned ${resp.status()} — expected 200 after scopedReseller ` +
          `passes, isMonthExposed accepts the current UTC month, the reseller_report_files ` +
          `row resolves via attachReportRow, storage.createSignedUrl mints a URL, and ` +
          `reseller_audit_log(download_report) writes. A 404 not_found here means ` +
          `attachReportRow did not persist the row (fixture regression); a 403 no_membership ` +
          `means adminEmail did not resolve to an active reseller_admins row (P10 Option A ` +
          `multi-admin seed missing). Body: ${await resp.text()}`,
      ).toBe(200);

      const body = (await resp.json()) as {
        ok?: unknown;
        signed_url?: unknown;
        filename?: unknown;
        month?: unknown;
        expires_at?: unknown;
        ttl_seconds?: unknown;
        bucket?: unknown;
      };

      expect(
        body.ok,
        `happy body.ok should be true: ${JSON.stringify(body).slice(0, 200)}`,
      ).toBe(true);
      expect(typeof body.signed_url).toBe("string");
      expect((body.signed_url as string).length).toBeGreaterThan(0);
      // Signed URL points at the Supabase Storage sign endpoint; the exact
      // host varies by environment (staging vs prod), so match on the
      // storage-signing path fragment rather than a full URL.
      expect(body.signed_url as string).toContain("/storage/v1/object/sign/");
      expect(body.signed_url as string).toContain(attach.storageBucket);

      expect(typeof body.filename).toBe("string");
      const expectedFilename =
        `blockid-${slugifyForFilename(fixture.displayName || fixture.code)}` +
        `-${monthKey}.csv`;
      expect(body.filename).toBe(expectedFilename);

      expect(body.month).toBe(monthKey);

      expect(typeof body.expires_at).toBe("string");
      expect(Number.isNaN(new Date(body.expires_at as string).valueOf())).toBe(
        false,
      );

      // SIGNED_URL_TTL_SECONDS = 24 * 60 * 60 (report-storage.ts:10). A
      // route refactor that shortens or lengthens the TTL surfaces here.
      expect(body.ttl_seconds).toBe(24 * 60 * 60);

      // REPORT_BUCKET constant (report-storage.ts:9). Same rationale as
      // ttl_seconds — pin the constant so a bucket rename surfaces.
      expect(body.bucket).toBe("reseller-reports");
    } finally {
      if (attached) {
        await fixture.cleanup();
      }
    }
  });
});
