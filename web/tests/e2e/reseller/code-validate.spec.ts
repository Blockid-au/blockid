// POST /api/reseller/code/validate input-validation contract — P10 dry-run
// per plan §C.2 (redemption UX) and §J.2 (Playwright must cover the reseller
// public endpoints so a regression in the validator surfaces before the
// consent modal / checkout flow diverges from the response envelope).
//
// This endpoint is intentionally UNAUTHENTICATED — the code is applied
// pre-signup so no viewer identity exists to scope on (r-01-exempt in the
// route file). That means the spec does NOT depend on the reseller QA
// harness and runs against staging with zero writes: rows 1-4 bail before
// any DB read fires, and row 5 hits only the reseller_promotion_codes
// SELECT with a code chosen to be astronomically unlikely to collide with
// a real row.
//
// Branches probed (all pre-write, all safe against staging):
//   1. invalid_payload_no_json — POST with content-type: text/plain body    → 400 reason="invalid"
//   2. missing_code            — body {} with no `code` field               → 400 reason="invalid"
//   3. blank_code              — body { code: "" } (empty string)           → 400 reason="invalid"
//   4. punctuation_only        — body { code: "!!!" } (normalises to "")    → 400 reason="invalid"
//   5. code_not_found          — well-formed random code that does not      → 404 reason="invalid"
//                                exist in reseller_promotion_codes
//
// Route reference: web/src/app/api/reseller/code/validate/route.ts
//   Line 32-36: JSON parse error → 400 { reason: "invalid" }
//   Line 38-41: normaliseResellerCode() returns null → 400 { reason: "invalid" }
//   Line 61-63: promo row missing OR promo.active=false → 404 { reason: "invalid" }
//   Line 72-74: reseller missing OR status !== "active" → 404 { reason: "inactive" }
//   Line 44-46: SUPABASE_URL/SERVICE_ROLE unset → 503 { reason: "not_configured" }
//
// Deliberately out of scope (need reseller row column state that plan §J.2
// forbids per-test seeding for):
//   - inactive (404) — ACTIVATED as P10 wave-4 row 157 below via
//     loadTempReseller("paused") + fixture.promotionCodes[0].code. Uses the
//     QAPROBEPAUSED20 promo code minted by
//     seed-qa-reseller.mjs::seedPromotionCodes(..., PAUSED_PROMO_TIERS)
//     (added tick 205 alongside the existing active_wholesale mint). The
//     paused reseller row has status='paused' so route.ts:72-74 returns
//     404 reason='inactive' AFTER the promo lookup at route.ts:50-63
//     succeeds — proving the two 404 branches are distinguishable at the
//     wire. No login needed since /api/reseller/code/validate is public
//     unauthenticated (r-01-exempt in route.ts:18).
//   - not_configured (503) — needs SUPABASE_URL/SERVICE_ROLE unset which
//     would break every other Playwright spec running in the same worker.
//   - Happy path (200 ok + reseller.display_name + tier_pct) — ACTIVATED
//     as P10 wave-4 row 158 below via loadTempReseller("active_wholesale")
//     + fixture.promotionCodes[0].code. Uses the QAPROBEWHOLESALEACTIVE20
//     / QAPROBEWHOLESALEACTIVE40 promo codes minted by
//     seed-qa-reseller.mjs::seedPromotionCodes() (line 359-388). No login
//     needed since /api/reseller/code/validate is public unauthenticated
//     (r-01-exempt in route.ts:18).

import { test, expect } from "@playwright/test";
import {
  loadTempReseller,
  tempResellerSkipReason,
  type TempResellerFixture,
} from "../fixtures/reseller";

interface ValidationCase {
  label: string;
  body: unknown;
  headers?: Record<string, string>;
  expectedStatus: number;
  expectedReason: "invalid" | "inactive" | "not_configured";
}

// A well-formed but astronomically unlikely-to-exist reseller code. The
// normaliser strips non-alphanumerics and uppercases, so this passes the
// null gate at line 39-41 and hits the reseller_promotion_codes SELECT.
// Prefix marks it as a Playwright probe so any operator inspecting the
// DB after a run can identify test traffic.
const NON_EXISTENT_CODE = "PWNONEXIST" + Math.random().toString(36).slice(2, 8).toUpperCase();

const ROUTE = "/api/reseller/code/validate";

const CASES: ValidationCase[] = [
  {
    label: "invalid_payload_no_json — POST with text/plain body returns 400",
    body: "not-json",
    headers: { "content-type": "text/plain" },
    expectedStatus: 400,
    expectedReason: "invalid",
  },
  {
    label: "missing_code — body without code field returns 400",
    body: {},
    expectedStatus: 400,
    expectedReason: "invalid",
  },
  {
    label: "blank_code — body with empty code string returns 400",
    body: { code: "" },
    expectedStatus: 400,
    expectedReason: "invalid",
  },
  {
    label: "punctuation_only — code with no alphanumerics normalises to null returns 400",
    body: { code: "!!!" },
    expectedStatus: 400,
    expectedReason: "invalid",
  },
  {
    label: "code_not_found — well-formed but non-existent code returns 404",
    body: { code: NON_EXISTENT_CODE },
    expectedStatus: 404,
    expectedReason: "invalid",
  },
];

