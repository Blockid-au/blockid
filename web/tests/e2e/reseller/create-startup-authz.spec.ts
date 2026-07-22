// POST /api/reseller/create-startup pre-write authorization contract —
// P10 dry-run per plan §C.1.5 (wholesale provisioning form) and §J.2
// (Playwright must cover the reseller-admin endpoints so a regression in
// the auth → feature-gate → scope → normalise → DB-write ordering surfaces
// before the endpoint fires app_users / projects / reseller_attributions
// inserts, mints a magic-link, dispatches sendWholesaleWelcome, or writes
// reseller_audit_log(provision_startup)).
//
// The sibling normalise-error branches (invalid_email / company_name_required
// / invalid_plan_tier / invalid_discount_tier) already ship via
// create-startup-validation.spec.ts (tick 94). Those probes reach the
// normalise gate via a reseller-admin session, so the pre-auth chain (no
// session, non-reseller founder) was uncovered — this spec closes that gap
// with the same two-row pattern used by sandbox-setup-authz.spec.ts and
// billing-authz.spec.ts.
//
// Two branches are harness-free and safe against staging (no rows written
// to app_users / projects / reseller_attributions / reseller_audit_log, no
// magic-link mint, no email dispatch, no Stripe subscription create):
//
//   1. unauthenticated       — POST with no session          → 401 error="Authentication required"
//                              (gateRequireFeature bails before scope, body,
//                              or DB read)
//   2. non_reseller_admin    — POST as a founder QA account  → 402 error="feature_locked", feature="reseller.create_startup"
//                              (gateRequireFeature bails because founder
//                              plans do not grant reseller.create_startup;
//                              scopedReseller, readBody, and every DB /
//                              Stripe / email branch is never touched)
//
// Route reference: web/src/app/api/reseller/create-startup/route.ts
//   Line 459-460: gateRequireFeature("reseller.create_startup") → 401/402 before scope
//   Line 463-471: scopedReseller(user) throws                   → 403 { reason: err.code }
//   Line 473-484: normaliseCreateStartupInput → invalid_* branch → 400 (covered by create-startup-validation.spec.ts)
//   Line 487-494: db.selfReseller null                           → 404 { reason: "reseller_missing" }
//   Line 518-521: getSupabaseAdmin() null                        → 503 { reason: "not_configured" }
//   Line 458+: decideCreateStartup → capability/tier/attribution gates → 400
//   Line 458+: execute() → app_users/projects/reseller_attributions writes → 200 / 500
//
// Skips:
//   Row 2 skips at test-scope if the qa-founder-1 account is not seeded
//   (loginAs throws). Row 1 always runs — no harness required — so this
//   spec lights up in CI on the next `npx playwright test` pass alongside
//   sandbox-setup-authz.spec.ts, billing-authz.spec.ts, and
//   credit-grant-validation.spec.ts.
//
// Deliberately out of scope (needs the reseller QA harness or per-test
// seeding which plan §J.2 forbids):
//   - no_membership (403 via scopedReseller) — needs a user with the
//     reseller.create_startup entitlement but no reseller_admins row;
//     inconsistent state that never occurs in production because the two
//     are provisioned together.
//   - reseller_missing (404) — needs a reseller_admins row without a
//     matching resellers row (edge case; per-test seeding).
//   - existing_active_attribution (400) / promotion_code_missing (400) —
//     two remaining decideCreateStartup() branches still sit BEHIND the
//     auth chain. Rows 141 (billing_model_not_wholesale via the
//     active_retail variant), 142 (reseller_not_active via the paused
//     variant), 143 (capability_disabled via the no_capability variant),
//     and 144 (tier_not_allowed via the tier_only_zero variant + tier=10
//     body) are ACTIVATED below.
//
//     Row 144 design correction (tick 146): the wave-1 schedule at
//     docs/plans/p10-deferred-spec-activation-order.md originally paired
//     row 144 with the active_wholesale variant + tier=99 body. That pair
//     is unreachable — tier=99 fails normaliseCreateStartupInput's
//     [0,10,20,30,40] guard (invalid_discount_tier) before
//     decideCreateStartup fires, and active_wholesale's
//     allowed_tiers=[0,10,20,30,40] means no VALID tier can miss gate 4
//     either. tier_only_zero (allowed_tiers=[0]) + a valid non-zero tier
//     (10) is the only fixture combination that reaches gate 4 with
//     status=active + can_create_startups=true + billing_model=wholesale.
//   - not_configured (503) — needs SUPABASE_URL/SERVICE_ROLE unset which
//     would break every other Playwright spec running in the same worker.
//   - Happy path (200 with project_id/user_id/magic_link_sent/stripe_wiring)
//     — fires app_users + projects + reseller_attributions inserts,
//     requestMagicLink mint, sendWholesaleWelcome dispatch, and
//     reseller_audit_log write against the harness reseller; folded into
//     the temp-reseller mint fixture follow-up alongside ticks 94/95/96/97/98.

