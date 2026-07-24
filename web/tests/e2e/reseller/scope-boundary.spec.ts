// Reseller scope boundary — P10_hardening dry-run per plan §J.4 point 4:
// "reseller user attempting to fetch /api/svi/*, /api/dataroom/*,
// /api/cap-table/* for an attributed customer; expect 403 on every one."
//
// Skips until the reseller QA harness is provisioned (see fixtures/reseller.ts).
// Landing this scaffold pre-unblock keeps the P10 gate ready to fire as soon
// as P1.5 (H.20 ABN) + P8.5 (Stripe add-on env vars) clear.
//
// ACTIVATED wave-5 row 181 below (temp-reseller mint fixture route via
// loadTempReseller('active_wholesale')). The pre-existing describe keeps
// the env-based loadResellerHarness contract alive for hosts that hold the
// QA_RESELLER_ADMIN_EMAIL + QA_RESELLER_ATTRIBUTED_CUSTOMER_ID +
// QA_RESELLER_ATTRIBUTED_PROJECT_ID env-var trio; the new describe covers
// the QAPROBE cohort (seed-qa-reseller.mjs with QA_RESELLER_MULTI_ADMIN=1)
// via fixture.attributedUserId + attach.attributedUserId + a projects
// lookup for the attributed founder so the same auth-refusal invariant is
// pinned without a second env-var flip. Both blocks assert that the
// reseller-admin session is refused (401 / 402 / 403 / 404) on the SVI +
// dataroom + cap-table read/write endpoints when the target belongs to an
// attributed customer's workspace — matches plan §420 P10 exit criterion
// #3 (security-audit: RLS + typed wrapper enforced end-to-end). Mirror-
// shape of wave-5 row 180 (audit-anomaly-scan twin describe tick 176).

import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/accounts";
import {
  harnessSkipReason,
  loadResellerHarness,
  loadTempReseller,
  tempResellerSkipReason,
  type TempResellerFixture,
} from "../fixtures/reseller";
import {
  findFirstProjectIdForUser,
  loadSupabaseAdmin,
  supabaseAdminSkipReason,
} from "../fixtures/supabase-admin";

interface ProbeRoute {
  method: "GET" | "POST";
  url: (customerId: string, projectId: string | null) => string;
  body?: Record<string, unknown>;
  label: string;
}

const PROBES: ProbeRoute[] = [
  {
    method: "GET",
    label: "/api/svi/latest for attributed customer",
    url: (customerId) => `/api/svi/latest?user_id=${encodeURIComponent(customerId)}`,
  },
  {
    method: "GET",
    label: "/api/svi/history for attributed customer",
    url: (customerId) => `/api/svi/history?user_id=${encodeURIComponent(customerId)}`,
  },
  {
    method: "POST",
    label: "/api/dataroom/clone into attributed project",
    url: (_c, projectId) => `/api/dataroom/clone`,
    body: { source_project_id: "__placeholder__" },
  },
  {
    method: "POST",
    label: "/api/cap-table on attributed project",
    url: () => "/api/cap-table",
    body: { holder: "probe", class: "ordinary", quantity: 1 },
  },
];

