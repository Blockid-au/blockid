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

// Deterministic mask shape produced by maskEmail() at
// web/src/lib/reseller/customer-reveal.ts:34-42 — the sole normaliser on the
// drawer route's overview.masked_email write path (buildOverviewSummary at
// web/src/lib/reseller/customer-drawer.ts pipes app_users.email through
// maskEmail before the wire). Shape is `<1-2 non-@ chars>***@<domain>` per
// the branch split at customer-reveal.ts:40-41 (local.length <= 2 → 1 char;
// local.length > 2 → 2 chars). Pre-tick this row pinned masked_email only
// to typeof string (line 297) — strictly weaker than the twin sibling at
// drawer-authz.spec.ts:242-244 which pinned typeof string + .toContain("@")
// + .toMatch(/\*/). Landed tick 233 in the same twin-symmetrisation
// discipline as tick 231 option (j) + tick 232 option (l) — hoist the shape
// invariant to a module-scope constant matching the drawer-authz twin so
// both files point at the same literal. A regression that leaked plaintext
// through the drawer route or that changed the mask envelope surfaces on
// the first offending row instead of at visual QA.
const MASKED_EMAIL_RE = /^[^@\s]{1,2}\*\*\*@[^@\s]+$/;

// Tick 380 — reseller_attributions row-cluster cross-column invariant summary
// (option (i) from tick 379 next-picks). Cross-surface twin-lift of the tick
// 376/377/378/379 module-scope summary onto drawer-validation.spec.ts — the
// SECOND SELECT-LENS reseller_attributions-touching surface and the
// close-out of the drawer spec pair to 2/2 parity within the drawer-authz-
// authz-and-validation subset (mirrors the tick 377 close-out of the create-
// startup pair + tick 375 close-out of the credit-grant pair). Raises 5/16
// surface parity on the reseller_attributions row cluster; 11 sibling
// touching surfaces still pending (me-attribution, scope-boundary, reveal-
// email-authz, reveal-email-validation, credit-grant-authz, credit-grant-
// validation, audit-log-writes, audit-anomaly-scan, sandbox-setup-authz,
// admin-reseller-detail-authz, admin-reseller-detail-validation).
//
// The reseller_attributions row cluster carries FIVE invariants at
// web/supabase/migrations/0091_reseller_module_foundations.sql:112-142
// (IDENTICAL enumeration to tick 376/377/378/379):
//   - ck_subject_fk_matches_type (0091:128-132) — CROSS-COLUMN: subject_type=
//                                                  'user'⇒subject_user_id set
//                                                  + subject_project_id null;
//                                                  subject_type='project'⇒
//                                                  inverse
//   - subject_type CHECK          (0091:115)     — subject_type ∈ {user,
//                                                  project}
//   - status CHECK                (0091:118-119) — status ∈ {active, revoked}
//                                                  (DEFAULT 'active')
//   - source CHECK                (0091:123)     — source ∈ {code,
//                                                  provisioned, admin_manual}
//   - reseller_attributions_active_project_uniq  — PARTIAL-UNIQUE INDEX
//     (0091:137-139)                              on (subject_project_id)
//                                                  WHERE subject_type=
//                                                  'project' AND status=
//                                                  'active' AND opted_out=
//                                                  false; enforces per U.15.1
//                                                  that a project can carry
//                                                  at most ONE active non-
//                                                  opted-out attribution
//                                                  regardless of reseller
//
// Writer-side source: IDENTICAL to tick 376/377/378/379 — DB CHECK + partial-
// unique guards at 0091:112-142 wrap every reseller_attributions insert;
// enforcement happens at DB write time. Route-side callers precompose the
// insert payload under an always-'project' discriminator — the 'user' branch
// of ck_subject_fk_matches_type is UNREACHABLE-BY-CONSTRUCTION from EVERY
// current write path (grep audit: retail-attribution.ts:165-172 + create-
// startup/route.ts:301-313 both hard-code subject_type='project' + subject_
// project_id=<uuid> + subject_user_id=null; no code path ever inserts
// subject_type='user').
//
// Application read-path anchor for THIS surface: IDENTICAL to tick 379.
// This spec anchors at web/src/lib/reseller/scope.ts:63-84 via scopedReseller
// .allowedCustomerIds() — the canonical SELECT-lens read of the reseller_
// attributions cluster. The lazy allowedCustomerIds() query filters on
// (reseller_id, status='active', opted_out=false) which exactly matches the
// WHERE clause of the reseller_attributions_active_project_uniq partial-
// unique index at 0091:137-139, then splits the rows on subject_type ∈
// {user, project} — the 'user' branch is DEAD CODE at line 73 of scope.ts
// because no write path ever inserts subject_type='user' per the tick 376/
// 377/378/379 UNREACHABLE-BY-CONSTRUCTION posture. The drawer route consumes
// the resolved user-id set at route.ts:63-68 via decideReveal(id,
// allowedCustomerIds) which returns invalid_id / not_in_scope BEFORE the
// downstream app_users SELECT, Promise.all fan-out, or audit log fires.
//
// Runtime enforcement on THIS spec: DIFFERENT from tick 379 — FIRST SELECT-
// LENS surface where the HARNESS-MODE rows DO fire the allowedCustomerIds()
// SELECT. Both drawer-validation rows (row 1 invalid_id 400 + row 2 not_in_
// scope 403) run under loadResellerHarness() with the reseller-admin session
// established — that means BOTH reach route.ts:63 which awaits scope
// .allowedCustomerIds() BEFORE decideReveal fires the shape/scope check.
// Contrast with drawer-authz.spec.ts (tick 379) where rows 1 (unauthenticated
// 401) + 2 (non_reseller_admin 403 no_membership) BAIL upstream at route.ts:
// 47 (getCurrentUser null) or route.ts:54 (scopedReseller throws), so the
// SELECT never runs on the drawer-authz harness-mode rows. Consequently,
// drawer-validation carries the FIRST harness-mode SELECT-lens coverage on
// the cluster: BOTH rows fire the (reseller_id, status='active', opted_out=
// false) SELECT filter, then diverge on the decideReveal check — row 1
// returns 400 invalid_id because "not-a-uuid" fails UUID_RE at customer-
// reveal.ts:20; row 2 returns 403 not_in_scope because the well-formed
// OUT_OF_SCOPE_UUID passes UUID_RE but fails allowedIds.includes() at
// customer-reveal.ts:23. Wave-2 row 147 (active_wholesale happy path) DOES
// reach decideReveal's POSITIVE uuid_in_scope branch — the SELECT fires and
// returns the seeded reseller_attributions row for fixture.attributedUserId,
// then the decideReveal check passes because fixture.attributedUserId lives
// in the resolved allowedCustomerIds set. That row exercises the full READ-
// side lens on the cluster INCLUDING the positive membership branch.
//
// Coverage-per-guard posture on this surface: ZERO-COVERAGE-PER-GUARD on
// all five CHECK/index invariants — SELECT does not fire DB CHECK
// constraints, and read-side hits on the partial-unique index only
// validate index existence rather than uniqueness enforcement. IDENTICAL
// to tick 379 posture. The 'project' branch of ck_subject_fk_matches_type
// is READ-side EXERCISED at rows 1 + 2 + 147 via the subject_type='project'
// filter but the CHECK itself only fires on write; the 'user' branch
// remains UNREACHABLE-BY-CONSTRUCTION AND is DEAD CODE at scope.ts:73.
// Status 'active' branch is READ-side EXERCISED via the .eq("status",
// "active") filter; 'revoked' branch remains UNREACHABLE from insert.
// Source CHECK all three enum branches ZERO-COVERAGE-PER-GUARD on both
// write and read (the SELECT projection at scope.ts:65 does not include
// source, so a regression that widened the source enum would not surface
// here).
//
// Symmetric-cluster posture: THIS surface closes the drawer spec pair to
// 2/2 parity within the drawer-authz-authz-and-validation subset — both
// drawer-authz (SELECT-lens, harness-mode-rows-bail-upstream) and drawer-
// validation (SELECT-lens, harness-mode-rows-fire-SELECT) now carry the
// same tick 376/377/378/379/380 module-scope invariant summary pinned to
// the same 0091:112-142 line anchor. Combined post-tick 380 posture: 5/16
// total surfaces summarised on the cluster (create-startup-authz tick 376
// + create-startup-validation tick 377 + attribution-timing tick 378 +
// drawer-authz tick 379 + drawer-validation this tick — closes drawer pair
// to 2/2 within the SELECT-lens subset). 11 sibling touching surfaces
// still pending twin-lift. The 'user'-branch complement stays ASYMMETRIC +
// UNREACHABLE-BY-CONSTRUCTION + DEAD-CODE-AT-READ across the entire
// codebase per tick 376/377/378/379 posture — full 16-surface × 5-invariant
// saturation would collate ZERO-COVERAGE-PER-GUARD × UNREACHABLE-BY-
// CONSTRUCTION documentation on the 'user' branch across every touching
// spec.
//
// Diagnostic delta of this pass: pure documentation-only doc-block hoist —
// no new imports, no new module-scope constants, no per-column assert
// added, no fixture change, no route change, no migration change. Doc-
// block placed after the MASKED_EMAIL_RE const (line ~125) and before the
// first test.describe (line ~127 pre-edit), matching the tick 376
// placement on create-startup-authz.spec.ts (after NON_RESELLER_FOUNDER_
// EMAIL const, before first test.describe), the tick 377 placement on
// create-startup-validation.spec.ts (after CASES const, before first
// test.describe), the tick 378 placement on attribution-timing.spec.ts
// (after shared-fixture imports, before first test.describe), and the
// tick 379 placement on drawer-authz.spec.ts (after MASKED_EMAIL_RE const,
// before first test.describe). Twin-lift symmetry across the drawer spec
// pair now literal — the two doc-blocks share verbatim structure adjusted
// for the harness-mode-rows-fire-SELECT delta above.

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
        chapterSlug?: string | null;
        href?: string | null;
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
    // Tick 233 — tighten from typeof-string-only to the exact shape emitted
    // by maskEmail() (see MASKED_EMAIL_RE above). Strictly stronger than the
    // pre-tick typeof-string pin and matches the drawer-authz.spec.ts:245
    // twin landing this tick so both drawer spec files hold masked_email to
    // the same envelope. Catches a regression that leaked a plaintext email
    // through the drawer route or that changed the mask envelope (e.g.
    // widened the prefix from 1-2 chars to 3+, dropped the '@' separator,
    // or swapped '***' for another literal).
    expect(body.overview?.masked_email ?? "").toMatch(MASKED_EMAIL_RE);
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
    // Tick 228 — option (f): mirror row 146's progression[0] optional-field
    // shape pins (detail / phase / chapterSlug / href per ProgressionEvent
    // at customer-drawer.ts:32-38) onto row 147 so the twin discipline
    // established at rows 146/147 stays coherent across the drawer spec
    // pair. Tick 230 — option (h): twin-symmetrise the drawer-authz row 146
    // VALUE tightening onto row 147 so the phase-1 triple pins align across
    // the pair. See drawer-authz.spec.ts:299-326 for the parallel rationale
    // (PHASE_BY_KIND[signup] = 1 → chapterSlugForPhase(1) = "01-vision" →
    // href "/guide/01-vision"; detail stays null-or-typeof-string since the
    // signup push drops the key on the wire; VALUE pins catch a regression
    // that renamed the phase-1 slug or re-mapped signup's phase without a
    // synchronised bump across the tour-state + phase-distribution + guide
    // surfaces that all read startup-journey.ts as the single source).
    expect(
      body.progression?.[0]?.detail == null ||
        typeof body.progression?.[0]?.detail === "string",
    ).toBe(true);
    expect(body.progression?.[0]?.phase).toBe(1);
    expect(body.progression?.[0]?.chapterSlug).toBe("01-vision");
    expect(body.progression?.[0]?.href).toBe("/guide/01-vision");
  });
});
