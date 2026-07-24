// POST /api/reseller/customers/[id]/reveal-email input-validation contract —
// P10 dry-run per plan §C.1.2 (masked email chokepoint) + §H.10 (reveal-on-
// click logs to reseller_audit_log) + §J.2 (Playwright must cover the
// reseller-admin endpoints so a regression in the id → scope → decideReveal
// ordering surfaces before the endpoint fires app_users SELECT or the
// reseller_audit_log(reveal_email) write).
//
// Track A P4.1 shipped tick 21 (see reseller-module-goal.md
// P4.1_reveal_email_audit). reveal-email-authz.spec.ts (tick 100) already
// probes the pre-scope auth chain (unauthenticated + non_reseller_admin).
// This spec closes the last remaining coverage gap: the post-scope
// validation branches surfaced by decideReveal(id, allowedCustomerIds)
// BEFORE the app_users SELECT and reseller_audit_log write. Mirrors the
// credit-grant-validation / requests-validation / create-startup-validation
// posture — validation rows fire behind loadResellerHarness() so the QA
// harness owns the scoped reseller session and no per-test row seeding is
// needed.
//
// Two branches are harness-only and safe against staging (no app_users
// SELECT fires, no reseller_audit_log(reveal_email) row is written —
// decideReveal short-circuits BEFORE getSupabaseAdmin, the app_users
// SELECT, or the audit-log write):
//
//   1. invalid_id   — [id] path segment is not a UUID       → 400 { ok:false, reason:"invalid_id" }
//                     (decideReveal UUID_RE.test() false;
//                     never hits app_users SELECT or audit log)
//   2. not_in_scope — [id] is a well-formed UUID that is    → 403 { ok:false, reason:"not_in_scope" }
//                     not in the reseller's allowedCustomerIds
//                     set (allowed.includes() false;
//                     never hits app_users SELECT or audit log)
//
// Route reference: web/src/app/api/reseller/customers/[id]/reveal-email/route.ts
//   Line 32-35: getCurrentUser null                     → 401 { reason: "unauthorised" }
//   Line 37-45: scopedReseller throws                   → 403 { reason: err.code }
//   Line 47-53: decideReveal(id, allowedCustomerIds)    → 400 invalid_id | missing_id
//                                                          403 not_in_scope
//   Line 55-58: getSupabaseAdmin() null                 → 503 { reason: "not_configured" }
//   Line 60-74: app_users SELECT + maybeSingle          → 500 lookup_failed / 404 not_found
//   Line 76-93: db.auditLog(action='reveal_email')      → 500 { reason: "audit_failed" }
//   Line 95:    200 { ok:true, email }
//
// Rows 1-2 cover Line 47-53 exclusively. The missing_id branch of decideReveal
// (customerId.length === 0) cannot surface via a live HTTP request because
// Next.js dynamic route matching rejects an empty [id] segment and returns
// 404 at the router before route.ts:32 runs — so missing_id is unit-tested
// in customer-reveal.test.ts (tick 21, 7/7) but not reachable here.
//
// Deliberately out of scope (needs per-test seeding which plan §J.2 forbids
// or would break sibling specs sharing the same worker):
//   - not_configured (503) — needs SUPABASE_URL/SERVICE_ROLE unset which
//     would break every other Playwright spec in the same worker.
//   - not_found (404) — needs decideReveal to pass BUT then the app_users
//     SELECT to return no row, which requires per-test tampering with
//     app_users (an in-scope customer id that has since been deleted).
//   - lookup_failed (500) — needs the app_users SELECT to error, which
//     requires per-test tampering plan §J.2 forbids.
//   - audit_failed (500) — needs the reseller_audit_log INSERT to fail,
//     which requires per-test tampering plan §J.2 forbids.
//   - Happy path (200 with email) — ACTIVATED as P10 wave-2 row 149 below
//     via loadTempReseller("active_wholesale") + fixture.attributedUserId as
//     the URL segment. Row 148 (reveal-email-authz.spec.ts, tick 150) already
//     pinned the full envelope shape (200 + body.ok true + email plaintext
//     string containing '@' + NOT containing '*'). Row 149 partners with the
//     invalid_id / not_in_scope branches sitting above and asserts that the
//     same well-formed UUID → decideReveal chokepoint that BLOCKS
//     out-of-scope UUIDs PASSES an in-scope UUID (fixture.attributedUserId)
//     from the reveal-email-validation surface too, so a regression in
//     allowedCustomerIds().includes() surfaces in both the authz spec
//     (where it would look like a fixture bug) and here (where it lands
//     next to the invalid_id / not_in_scope branches it partners with).
//
// Random UUID that's astronomically unlikely to match any real app_users
// row so the not_in_scope branch fires deterministically. Passes decideReveal's
// UUID_RE shape guard on line 20, then fails the allowedCustomerIds
// membership check on line 23.

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
const REVEAL_ROUTE = (customerId: string) =>
  `/api/reseller/customers/${customerId}/reveal-email`;