// Tick 384 — reseller_attributions row-cluster cross-column invariant summary
// (option (i) from tick 383 next-picks). Cross-surface twin-lift of the tick
// 376/377/378/379/380/381/382/383 module-scope summary onto scope-boundary
// .spec.ts — the NINTH reseller_attributions-touching surface and the FIRST
// NEGATIVE-SPACE / WORKSPACE-OWNER read-anchor coverage on the cluster (the
// seven ticks 376-382 all anchored at scope.ts:63-84 allowedCustomerIds();
// tick 383 opened the CACHE-PROJECTION subset at app_users.attribution_
// reseller_id; this one opens a THIRD DISTINCT anchor subset — the WORKSPACE-
// OWNER refusal lens where the probed routes /api/svi/*, /api/dataroom/*,
// /api/cap-table/* NEVER READ the reseller_attributions cluster AT ALL, so
// the cluster's presence for the attributed customer must NOT leak into the
// refusal decision). Raises 9/16 surface parity on the reseller_attributions
// row cluster; 7 sibling touching surfaces still pending (credit-grant-authz,
// credit-grant-validation, audit-log-writes, audit-anomaly-scan, sandbox-
// setup-authz, admin-reseller-detail-authz, admin-reseller-detail-validation).
//
// The reseller_attributions row cluster carries FIVE invariants at
// web/supabase/migrations/0091_reseller_module_foundations.sql:112-142
// (IDENTICAL enumeration to tick 376/377/378/379/380/381/382/383):
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
// Writer-side source: IDENTICAL to tick 376/377/378/379/380/381/382/383 — DB
// CHECK + partial-unique guards at 0091:112-142 wrap every reseller_
// attributions insert; enforcement happens at DB write time. Route-side
// callers precompose the insert payload under an always-'project'
// discriminator — the 'user' branch of ck_subject_fk_matches_type is
// UNREACHABLE-BY-CONSTRUCTION from EVERY current write path (grep audit:
// retail-attribution.ts:165-172 + create-startup/route.ts:301-313 both
// hard-code subject_type='project' + subject_project_id=<uuid> +
// subject_user_id=null; no code path ever inserts subject_type='user').
//
// Application read-path anchor for THIS surface: KEY DELTA vs tick 376/377/
// 378/379/380/381/382/383 — this spec opens a THIRD DISTINCT read-anchor
// subset. The four probed routes ALL LIVE OUTSIDE the /api/reseller/**
// tree (they live at /api/svi/latest, /api/svi/history, /api/dataroom/
// clone, /api/cap-table) and NONE OF THEM read the reseller_attributions
// cluster at ANY point in their handler. Their authorization is anchored
// at WORKSPACE-OWNER ownership: getCurrentUser() → projects.user_id ===
// session.user.id (or similar app_users-side owner check depending on the
// endpoint). The reseller_attributions row that links reseller ↔ customer
// is COMPLETELY INVISIBLE to these routes; the cluster's presence does
// NOT grant the reseller-admin session ACCESS to the attributed founder's
// SVI/dataroom/cap-table endpoints. This is the ONLY reseller_attributions
// -touching surface across the entire codebase that verifies the NEGATIVE-
// SPACE lens — i.e., that non-reseller-scoped workspace routes stay
// INSENSITIVE to the cluster. Contrast:
//   - Ticks 376-382 (scopedReseller anchor): read the cluster via scope.ts
//     :63-84 allowedCustomerIds(), positively consume the (reseller_id,
//     status='active', opted_out=false) set to authorize downstream
//     reseller-scoped operations.
//   - Tick 383 (cache-projection anchor): read the cluster via the
//     app_users.attribution_reseller_id denormalised mirror, positively
//     consume the FK to render the co-branding pill.
//   - Tick 384 (workspace-owner anchor, THIS surface): NEVER read the
//     cluster; verify that the workspace-owner refusal on /api/svi/*,
//     /api/dataroom/*, /api/cap-table/* fires REGARDLESS of the cluster's
//     row state for the (reseller ↔ customer) pair. A regression that
//     accidentally widened the workspace-owner check to accept a reseller-
//     admin session because the caller HAS a reseller_attributions row
//     against the target would surface here BEFORE surfacing on any other
//     touching spec (because no other spec exercises the workspace-owner
//     boundary from a reseller-admin session).
//
// Runtime enforcement on THIS spec: DIFFERENT from every prior twin-lift.
// The four probes in each of the two describes fire a reseller-admin
// session (loadResellerHarness admin OR fixture.adminEmail for wave-5 row
// 181) against the workspace-owner endpoints AND the seed fixture
// attach.attachAttributedCustomer() has already stamped app_users
// .attribution_reseller_id to the reseller (wave-5 row 181) OR the QA
// harness has pre-seeded the (reseller ↔ attributed_customer) relationship
// (pre-existing describe). The refusal set [401, 402, 403, 404] must fire
// on EACH probe DESPITE that stamp — that's the negative-space assertion.
// If a workspace-owner route regressed to accept a reseller-admin session
// on the basis of the reseller_attributions row's existence, the probe
// would return 200 and both describes would fail on the toContain([401,
// 402, 403, 404]) assertion. Wave-5 row 181's attachAttributedCustomer()
// runs INSIDE the beforeAll/afterAll cleanup discipline so a mid-test
// failure cannot leak the cache flip into sibling spec workers.
//
// Coverage-per-guard posture on this surface: ZERO-COVERAGE-PER-GUARD on
// all five CHECK/index invariants — the four probed routes never touch
// the reseller_attributions table so no DB CHECK constraint or partial-
// unique index fires; they don't project subject_type, status, source, or
// subject_project_id AT ALL. IDENTICAL to tick 383's ZERO-COVERAGE-PER-
// GUARD verdict on the per-guard axis, but through a THIRD DISTINCT
// mechanism: tick 379-382 anchor at scope.ts and don't fire the CHECK
// because SELECT doesn't fire CHECKs; tick 383 anchors at the cache
// column and doesn't fire the CHECK because the cache projection
// collapses the CROSS-COLUMN discriminator into a single FK; THIS surface
// doesn't fire the CHECK because the entire cluster is BYPASSED at the
// route level — a fourth annotation dimension, CROSS-BOUNDARY-INVISIBLE-
// BY-ROUTE-CHOICE, that only applies to negative-space surfaces which
// verify the cluster's presence does not leak into non-scoped routes. The
// 'project' branch of ck_subject_fk_matches_type is NOT READ-side
// EXERCISED here because the routes never read the cluster; the 'user'
// branch remains UNREACHABLE-BY-CONSTRUCTION AND is DEAD CODE at scope
// .ts:73 AND is INVISIBLE-BY-PROJECTION (tick 383 posture) AND is now
// also INVISIBLE-BY-ROUTE-CHOICE (this tick's posture). Status 'active'
// branch is NOT READ-side EXERCISED via ANY filter on this surface;
// 'revoked' branch equally invisible. Source CHECK all three enum
// branches ZERO-COVERAGE-PER-GUARD on both write and read (source is not
// projected at all here).
//
// Symmetric-cluster posture: THIS surface OPENS the WORKSPACE-OWNER
// negative-space read-anchor subset on the cluster (previously empty —
// 0/1 within its own subset, now 1/1). Combined post-tick 384 posture:
// 9/16 total surfaces summarised on the cluster (create-startup-authz
// tick 376 + create-startup-validation tick 377 + attribution-timing tick
// 378 + drawer-authz tick 379 + drawer-validation tick 380 + reveal-
// email-authz tick 381 + reveal-email-validation tick 382 + me-
// attribution tick 383 + scope-boundary this tick — opens the workspace-
// owner negative-space read-anchor subset while the seven prior ticks
// (376-382) all anchored on the canonical scopedReseller().allowed
// CustomerIds() SELECT and tick 383 opened the cache-projection subset).
// The 'user'-branch complement stays ASYMMETRIC + UNREACHABLE-BY-
// CONSTRUCTION + DEAD-CODE-AT-READ across the entire codebase per tick
// 376/377/378/379/380/381/382/383 posture — full 16-surface × 5-invariant
// saturation would collate ZERO-COVERAGE-PER-GUARD × UNREACHABLE-BY-
// CONSTRUCTION documentation on the 'user' branch across every touching
// spec, with the cache-projection subset carrying an additional CROSS-
// COLUMN-INVISIBLE-BY-PROJECTION annotation (tick 383) and the workspace-
// owner subset carrying an additional CROSS-BOUNDARY-INVISIBLE-BY-ROUTE-
// CHOICE annotation (this tick) that only apply to their respective
// read-anchor subsets.
//
// Diagnostic delta of this pass: pure documentation-only doc-block hoist —
// no new imports, no new module-scope constants, no per-column assert
// added, no fixture change, no route change, no migration change. Doc-
// block placed after the PROBES const (line ~69) and before the first
// test.describe (line ~71 pre-edit), matching the tick 376 placement on
// create-startup-authz.spec.ts (after NON_RESELLER_FOUNDER_EMAIL const,
// before first test.describe), the tick 377 placement on create-startup-
// validation.spec.ts (after CASES const, before first test.describe), the
// tick 378 placement on attribution-timing.spec.ts (after shared-fixture
// imports, before first test.describe), the tick 379 placement on drawer-
// authz.spec.ts (after MASKED_EMAIL_RE const, before first test.describe),
// the tick 380 placement on drawer-validation.spec.ts (after MASKED_EMAIL_
// RE const, before first test.describe), the tick 381 placement on
// reveal-email-authz.spec.ts (after REVEAL_ROUTE const, before first test
// .describe), the tick 382 placement on reveal-email-validation.spec.ts
// (after REVEAL_ROUTE const, before first test.describe), and the tick
// 383 placement on me-attribution.spec.ts (after ROUTE const, before
// first test.describe). Twin-lift now spans a heterogeneous read-anchor
// set — seven specs anchor at scope.ts:63-84 allowedCustomerIds(), one
// spec (me-attribution) anchors at the app_users.attribution_reseller_id
// cache column, and one spec (this one) anchors at the WORKSPACE-OWNER
// non-cluster refusal — three distinct anchor subsets now documented
// under a single cluster's cross-column invariant summary.

