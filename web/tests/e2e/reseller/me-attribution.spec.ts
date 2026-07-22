// GET /api/reseller/me pre-read authorization contract —
// P10 dry-run auth-chain spec (tick 102).
//
// Per plan § P5 co-branding — this endpoint powers the useResellerAttribution()
// client hook that drives the topbar co-branding pill (ResellerPill), the
// email footer resolver, and any future co-branding surface. Unlike the
// reseller-admin routes it does NOT use gateRequireFeature() or
// scopedReseller() — any signed-in user may ask about their OWN attribution
// (route.ts:18 has an `r-01-exempt` pragma calling this out). The response
// envelope is therefore { ok, reseller|reason } rather than the
// { ok:false, error, feature } shape gateRequireFeature emits.
//
// Two branches are harness-free and safe against staging (row 1 fires no
// DB call at all; row 2 hits only the app_users SELECT with the caller's
// own id — no write, no audit-log row):
//
//   1. unauthenticated              — GET with no session      → 401 { ok:false, reason:"unauthenticated" }
//                                      (getCurrentUser null → returns before
//                                      getSupabaseAdmin, app_users SELECT,
//                                      or resellers SELECT run)
//   2. authenticated_no_attribution — GET as a founder QA user → 200 { ok:true, reseller:null }
//                                      (app_users.attribution_reseller_id is
//                                      null for a founder account that never
//                                      redeemed a reseller code → returns null
//                                      before the resellers SELECT fires)
//
// Route reference: web/src/app/api/reseller/me/route.ts
//   Line 28-34: getCurrentUser() null           → 401 { reason: "unauthenticated" }
//   Line 36-39: getSupabaseAdmin() null         → 200 { ok:true, reseller:null } (fail-open)
//   Line 42-54: app_users SELECT + no id        → 200 { ok:true, reseller:null }
//   Line 56-64: resellers SELECT + inactive     → 200 { ok:true, reseller:null }
//   Line 66-75: 200 { ok:true, reseller:{...} }
//   Line 76-80: try/catch                       → 200 { ok:true, reseller:null } (fail-closed)
//
// Skips:
//   Row 2 skips at test-scope if the qa-founder-1 account is not seeded
//   (loginAs throws). Row 1 always runs — no harness required — so this
//   spec lights up in CI on the next `npx playwright test` pass alongside
//   reveal-email-authz.spec.ts and drawer-authz.spec.ts.
//
// Deliberately out of scope (needs the reseller attribution harness or
// per-test seeding which plan §J.2 forbids):
//   - attributed founder (200 with populated reseller.{code,display_name,
//     logo_url,primary_color,billing_model}) — ACTIVATED as P10 wave-2
//     row 145 below via loadTempReseller("active_wholesale") +
//     fixture.attachAttributedCustomer() which stamps the cache column
//     app_users.attribution_reseller_id on the seeded qa-founder-attributed-1
//     row and restores it in afterEach. Skip conditions match the wave-1
//     posture (fixture null / attributedUserId null / loginAs throw).
//   - inactive-reseller silent-null (200 with reseller:null when status
//     !== "active") — requires a reseller row in a non-active state pinned
//     against a specific QA founder's attribution_reseller_id; per-test
//     tampering plan §J.2 forbids.
//   - fail-open supabase-null (200 with reseller:null when
//     SUPABASE_URL/SERVICE_ROLE unset) — would break every other Playwright
//     spec running in the same worker.
//   - fail-closed catch (200 with reseller:null when the app_users SELECT
//     throws pre-0091-apply) — the migration has been applied since tick
//     41; no realistic way to reproduce without per-test tampering.
//
// Why row 2 is worth a spec even though the response is the SAME success
// shape as fail-open/fail-closed/catch: it pins the CONTRACT for the
// caller — a founder with no attribution must see `{ok:true, reseller:null}`
// rather than a 401 (which would flash the auth banner on the pill) or a
// 402 (which would suggest a plan gate exists). The pill component treats
// `reseller:null` as "hide" and any other shape as "show or error"; a
// refactor that accidentally gate-locks this route to reseller-admins
// would light up as row 2 flipping from 200 to 402.

import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/accounts";
import {
  loadTempReseller,
  tempResellerSkipReason,
  type TempResellerFixture,
} from "../fixtures/reseller";

const NON_RESELLER_FOUNDER_EMAIL =
  process.env.QA_UNATTRIBUTED_FOUNDER_EMAIL ?? "qa-founder-1@blockid.au";

const ROUTE = "/api/reseller/me";

test.describe("Reseller /me attribution pre-read authorization — P10 dry-run", () => {
  test("unauthenticated — GET with no session returns 401 unauthenticated", async ({
    request,
  }) => {
    const resp = await request.get(ROUTE);
    expect(
      resp.status(),
      `unauthenticated returned ${resp.status()} — expected 401 before getSupabaseAdmin, app_users SELECT, or resellers SELECT run. Body: ${await resp.text()}`,
    ).toBe(401);
    const body = (await resp.json()) as { ok: boolean; reason?: string };
    expect(
      body.ok,
      `unauthenticated body.ok should be false: ${JSON.stringify(body)}`,
    ).toBe(false);
    expect(body.reason).toBe("unauthenticated");
  });

  test("authenticated_no_attribution — GET as a founder QA account returns 200 reseller:null", async ({
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
      `authenticated_no_attribution returned ${resp.status()} — expected 200 with reseller:null. Body: ${await resp.text()}`,
    ).toBe(200);
    const body = (await resp.json()) as {
      ok: boolean;
      reseller: unknown;
      reason?: string;
    };
    expect(
      body.ok,
      `authenticated_no_attribution body.ok should be true: ${JSON.stringify(body)}`,
    ).toBe(true);
    expect(
      body.reseller,
      `authenticated_no_attribution body.reseller should be null (founder has no attribution_reseller_id): ${JSON.stringify(body)}`,
    ).toBeNull();
  });
});

