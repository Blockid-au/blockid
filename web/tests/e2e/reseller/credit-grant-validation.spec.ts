// POST /api/reseller/credits/grant input-validation contract — P10 dry-run
// per plan §D.3 (reseller_credit_grants mirror) and §J.2 (Playwright must
// cover the reseller-admin endpoints so a regression in the target/amount
// gate ordering surfaces before the endpoint fires DB writes).
//
// This spec probes the input-validation branches surfaced by
// web/src/app/api/reseller/credits/grant/route.ts before the endpoint
// touches credit_balances / credit_transactions / reseller_credit_grants:
//
//   1. invalid_body   — POST with no JSON body → 400
//   2. missing_id     — target_user_id absent from body      → 400
//                       (decideReveal returns reason='missing_id')
//   3. invalid_id     — target_user_id is not a UUID         → 400
//                       (decideReveal returns reason='invalid_id')
//   4. not_in_scope   — target_user_id is a random UUID that  → 403
//                       is not in the reseller's allowedCustomerIds
//                       (decideReveal returns reason='not_in_scope')
//   5. invalid_amount — amount ≤ 0 or non-integer, target is  → 400
//                       in scope so decideReveal passes but decideGrant
//                       bails at the invalid_amount gate
//                       (decideGrant returns reason='invalid_amount')
//
// Rows 1-4 return before any DB read fires; row 5 reads the monthly-grant
// rollup for the reseller but never writes, so the spec is safe against
// staging (no credit ledger pollution, no reseller_credit_grants row
// insertion).
//
// Skips:
//   describe-scope on loadResellerHarness() (needs QA_RESELLER_ADMIN_EMAIL +
//     QA_RESELLER_ATTRIBUTED_CUSTOMER_ID) — same posture as
//     create-startup-validation.spec.ts, audit-log-writes.spec.ts,
//     audit-anomaly-scan.spec.ts, attribution-timing.spec.ts,
//     scope-boundary.spec.ts.
//
// Downstream reasons (capability_disabled / over_budget_requires_approval
// / reseller_missing / not_configured) each need bespoke reseller-column
// state (can_grant_credits=false; already_granted_this_month ≥ budget; a
// scope that resolves to no reseller row; supabase-admin unavailable) —
// asserting them here would need per-test row seeding (forbidden by plan
// §J.2) or a QA-only mode toggle. Tracked as follow-up alongside the
// decideCreateStartup gate rows deferred by tick 94.
//
// Happy path (200 with credit_transaction_id) — ACTIVATED as P10 wave-3
// row 152 below via loadTempReseller("active_wholesale") + fixture.adminEmail
// loginAs + fixture.attributedUserId. Sits inside the wave-3-active_wholesale
// subwave (152 / 154 / 155 / 156) that tick 152's preflight flagged as
// activation-ready without any seed/fixture delta. Row 154 already landed
// (sandbox-setup happy 200) tick 153; row 152 is the shortest remaining
// wave-3 row per tick 153's next-tick recommendation.

import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/accounts";
import {
  harnessSkipReason,
  loadResellerHarness,
  loadTempReseller,
  tempResellerSkipReason,
  type TempResellerFixture,
} from "../fixtures/reseller";

// Random UUID that's astronomically unlikely to match any real app_users row
// so the not_in_scope branch fires deterministically. Passes decideReveal's
// UUID shape guard, then fails the allowedCustomerIds membership check.
const OUT_OF_SCOPE_UUID = "00000000-0000-4000-8000-000000000001";