import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/accounts";
import {
  loadTempReseller,
  tempResellerSkipReason,
  type TempResellerFixture,
} from "../fixtures/reseller";

const ROUTE = "/api/reseller/create-startup";
const NON_RESELLER_FOUNDER_EMAIL =
  process.env.QA_UNATTRIBUTED_FOUNDER_EMAIL ?? "qa-founder-1@blockid.au";

test.describe("Reseller create-startup pre-write authorization — P10 dry-run", () => {
  test("unauthenticated — POST with no session returns 401", async ({ request }) => {
    const resp = await request.post(ROUTE);
    expect(
      resp.status(),
      `unauthenticated returned ${resp.status()} — expected 401 before scope, body parse, or DB read. Body: ${await resp.text()}`,
    ).toBe(401);
    const body = (await resp.json()) as { ok: boolean; error?: string };
    expect(
      body.ok,
      `unauthenticated body.ok should be false: ${JSON.stringify(body)}`,
    ).toBe(false);
    expect(body.error).toBe("Authentication required");
  });

  test("non_reseller_admin — POST as a founder QA account returns 402 feature_locked", async ({
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
    const resp = await page.request.post(ROUTE);
    expect(
      resp.status(),
      `non_reseller_admin returned ${resp.status()} — expected 402 (feature_locked) before scope, body parse, or DB read. Body: ${await resp.text()}`,
    ).toBe(402);
    const body = (await resp.json()) as {
      ok: boolean;
      error?: string;
      feature?: string;
      reason?: string;
    };
    expect(
      body.ok,
      `non_reseller_admin body.ok should be false: ${JSON.stringify(body)}`,
    ).toBe(false);
    expect(body.error).toBe("feature_locked");
    expect(body.feature).toBe("reseller.create_startup");
  });
});

// P10 wave-1 row 141 — active_retail variant probes the third
// decideCreateStartup gate (billing_model !== "wholesale"). Order per
// web/src/lib/reseller/create-startup.ts:210-222:
//   1. reseller.status !== "active"        → reseller_not_active   (row 142)
//   2. !reseller.can_create_startups        → capability_disabled   (row 143)
//   3. reseller.billing_model !== "wholesale" → billing_model_not_wholesale ← THIS
//   4. discount_tier ∉ allowed_tiers        → tier_not_allowed      (row 144)
//   5. existing active project attribution  → existing_active_attribution
//   6. promotion code missing               → promotion_code_missing
//
// active_retail seed (web/scripts/seed-qa-reseller.mjs:81-92):
//   status="active", can_create_startups=true (flipped tick 141 so gates
//   1+2 pass), billing_model="retail" → gate 3 fires. allowed_tiers
//   includes every tier so the row does not accidentally short-circuit on
//   gate 4 if a future edit ever reorders the gates.
//
// Skip conditions:
//   - loadTempReseller("active_retail") returns null when SUPABASE_URL /
//     SUPABASE_SERVICE_ROLE_KEY are unset or when the QA_PROBE seed row is
//     missing (seed-qa-reseller.mjs not run against the target host).
//   - fixture.adminUserId is null when the per-variant reseller_admins
//     mirror is missing (seed-test-users.mjs and seed-qa-reseller.mjs must
//     both be re-run with QA_RESELLER_MULTI_ADMIN=1 after tick 142's
//     LEGACY_FEATURE_FALLBACK Option A landed).
//   - loginAs throws when the per-variant admin email is not in
//     /tmp/blockid-qa-accounts.txt (same seeder gap).
test.describe("Reseller create-startup — P10 wave-1 downstream reason branches", () => {
  test("active_retail — POST returns 400 with reason=billing_model_not_wholesale", async ({
    page,
  }) => {
    let fixture: TempResellerFixture | null;
    try {
      fixture = await loadTempReseller("active_retail");
    } catch (err) {
      test.skip(
        true,
        `loadTempReseller('active_retail') threw: ${(err as Error).message}. ` +
          tempResellerSkipReason("active_retail"),
      );
      return;
    }
    if (!fixture || !fixture.adminUserId) {
      test.skip(true, tempResellerSkipReason("active_retail"));
      return;
    }
    try {
      await loginAs(page, fixture.adminEmail);
    } catch (err) {
      test.skip(
        true,
        `loginAs(${fixture.adminEmail}) threw: ${(err as Error).message}. ` +
          tempResellerSkipReason("active_retail"),
      );
      return;
    }
    const resp = await page.request.post(ROUTE, {
      data: {
        founder_email: "p10-wave1-active-retail@blockid.au",
        company_name: "P10 Wave 1 — active_retail probe",
        plan_tier: "founder_growth",
        discount_tier: 0,
      },
    });
    expect(
      resp.status(),
      `active_retail returned ${resp.status()} — expected 400 (decideCreateStartup gate 3). Body: ${await resp.text()}`,
    ).toBe(400);
    const body = (await resp.json()) as {
      ok: boolean;
      reason?: string;
      message?: string;
    };
    expect(
      body.ok,
      `active_retail body.ok should be false: ${JSON.stringify(body)}`,
    ).toBe(false);
    expect(body.reason).toBe("billing_model_not_wholesale");
    expect(body.message).toBe(
      "Wholesale provisioning requires the wholesale billing model.",
    );
  });

  // P10 wave-1 row 142 — paused variant probes the first
  // decideCreateStartup gate (reseller.status !== "active"). Order per
  // web/src/lib/reseller/create-startup.ts:210-222:
  //   1. reseller.status !== "active"        → reseller_not_active   ← THIS
  //   2. !reseller.can_create_startups        → capability_disabled   (row 143)
  //   3. reseller.billing_model !== "wholesale" → billing_model_not_wholesale (row 141)
  //   4. discount_tier ∉ allowed_tiers        → tier_not_allowed      (row 144)
  //
  // paused seed (web/scripts/seed-qa-reseller.mjs:93-105):
  //   status="paused", billing_model="wholesale", can_create_startups=true,
  //   allowed_tiers=[0,10,20,30,40] → gate 1 fires before any downstream
  //   gate can short-circuit the row's assertion.
  //
  // discount_tier=0 chosen so the row is independent of allowed_tiers
  // ordering AND does not require a reseller_promotion_codes row (gate 1
  // pre-empts gate 6 anyway). Body shape mirrors row 141 verbatim so the
  // only variance across the four wave-1 rows is variant + expected reason.
  test("paused — POST returns 400 with reason=reseller_not_active", async ({
    page,
  }) => {
    let fixture: TempResellerFixture | null;
    try {
      fixture = await loadTempReseller("paused");
    } catch (err) {
      test.skip(
        true,
        `loadTempReseller('paused') threw: ${(err as Error).message}. ` +
          tempResellerSkipReason("paused"),
      );
      return;
    }
    if (!fixture || !fixture.adminUserId) {
      test.skip(true, tempResellerSkipReason("paused"));
      return;
    }
    try {
      await loginAs(page, fixture.adminEmail);
    } catch (err) {
      test.skip(
        true,
        `loginAs(${fixture.adminEmail}) threw: ${(err as Error).message}. ` +
          tempResellerSkipReason("paused"),
      );
      return;
    }
    const resp = await page.request.post(ROUTE, {
      data: {
        founder_email: "p10-wave1-paused@blockid.au",
        company_name: "P10 Wave 1 — paused probe",
        plan_tier: "founder_growth",
        discount_tier: 0,
      },
    });
    expect(
      resp.status(),
      `paused returned ${resp.status()} — expected 400 (decideCreateStartup gate 1). Body: ${await resp.text()}`,
    ).toBe(400);
    const body = (await resp.json()) as {
      ok: boolean;
      reason?: string;
      message?: string;
    };
    expect(
      body.ok,
      `paused body.ok should be false: ${JSON.stringify(body)}`,
    ).toBe(false);
    expect(body.reason).toBe("reseller_not_active");
    expect(body.message).toBe(
      "Your reseller account is not active. Contact admin@blockid.au.",
    );
  });

  // P10 wave-1 row 143 — no_capability variant probes the second
  // decideCreateStartup gate (!reseller.can_create_startups). Order per
  // web/src/lib/reseller/create-startup.ts:210-222:
  //   1. reseller.status !== "active"        → reseller_not_active   (row 142)
  //   2. !reseller.can_create_startups        → capability_disabled   ← THIS
  //   3. reseller.billing_model !== "wholesale" → billing_model_not_wholesale (row 141)
  //   4. discount_tier ∉ allowed_tiers        → tier_not_allowed      (row 144)
  //
  // no_capability seed (web/scripts/seed-qa-reseller.mjs:119-131):
  //   status="active", billing_model="wholesale", can_create_startups=false,
  //   allowed_tiers=[0,10,20,30,40] → gate 1 passes, gate 2 fires before any
  //   downstream gate can short-circuit the row's assertion.
  //
  // discount_tier=0 chosen so the row is independent of allowed_tiers
  // ordering AND does not require a reseller_promotion_codes row (gate 2
  // pre-empts gate 6 anyway). Body shape mirrors rows 141+142 verbatim so the
  // only variance across the four wave-1 rows is variant + expected reason.
  test("no_capability — POST returns 400 with reason=capability_disabled", async ({
    page,
  }) => {
    let fixture: TempResellerFixture | null;
    try {
      fixture = await loadTempReseller("no_capability");
    } catch (err) {
      test.skip(
        true,
        `loadTempReseller('no_capability') threw: ${(err as Error).message}. ` +
          tempResellerSkipReason("no_capability"),
      );
      return;
    }
    if (!fixture || !fixture.adminUserId) {
      test.skip(true, tempResellerSkipReason("no_capability"));
      return;
    }
    try {
      await loginAs(page, fixture.adminEmail);
    } catch (err) {
      test.skip(
        true,
        `loginAs(${fixture.adminEmail}) threw: ${(err as Error).message}. ` +
          tempResellerSkipReason("no_capability"),
      );
      return;
    }
    const resp = await page.request.post(ROUTE, {
      data: {
        founder_email: "p10-wave1-no-capability@blockid.au",
        company_name: "P10 Wave 1 — no_capability probe",
        plan_tier: "founder_growth",
        discount_tier: 0,
      },
    });
    expect(
      resp.status(),
      `no_capability returned ${resp.status()} — expected 400 (decideCreateStartup gate 2). Body: ${await resp.text()}`,
    ).toBe(400);
    const body = (await resp.json()) as {
      ok: boolean;
      reason?: string;
      message?: string;
    };
    expect(
      body.ok,
      `no_capability body.ok should be false: ${JSON.stringify(body)}`,
    ).toBe(false);
    expect(body.reason).toBe("capability_disabled");
    expect(body.message).toBe(
      "Your reseller account is not enabled for wholesale provisioning.",
    );
  });

  // P10 wave-1 row 144 — tier_only_zero variant probes the fourth
  // decideCreateStartup gate (discount_tier ∉ allowed_tiers). Order per
  // web/src/lib/reseller/create-startup.ts:210-222:
  //   1. reseller.status !== "active"        → reseller_not_active   (row 142)
  //   2. !reseller.can_create_startups        → capability_disabled   (row 143)
  //   3. reseller.billing_model !== "wholesale" → billing_model_not_wholesale (row 141)
  //   4. discount_tier ∉ allowed_tiers        → tier_not_allowed      ← THIS
  //
  // Schedule doc's original pair (active_wholesale + tier=99) is
  // unreachable — see the top-of-file design correction. tier_only_zero
  // seed (web/scripts/seed-qa-reseller.mjs:132-144) sits at
  // (status=active, billing_model=wholesale, can_create_startups=true,
  // allowed_tiers=[0]) so gates 1-3 pass and gate 4 fires against
  // discount_tier=10 (a valid tier per normaliseCreateStartupInput but
  // NOT in this reseller's allowed_tiers). discount_tier=10 chosen (over
  // 20/30/40) so the assertion pins to the smallest deviation from the
  // seed — a future edit that widens allowed_tiers past [0] surfaces on
  // the smallest tier first.
  //
  // Non-Stripe / non-GST discipline: assertion does not touch Stripe (no
  // promotion_code branch reached — gate 4 pre-empts gate 6), does not
  // touch GST reconciliation, and does not depend on the InfoVision
  // seed. P8.5 + P1.5 remain neither a dependency nor a consequence.
  test("tier_only_zero — POST with tier=10 returns 400 with reason=tier_not_allowed", async ({
    page,
  }) => {
    let fixture: TempResellerFixture | null;
    try {
      fixture = await loadTempReseller("tier_only_zero");
    } catch (err) {
      test.skip(
        true,
        `loadTempReseller('tier_only_zero') threw: ${(err as Error).message}. ` +
          tempResellerSkipReason("tier_only_zero"),
      );
      return;
    }
    if (!fixture || !fixture.adminUserId) {
      test.skip(true, tempResellerSkipReason("tier_only_zero"));
      return;
    }
    try {
      await loginAs(page, fixture.adminEmail);
    } catch (err) {
      test.skip(
        true,
        `loginAs(${fixture.adminEmail}) threw: ${(err as Error).message}. ` +
          tempResellerSkipReason("tier_only_zero"),
      );
      return;
    }
    const resp = await page.request.post(ROUTE, {
      data: {
        founder_email: "p10-wave1-tier-not-allowed@blockid.au",
        company_name: "P10 Wave 1 — tier_not_allowed probe",
        plan_tier: "founder_growth",
        discount_tier: 10,
      },
    });
    expect(
      resp.status(),
      `tier_only_zero returned ${resp.status()} — expected 400 (decideCreateStartup gate 4). Body: ${await resp.text()}`,
    ).toBe(400);
    const body = (await resp.json()) as {
      ok: boolean;
      reason?: string;
      message?: string;
    };
    expect(
      body.ok,
      `tier_only_zero body.ok should be false: ${JSON.stringify(body)}`,
    ).toBe(false);
    expect(body.reason).toBe("tier_not_allowed");
    expect(body.message).toBe(
      "That discount tier is not enabled for your reseller account.",
    );
  });
});
