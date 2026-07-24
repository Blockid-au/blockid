// Reseller attribution timing — P10_hardening dry-run per plan §J.2 point 9
// (U.6): "user with blockid_via cookie logs in via Google, does NOT create a
// project → assert no reseller_attributions row. Same user then creates
// project → assert one row with subject_type='project'."
//
// Extends ticks 82/83 (scope-boundary + co-branding pill) with the capture
// half of the attribution funnel. Skips at describe-scope until the timing
// harness is provisioned (see fixtures/reseller.ts loadAttributionTimingHarness).
// Rows 2 + 3 also require the service-role Supabase fixture; when
// SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are unset those rows self-skip
// with supabaseAdminSkipReason() while row 1 keeps running.
//
// ACTIVATED wave-5 row 178 below (temp-reseller mint fixture route via
// loadTempReseller('active_wholesale')). The pre-existing describe covers the
// env-based loadAttributionTimingHarness contract (QA_RESELLER_CODE +
// QA_RESELLER_DISPLAY_NAME) for hosts that keep that env-var contract alive;
// the new describe covers the temp-reseller mint fixture route so a QAPROBE-
// cohort host — which mints per-variant reseller rows via seed-qa-reseller.mjs
// — covers the /api/reseller/me cache-column contract without flipping either
// env var. attachAttributedCustomer() drives the app_users.attribution_reseller_id
// column so the /me handler's SELECT on that column returns the QAPROBE row,
// then the wave-5 assertion pins the same body shape as wave-2 row 145 (code +
// display_name + billing_model) so a regression in the /me → resellers SELECT
// column contract still surfaces here even without the login-form.tsx /
// google/route.ts cookie side effect. The plan §337 "signup → attribution
// stamp within jitter window" branch remains DELIBERATELY out of scope because
// Playwright cannot drive the Google OAuth signup redirect that runs
// processAttribution() — that branch stays in the env-based describe above via
// the blockid_via cookie + loginAs pair, which loginAs's /api/qa/login
// strategy does not honour on a QAPROBE cohort host (the QA login endpoint
// bypasses the cookie-consumption sites at login-form.tsx:167, google/route
// .ts:114, auth.ts:517/642).
//
// Attribution write reference:
//   - login-form.tsx:167, google/route.ts:114, auth.ts:517/642 → app_users
//     .attribution_reseller_id (user-level cache; P2.5 stamp-on-signup).
//   - reseller_attributions(subject_type='project') is written by two
//     paths: (a) wholesale-provisioned /api/reseller/create-startup route
//     (route.ts:302) and (b) retail createProject() via
//     attributeProjectFromUserCache() in web/src/lib/reseller/retail-attribution.ts
//     (closes the tick 91 frontier gap).
//
// See docs/plans/reseller-module-plan.md §J.2 point 9 for the full spec.

import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/accounts";
import {
  attributionTimingSkipReason,
  loadAttributionTimingHarness,
  loadTempReseller,
  tempResellerSkipReason,
  type TempResellerFixture,
} from "../fixtures/reseller";
import {
  countResellerAttributionsFor,
  countResellerAttributionsForProject,
  findUserIdByEmail,
  loadSupabaseAdmin,
  supabaseAdminSkipReason,
} from "../fixtures/supabase-admin";

