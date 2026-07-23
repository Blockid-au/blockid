// GET /api/reseller/customers/[id]/drawer input-validation contract —
// P10 dry-run per plan § U.7 (three-tab customer drawer) + § H.10
// (reveal-on-click logs to reseller_audit_log; drawer shares the same
// decideReveal id → scope → allowedCustomerIds chokepoint at
// route.ts:62-68) + § J.2 (Playwright must cover the reseller-admin
// endpoints so a regression in the id → scope → decideReveal ordering
// surfaces before the endpoint fires the app_users SELECT, the
// Promise.all fan-out across svi_analyses / revenue_events /
// credit_transactions / credit_balances, or the
// reseller_audit_log(view_customer_drawer) write).
//
// Track A P4.2 shipped tick 22 (see reseller-module-goal.md
// P4.2_customer_drawer). drawer-authz.spec.ts (tick 101) already probes
// the pre-scope auth chain (unauthenticated + non_reseller_admin). This
// spec closes the last remaining coverage gap: the post-scope validation
// branches surfaced by decideReveal(id, allowedCustomerIds) BEFORE the
// app_users SELECT, the fan-out, or the audit-log write.
//
// Twin of reveal-email-validation.spec.ts (tick 117) — same two branches,
// same OUT_OF_SCOPE_UUID sentinel, same harness posture. The routes share
// the decideReveal chokepoint verbatim (customer-reveal.ts is imported by
// both handlers), so the two specs together assert that a regression in
// the shared helper surfaces via both the POST reveal-email lens AND the
// GET drawer lens. Distinct from reveal-email-validation in one dimension
// only — this is the READ lens (GET) rather than the WRITE lens (POST),
// whose blast radius is a durable audit-log row + a joined view-model
// (Overview + Progression + SVI curve + Reports) leaving the boundary
// rather than a single plaintext email.
//
// Two branches are harness-only and safe against staging (no app_users
// SELECT fires, no Promise.all fan-out fires, no
// reseller_audit_log(view_customer_drawer) row is written — decideReveal
// short-circuits BEFORE getSupabaseAdmin, the app_users SELECT, the
// parallel joins, or the audit-log write):
//
//   1. invalid_id   — [id] path segment is not a UUID       → 400 { ok:false, reason:"invalid_id" }
//                     (decideReveal UUID_RE.test() false;
//                     never hits app_users SELECT or audit log)
//   2. not_in_scope — [id] is a well-formed UUID that is    → 403 { ok:false, reason:"not_in_scope" }
//                     not in the reseller's allowedCustomerIds
//                     set (allowed.includes() false;
//                     never hits app_users SELECT or audit log)
//
// Route reference: web/src/app/api/reseller/customers/[id]/drawer/route.ts
//   Line 47-50: getCurrentUser null                     → 401 { reason: "unauthorised" }
//   Line 52-60: scopedReseller throws                   → 403 { reason: err.code }
//   Line 62-68: decideReveal(id, allowedCustomerIds)    → 400 invalid_id | missing_id
//                                                          403 not_in_scope
//   Line 70-73: getSupabaseAdmin() null                 → 503 { reason: "not_configured" }
//   Line 77-87: app_users SELECT + maybeSingle          → 500 lookup_failed / 404 not_found
//   Line 90-135: Promise.all + db.auditLog              → 500 audit_failed
//   Line 148:   200 { ok:true, overview, progression, svi_curve, reports }
//
// Rows 1-2 cover Line 62-68 exclusively. The missing_id branch of
// decideReveal (customerId.length === 0) cannot surface via a live HTTP
// request because Next.js dynamic route matching rejects an empty [id]
// segment and returns 404 at the router before route.ts:47 runs — so
// missing_id is unit-tested in customer-reveal.test.ts (tick 21, 7/7)
// but not reachable here.
//
// Deliberately out of scope (needs per-test seeding which plan §J.2
// forbids or would break sibling specs sharing the same worker):
//   - not_configured (503) — needs SUPABASE_URL/SERVICE_ROLE unset which
//     would break every other Playwright spec in the same worker.
//   - not_found (404) — needs decideReveal to pass BUT then the app_users
//     SELECT to return no row, which requires per-test tampering with
//     app_users (an in-scope customer id that has since been deleted).
//   - lookup_failed (500) — needs the app_users SELECT to error, which
//     requires per-test tampering plan §J.2 forbids.
//   - audit_failed (500) — needs the reseller_audit_log INSERT to fail,
//     which requires per-test tampering plan §J.2 forbids.
//   - Happy path (200 with overview + progression + svi_curve + reports)
//     — fires the app_users SELECT + Promise.all fan-out across
//     svi_analyses / revenue_events / credit_transactions /
//     credit_balances + the reseller_audit_log(view_customer_drawer)
//     write against the harness reseller + attributed customer. ACTIVATED
//     as P10 wave-2 row 147 below (uuid_in_scope + happy branch) via
//     loadTempReseller("active_wholesale") + fixture.attributedUserId as
//     the URL segment. Row 146 (drawer-authz.spec.ts, tick 148) already
//     pinned the full envelope shape; row 147 is a companion probe that
//     proves decideReveal's POSITIVE uuid_in_scope branch fires from the
//     validation-spec surface too, so a regression in
//     allowedCustomerIds().includes() surfaces in both the authz spec
//     (where it would look like a fixture bug) and here (where it lands
//     next to the invalid_id / not_in_scope branches it partners with).
//
// Random UUID that's astronomically unlikely to match any real app_users
// row so the not_in_scope branch fires deterministically. Passes
// decideReveal's UUID_RE shape guard on line 20, then fails the
// allowedCustomerIds membership check on line 23. Mirrored from
// reveal-email-validation.spec.ts so the two specs use identical
// sentinels — if the value ever needs to change (collision with a
// real row) both specs update in lockstep.