// P10 wave-2 row 145 — active_wholesale variant probes the /me happy path
// (attributed founder → 200 with populated reseller.{code, display_name,
// logo_url, primary_color, billing_model}). Per docs/plans/p10-deferred-
// spec-activation-order.md wave 2:
//   145 | me-attribution.spec.ts | active_wholesale | happy (returns display_name) | 200
//
// Route order per web/src/app/api/reseller/me/route.ts:
//   Line 28-34: getCurrentUser null                  → 401 (row 1)
//   Line 42-54: app_users.attribution_reseller_id null → 200 reseller:null (row 2)
//   Line 56-64: resellers.status !== "active"        → 200 reseller:null
//   Line 66-75: happy path                            → 200 reseller:{...} ← THIS
//
// Fixture wiring (wave-2 prep):
//   - loadTempReseller("active_wholesale") reads the QAPROBEWHOLESALEACTIVE
//     seed row + resolves attributedUserId via QA_RESELLER_ATTRIBUTED_FOUNDER_EMAIL
//     (default qa-founder-attributed-1@blockid.au) → app_users.id.
//   - fixture.attachAttributedCustomer() then stamps the cache column
//     app_users.attribution_reseller_id = fixture.resellerId (the seed script
//     only writes reseller_attributions, so without this shim /me returns
//     reseller:null on line 52-53). afterEach fixture.cleanup() restores the
//     previous value so cross-spec state does not leak.
//   - loginAs(page, fixture.attributedFounderEmail) signs the founder in via
//     the QA login endpoint; getCurrentUser() then resolves to that founder
//     and the /me handler reads the just-stamped cache column.
//
// Skip conditions (mirrors wave-1 posture verbatim):
//   - loadTempReseller returns null when SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
//     are unset or the QAPROBEWHOLESALEACTIVE seed row is missing.
//   - fixture.attributedUserId null when qa-founder-attributed-1 is not in
//     app_users (seed-test-users.mjs delta not run).
//   - fixture.attributedFounderEmail null (redundant guard — always null iff
//     attributedUserId is null on active_wholesale, but pinned so a future
//     variant change surfaces on the exact skip line).
//   - loginAs throws when /tmp/blockid-qa-accounts.txt has no row for the
//     resolved email (seed-test-users.mjs not run against the target host).
//
// Non-Stripe / non-GST discipline: /me is a pure app_users + resellers SELECT.
// No promotion_code lookup, no revenue_events read, no Stripe network call,
// no InfoVision dependency. P8.5 + P1.5 remain neither a dependency nor a
// consequence.
test.describe("Reseller /me attribution — P10 wave-2 attributed happy path", () => {
  test("active_wholesale — GET as attributed founder returns 200 with populated reseller", async ({
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
    if (!fixture || !fixture.attributedUserId || !fixture.attributedFounderEmail) {
      test.skip(true, tempResellerSkipReason("active_wholesale"));
      return;
    }
    const attributedFounderEmail = fixture.attributedFounderEmail;
    let attached = false;
    try {
      const result = await fixture.attachAttributedCustomer();
      if (!result) {
        test.skip(true, tempResellerSkipReason("active_wholesale"));
        return;
      }
      attached = true;
      try {
        await loginAs(page, attributedFounderEmail);
      } catch (err) {
        test.skip(
          true,
          `loginAs(${attributedFounderEmail}) threw: ${(err as Error).message}. ` +
            tempResellerSkipReason("active_wholesale"),
        );
        return;
      }
      const resp = await page.request.get(ROUTE);
      expect(
        resp.status(),
        `active_wholesale returned ${resp.status()} — expected 200 with populated reseller. Body: ${await resp.text()}`,
      ).toBe(200);
      const body = (await resp.json()) as {
        ok: boolean;
        reseller: {
          code?: string;
          display_name?: string;
          billing_model?: string;
        } | null;
        reason?: string;
      };
      expect(
        body.ok,
        `active_wholesale body.ok should be true: ${JSON.stringify(body)}`,
      ).toBe(true);
      expect(
        body.reseller,
        `active_wholesale body.reseller should be non-null (attribution_reseller_id was just stamped): ${JSON.stringify(body)}`,
      ).not.toBeNull();
      // display_name is the wave-2 row 145 oracle per the schedule doc's
      // "happy (returns display_name)" label. code + billing_model pin the
      // rest of the co-branding payload so a partial-shape regression (e.g.
      // an accidental select() column drop in route.ts) surfaces here.
      expect(body.reseller?.display_name).toBe(fixture.displayName);
      expect(body.reseller?.code).toBe(fixture.code);
      expect(body.reseller?.billing_model).toBe("wholesale");
    } finally {
      if (attached) {
        await fixture.cleanup();
      }
    }
  });
});
