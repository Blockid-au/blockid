// GET /api/admin/resellers/[code] input-validation contract — P10 dry-run
// per plan §C.5 (admin surfaces) and §J.2 (Playwright must cover the admin
// surfaces so a regression in the pre-load validators surfaces before the
// endpoint reads the resellers row or the four related-rows Promise.all
// fan-out that follows).
//
// admin-reseller-detail-authz.spec.ts (tick 104) already probes the two
// pre-scope requireAdmin branches (unauthenticated → 401 no_user;
// non_admin → 401 not_admin). This spec closes the two pre-read body-and-
// path validators that fire BEFORE the resellers SELECT + the
// promotion_codes/admins/attributions/commissions Promise.all, both safely
// exercisable against staging without seeding a resellers row (plan §J.2):
//
//   1. code_required — GET with a path segment that normalises to null
//                      (all-punctuation "---") after normaliseResellerCode's
//                      trim/uppercase/[^A-Z0-9] strip           → 400 { ok:false, reason:"code_required" }
//                      (bails at route.ts:55-56 before loadReseller, before
//                      the four related-rows Promise.all runs)
//
//   2. not_found      — GET with a well-formed code path that does not
//                       resolve to a resellers row              → 404 { ok:false, reason:"not_found" }
//                       (loadReseller returns error='not_found' at route.ts
//                       :58-62 before the four related-rows Promise.all runs)
//
// Both branches return BEFORE the four related-rows Promise.all fires (row 1
// short-circuits at code check; row 2 at loadReseller not_found), so the
// spec is safe against staging (no resellers row is read, no promotion_codes
// / admins / attributions / commissions payload leaks, no P1.5 InfoVision
// seed is touched even after H.20 clears).
//
// Twin of admin-reseller-delete-validation.spec.ts (tick 125) — same route
// file, same pre-load validators, same normaliseResellerCode source (URL
// path segment via params.code, not request body). Differs in one dimension
// only — GET is a read (loadReseller + Promise.all fan-out) rather than a
// write (resellers UPDATE status=terminated), but the pre-load validator
// surface is IDENTICAL: code_required + not_found return in the same order,
// with the same envelope, before any DB read fires. The full row set stays
// at two (code_required + not_found).
//
// Route reference: web/src/app/api/admin/resellers/[code]/route.ts
//   Line 21-32:   gate() — getCurrentUser + requireAdmin → 401 no_user / not_admin  (admin-reseller-detail-authz)
//   Line 47-56:   normaliseResellerCode(params.code)   → 400 code_required          ← this spec (row 1)
//   Line 58-70:   loadReseller                         → 404 not_found / 503 not_configured / 500 query_failed  ← this spec (row 2)
//   Line 74-97:   promotion_codes + admins + attributions + commissions Promise.all (needs a seeded resellers row + reads real DB — deferred to temp-reseller mint fixture)
//   Line 113-120: 200 { ok, reseller, promotion_codes, admins, attributions_summary, commissions }
//
// Deliberately out of scope (needs a seeded resellers row which plan §J.2
// forbids per-test or would poison every other admin-facing spec in the same
// worker):
//   - Happy path (200) — ACTIVATED wave-5 row 168 below via
//     loadAdminHarness() (qa-admin-1@blockid.au) + loadTempReseller(
//     'active_wholesale') (fetches the QAPROBEWHOLESALEACTIVE seed row).
//     Reads real resellers + reseller_promotion_codes + reseller_admins +
//     reseller_attributions + reseller_commissions_current rows for the
//     variant — pins envelope shape without pinning any array lengths so
//     the row is idempotent under CI replay across fresh + seeded hosts.
//     Twin of row 167 (admin-reseller-detail-authz happy 200) — same
//     endpoint, same fixture wiring, same coverage-vs-duplication call.
//     Kept in this spec so a refactor of the pre-read validators does not
//     accidentally reject well-formed happy calls.
//   - not_configured (503) — needs SUPABASE_URL/SERVICE_ROLE unset which
//     would break every other Playwright spec in the same worker.
//   - query_failed (500) — needs a broken resellers SELECT which requires
//     per-test tampering plan §J.2 forbids.
//
// Path-segment probes:
//   Row 1 uses "---" so normaliseResellerCode('---'.trim().toUpperCase()
//   .replace(/[^A-Z0-9]/g, '')) returns "" → null, tripping the code_required
//   guard before any downstream side effect.
//   Row 2 uses PROBE_CODE = "qa-probe-should-not-persist" — a stable
//   lowercase-kebab prefix that will not collide with any real reseller_code
//   (INFOVISION, ACCEL_*, etc.). normaliseResellerCode strips the hyphens
//   and uppercases, yielding "QAPROBESHOULDNOTPERSIST" — a 22-char code that
//   safely does not match any seeded row (P1.5 InfoVision seed remains
//   HUMAN-BLOCKED on H.20 anyway).