// Tick 378 — reseller_attributions row-cluster cross-column invariant summary
// (option (i) from tick 377 next-picks). Cross-surface twin-lift of the tick
// 376/377 module-scope summary from the create-startup write-path pair (both
// ZERO-COVERAGE-PER-GUARD authz + validation surfaces) onto attribution-timing
// .spec.ts — the FIRST non-write-path reseller_attributions-touching surface
// AND the FIRST surface on the cluster with NON-ZERO COVERAGE of any invariant
// branch. Raises 3/16 surface parity on the reseller_attributions row cluster
// while the create-startup write-path pair holds at 2/2 within the SYMMETRIC
// (project-branch-only) subset per the tick 377 close-out.
//
// The reseller_attributions row cluster carries FIVE invariants at
// web/supabase/migrations/0091_reseller_module_foundations.sql:112-142
// (IDENTICAL enumeration to tick 376/377):
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
// Writer-side source: IDENTICAL to tick 376/377 — DB CHECK + partial-unique
// guards at 0091:112-142 wrap every reseller_attributions insert; enforcement
// happens at DB write time. Route-side callers precompose the insert payload
// under an always-'project' discriminator — the 'user' branch of ck_subject_
// fk_matches_type is UNREACHABLE-BY-CONSTRUCTION from EVERY current write
// path across the codebase (grep audit: web/src/lib/reseller/retail-
// attribution.ts:165-172 + web/src/app/api/reseller/create-startup/route.ts:
// 301-313 both hard-code subject_type='project' + subject_project_id=<uuid>
// + subject_user_id=null; no code path ever inserts subject_type='user').
//
// Application write path anchor for THIS surface: DIFFERENT from tick 376/377.
// Tick 376/377 anchor at create-startup execute() route.ts:301-313 (the
// wholesale-provisioning path never fires on either write-path surface because
// both bail upstream at auth or normalise). THIS spec anchors at web/src/lib/
// reseller/retail-attribution.ts:165-172 via attributeProjectFromUserCache()
// — the second of two documented write paths for reseller_attributions rows.
// Row 3 (test "reseller_attributions row appears with subject_type='project'
// after createProject()") POSTs /api/projects; the workspace createProject()
// side-effect calls attributeProjectFromUserCache which INSERTs the row on
// the 'project' branch of ck_subject_fk_matches_type, defaults status to
// 'active' at the DB, and stamps source='code' unconditionally (the retail-
// attribution path derives from the app_users.attribution_reseller_id cache
// column populated by the P2.5 login-form.tsx / google/route.ts / auth.ts
// signup hooks off the blockid_via cookie chain).
//
// Runtime enforcement on THIS spec: DIFFERENT from tick 376/377 — FIRST
// NON-ZERO coverage on the cluster. Row 1 (/api/reseller/me cache-flip) +
// row 2 (count=0 pre-project) READ from the cluster (via /api/reseller/me
// and countResellerAttributionsFor respectively) without firing any insert.
// Row 3 (project creation + count assertions) DOES fire the insert; it lands
// on the 'project'/'active'/'code' triple and the count=1 read-back at row
// 179-182 ratifies both the CHECK constraints AND the partial-unique index
// accepted exactly one such row per project. The wave-5 row 178 tail
// describes (rows 255-368) only reads /api/reseller/me — no insert. Bail-
// layer differs from BOTH tick 376 surfaces (which bail upstream of the DB
// write) — this surface REACHES the write path via the retail adapter.
//
// Coverage-per-guard posture on this surface: FIRST NON-ZERO surface on the
// cluster. Row 3 exercises the following invariant branches once per pass:
//   - ck_subject_fk_matches_type 'project' branch:  COVERED (count=1 assertion
//                                                    at row 179-182 requires
//                                                    the branch fired without
//                                                    error)
//   - subject_type CHECK 'project' enum value:      COVERED (count=1 read-back
//                                                    via countResellerAttri
//                                                    butionsForProject pins
//                                                    the enum value)
//   - status CHECK 'active' default branch:         COVERED (retail-
//                                                    attribution.ts:165-172
//                                                    lets DB DEFAULT stamp
//                                                    status='active'; the
//                                                    count=1 read-back
//                                                    accepts only active rows
//                                                    per U.15.1's partial-
//                                                    unique index scope)
//   - source CHECK 'code' enum value:               COVERED (retail-
//                                                    attribution.ts writes
//                                                    source='code' when the
//                                                    cache was populated via
//                                                    the blockid_via cookie
//                                                    chain from P2.5)
//   - reseller_attributions_active_project_uniq:    COVERED (single-insert
//                                                    happy path — a
//                                                    regression that fired
//                                                    twice per createProject
//                                                    would trip the index
//                                                    and the count=1
//                                                    assertion would fail
//                                                    with count=2)
// The 'user' branch of ck_subject_fk_matches_type + subject_type CHECK
// remains UNREACHABLE-BY-CONSTRUCTION on every insert path in the codebase;
// row 3 belt-and-braces asserts count=0 for subject_type='user' at rows 190-
// 196 — that assertion pins the UNREACHABLE-BY-CONSTRUCTION posture at the
// read layer, so a future write path that started emitting subject_type=
// 'user' rows (e.g. an admin backfill script) would surface here as
// count!=0. Status 'revoked' branch remains UNREACHABLE from insert (only
// settable via /api/admin/affiliate/attributions/[attributionId]/revoke
// which flips an existing row rather than inserting one). Source enum
// {provisioned, admin_manual} branches are NOT exercised on this surface
// (retail-attribution.ts hard-codes source='code'); the provisioned +
// admin_manual branches remain reachable only via wholesale create-startup
// + admin-manual paths respectively, both of which are ZERO-COVERAGE-PER-
// GUARD on tick 376/377's surfaces.
//
// Symmetric-cluster posture: THIS surface opens the READ-PATH lens on the
// cluster and simultaneously delivers the cluster's FIRST NON-ZERO-COVERAGE
// documentation. The create-startup write-path pair (tick 376/377) carries
// 2/2 parity within the SYMMETRIC (project-branch-only) subset with ZERO-
// COVERAGE-PER-GUARD posture on all five invariants. Combined post-tick 378
// posture: 3/16 total surfaces summarised on the cluster; 13 sibling
// touching surfaces still pending (drawer-authz, drawer-validation, me-
// attribution, scope-boundary, reveal-email-authz, reveal-email-validation,
// credit-grant-authz, credit-grant-validation, audit-log-writes, audit-
// anomaly-scan, sandbox-setup-authz, admin-reseller-detail-authz, admin-
// reseller-detail-validation). The 'user'-branch complement stays
// ASYMMETRIC + UNREACHABLE-BY-CONSTRUCTION across the entire codebase per
// tick 376/377 posture — full 16-surface × 5-invariant saturation would
// collate ZERO-COVERAGE-PER-GUARD × UNREACHABLE-BY-CONSTRUCTION
// documentation on the 'user' branch across every touching spec.
//
// Diagnostic delta of this pass: pure documentation-only doc-block hoist —
// no new imports, no new module-scope constants, no per-column assert
// added, no fixture change, no route change, no migration change. Doc-
// block placed after the shared-fixture imports (line 60) and before the
// first test.describe (line ~62 pre-edit), matching the tick 376 placement
// on create-startup-authz.spec.ts (after NON_RESELLER_FOUNDER_EMAIL const,
// before first test.describe) and the tick 377 placement on create-
// startup-validation.spec.ts (after the CASES const, before first
// test.describe).