test.describe("Reseller credit-grant input validation — P10 dry-run", () => {
  const harness = loadResellerHarness();
  test.skip(!harness, harnessSkipReason());

  test("invalid_body — POST with no JSON body returns 400", async ({ page }) => {
    await loginAs(page, harness!.admin.email);
    const resp = await page.request.post(`/api/reseller/credits/grant`, {
      // Deliberately send raw non-JSON so request.json() rejects and the
      // route hits its `if (!body)` guard.
      data: "not-json",
      headers: { "content-type": "text/plain" },
    });
    expect(
      resp.status(),
      `invalid_body returned ${resp.status()} — expected 400 before DB reads. Body: ${await resp.text()}`,
    ).toBe(400);
    const body = (await resp.json()) as { ok: boolean; reason: string };
    expect(body.ok, `invalid_body body.ok should be false: ${JSON.stringify(body)}`).toBe(false);
    expect(body.reason).toBe("invalid_body");
  });

  test("missing_id — target_user_id absent returns 400", async ({ page }) => {
    await loginAs(page, harness!.admin.email);
    const resp = await page.request.post(`/api/reseller/credits/grant`, {
      data: { amount: 100 },
      headers: { "content-type": "application/json" },
    });
    expect(
      resp.status(),
      `missing_id returned ${resp.status()} — expected 400 before DB writes. Body: ${await resp.text()}`,
    ).toBe(400);
    const body = (await resp.json()) as { ok: boolean; reason: string };
    expect(body.ok).toBe(false);
    expect(body.reason).toBe("missing_id");
  });

  test("invalid_id — target_user_id not a UUID returns 400", async ({ page }) => {
    await loginAs(page, harness!.admin.email);
    const resp = await page.request.post(`/api/reseller/credits/grant`, {
      data: { target_user_id: "not-a-uuid", amount: 100 },
      headers: { "content-type": "application/json" },
    });
    expect(
      resp.status(),
      `invalid_id returned ${resp.status()} — expected 400 before DB writes. Body: ${await resp.text()}`,
    ).toBe(400);
    const body = (await resp.json()) as { ok: boolean; reason: string };
    expect(body.ok).toBe(false);
    expect(body.reason).toBe("invalid_id");
  });

  test("not_in_scope — well-formed UUID outside allowedCustomerIds returns 403", async ({ page }) => {
    await loginAs(page, harness!.admin.email);
    const resp = await page.request.post(`/api/reseller/credits/grant`, {
      data: { target_user_id: OUT_OF_SCOPE_UUID, amount: 100 },
      headers: { "content-type": "application/json" },
    });
    expect(
      resp.status(),
      `not_in_scope returned ${resp.status()} — expected 403 before DB writes. Body: ${await resp.text()}`,
    ).toBe(403);
    const body = (await resp.json()) as { ok: boolean; reason: string };
    expect(body.ok).toBe(false);
    expect(body.reason).toBe("not_in_scope");
  });

  test("invalid_amount — target in scope but amount ≤ 0 returns 400", async ({ page }) => {
    await loginAs(page, harness!.admin.email);
    const resp = await page.request.post(`/api/reseller/credits/grant`, {
      data: {
        target_user_id: harness!.attributedCustomerId,
        amount: 0,
      },
      headers: { "content-type": "application/json" },
    });
    expect(
      resp.status(),
      `invalid_amount returned ${resp.status()} — expected 400 before any credit_balances write. Body: ${await resp.text()}`,
    ).toBe(400);
    const body = (await resp.json()) as { ok: boolean; reason: string };
    expect(body.ok).toBe(false);
    expect(body.reason).toBe("invalid_amount");
  });
});

// P10 wave-3 row 152 — active_wholesale variant probes decideGrant's POSITIVE
// branch (target in scope + amount>0 + can_grant_credits=true + within
// monthly_credit_budget) from the credit-grant-validation surface. Per
// docs/plans/p10-deferred-spec-activation-order.md wave 3:
//   152 | credit-grant-validation.spec.ts | active_wholesale |
//         happy 200 with credit_transaction_id | 200
//
// Route reference (web/src/app/api/reseller/credits/grant/route.ts):
//   Line 52-55: gateRequireFeature("reseller.grant_credits") failure
//   Line 57-65: scopedReseller throws                → 403 { reason: <code> }
//   Line 67-70: invalid_body                          → 400
//   Line 82-87: decideReveal fails                    → 400 invalid_id / missing_id
//                                                       or 403 not_in_scope
//   Line 89-92: getSupabaseAdmin null                 → 503 not_configured
//   Line 96-99: selfReseller null                     → 404 reseller_missing
//   Line 103-113: rollup read failure                 → 500 rollup_failed
//   Line 128-148: decideGrant fails                   → 400 invalid_amount
//                                                       / 403 capability_disabled
//                                                       / 402 over_budget_requires_approval
//   Line 152-162: balance_read_failed                 → 500
//   Line 169-185: balance_upsert_failed               → 500
//   Line 187-204: transaction_insert_failed           → 500
//   Line 206-224: mirror_insert_failed                → 500
//   Line 226-248: audit_failed                        → 500
//   Line 250-260: 200 { ok, balance, credit_transaction_id,
//                       over_budget, month_key, remaining_budget } ← THIS
//
// Fixture wiring (mirrors wave-2 row 146/147/148/149 + wave-3 row 154 posture
// verbatim):
//   - loadTempReseller("active_wholesale") reads the QAPROBEWHOLESALEACTIVE
//     seed row + resolves adminEmail via the P10 Option A per-variant slot
//     (qa-reseller-wholesale-active@blockid.au) + mirrors reseller_admins.
//   - fixture.attributionExists asserts the seeder also planted a
//     reseller_attributions row so scopedReseller().allowedCustomerIds()
//     surfaces fixture.attributedUserId. Without the row the credit-grant
//     route returns 403 not_in_scope from decideReveal (route.ts:82-87)
//     BEFORE decideGrant fires — that would false-flag the happy path.
//   - loginAs(page, fixture.adminEmail) opens the reseller-admin session
//     against the DISTINCT per-variant app_users row so scopedReseller()
//     .maybeSingle() does not PGRST116-collide with other variants.
//
// Skip conditions:
//   - loadTempReseller returns null (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
//     unset or QAPROBEWHOLESALEACTIVE seed row missing).
//   - fixture.adminUserId null (variant admin row missing or reseller_admins
//     mirror not seeded — scopedReseller would 403 no_membership).
//   - fixture.attributedUserId null (attributed founder not in app_users).
//   - fixture.attributionExists false (reseller_attributions row missing —
//     decideReveal would 403 not_in_scope; partial-seed host must skip
//     rather than false-fail).
//   - loginAs throws when /tmp/blockid-qa-accounts.txt has no row for the
//     resolved admin email.
//
// State-pollution posture per tick 153's next-tick recommendation ("credit_
// transactions rows are cheap and self-scoped — trackProjectForCleanup
// pattern isn't even needed"):
//   - amount=1 keeps the founder's credit_balances bump minimal (one credit
//     per CI run against staging).
//   - QAPROBEWHOLESALEACTIVE's monthly_credit_budget is set by the seeder
//     (see web/scripts/seed-qa-reseller.mjs) well above the accumulated
//     spend a monthly CI cadence would produce; the over_budget_requires_
//     approval branch is exercised in row 151 against the no_budget variant
//     that has monthly_credit_budget=0. Runaway spend surfaces as a 402 here
//     (spec would fail with helpful body carrying already_granted_this_month
//     + remaining_budget) which is the sentinel for "reset the QA reseller
//     budget on staging."
//   - reseller_credit_grants(kind=grant) mirror + reseller_audit_log write
//     are one row each per run — same posture as row 154's audit row.
//   - No projects.id created → no fixture.trackProjectForCleanup / cleanup()
//     wiring needed; this is why row 152 is the shortest remaining wave-3
//     row per tick 153's recommendation.
//
// Coverage-vs-duplication call: pin 200 + body.ok=true + body.credit_
// transaction_id is a non-empty string matching UUID shape. Do NOT pin the
// balance / remaining_budget values — those depend on the founder's prior
// credit_balances state and the reseller's month-to-date spend, which drift
// across CI runs. The credit_transaction_id assertion is enough to catch:
//   (a) a regression that returns 200 without inserting the credit_
//       transactions row (route.ts:187-204 short-circuits with a 5xx
//       body.reason=transaction_insert_failed so ok would flip false), or
//   (b) a regression that returns the wrong id type (e.g. a bigint from a
//       stale migration instead of a UUID).
// The over_budget assertion (body.over_budget === false) is intentionally
// added because row 151 (no_budget variant) is designed to surface
// over_budget_requires_approval=402, and this row's over_budget=false pins
// the twin: when the reseller IS within budget, the mirror row is inserted
// with over_budget=false rather than =true (see route.ts:206-218).
//
// Non-Stripe / non-GST discipline: the credit-grant route reads
// reseller_credit_grants (rollup for the current month) + credit_balances
// (target row) and writes credit_balances + credit_transactions +
// reseller_credit_grants + reseller_audit_log. No promotion_code lookup,
// no revenue_events read, no Stripe network call, no InfoVision dependency.
// P8.5 + P1.5 remain neither a dependency nor a consequence. The audit-log
// write side-effect is captured by wave-5 row 179 (audit-log-writes.spec.ts)
// so this row focuses on the wire envelope — the 500 audit_failed branch
// means a broken audit-log write would surface as body.ok=false here
// (route.ts:243-247 returns 500 BEFORE the 200 return on route.ts:250)
// rather than as a missing audit row that only row 179 could detect.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

