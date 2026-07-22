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
//     logo_url,primary_color,billing_model}) — requires an app_users row
//     whose attribution_reseller_id points at an active resellers row;
//     folded into the temp-reseller mint fixture follow-up alongside the
//     deferred rows from ticks 94/95/96/97/98/99/100/101.
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