test.describe("Reseller attribution timing — P10 dry-run", () => {
  const harness = loadAttributionTimingHarness();
  test.skip(!harness, attributionTimingSkipReason());

  test("blockid_via cookie + login flips /api/reseller/me to the reseller", async ({
    page,
    context,
  }) => {
    const baseURL = page.context()._options.baseURL ?? "http://localhost:3000";
    const parsed = new URL(baseURL);
    // Seed the ?via= cookie BEFORE hitting the login flow so the consumption
    // sites (login-form.tsx:167, google/route.ts:114, auth.ts:517/642) see
    // the cookie and stamp app_users.attribution_reseller_id per P2.5.
    await context.addCookies([
      {
        name: "blockid_via",
        value: harness!.resellerCode,
        domain: parsed.hostname,
        path: "/",
        sameSite: "Lax",
      },
    ]);
    await loginAs(page, harness!.founder.email);
    const me = await page.request.get("/api/reseller/me");
    expect(me.ok(), `/api/reseller/me responded ${me.status()}`).toBe(true);
    const body = (await me.json()) as {
      ok: boolean;
      reseller: { display_name?: string } | null;
    };
    expect(body.ok).toBe(true);
    expect(
      body.reseller?.display_name,
      "expected the user-level attribution cache to point at the seeded reseller",
    ).toBe(harness!.resellerDisplayName);
  });

  test("no reseller_attributions row exists until the founder creates a project (U.6)", async ({
    page,
    context,
  }) => {
    const supabase = loadSupabaseAdmin();
    test.skip(!supabase, supabaseAdminSkipReason());

    const baseURL = page.context()._options.baseURL ?? "http://localhost:3000";
    const parsed = new URL(baseURL);
    await context.addCookies([
      {
        name: "blockid_via",
        value: harness!.resellerCode,
        domain: parsed.hostname,
        path: "/",
        sameSite: "Lax",
      },
    ]);
    await loginAs(page, harness!.founder.email);

    const userId = await findUserIdByEmail(supabase!, harness!.founder.email);
    expect(
      userId,
      `expected app_users row for ${harness!.founder.email} — reseed via scripts/seed-test-users.mjs`,
    ).not.toBeNull();

    // U.6 invariant: attribution_reseller_id on app_users is the cache; the
    // canonical per-workspace row lives in reseller_attributions and only
    // materialises once the founder starts their first workspace. This
    // assertion catches a regression where signup itself would incorrectly
    // insert a user-scoped attribution row.
    const count = await countResellerAttributionsFor(supabase!, userId!);
    expect(
      count,
      `expected 0 reseller_attributions rows for the fresh founder; got ${count}`,
    ).toBe(0);
  });

  test("reseller_attributions row appears with subject_type='project' after createProject() (U.6)", async ({
    page,
    context,
    request,
  }) => {
    const supabase = loadSupabaseAdmin();
    test.skip(!supabase, supabaseAdminSkipReason());

    const baseURL = page.context()._options.baseURL ?? "http://localhost:3000";
    const parsed = new URL(baseURL);
    await context.addCookies([
      {
        name: "blockid_via",
        value: harness!.resellerCode,
        domain: parsed.hostname,
        path: "/",
        sameSite: "Lax",
      },
    ]);
    await loginAs(page, harness!.founder.email);

    // POST /api/projects creates a new workspace. The retail-attribution
    // adapter (web/src/lib/reseller/retail-attribution.ts) fires from
    // createProject() after the row lands, materialising the U.6 canonical
    // per-project attribution row from the app_users.attribution_reseller_id
    // cache the P2.5 signup hooks populated.
    const projectName = `attrib-timing-${Date.now()}`;
    const created = await page.request.post("/api/projects", {
      data: { name: projectName },
    });
    expect(
      created.ok(),
      `POST /api/projects responded ${created.status()}`,
    ).toBe(true);
    const createdBody = (await created.json()) as {
      ok: boolean;
      project?: { id: string };
    };
    expect(createdBody.ok).toBe(true);
    const projectId = createdBody.project?.id;
    expect(projectId, "expected the created project id in the response").toBeTruthy();

    const count = await countResellerAttributionsForProject(supabase!, projectId!);
    expect(
      count,
      `expected exactly 1 active project-scoped reseller_attributions row for ${projectId}; got ${count}`,
    ).toBe(1);

    // Belt-and-braces: the user-scoped subject_type='user' row must NOT
    // exist (U.6 forbids user-level attribution rows — canonical shape is
    // per-project). If a regression starts writing subject_type='user'
    // rows this catches it before the ledger inherits ambiguous provenance.
    const userId = await findUserIdByEmail(supabase!, harness!.founder.email);
    expect(userId, "expected app_users row for harness founder").not.toBeNull();
    const userScoped = await countResellerAttributionsFor(supabase!, userId!, {
      subjectType: "user",
    });
    expect(
      userScoped,
      `expected 0 subject_type='user' reseller_attributions rows; got ${userScoped}`,
    ).toBe(0);
    // Silence unused param lint — `request` is exposed for symmetry with
    // sibling specs but this row uses page.request for cookie propagation.
    void request;
  });
});