import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/accounts";
import {
  harnessSkipReason,
  loadResellerHarness,
  loadTempReseller,
  tempResellerSkipReason,
  type TempResellerFixture,
} from "../fixtures/reseller";

const OUT_OF_SCOPE_UUID = "00000000-0000-4000-8000-000000000001";
const INVALID_ID_SEGMENT = "not-a-uuid";
const DRAWER_ROUTE = (customerId: string) =>
  `/api/reseller/customers/${customerId}/drawer`;

test.describe("Reseller customer-drawer input validation — P10 dry-run", () => {
  const harness = loadResellerHarness();
  test.skip(!harness, harnessSkipReason());

  test("invalid_id — [id] path segment is not a UUID returns 400 invalid_id", async ({
    page,
  }) => {
    await loginAs(page, harness!.admin.email);
    const resp = await page.request.get(
      `/api/reseller/customers/${INVALID_ID_SEGMENT}/drawer`,
    );
    expect(
      resp.status(),
      `invalid_id returned ${resp.status()} — expected 400 before getSupabaseAdmin, app_users SELECT, Promise.all fan-out, or reseller_audit_log write. Body: ${await resp.text()}`,
    ).toBe(400);
    const body = (await resp.json()) as { ok: boolean; reason?: string };
    expect(
      body.ok,
      `invalid_id body.ok should be false: ${JSON.stringify(body)}`,
    ).toBe(false);
    expect(body.reason).toBe("invalid_id");
  });

  test("not_in_scope — well-formed UUID outside allowedCustomerIds returns 403 not_in_scope", async ({
    page,
  }) => {
    await loginAs(page, harness!.admin.email);
    const resp = await page.request.get(
      `/api/reseller/customers/${OUT_OF_SCOPE_UUID}/drawer`,
    );
    expect(
      resp.status(),
      `not_in_scope returned ${resp.status()} — expected 403 before getSupabaseAdmin, app_users SELECT, Promise.all fan-out, or reseller_audit_log write. Body: ${await resp.text()}`,
    ).toBe(403);
    const body = (await resp.json()) as { ok: boolean; reason?: string };
    expect(
      body.ok,
      `not_in_scope body.ok should be false: ${JSON.stringify(body)}`,
    ).toBe(false);
    expect(body.reason).toBe("not_in_scope");
  });
});