import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/accounts";
import {
  adminHarnessSkipReason,
  loadAdminHarness,
  loadTempReseller,
  tempResellerSkipReason,
  type TempResellerFixture,
} from "../fixtures/reseller";

const PROBE_CODE = "qa-probe-should-not-persist";
const ALL_PUNCT_CODE = "---";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Uppercase-alphanumeric invariant for promotion_codes[].code — matches the
// buildPromoCodeName write-path guarantee at
// web/src/lib/reseller/promotion-code-mint.ts:41-58 (uppercase + <=40 chars,
// composed from normaliseResellerCode() output + optional SUFFIX_RE-vetted
// tier suffix). The DB column reseller_promotion_codes.code (0091:91) is
// UNIQUE but carries NO CHECK constraint, so the invariant lives ONLY on the
// application write path. Pinning the shape at the Playwright layer catches
// a regression that INSERTed a raw / lowercase / punctuated code straight
// past buildPromoCodeName (e.g. a P9.4 approve-branch bypass). Landed tick
// 232 in the same twin-symmetrisation discipline as tick 231 option (j)
// which pinned resellers.code across the admin-list surfaces.
const PROMO_CODE_RE = /^[A-Z0-9]+$/;
const BILLING_MODELS = new Set(["retail", "wholesale"]);
const STATUSES = new Set(["active", "paused", "terminated"]);

interface ValidationCase {
  label: string;
  code: string;
  expectedStatus: 400 | 404;
  expectedReason: "code_required" | "not_found";
}

const CASES: ValidationCase[] = [
  {
    label:
      "code_required — GET with all-punctuation code segment returns 400 code_required",
    code: ALL_PUNCT_CODE,
    expectedStatus: 400,
    expectedReason: "code_required",
  },
  {
    label:
      "not_found — GET with well-formed code that does not resolve returns 404 not_found",
    code: PROBE_CODE,
    expectedStatus: 404,
    expectedReason: "not_found",
  },
];

test.describe("Admin reseller GET input validation — P10 dry-run", () => {
  const harness = loadAdminHarness();
  test.skip(!harness, adminHarnessSkipReason());

  for (const c of CASES) {
    test(c.label, async ({ page }) => {
      await loginAs(page, harness!.admin.email);
      const route = `/api/admin/resellers/${c.code}`;
      const resp = await page.request.get(route);
      expect(
        resp.status(),
        `${c.label} returned ${resp.status()} — expected ${c.expectedStatus} (pre-read validator rejects before loadReseller + related-rows Promise.all). Body: ${await resp.text()}`,
      ).toBe(c.expectedStatus);
      const body = (await resp.json()) as { ok: boolean; reason?: string };
      expect(
        body.ok,
        `${c.label} body.ok should be false: ${JSON.stringify(body)}`,
      ).toBe(false);
      expect(
        body.reason,
        `${c.label} expected reason='${c.expectedReason}' but got '${body.reason}'`,
      ).toBe(c.expectedReason);
    });
  }
});