test.describe("Reseller code/validate input validation — P10 dry-run", () => {
  for (const c of CASES) {
    test(c.label, async ({ request }) => {
      const resp = await request.post(ROUTE, {
        data: c.body as never,
        headers: c.headers ?? { "content-type": "application/json" },
      });
      expect(
        resp.status(),
        `${c.label} returned ${resp.status()} — expected ${c.expectedStatus} (route rejects before any write; only row 5 hits a SELECT). Body: ${await resp.text()}`,
      ).toBe(c.expectedStatus);
      const body = (await resp.json()) as { ok: boolean; reason: string };
      expect(body.ok, `${c.label} body.ok should be false: ${JSON.stringify(body)}`).toBe(false);
      expect(
        body.reason,
        `${c.label} expected reason='${c.expectedReason}' but got '${body.reason}'`,
      ).toBe(c.expectedReason);
    });
  }
});

test.describe("Reseller code/validate — P10 wave-4 happy path", () => {
  test("active_wholesale — POST with active promo code returns 200 + tier_pct + reseller display fields", async ({
    request,
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
    if (fixture.promotionCodes.length === 0) {
      test.skip(
        true,
        "active_wholesale fixture has no reseller_promotion_codes rows — " +
          "seed-qa-reseller.mjs::seedPromotionCodes() (line 359-388) did not " +
          "run on this host, or the QAPROBEWHOLESALEACTIVE20/40 rows were " +
          "deleted. Re-run `node web/scripts/seed-qa-reseller.mjs` against " +
          "staging to re-mint the tier-20 + tier-40 promo codes.",
      );
      return;
    }
    const promo = fixture.promotionCodes[0];
    const resp = await request.post(ROUTE, {
      data: { code: promo.code },
      headers: { "content-type": "application/json" },
    });
    expect(
      resp.status(),
      `active_wholesale + happy 200 returned ${resp.status()} — expected 200 with body.ok=true. A 404 reason='invalid' here means the promo row was dropped (route.ts:61-63); a 404 reason='inactive' means the reseller row flipped away from status='active' (route.ts:72-74); a 503 means SUPABASE_URL/SERVICE_ROLE unset in the Playwright env (route.ts:44-46). Body: ${await resp.text()}`,
    ).toBe(200);
    const body = (await resp.json()) as {
      ok: boolean;
      tier_pct?: number;
      promotion_code_id_present?: boolean;
      reseller?: {
        code?: string;
        display_name?: string;
        logo_url?: string | null;
        primary_color?: string | null;
        billing_model?: string;
      };
      reason?: string;
    };
    expect(
      body.ok,
      `active_wholesale + happy body.ok should be true: ${JSON.stringify(body)}`,
    ).toBe(true);
    expect(body.tier_pct).toBe(promo.tier_pct);
    expect(typeof body.promotion_code_id_present).toBe("boolean");
    expect(body.reseller?.code).toBe(fixture.code);
    expect(body.reseller?.display_name).toBe(fixture.displayName);
    expect(body.reseller?.billing_model).toBe("wholesale");
  });
});

// P10 wave-4 row 157 — paused-reseller × active-promo probes the
// reseller.status !== 'active' branch of /api/reseller/code/validate at
// route.ts:66-74. Where row 158 pins the happy 200 with an active_wholesale
// promo (both promo.active=true AND reseller.status='active'), row 157 pins
// the intermediate state where the promo lookup succeeds (promo.active=true)
// but the reseller org itself has been paused (reseller.status='paused').
// Without the seed delta added in tick 205 (PAUSED_PROMO_TIERS in
// web/scripts/seed-qa-reseller.mjs) this branch was unreachable because the
// paused variant had no active promo row — the route short-circuited at
// route.ts:61-63 with 404 reason='invalid' and collapsed into the
// code_not_found probe already covered by the P10 dry-run block above.
//
// Regression signal: any change to route.ts that swaps the reason strings
// between the two 404 branches, or that reorders the checks so promo.active
// is verified against reseller.status, surfaces here without also breaking
// row 158's happy 200 assertion.
test.describe("Reseller code/validate — P10 wave-4 row 157 paused-reseller inactive branch", () => {
  test("paused — POST with paused reseller's active promo code returns 404 reason='inactive'", async ({
    request,
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
    if (!fixture) {
      test.skip(true, tempResellerSkipReason("paused"));
      return;
    }
    if (fixture.promotionCodes.length === 0) {
      test.skip(
        true,
        "paused fixture has no reseller_promotion_codes rows — " +
          "seed-qa-reseller.mjs::seedPromotionCodes(..., PAUSED_PROMO_TIERS) " +
          "(added tick 205) did not run on this host, or the QAPROBEPAUSED20 " +
          "row was deleted. Re-run `node web/scripts/seed-qa-reseller.mjs` " +
          "against staging to re-mint the tier-20 promo code on the paused " +
          "variant.",
      );
      return;
    }
    const promo = fixture.promotionCodes[0];
    const resp = await request.post(ROUTE, {
      data: { code: promo.code },
      headers: { "content-type": "application/json" },
    });
    expect(
      resp.status(),
      `paused + inactive returned ${resp.status()} — expected 404 with body.ok=false + body.reason='inactive'. A 200 here means the reseller row flipped to status='active' (route.ts:66-74 did not trip); a 404 reason='invalid' means the paused-variant promo row was dropped or deactivated (route.ts:50-63 short-circuited before the reseller.status check); a 503 means SUPABASE_URL/SERVICE_ROLE unset in the Playwright env (route.ts:43-46). Body: ${await resp.text()}`,
    ).toBe(404);
    const body = (await resp.json()) as { ok: boolean; reason?: string };
    expect(
      body.ok,
      `paused + inactive body.ok should be false: ${JSON.stringify(body)}`,
    ).toBe(false);
    expect(
      body.reason,
      `paused + inactive expected reason='inactive' but got '${body.reason}' — the promo lookup succeeded but the reseller status check should have flipped the reason string. Body: ${JSON.stringify(body)}`,
    ).toBe("inactive");
  });
});