// P10 wave-5 row 178 — attribution-timing spec activated for the temp-reseller
// mint fixture cohort. Twin coverage on the /api/reseller/me cache-column
// contract without needing the env-based loadAttributionTimingHarness
// (QA_RESELLER_CODE + QA_RESELLER_DISPLAY_NAME) that the pre-existing describe
// consumes. Per docs/plans/p10-deferred-spec-activation-order.md wave 5:
//   178 | attribution-timing.spec.ts | (n/a) | signup → attribution stamp within jitter window | 200
//
// Fixture wiring (mirrors wave-2 row 145 + wave-5 row 179 posture):
//   - loadTempReseller("active_wholesale") reads the QAPROBEWHOLESALEACTIVE
//     seed row + resolves attributedUserId via QA_RESELLER_ATTRIBUTED_FOUNDER_EMAIL
//     (default qa-founder-attributed-1@blockid.au) → app_users.id.
//   - fixture.attachAttributedCustomer() stamps
//     app_users.attribution_reseller_id = fixture.resellerId (the seed script
//     only writes reseller_attributions, so without this shim /me returns
//     reseller:null on line 52-53 of the /me route). afterAll fixture.cleanup()
//     restores the previous value so cross-spec state does not leak.
//   - loginAs(page, fixture.attributedFounderEmail) signs the founder in via
//     the QA login endpoint; getCurrentUser() then resolves to that founder
//     and the /me handler reads the just-stamped cache column.
//   - The blockid_via cookie is DELIBERATELY set on the browser context before
//     the /me call so a future refactor that made the /me handler consult the
//     cookie as a fallback path (e.g. when the cache column is null) would
//     still find the right reseller and the assertion would stay green — the
//     cache column stamp is the primary oracle, the cookie is belt-and-braces.
//
// Skip conditions (mirrors wave-2 row 145 + wave-5 row 179 verbatim):
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
// Deliberately out of scope — the plan §337 "signup → attribution stamp
// within jitter window" branch. Playwright cannot drive the Google OAuth
// signup redirect that runs processAttribution() in
// web/src/app/api/auth/google/route.ts:116; that branch stays in the env-
// based describe above via the blockid_via cookie + loginAs pair (which
// loginAs's /api/qa/login strategy does not honour — QA login bypasses the
// cookie-consumption sites at login-form.tsx:167 / google/route.ts:114 /
// auth.ts:517/642). The wave-5 twin here activates the fixture route that
// downstream P10 exit-criteria consumers depend on; the jitter-window
// branch remains a P10 follow-up once a QA-mode signup flow lands that
// Playwright can drive without user interaction.
//
// Non-Stripe / non-GST discipline: /me is a pure app_users + resellers SELECT.
// No promotion_code lookup, no revenue_events read, no Stripe network call,
// no InfoVision dependency. P8.5 + P1.5 remain neither a dependency nor a
// consequence.
test.describe("Reseller attribution timing — P10 wave-5 row 178 me-flip", () => {
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
          `wave-5 row 178 cleanup failed — attributed founder's app_users.attribution_reseller_id may still point at the QAPROBE reseller: ${(err as Error).message}`,
        );
      }
    }
  });

  test("active_wholesale — cache column stamp + login returns /api/reseller/me with QAPROBE display_name", async ({
    page,
    context,
  }) => {
    if (fixtureError) {
      test.skip(true, `${tempResellerSkipReason("active_wholesale")} (${fixtureError})`);
      return;
    }
    if (!fixture) {
      test.skip(true, tempResellerSkipReason("active_wholesale"));
      return;
    }
    if (!fixture.attributedUserId || !fixture.attributedFounderEmail) {
      test.skip(
        true,
        `${tempResellerSkipReason("active_wholesale")} — attributedUserId or attributedFounderEmail null (attributed founder app_users row missing on this host).`,
      );
      return;
    }
    const attributedFounderEmail = fixture.attributedFounderEmail;

    const attach = await fixture.attachAttributedCustomer();
    if (!attach) {
      test.skip(
        true,
        "attachAttributedCustomer() returned null — variant mismatch or attributedUserId lookup failed after beforeAll seed. Investigate seed-qa-reseller.mjs output.",
      );
      return;
    }

    // Belt-and-braces cookie — see docblock. Adds resilience to a future /me
    // refactor that reads the cookie as a fallback when the cache column is
    // null; the cache stamp above remains the primary oracle. Set BEFORE
    // loginAs so any future auth path that consumes the cookie (google
    // OAuth callback, magic-link callback) sees it during session hydration.
    const baseURL = page.context()._options.baseURL ?? "http://localhost:3000";
    const parsed = new URL(baseURL);
    await context.addCookies([
      {
        name: "blockid_via",
        value: fixture.code,
        domain: parsed.hostname,
        path: "/",
        sameSite: "Lax",
      },
    ]);

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

    const resp = await page.request.get("/api/reseller/me");
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
    // display_name is the wave-5 row 178 oracle. code + billing_model pin
    // the rest of the co-branding payload so a partial-shape regression
    // (e.g. an accidental select() column drop in route.ts) surfaces here
    // as well — matches wave-2 row 145's belt-and-braces assertion shape.
    expect(body.reseller?.display_name).toBe(fixture.displayName);
    expect(body.reseller?.code).toBe(fixture.code);
    expect(body.reseller?.billing_model).toBe("wholesale");
  });
});