// P10 wave-5 row 168 happy path — active_wholesale variant + admin harness →
// 200 with detail payload. Per docs/plans/p10-deferred-spec-activation-order.md
// wave 5:
//   168 | admin-reseller-detail-validation.spec.ts | active_wholesale |
//         code_required / not_found / happy | 400 / 404 / 200
//
// The code_required (400) + not_found (404) branches above are harness-free
// (they short-circuit before loadReseller fires). This block closes the
// third row in the same file's contract table — the control 200 that
// proves the two reject branches above genuinely reject on their specific
// validator logic and not on a stale auth or a broken URL contract.
//
// Twin of row 167 (admin-reseller-detail-authz happy 200 tick 168). The
// two happy-path activations pin the same endpoint from two spec files so
// a route refactor that changes the DETAIL envelope surfaces in both on
// the next `npx playwright test` run. Kept in this spec so a future
// tightening of the pre-read validators cannot silently reject well-formed
// admin GETs — the happy row runs in the same file as the reject rows.
//
// Route reference: web/src/app/api/admin/resellers/[code]/route.ts
//   Line 21-32:  gate() — getCurrentUser + requireAdmin → 401 no_user / not_admin (row 167 authz)
//   Line 47-56:  code normalisation → 400 code_required (row 168 above)
//   Line 58-70:  loadReseller → 404 not_found / 503 / 500 (row 168 above)
//   Line 74-97:  Promise.all — reseller_promotion_codes + reseller_admins +
//                reseller_attributions + reseller_commissions_current
//   Line 113-120: 200 { ok, reseller, promotion_codes, admins,
//                       attributions_summary: {total, active, by_source},
//                       commissions }
//
// Fixture wiring:
//   - loadAdminHarness() resolves qa-admin-1@blockid.au — a real admin
//     session so requireAdmin() returns without throwing.
//   - loadTempReseller('active_wholesale') reads the QAPROBEWHOLESALEACTIVE
//     seed row so fixture.code is the real DB code. adminUserId is NOT
//     needed here because we log in as the ADMIN, not the reseller-admin
//     for the variant — the admin gate is independent of scopedReseller().
//
// Skip conditions:
//   - loadAdminHarness returns null (QA_ADMIN_EMAIL unset or not seeded).
//   - loadTempReseller returns null (SUPABASE_URL / SUPABASE_SERVICE_ROLE_
//     KEY unset or QAPROBEWHOLESALEACTIVE seed row missing).
//   - loginAs throws when /tmp/blockid-qa-accounts.txt has no row for the
//     resolved admin email.
//
// State-pollution posture: read-only GET — no INSERT / UPDATE / DELETE
// fires from this endpoint. Idempotent under CI replay. No fixture
// cleanup wiring because the fixture only reads existing seed rows.
//
// Coverage-vs-duplication call: pin 200 + body.ok=true + reseller shape
// (id UUID, code === fixture.code uppercased, display_name string,
// billing_model ∈ {retail, wholesale}, status ∈ {active, paused,
// terminated}) + Array.isArray on the four related-rows arrays +
// attributions_summary { total: number, active: number, by_source:
// object }. Do NOT pin ANY array length — promotion_codes may hold 0-3
// rows (tiers 20 + 40 seeded for active_wholesale + optional admin
// mints); admins holds ≥1 (per-variant reseller_admins row when the
// multi-admin cohort seeder ran) or 0 otherwise; commissions may be
// empty on fresh CI or ≥1 on hosts where P3 webhook accrual has fired;
// attributions_summary.total varies with whether the attributed-founder
// seed has been planted. Per-row shape pins on promotion_codes + admins
// catch a route regression that dropped a column from the SELECT list
// (route.ts:75-77 lists the exact column set) without depending on
// seed volume.
//
// Non-Stripe / non-GST discipline: reads resellers +
// reseller_promotion_codes + reseller_admins + reseller_attributions +
// reseller_commissions_current only. No Stripe network call, no
// InfoVision dependency, no revenue_events read. P8.5 + P1.5 remain
// neither a dependency nor a consequence.
test.describe("Admin reseller GET input validation — P10 wave-5 row 168 happy path", () => {
  const harness = loadAdminHarness();
  test.skip(!harness, adminHarnessSkipReason());

  test("active_wholesale — GET with well-formed code as qa-admin-1 returns 200 with detail payload", async ({
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
    try {
      await loginAs(page, harness!.admin.email);
    } catch (err) {
      test.skip(
        true,
        `Admin QA account not seeded: ${(err as Error).message}. Run ` +
          `scripts/seed-test-users.mjs to populate /tmp/blockid-qa-accounts.txt.`,
      );
      return;
    }

    const detailRoute = `/api/admin/resellers/${fixture.code.toLowerCase()}`;
    const resp = await page.request.get(detailRoute);
    expect(
      resp.status(),
      `active_wholesale + happy GET returned ${resp.status()} — expected 200 after requireAdmin() passes, normaliseResellerCode accepts the fixture code, and loadReseller resolves the QAPROBEWHOLESALEACTIVE row. A 400 code_required means the fixture code was rejected by normalisation (attribution.ts:25-29). A 404 not_found means the seed row is missing (run seed-qa-reseller.mjs). A 5xx means one of the four Promise.all SELECTs failed (route.ts:74-97). Body: ${await resp.text()}`,
    ).toBe(200);

    const body = (await resp.json()) as {
      ok?: unknown;
      reseller?: {
        id?: unknown;
        code?: unknown;
        display_name?: unknown;
        billing_model?: unknown;
        status?: unknown;
      };
      promotion_codes?: Array<{
        id?: unknown;
        tier_pct?: unknown;
        code?: unknown;
      }>;
      admins?: Array<{
        id?: unknown;
        user_id?: unknown;
        role?: unknown;
        status?: unknown;
      }>;
      attributions_summary?: {
        total?: unknown;
        active?: unknown;
        by_source?: unknown;
      };
      commissions?: unknown;
    };

    expect(
      body.ok,
      `happy body.ok should be true: ${JSON.stringify(body).slice(0, 200)}`,
    ).toBe(true);

    // Reseller row shape — reads resellers.* (route.ts:37-41).
    expect(body.reseller, "body.reseller should be present").toBeTruthy();
    expect(
      typeof body.reseller?.id === "string" &&
        UUID_RE.test(body.reseller!.id as string),
      `reseller.id should be UUID: ${JSON.stringify(body.reseller).slice(0, 200)}`,
    ).toBe(true);
    expect(
      body.reseller?.code,
      `reseller.code should equal fixture.code (uppercase form): ${JSON.stringify(body.reseller).slice(0, 200)}`,
    ).toBe(fixture.code);
    // Tick 338 — reseller.display_name message-symmetry lift on this
    // detail-validation spec, cross-surface twin of the tick 327 lift on
    // admin-reseller-detail-authz.spec.ts and the tick 336 lift on
    // admin-resellers-list-authz.spec.ts. Executes tick 337 next-pick
    // option (a) verbatim: the last outstanding tick-1710 baseline bare
    // `expect(typeof body.reseller?.display_name).toBe("string")` on this
    // spec was the only projected column on the body.reseller single-row
    // lens still carrying the bare typeof half. Two-part guard: (a)
    // typeof-string labelled with diagnostic prose preserves the NOT-NULL
    // raw-type discipline; (b) String(...).trim().length > 0 shape assert
    // catches an unvalidated INSERT / bypass write path that stamped
    // display_name='' or display_name='   ' straight past the admin-
    // validator.ts:66-70 display_name_blank guard. Writer-side source:
    // resellers.display_name declared at 0091:25 as `display_name text
    // NOT NULL` — DB carries NO CHECK against blank/whitespace-only
    // values so the trim non-blank half is the sole shape backstop.
    expect(
      typeof body.reseller?.display_name,
      `reseller.display_name '${String(body.reseller?.display_name)}' should be a string (text NOT NULL per 0091:25; a schema-side NOT NULL drop, a projection-side drop from route.ts:37-41 select("*"), or a PostgREST serialisation regression that returned null|undefined would surface here — separated from the trim-non-blank check below so a raw-type flip does not hide behind a length-based diagnostic). Reseller: ${JSON.stringify(body.reseller).slice(0, 200)}`,
    ).toBe("string");
    expect(
      String(body.reseller?.display_name ?? "").trim().length > 0,
      `reseller.display_name '${String(body.reseller?.display_name)}' should be a non-blank string (admin-validator.ts:66-70 rejects trimmed-empty writes with reason='display_name_blank' but the DB has no CHECK constraint against blank/whitespace-only values — a bypass write path that INSERTed display_name='' or display_name='   ' straight past validateAdminResellerPatch would surface here). Reseller: ${JSON.stringify(body.reseller).slice(0, 200)}`,
    ).toBe(true);
    expect(
      BILLING_MODELS.has(body.reseller?.billing_model as string),
      `reseller.billing_model should be retail|wholesale: ${JSON.stringify(body.reseller).slice(0, 200)}`,
    ).toBe(true);
    expect(
      STATUSES.has(body.reseller?.status as string),
      `reseller.status should be active|paused|terminated: ${JSON.stringify(body.reseller).slice(0, 200)}`,
    ).toBe(true);

    // Related-rows arrays — do NOT pin length; each row-shape pin catches
    // a SELECT-column drift on the route-side Promise.all (route.ts:74-97).
    expect(
      Array.isArray(body.promotion_codes),
      `promotion_codes should be an array: ${JSON.stringify(body).slice(0, 200)}`,
    ).toBe(true);
    for (const row of body.promotion_codes ?? []) {
      expect(
        typeof row.id === "string" && UUID_RE.test(row.id as string),
        `promotion_codes[].id should be UUID: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      expect(typeof row.tier_pct).toBe("number");
      // Tick 232 twin-symmetrisation with admin-reseller-detail-authz.spec.ts
      // row 335: shape-pin promotion_codes[].code against PROMO_CODE_RE
      // (uppercase alphanumeric per buildPromoCodeName). A route regression
      // that echoed a raw / lowercase / punctuated code (bypassing the P9.4
      // approve-branch normalisation) surfaces here on the first offending
      // row rather than only at visual QA of /admin/resellers/[code].
      expect(typeof row.code).toBe("string");
      expect(row.code as string).toMatch(PROMO_CODE_RE);
    }

    expect(
      Array.isArray(body.admins),
      `admins should be an array: ${JSON.stringify(body).slice(0, 200)}`,
    ).toBe(true);
    for (const row of body.admins ?? []) {
      expect(
        typeof row.id === "string" && UUID_RE.test(row.id as string),
        `admins[].id should be UUID: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      expect(
        typeof row.user_id === "string" && UUID_RE.test(row.user_id as string),
        `admins[].user_id should be UUID: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      expect(typeof row.role).toBe("string");
      expect(typeof row.status).toBe("string");
    }

    // Attributions summary — pins the {total, active, by_source} shape
    // computed by route.ts:104-111. Sub-map by_source is an object with
    // numeric counts; not pinning its keys because sources vary.
    expect(
      body.attributions_summary,
      `attributions_summary should be present: ${JSON.stringify(body).slice(0, 200)}`,
    ).toBeTruthy();
    expect(typeof body.attributions_summary?.total).toBe("number");
    expect(typeof body.attributions_summary?.active).toBe("number");
    expect(
      body.attributions_summary?.by_source !== null &&
        typeof body.attributions_summary?.by_source === "object" &&
        !Array.isArray(body.attributions_summary?.by_source),
      `attributions_summary.by_source should be a plain object: ${JSON.stringify(body.attributions_summary).slice(0, 200)}`,
    ).toBe(true);

    expect(
      Array.isArray(body.commissions),
      `commissions should be an array: ${JSON.stringify(body).slice(0, 200)}`,
    ).toBe(true);
  });
});