// P10 wave-2 row 147 — active_wholesale variant probes decideReveal's
// POSITIVE uuid_in_scope branch (allowedCustomerIds().includes()=true) from
// the drawer-validation surface. Per docs/plans/p10-deferred-spec-activation-
// order.md wave 2:
//   147 | drawer-validation.spec.ts | active_wholesale | uuid_in_scope + happy | 200
//
// Row 146 (drawer-authz.spec.ts, tick 148) already pinned the full envelope
// shape (overview.masked_email / signup_at / credits_balance + progression[0]
// .kind === "signup" + svi_curve/reports arrays). Row 147 partners with the
// invalid_id / not_in_scope branches sitting above and asserts that the same
// well-formed UUID → decideReveal chokepoint that BLOCKS out-of-scope UUIDs
// PASSES an in-scope UUID (fixture.attributedUserId). A regression in
// allowedCustomerIds().includes() would either:
//   (a) leak an out-of-scope UUID through (caught by the not_in_scope test
//       above returning 200 instead of 403), or
//   (b) reject an in-scope UUID (caught here returning 403 instead of 200).
// Both branches must hold for the chokepoint to be sound.
//
// Fixture wiring (wave-2 helper landed tick 147; row 146 landed tick 148):
//   - loadTempReseller("active_wholesale") reads the QAPROBEWHOLESALEACTIVE
//     seed row + resolves adminEmail via the P10 Option A per-variant slot
//     (qa-reseller-wholesale-active@blockid.au) + mirrors reseller_admins.
//   - fixture.attributionExists asserts the seeder also planted a
//     reseller_attributions row so scopedReseller().allowedCustomerIds()
//     surfaces fixture.attributedUserId. Without the row the drawer route
//     returns 403 not_in_scope; the fixture flag lets the spec skip cleanly
//     rather than false-fail as a code regression.
//   - loginAs(page, fixture.adminEmail) opens the reseller-admin session
//     against the DISTINCT per-variant app_users row so scopedReseller()
//     .maybeSingle() does not PGRST116-collide with other variants.
//
// Skip conditions (mirrors wave-2 row 146 posture verbatim):
//   - loadTempReseller returns null when SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
//     are unset or the QAPROBEWHOLESALEACTIVE seed row is missing.
//   - fixture.adminUserId null (variant admin row missing or reseller_admins
//     mirror not seeded — scopedReseller would 403 no_membership).
//   - fixture.attributedUserId null (attributed founder not in app_users).
//   - fixture.attributionExists false (reseller_attributions row missing —
//     drawer would 403 not_in_scope; that is the failure mode row 147 is
//     designed to catch, so a partial-seed host must skip rather than
//     false-fail).
//   - loginAs throws when /tmp/blockid-qa-accounts.txt has no row for the
//     resolved admin email.
//
// Non-Stripe / non-GST discipline: mirrors row 146 — no promotion_code
// lookup, no Stripe network call, no InfoVision dependency. P8.5 + P1.5
// remain neither a dependency nor a consequence. The audit-log write is
// captured by wave-5 row 179 (audit-log-writes.spec.ts) so this row focuses
// on the read envelope only.
//
// Assertion scope per wave-2 prep-cost note ("rows 145-149 each add 2-3
// assertions"): row 146 pinned the FULL envelope shape; row 147 pins
// only the two dimensions that row 146 covers by side-effect but that this
// spec's siblings (invalid_id / not_in_scope) do NOT — status 200 with
// body.ok true (proves decideReveal's positive branch fires) plus overview
// defined + progression is a non-empty array (proves the chain COMPLETES
// through the app_users SELECT + fan-out + audit-log write without a 5xx
// leaking through). Body shape is authoritatively tested at
// customer-drawer.test.ts (10/10) and pinned at the wire in row 146.
test.describe("Reseller customer-drawer — P10 wave-2 uuid_in_scope happy", () => {
  test("active_wholesale — well-formed UUID inside allowedCustomerIds returns 200 with drawer envelope", async ({
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
    const resp = await page.request.get(DRAWER_ROUTE(attributedUserId));
    expect(
      resp.status(),
      `uuid_in_scope + happy returned ${resp.status()} — expected 200. A 403 not_in_scope here means allowedCustomerIds().includes() rejected an in-scope UUID (mirror of the not_in_scope branch above). A 5xx here means the chain (app_users SELECT + fan-out + audit-log) leaked through. Body: ${await resp.text()}`,
    ).toBe(200);
    const body = (await resp.json()) as {
      ok: boolean;
      overview?: {
        display_name: string | null;
        masked_email: string;
        signup_at: string;
        last_active_at: string | null;
        onboarding_completed: boolean;
        plan_label: string | null;
        credits_balance: number;
        mrr_aud_cents: number;
      };
      progression?: Array<{
        kind: string;
        ts: string;
        label: string;
        detail?: string | null;
        phase?: number | null;
      }>;
      svi_curve?: unknown;
      reports?: unknown;
      reason?: string;
    };
    expect(
      body.ok,
      `uuid_in_scope + happy body.ok should be true: ${JSON.stringify(body)}`,
    ).toBe(true);
    expect(body.overview, "overview missing").toBeDefined();
    // Tick 226 — mirror tick 225's row 146 OverviewSummary + progression[0]
    // shape pins onto drawer-validation row 147 so the twin discipline
    // established at drawer-authz row 146 stays coherent across the drawer
    // spec pair. Same 7 new expects, same position, same null-or-typeof-
    // string discipline as tick 223 row 161 + tick 224 row 156 + tick 225
    // row 146. Shape pins only — no VALUE assertions on fields that drift
    // across staging seed rewrites. See drawer-authz.spec.ts:245-283 for
    // the parallel rationale (nullable-string columns in app_users, `!!`
    // coercion on onboarding_completed at customer-drawer.ts:282, mrr
    // accumulator at customer-drawer.ts:263+285, signup event ts+label
    // pushed at customer-drawer.ts:122-126).
    expect(
      body.overview?.display_name === null ||
        typeof body.overview?.display_name === "string",
    ).toBe(true);
    expect(typeof body.overview?.masked_email).toBe("string");
    expect(typeof body.overview?.signup_at).toBe("string");
    expect(
      body.overview?.last_active_at === null ||
        typeof body.overview?.last_active_at === "string",
    ).toBe(true);
    expect(typeof body.overview?.onboarding_completed).toBe("boolean");
    expect(
      body.overview?.plan_label === null ||
        typeof body.overview?.plan_label === "string",
    ).toBe(true);
    expect(typeof body.overview?.credits_balance).toBe("number");
    expect(typeof body.overview?.mrr_aud_cents).toBe("number");
    expect(Array.isArray(body.progression)).toBe(true);
    expect((body.progression ?? []).length).toBeGreaterThan(0);
    // Tick 227 — mirror row 146's progression[0].kind === "signup" literal pin
    // onto row 147 so the twin kind-literal coverage aligns across the drawer
    // spec pair. buildProgressionTimeline at customer-drawer.ts:122-126 always
    // pushes the signup event first with the literal string "signup" as .kind.
    // A regression that reordered the timeline (e.g. onboarding_completed
    // sorted before signup by ts) would break the drawer client renderer's
    // signup-anchor and now surfaces in both the authz spec (where it landed
    // at tick 148) and here (validation surface).
    expect(body.progression?.[0]?.kind).toBe("signup");
    expect(typeof body.progression?.[0]?.ts).toBe("string");
    expect(typeof body.progression?.[0]?.label).toBe("string");
  });
});