// Tick 382 — reseller_attributions row-cluster cross-column invariant summary
// (option (i) from tick 381 next-picks). Cross-surface twin-lift of the tick
// 376/377/378/379/380/381 module-scope summary onto reveal-email-validation
// .spec.ts — the SECOND SELECT-LENS reveal-email-touching surface and the
// close-out of the reveal-email spec pair to 2/2 parity within the reveal-
// email-authz-and-validation subset (mirrors the tick 380 close-out of the
// drawer pair + tick 377 close-out of the create-startup pair + tick 375
// close-out of the credit-grant pair). Raises 7/16 surface parity on the
// reseller_attributions row cluster; 9 sibling touching surfaces still
// pending (me-attribution, scope-boundary, credit-grant-authz, credit-grant-
// validation, audit-log-writes, audit-anomaly-scan, sandbox-setup-authz,
// admin-reseller-detail-authz, admin-reseller-detail-validation).
//
// The reseller_attributions row cluster carries FIVE invariants at
// web/supabase/migrations/0091_reseller_module_foundations.sql:112-142
// (IDENTICAL enumeration to tick 376/377/378/379/380/381):
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
// Writer-side source: IDENTICAL to tick 376/377/378/379/380/381 — DB CHECK +
// partial-unique guards at 0091:112-142 wrap every reseller_attributions
// insert; enforcement happens at DB write time. Route-side callers precompose
// the insert payload under an always-'project' discriminator — the 'user'
// branch of ck_subject_fk_matches_type is UNREACHABLE-BY-CONSTRUCTION from
// EVERY current write path (grep audit: retail-attribution.ts:165-172 +
// create-startup/route.ts:301-313 both hard-code subject_type='project' +
// subject_project_id=<uuid> + subject_user_id=null; no code path ever inserts
// subject_type='user').
//
// Application read-path anchor for THIS surface: IDENTICAL to tick 379/380/
// 381. This spec anchors at web/src/lib/reseller/scope.ts:63-84 via
// scopedReseller.allowedCustomerIds() — the canonical SELECT-lens read of
// the reseller_attributions cluster SHARED VERBATIM with the drawer route
// AND with the reveal-email-authz twin at tick 381 because all three
// handlers import the SAME decideReveal helper from web/src/lib/reseller/
// customer-reveal.ts. The lazy allowedCustomerIds() query filters on
// (reseller_id, status='active', opted_out=false) which exactly matches the
// WHERE clause of the reseller_attributions_active_project_uniq partial-
// unique index at 0091:137-139, then splits the rows on subject_type ∈
// {user, project} — the 'user' branch is DEAD CODE at line 73 of scope.ts
// because no write path ever inserts subject_type='user' per the tick 376/
// 377/378/379/380/381 UNREACHABLE-BY-CONSTRUCTION posture. The reveal-email
// route consumes the resolved user-id set at route.ts:47-52 via
// decideReveal(id, allowedCustomerIds) which returns 400 invalid_id / 403
// not_in_scope BEFORE the downstream getSupabaseAdmin, app_users SELECT, or
// reseller_audit_log(reveal_email) write fires. A regression in the id →
// scope → decideReveal ordering surfaces on both the POST reveal-email and
// GET drawer lenses in lockstep because both handlers share the same helper
// import.
//
// Runtime enforcement on THIS spec: IDENTICAL to tick 380 (harness-mode-
// rows-fire-SELECT) — DIFFERENT from tick 381 (harness-mode-rows-bail-
// upstream). Both reveal-email-validation rows (row 1 invalid_id 400 +
// row 2 not_in_scope 403) run under loadResellerHarness() with the reseller-
// admin session established — that means BOTH reach route.ts:47 which awaits
// scope.allowedCustomerIds() BEFORE decideReveal fires the shape/scope
// check. Contrast with reveal-email-authz.spec.ts (tick 381) where rows 1
// (unauthenticated 401) + 2 (non_reseller_admin 403 no_membership) BAIL
// upstream at route.ts:32 (getCurrentUser null) or route.ts:37 (scopedReseller
// throws), so the SELECT never runs on the reveal-email-authz harness-mode
// rows. Consequently, reveal-email-validation carries the SECOND harness-
// mode SELECT-lens coverage on the cluster (after drawer-validation tick
// 380): BOTH rows fire the (reseller_id, status='active', opted_out=false)
// SELECT filter, then diverge on the decideReveal check — row 1 returns 400
// invalid_id because "not-a-uuid" fails UUID_RE at customer-reveal.ts:20;
// row 2 returns 403 not_in_scope because the well-formed OUT_OF_SCOPE_UUID
// passes UUID_RE but fails allowedIds.includes() at customer-reveal.ts:23.
// Wave-2 row 149 (active_wholesale happy path) DOES reach decideReveal's
// POSITIVE uuid_in_scope branch — the SELECT fires and returns the seeded
// reseller_attributions row for fixture.attributedUserId, then decideReveal
// passes because fixture.attributedUserId lives in the resolved
// allowedCustomerIds set. That row exercises the full READ-side lens on the
// cluster INCLUDING the positive membership branch through the shared
// decideReveal chokepoint (twin of drawer-validation wave-2 row 147).
//
// Coverage-per-guard posture on this surface: ZERO-COVERAGE-PER-GUARD on
// all five CHECK/index invariants — SELECT does not fire DB CHECK
// constraints, and read-side hits on the partial-unique index only
// validate index existence rather than uniqueness enforcement (a regression
// that dropped the index would not surface here because the SELECT would
// still return the same rows). IDENTICAL to tick 379/380/381 posture. The
// 'project' branch of ck_subject_fk_matches_type is READ-side EXERCISED at
// rows 1 + 2 + wave-2 row 149 via the subject_type='project' filter but the
// CHECK itself only fires on write; the 'user' branch remains UNREACHABLE-
// BY-CONSTRUCTION AND is DEAD CODE at scope.ts:73. Status 'active' branch
// is READ-side EXERCISED via the .eq("status","active") filter; 'revoked'
// branch remains UNREACHABLE from insert. Source CHECK all three enum
// branches ZERO-COVERAGE-PER-GUARD on both write and read (the SELECT
// projection at scope.ts:65 does not include source, so a regression that
// widened the source enum would not surface here).
//
// Symmetric-cluster posture: THIS surface closes the reveal-email spec pair
// to 2/2 parity within the reveal-email-authz-and-validation subset — both
// reveal-email-authz (SELECT-lens, harness-mode-rows-bail-upstream) and
// reveal-email-validation (SELECT-lens, harness-mode-rows-fire-SELECT) now
// carry the same tick 376/377/378/379/380/381/382 module-scope invariant
// summary pinned to the same 0091:112-142 line anchor. Combined post-tick
// 382 posture: 7/16 total surfaces summarised on the cluster (create-startup-
// authz tick 376 + create-startup-validation tick 377 + attribution-timing
// tick 378 + drawer-authz tick 379 + drawer-validation tick 380 + reveal-
// email-authz tick 381 + reveal-email-validation this tick — closes reveal-
// email pair to 2/2 within the shared decideReveal chokepoint, mirroring
// the drawer pair close-out at tick 380). 9 sibling touching surfaces still
// pending twin-lift. The 'user'-branch complement stays ASYMMETRIC +
// UNREACHABLE-BY-CONSTRUCTION + DEAD-CODE-AT-READ across the entire
// codebase per tick 376/377/378/379/380/381 posture — full 16-surface × 5-
// invariant saturation would collate ZERO-COVERAGE-PER-GUARD × UNREACHABLE-
// BY-CONSTRUCTION documentation on the 'user' branch across every touching
// spec.
//
// Diagnostic delta of this pass: pure documentation-only doc-block hoist —
// no new imports, no new module-scope constants, no per-column assert
// added, no fixture change, no route change, no migration change. Doc-
// block placed after the REVEAL_ROUTE const (line ~90) and before the
// first test.describe (line ~92 pre-edit), matching the tick 376 placement
// on create-startup-authz.spec.ts (after NON_RESELLER_FOUNDER_EMAIL const,
// before first test.describe), the tick 377 placement on create-startup-
// validation.spec.ts (after CASES const, before first test.describe), the
// tick 378 placement on attribution-timing.spec.ts (after shared-fixture
// imports, before first test.describe), the tick 379 placement on drawer-
// authz.spec.ts (after MASKED_EMAIL_RE const, before first test.describe),
// the tick 380 placement on drawer-validation.spec.ts (after MASKED_EMAIL_
// RE const, before first test.describe), and the tick 381 placement on
// reveal-email-authz.spec.ts (after REVEAL_ROUTE const, before first
// test.describe). Twin-lift symmetry across the reveal-email spec pair now
// literal — the two doc-blocks share verbatim structure adjusted for the
// harness-mode-rows-fire-SELECT delta above.