test.describe("Reseller credit-grant — P10 wave-3 happy path", () => {
  test("active_wholesale — POST as reseller-admin with in-scope target + amount>0 returns 200 with credit_transaction_id", async ({
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
    if (
      !fixture ||
      !fixture.adminUserId ||
      !fixture.attributedUserId ||
      !fixture.attributionExists
    ) {
      test.skip(true, tempResellerSkipReason("active_wholesale"));
      return;
    }
    const attributedUserId = fixture.attributedUserId;
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
    const resp = await page.request.post(`/api/reseller/credits/grant`, {
      data: {
        target_user_id: attributedUserId,
        amount: 1,
        reason: "p10_wave3_row_152_happy_probe",
      },
      headers: { "content-type": "application/json" },
    });
    expect(
      resp.status(),
      `active_wholesale + happy returned ${resp.status()} — expected 200 with credit_transaction_id. A 402 over_budget_requires_approval here means the QAPROBEWHOLESALEACTIVE monthly_credit_budget has been exhausted (reset on staging or reduce test cadence). A 403 not_in_scope means allowedCustomerIds() rejected fixture.attributedUserId (fixture.attributionExists guard should have caught it — investigate seed drift). A 5xx means the credit_balances / credit_transactions / reseller_credit_grants / reseller_audit_log chain leaked through. Body: ${await resp.text()}`,
    ).toBe(200);
    const body = (await resp.json()) as {
      ok: boolean;
      credit_transaction_id?: string;
      over_budget?: boolean;
      reason?: string;
    };
    expect(
      body.ok,
      `active_wholesale + happy body.ok should be true: ${JSON.stringify(body)}`,
    ).toBe(true);
    expect(typeof body.credit_transaction_id).toBe("string");
    expect(body.credit_transaction_id ?? "").toMatch(UUID_RE);
    // Twin of row 151 (no_budget → over_budget=true / 402). This row pins the
    // within-budget branch: reseller_credit_grants mirror row is inserted
    // with over_budget=false per route.ts:215.
    expect(body.over_budget).toBe(false);
  });
});
