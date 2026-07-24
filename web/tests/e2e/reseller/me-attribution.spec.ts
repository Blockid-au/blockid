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

// Tick 383 — reseller_attributions row-cluster cross-column invariant summary
// (option (i) from tick 382 next-picks). Cross-surface twin-lift of the tick
// 376/377/378/379/380/381/382 module-scope summary onto me-attribution.spec.ts
// — the EIGHTH reseller_attributions-touching surface and the FIRST NON-
// scopedReseller read-anchor coverage on the cluster (the seven prior twin-
// lifts all anchored at scope.ts:63-84 allowedCustomerIds(); this one anchors
// at app_users.attribution_reseller_id + resellers.id — a DISTINCT read-path
// node that mirrors the cluster through the cache column rather than the
// canonical reseller_attributions SELECT). Raises 8/16 surface parity on the
// reseller_attributions row cluster; 8 sibling touching surfaces still
// pending (scope-boundary, credit-grant-authz, credit-grant-validation,
// audit-log-writes, audit-anomaly-scan, sandbox-setup-authz, admin-reseller-
// detail-authz, admin-reseller-detail-validation).
//
// The reseller_attributions row cluster carries FIVE invariants at
// web/supabase/migrations/0091_reseller_module_foundations.sql:112-142
// (IDENTICAL enumeration to tick 376/377/378/379/380/381/382):
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
// Writer-side source: IDENTICAL to tick 376/377/378/379/380/381/382 — DB CHECK
// + partial-unique guards at 0091:112-142 wrap every reseller_attributions
// insert; enforcement happens at DB write time. Route-side callers precompose
// the insert payload under an always-'project' discriminator — the 'user'
// branch of ck_subject_fk_matches_type is UNREACHABLE-BY-CONSTRUCTION from
// EVERY current write path (grep audit: retail-attribution.ts:165-172 +
// create-startup/route.ts:301-313 both hard-code subject_type='project' +
// subject_project_id=<uuid> + subject_user_id=null; no code path ever inserts
// subject_type='user').
//
// Application read-path anchor for THIS surface: KEY DELTA vs tick 376/377/
// 378/379/380/381/382. me-attribution does NOT anchor at scope.ts:63-84
// allowedCustomerIds() — the /api/reseller/me handler at web/src/app/api/
// reseller/me/route.ts:42-46 reads app_users.attribution_reseller_id directly
// via .eq("id", user.id).maybeSingle() and, when non-null, follows the FK to
// resellers via a second .eq("id", resellerId).maybeSingle() at route.ts:56-
// 60. The cache column app_users.attribution_reseller_id (0092 extension) is
// the DENORMALISED MIRROR of the canonical reseller_attributions row — it is
// written by processAttribution() at signup and by resolveAttributionCandidate
// on invoice.paid webhooks. A regression that let the cache diverge from the
// primary reseller_attributions row would surface on the pill's rendered
// display_name (this surface) BEFORE surfacing on the drawer/reveal-email
// SELECT-lens siblings (which read reseller_attributions directly through
// scopedReseller). This is the ONLY reseller_attributions-touching read
// surface across the codebase that traverses the cluster via its cache
// projection rather than through the source-of-truth table — the r-01-exempt
// pragma at route.ts:18 documents the design intent (any signed-in user may
// ask about their OWN attribution, so scopedReseller would reject them by
// design). The 'user'-branch UNREACHABLE-BY-CONSTRUCTION posture still holds
// on THIS surface: attribution_reseller_id resolves to a reseller.id
// regardless of the subject_type on the source row, but every write path
// planted subject_type='project' per the write-path audit, so any hypothetical
// subject_type='user' attribution would exist only as an out-of-band DB
// insert.
//
// Runtime enforcement on THIS spec: DIFFERENT from every prior twin-lift. All
// six harness-mode SELECT-lens surfaces (drawer-authz/drawer-validation/
// reveal-email-authz/reveal-email-validation tick 379-382 + create-startup
// pair tick 376-377) fire scopedReseller().allowedCustomerIds() from a
// reseller-admin session; the two rows on THIS spec (row 1 unauthenticated
// 401 + row 2 authenticated_no_attribution 200 reseller:null) fire the
// app_users .eq("id", user.id).select("attribution_reseller_id") SELECT
// from a FOUNDER session (row 2) or bail upstream at getCurrentUser (row 1
// — route.ts:29-33 short-circuits before getSupabaseAdmin, app_users SELECT,
// or resellers SELECT run, matching the create-startup-authz row 1 posture
// but through a different route). Row 2 fires the SELECT and returns
// attribution_reseller_id=null (the founder QA seed row has no attribution),
// so the resellers SELECT at route.ts:56-60 never fires — that keeps the
// harness-free row 2 safe against staging (no reseller_attributions row is
// read, only the cache column projection). Wave-2 row 145 (active_wholesale
// happy path, already landed at test.describe #2) DOES traverse the full
// chain: app_users SELECT returns fixture.resellerId (stamped by
// fixture.attachAttributedCustomer), resellers SELECT returns the seeded
// reseller with status='active', and the response envelope carries the full
// {code, display_name, billing_model} shape. That row exercises the CACHE-
// PROJECTION read-lens on the cluster INCLUDING the positive resolution
// branch through a read anchor that no other spec on the cluster exercises.
//
// Coverage-per-guard posture on this surface: ZERO-COVERAGE-PER-GUARD on
// all five CHECK/index invariants — the /me route never touches the
// reseller_attributions table so no DB CHECK constraint or partial-unique
// index fires; it reads only the denormalised attribution_reseller_id cache
// column on app_users. IDENTICAL to tick 379/380/381/382 posture on the
// per-guard axis but DIFFERENT on the read-anchor axis: the 'project' branch
// of ck_subject_fk_matches_type is NOT READ-side EXERCISED here because
// subject_type is not projected through the cache column; the 'user' branch
// remains UNREACHABLE-BY-CONSTRUCTION AND is DEAD CODE at scope.ts:73 but
// is ALSO INVISIBLE to this surface because the cache projection collapses
// the CROSS-COLUMN discriminator into a single FK. Status 'active' branch is
// READ-side EXERCISED via the resellers-side filter at route.ts:62 (reseller
// .status !== "active" ⇒ reseller:null), NOT via the reseller_attributions-
// side .eq("status","active") filter — that means a regression that flipped
// a reseller_attributions row from active→revoked would NOT surface on the
// /me pill until processAttribution or resolveAttributionCandidate re-ran
// against the stale cache column. Source CHECK all three enum branches
// ZERO-COVERAGE-PER-GUARD on both write and read (source is not projected
// through the cache column, so a regression that widened the source enum
// would not surface here — same posture as every prior twin-lift but for a
// different underlying reason: those surfaces don't project source through
// scope.ts:65, this one doesn't project it because the entire cluster is
// bypassed).
//
// Symmetric-cluster posture: THIS surface opens the CACHE-PROJECTION read-
// anchor subset on the cluster (previously empty — 0/1 within its own
// subset, now 1/1). Combined post-tick 383 posture: 8/16 total surfaces
// summarised on the cluster (create-startup-authz tick 376 + create-startup-
// validation tick 377 + attribution-timing tick 378 + drawer-authz tick 379
// + drawer-validation tick 380 + reveal-email-authz tick 381 + reveal-email-
// validation tick 382 + me-attribution this tick — opens the cache-projection
// read-anchor subset while the seven prior ticks all anchored on the
// canonical scopedReseller().allowedCustomerIds() SELECT). 8 sibling touching
// surfaces still pending twin-lift. The 'user'-branch complement stays
// ASYMMETRIC + UNREACHABLE-BY-CONSTRUCTION + DEAD-CODE-AT-READ across the
// entire codebase per tick 376/377/378/379/380/381/382 posture — full 16-
// surface × 5-invariant saturation would collate ZERO-COVERAGE-PER-GUARD ×
// UNREACHABLE-BY-CONSTRUCTION documentation on the 'user' branch across
// every touching spec, with the cache-projection subset carrying an
// additional CROSS-COLUMN-INVISIBLE-BY-PROJECTION annotation that only
// applies to surfaces that traverse the cluster through app_users
// .attribution_reseller_id rather than through the source-of-truth table.
//
// Diagnostic delta of this pass: pure documentation-only doc-block hoist —
// no new imports, no new module-scope constants, no per-column assert
// added, no fixture change, no route change, no migration change. Doc-
// block placed after the ROUTE const (line ~81) and before the first
// test.describe (line ~83 pre-edit), matching the tick 376 placement on
// create-startup-authz.spec.ts (after NON_RESELLER_FOUNDER_EMAIL const,
// before first test.describe), the tick 377 placement on create-startup-
// validation.spec.ts (after CASES const, before first test.describe), the
// tick 378 placement on attribution-timing.spec.ts (after shared-fixture
// imports, before first test.describe), the tick 379 placement on drawer-
// authz.spec.ts (after MASKED_EMAIL_RE const, before first test.describe),
// the tick 380 placement on drawer-validation.spec.ts (after MASKED_EMAIL_
// RE const, before first test.describe), the tick 381 placement on reveal-
// email-authz.spec.ts (after REVEAL_ROUTE const, before first test
// .describe), and the tick 382 placement on reveal-email-validation.spec.ts
// (after REVEAL_ROUTE const, before first test.describe). Twin-lift now
// spans a heterogeneous read-anchor set — six specs anchor at scope.ts:63-
// 84 allowedCustomerIds(), one spec (this one) anchors at the app_users
// .attribution_reseller_id cache column, and the CROSS-COLUMN ck_subject_
// fk_matches_type summary is now documented across both anchor subsets.

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