test.describe("Reseller reveal-email input validation — P10 dry-run", () => {
  const harness = loadResellerHarness();
  test.skip(!harness, harnessSkipReason());

  test("invalid_id — [id] path segment is not a UUID returns 400 invalid_id", async ({
    page,
  }) => {
    await loginAs(page, harness!.admin.email);
    const resp = await page.request.post(
      `/api/reseller/customers/${INVALID_ID_SEGMENT}/reveal-email`,
    );
    expect(
      resp.status(),
      `invalid_id returned ${resp.status()} — expected 400 before getSupabaseAdmin, app_users SELECT, or reseller_audit_log write. Body: ${await resp.text()}`,
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
    const resp = await page.request.post(
      `/api/reseller/customers/${OUT_OF_SCOPE_UUID}/reveal-email`,
    );
    expect(
      resp.status(),
      `not_in_scope returned ${resp.status()} — expected 403 before getSupabaseAdmin, app_users SELECT, or reseller_audit_log write. Body: ${await resp.text()}`,
    ).toBe(403);
    const body = (await resp.json()) as { ok: boolean; reason?: string };
    expect(
      body.ok,
      `not_in_scope body.ok should be false: ${JSON.stringify(body)}`,
    ).toBe(false);
    expect(body.reason).toBe("not_in_scope");
  });
});

// P10 wave-2 row 149 — active_wholesale variant probes decideReveal's
// POSITIVE uuid_in_scope branch (allowedCustomerIds().includes()=true) from
// the reveal-email-validation surface. Per docs/plans/p10-deferred-spec-
// activation-order.md wave 2:
//   149 | reveal-email-validation.spec.ts | active_wholesale |
//         happy path with attributed customer id | 200
//
// Row 148 (reveal-email-authz.spec.ts, tick 150) already pinned the full
// wire envelope (200 + body.ok true + email plaintext string containing '@'
// + NOT containing '*'). Row 149 partners with the invalid_id / not_in_scope
// branches sitting above and asserts that the same well-formed UUID →
// decideReveal chokepoint that BLOCKS out-of-scope UUIDs PASSES an in-scope
// UUID (fixture.attributedUserId). A regression in
// allowedCustomerIds().includes() would either:
//   (a) leak an out-of-scope UUID through (caught by the not_in_scope test
//       above returning 200 instead of 403), or
//   (b) reject an in-scope UUID (caught here returning 403 instead of 200).
// Both branches must hold for the chokepoint to be sound. This row mirrors
// the row 147 posture (drawer-validation.spec.ts happy path partnering with
// invalid_id / not_in_scope) across the sibling POST reveal-email route.
//
// Fixture wiring (wave-2 helper landed tick 147; row 146 landed tick 148
// added attributionExists guard; rows 147 + 148 landed ticks 149 + 150):
//   - loadTempReseller("active_wholesale") reads the QAPROBEWHOLESALEACTIVE
//     seed row + resolves adminEmail via the P10 Option A per-variant slot
//     (qa-reseller-wholesale-active@blockid.au) + mirrors reseller_admins.
//   - fixture.attributionExists asserts the seeder also planted a
//     reseller_attributions row so scopedReseller().allowedCustomerIds()
//     surfaces fixture.attributedUserId. Without the row the reveal-email
//     route returns 403 not_in_scope (see route.ts:49-52); the fixture flag
//     lets the spec skip cleanly rather than false-fail as a code regression.
//   - loginAs(page, fixture.adminEmail) opens the reseller-admin session
//     against the DISTINCT per-variant app_users row so scopedReseller()
//     .maybeSingle() does not PGRST116-collide with other variants.
//
// Skip conditions (mirrors row 148 posture verbatim):
//   - loadTempReseller returns null when SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
//     are unset or the QAPROBEWHOLESALEACTIVE seed row is missing.
//   - fixture.adminUserId null (variant admin row missing or reseller_admins
//     mirror not seeded — scopedReseller would 403 no_membership).
//   - fixture.attributedUserId null (attributed founder not in app_users).
//   - fixture.attributionExists false (reseller_attributions row missing —
//     reveal-email would 403 not_in_scope; that is the failure mode row 149
//     is designed to catch, so a partial-seed host must skip rather than
//     false-fail).
//   - loginAs throws when /tmp/blockid-qa-accounts.txt has no row for the
//     resolved admin email.
//
// Non-Stripe / non-GST discipline: mirrors row 148 — the reveal-email route
// reads app_users (id + email columns only) and writes one
// reseller_audit_log row via db.auditLog(). No promotion_code lookup, no
// Stripe network call, no InfoVision dependency. P8.5 + P1.5 remain neither
// a dependency nor a consequence. The audit-log write side-effect is
// captured by wave-5 row 179 (audit-log-writes.spec.ts) so this row focuses
// on the wire envelope — the 500 audit_failed branch means a broken
// audit-log write would surface as body.ok=false here rather than as a
// missing audit row that only row 179 could detect.
//
// Assertion scope per wave-2 prep-cost note ("rows 145-149 each add 2-3
// assertions") and per row 147 precedent: row 148 pinned the FULL plaintext
// contract at the wire (contains '@' + NOT '*'); row 149 pins only the
// two dimensions that this spec's siblings (invalid_id / not_in_scope) do
// NOT — status 200 with body.ok true (proves decideReveal's positive branch
// fires) plus body.email defined string containing '@' (proves the chain
// COMPLETES through the app_users SELECT + audit-log write without a 5xx
// leaking through). The '*' assertion is NOT duplicated here — row 148 owns
// the plaintext-vs-mask contract at the wire and duplicating it would (a)
// burn one assertion for zero new coverage and (b) mean a future change
// to the plaintext contract would force two spec edits instead of one.
test.describe("Reseller reveal-email — P10 wave-2 uuid_in_scope happy", () => {
  test("active_wholesale — well-formed UUID inside allowedCustomerIds returns 200 with plaintext email", async ({
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
    const resp = await page.request.post(REVEAL_ROUTE(attributedUserId));
    expect(
      resp.status(),
      `uuid_in_scope + happy returned ${resp.status()} — expected 200. A 403 not_in_scope here means allowedCustomerIds().includes() rejected an in-scope UUID (mirror of the not_in_scope branch above). A 5xx here means the chain (app_users SELECT + audit-log write) leaked through. Body: ${await resp.text()}`,
    ).toBe(200);
    const body = (await resp.json()) as {
      ok: boolean;
      email?: string;
      reason?: string;
    };
    expect(
      body.ok,
      `uuid_in_scope + happy body.ok should be true: ${JSON.stringify(body)}`,
    ).toBe(true);
    expect(typeof body.email).toBe("string");
    expect(body.email ?? "").toContain("@");
  });
});