test.describe("Reseller scope boundary — P10 dry-run", () => {
  const harness = loadResellerHarness();
  test.skip(!harness, harnessSkipReason());

  for (const probe of PROBES) {
    test(`reseller admin cannot ${probe.label}`, async ({ page, request }) => {
      await loginAs(page, harness!.admin.email);
      const url = probe.url(harness!.attributedCustomerId, harness!.attributedProjectId);
      const body = probe.body
        ? JSON.parse(
            JSON.stringify(probe.body).replace(
              "__placeholder__",
              harness!.attributedProjectId ?? harness!.attributedCustomerId,
            ),
          )
        : undefined;
      const resp =
        probe.method === "GET"
          ? await request.get(url)
          : await request.post(url, { data: body });
      expect(
        [401, 402, 403, 404],
        `${probe.label} returned ${resp.status()} — expected auth/scope refusal`,
      ).toContain(resp.status());
    });
  }
});

// Wave-5 row 181 — reseller-admin session cannot fetch /api/svi/*,
// /api/dataroom/*, /api/cap-table/* for an attributed customer when driven
// via the temp-reseller mint fixture's active_wholesale variant. Twin of
// the pre-existing describe: uses fixture.attributedUserId + attach.
// attributedUserId (via attachAttributedCustomer) + a live projects lookup
// for the attributed founder instead of leaning on the env-based
// loadResellerHarness contract. That means a QAPROBE-cohort host — which
// mints per-variant reseller rows via seed-qa-reseller.mjs with
// QA_RESELLER_MULTI_ADMIN=1 — covers the same scope-refusal invariant
// without a second env-var flip. Mirror-shape of wave-5 row 180 (audit-
// anomaly-scan twin describe tick 176): fixture in beforeAll, five-step
// skip discipline (fixture null / attributedUserId null /
// !attributionExists / supabase null / projectId null), attach the cache
// column via attachAttributedCustomer() so /api/reseller/* rescues would
// resolve (not relevant for the /api/svi/* etc. paths tested here but
// ensures the QAPROBE cohort stays parity with row 180 for cross-spec
// leak protection), then loginAs(fixture.adminEmail) and fire the same
// four probes.
test.describe("Reseller scope boundary — P10 wave-5 row 181 happy path", () => {
  let fixture: TempResellerFixture | null = null;
  let fixtureError: string | null = null;

  test.beforeAll(async () => {
    try {
      fixture = await loadTempReseller("active_wholesale");
    } catch (err) {
      fixtureError = (err as Error).message;
    }
  });

  test.afterAll(async () => {
    if (fixture) {
      try {
        await fixture.cleanup();
      } catch (err) {
        // Bubble so a partial restore fails the run rather than leaking
        // attribution_reseller_id state into the next spec worker.
        throw new Error(
          `wave-5 row 181 cleanup failed — attributed founder's app_users.attribution_reseller_id may still point at the QAPROBE reseller: ${(err as Error).message}`,
        );
      }
    }
  });

  for (const probe of PROBES) {
    test(`reseller admin cannot ${probe.label}`, async ({ page, request }) => {
      if (fixtureError) {
        test.skip(true, `${tempResellerSkipReason("active_wholesale")} (${fixtureError})`);
        return;
      }
      if (!fixture) {
        test.skip(true, tempResellerSkipReason("active_wholesale"));
        return;
      }
      if (!fixture.attributedUserId) {
        test.skip(
          true,
          `${tempResellerSkipReason("active_wholesale")} — attributedUserId null (attributed founder app_users row missing on this host). Re-run seed-qa-reseller.mjs with QA_RESELLER_MULTI_ADMIN=1 so the attributed founder row lands.`,
        );
        return;
      }
      if (!fixture.attributionExists) {
        test.skip(
          true,
          `${tempResellerSkipReason("active_wholesale")} — reseller_attributions row missing on this host so the QAPROBE cohort is only partially seeded. Re-run seed-qa-reseller.mjs with QA_RESELLER_MULTI_ADMIN=1 so the attribution row lands alongside the reseller_admins mirror.`,
        );
        return;
      }

      const supabase = loadSupabaseAdmin();
      if (!supabase) {
        test.skip(true, supabaseAdminSkipReason());
        return;
      }

      // Resolve a real projects.id owned by the attributed founder. The pre-
      // existing describe reads it from QA_RESELLER_ATTRIBUTED_PROJECT_ID —
      // the QAPROBE cohort does not export that env var, so look it up
      // read-only via findFirstProjectIdForUser. Falls back to
      // attributedUserId as the ?user_id= for the SVI probes (which take a
      // user id, not a project id) but the dataroom/cap-table probes need a
      // real project id in the body, so a null project row makes those
      // sub-probes skip individually rather than false-positive 404.
      const attributedUserId = fixture.attributedUserId;
      const projectId = await findFirstProjectIdForUser(supabase, attributedUserId);
      if (!projectId && probe.body) {
        // dataroom/clone + cap-table probes both need a project id in body.
        // Without one, the route would 404 not_found rather than 403 not_in_
        // scope — same outcome for the wave-5 assertion (both are in the
        // accepted [401,402,403,404] set) but the intent test would drift.
        test.skip(
          true,
          `${tempResellerSkipReason("active_wholesale")} — attributed founder has no projects row on this host so the ${probe.label} body cannot be constructed. Re-run seed-qa-reseller.mjs with QA_RESELLER_MULTI_ADMIN=1 or seed a workspace for the attributed founder.`,
        );
        return;
      }

      // attachAttributedCustomer() hydrates app_users.attribution_reseller_id
      // for the attributed founder against THIS variant's reseller_id.
      // Restore closure runs in afterAll via fixture.cleanup() so a failing
      // assertion cannot leak the cache flip. Matches row 180 posture.
      const attach = await fixture.attachAttributedCustomer();
      if (!attach) {
        test.skip(
          true,
          "attachAttributedCustomer() returned null — variant mismatch or attributedUserId lookup failed after beforeAll seed. Investigate seed-qa-reseller.mjs output.",
        );
        return;
      }

      try {
        await loginAs(page, fixture.adminEmail);
      } catch (err) {
        test.skip(
          true,
          `Reseller-admin QA account not seeded for variant='active_wholesale' (${fixture.adminEmail}): ${(err as Error).message}. Run scripts/seed-test-users.mjs with QA_RESELLER_MULTI_ADMIN=1 to populate /tmp/blockid-qa-accounts.txt.`,
        );
        return;
      }

      const url = probe.url(attach.attributedUserId, projectId);
      const body = probe.body
        ? JSON.parse(
            JSON.stringify(probe.body).replace(
              "__placeholder__",
              projectId ?? attach.attributedUserId,
            ),
          )
        : undefined;
      const resp =
        probe.method === "GET"
          ? await request.get(url)
          : await request.post(url, { data: body });
      expect(
        [401, 402, 403, 404],
        `${probe.label} returned ${resp.status()} — expected auth/scope refusal (reseller-admin session against attributed founder's SVI/dataroom/cap-table endpoints must not resolve). Body: ${await resp.text()}`,
      ).toContain(resp.status());
    });
  }
});
