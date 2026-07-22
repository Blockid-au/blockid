// POST + GET /api/showcase-reviews pre-write / pre-read authorization contract —
// P10 dry-run per plan §J.2 (Playwright must cover the Track B B9 review
// capture surface so a regression in the token / auth / rating / body
// ordering surfaces before the endpoint reads data_room_access_tokens,
// resolves data_rooms → project_id, or writes showcase_reviews).
//
// Track B B9 shipped tick 53 (see reseller-module-goal.md B9_reviews_surface)
// but /api/showcase-reviews had no Playwright spec at all. This closes that
// gap alongside the other reseller-lens authz specs (drawer/reveal-email
// tick 100, billing tick 101, sandbox-setup tick 102, admin-* ticks
// 103-111, reseller-crons tick 112, create-startup tick 113).
//
// The reviewer flow authenticates via a data_room_access_tokens.token so no
// BlockID account is required (same pattern as /api/data-room/engage). The
// founder flow authenticates via getCurrentUser() and scopes by
// projects.user_id = user.id. This spec covers the pre-write validation
// branches on POST and the pre-read auth branch on GET — all safe against
// staging because no showcase_reviews row is written and (row 4 aside) no
// data_room_access_tokens SELECT fires.
//
//   POST branches (all harness-free):
//     1. invalid_json      — POST with an unparseable body → 400 { ok:false, error:"Invalid JSON" }
//                            (bails at req.json() try/catch before token / rating checks)
//     2. missing_token     — POST with empty token         → 400 { ok:false, error:"token required" }
//                            (bails at !token guard before rating check or DB SELECT)
//     3. invalid_rating    — POST with rating out of 1..5  → 400 { ok:false, error:"rating must be 1-5" }
//                            (bails at Number.isFinite / range guard before DB SELECT)
//     4. invalid_token     — POST with a random-shaped     → 403 { ok:false, error:"Invalid or expired token" }
//                            token that resolves to no      (data_room_access_tokens SELECT returns
//                            data_room_access_tokens row    no row → guard trips before data_rooms
//                                                           SELECT and before showcase_reviews upsert)
//   GET branch:
//     5. unauthenticated   — GET with no session           → 401 { ok:false, error:"Auth required" }
//                            (getCurrentUser() null → returns before projectId parse,
//                            projects SELECT, or showcase_reviews SELECT)
//
// Route reference: web/src/app/api/showcase-reviews/route.ts
//   Line 36-39:  getSupabaseAdmin() null                            → 503 Storage not configured
//   Line 41-46:  req.json() try/catch                                → 400 Invalid JSON
//   Line 53-55:  !token guard                                        → 400 token required
//   Line 56-58:  rating range guard                                  → 400 rating must be 1-5
//   Line 60-71:  data_room_access_tokens SELECT + is_active + expiry → 403 Invalid or expired token
//   Line 72-74:  missing investor_email                              → 400 Access token missing reviewer email
//   Line 76-83:  data_rooms SELECT                                   → 409 Data room not linked to a project
//   Line 85-101: showcase_reviews upsert                             → 500 Failed to save review
//   Line 103:    200 { ok: true }
//   Line 107-110: GET getCurrentUser() null                          → 401 Auth required
//   Line 112-116: GET !projectId                                     → 400 projectId required
//   Line 118-121: GET getSupabaseAdmin() null                        → 503 Storage not configured
//   Line 123-130: GET projects SELECT + owner check                  → 404 Not found
//   Line 132-141: GET showcase_reviews SELECT                        → 500 Read failed / 200
//
// Deliberately out of scope (needs per-test seeding which plan §J.2 forbids
// or would break sibling specs sharing the same worker):
//   - expired_token (403) — needs a seeded data_room_access_tokens row with
//     expires_at in the past. Same envelope as row 4 so shape drift lights up.
//   - missing_investor_email (400) — needs a seeded access-token row with a
//     null investor_email column. Never occurs in the retail invite flow
//     because /api/data-room/access requires the invitee email up front.
//   - data_room_not_linked (409) — needs a data_room_access_tokens.data_room_id
//     pointing at a data_rooms row where project_id is null.
//   - upsert_failed (500) — needs per-test tampering that plan §J.2 forbids.
//   - projectId_required (400 on GET) — sits BEHIND getCurrentUser so it
//     needs a real logged-in QA account; folded into the temp-reseller mint
//     fixture follow-up.
//   - not_found (404 on GET) — needs a well-formed project_id that is not
//     owned by the caller; needs the QA harness.
//   - Reviewer POST happy path (200) — reviewer flow fires the full
//     data_room_access_tokens → data_rooms → showcase_reviews upsert chain
//     against seeded test data; folded into the temp-reseller mint fixture
//     follow-up alongside the deferred rows from ticks 94..113.
//
// ACTIVATED wave-5 row 176 below: founder-scoped GET happy 200 via
// loadTempReseller('active_wholesale') + loadSupabaseAdmin() +
// findUserIdByEmail(fixture.attributedFounderEmail) +
// findFirstProjectIdForUser(). The GET path is read-only (no
// showcase_reviews row is written) so it is safe against staging even
// though the sibling reviewer POST happy path stays deferred.
//
// Placeholder token: a well-formed uuid-shaped string that will not match
// any seeded data_room_access_tokens.token because the retail invite flow
// generates tokens via crypto.randomUUID() and the placeholder is a fixed
// all-zeros value that would only exist by extreme coincidence — the row 4
// probe expects the SELECT to return no row, not a real token collision.

import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/accounts";
import {
  loadTempReseller,
  tempResellerSkipReason,
  type TempResellerFixture,
} from "../fixtures/reseller";
import {
  findFirstProjectIdForUser,
  findUserIdByEmail,
  loadSupabaseAdmin,
  supabaseAdminSkipReason,
} from "../fixtures/supabase-admin";

const ROUTE = "/api/showcase-reviews";
const PLACEHOLDER_TOKEN = "00000000-0000-0000-0000-000000000000";
const PLACEHOLDER_PROJECT_ID = "00000000-0000-0000-0000-000000000000";

test.describe("Showcase-reviews pre-write / pre-read authorization — P10 dry-run", () => {
  test("invalid_json — POST with unparseable body returns 400 Invalid JSON", async ({
    request,
  }) => {
    const resp = await request.post(ROUTE, {
      headers: { "content-type": "application/json" },
      data: "not-json{",
    });
    expect(
      resp.status(),
      `invalid_json returned ${resp.status()} — expected 400 before token / rating checks or any DB SELECT. Body: ${await resp.text()}`,
    ).toBe(400);
    const body = (await resp.json()) as { ok: boolean; error?: string };
    expect(
      body.ok,
      `invalid_json body.ok should be false: ${JSON.stringify(body)}`,
    ).toBe(false);
    expect(body.error).toBe("Invalid JSON");
  });

  test("missing_token — POST with empty token returns 400 token required", async ({
    request,
  }) => {
    const resp = await request.post(ROUTE, {
      data: { token: "", rating: 5, comment: "" },
    });
    expect(
      resp.status(),
      `missing_token returned ${resp.status()} — expected 400 before rating check or any DB SELECT. Body: ${await resp.text()}`,
    ).toBe(400);
    const body = (await resp.json()) as { ok: boolean; error?: string };
    expect(
      body.ok,
      `missing_token body.ok should be false: ${JSON.stringify(body)}`,
    ).toBe(false);
    expect(body.error).toBe("token required");
  });

  test("invalid_rating — POST with rating out of 1..5 returns 400 rating must be 1-5", async ({
    request,
  }) => {
    const resp = await request.post(ROUTE, {
      data: { token: PLACEHOLDER_TOKEN, rating: 6, comment: "" },
    });
    expect(
      resp.status(),
      `invalid_rating returned ${resp.status()} — expected 400 before any DB SELECT. Body: ${await resp.text()}`,
    ).toBe(400);
    const body = (await resp.json()) as { ok: boolean; error?: string };
    expect(
      body.ok,
      `invalid_rating body.ok should be false: ${JSON.stringify(body)}`,
    ).toBe(false);
    expect(body.error).toBe("rating must be 1-5");
  });

  test("invalid_token — POST with unknown token returns 403 Invalid or expired token", async ({
    request,
  }) => {
    const resp = await request.post(ROUTE, {
      data: { token: PLACEHOLDER_TOKEN, rating: 4, comment: "" },
    });
    expect(
      resp.status(),
      `invalid_token returned ${resp.status()} — expected 403 after data_room_access_tokens SELECT returns no row, before data_rooms SELECT or showcase_reviews upsert. Body: ${await resp.text()}`,
    ).toBe(403);
    const body = (await resp.json()) as { ok: boolean; error?: string };
    expect(
      body.ok,
      `invalid_token body.ok should be false: ${JSON.stringify(body)}`,
    ).toBe(false);
    expect(body.error).toBe("Invalid or expired token");
  });

  test("unauthenticated — GET with no session returns 401 Auth required", async ({
    request,
  }) => {
    const resp = await request.get(`${ROUTE}?projectId=${PLACEHOLDER_PROJECT_ID}`);
    expect(
      resp.status(),
      `unauthenticated returned ${resp.status()} — expected 401 before projectId parse, projects SELECT, or showcase_reviews SELECT. Body: ${await resp.text()}`,
    ).toBe(401);
    const body = (await resp.json()) as { ok: boolean; error?: string };
    expect(
      body.ok,
      `unauthenticated body.ok should be false: ${JSON.stringify(body)}`,
    ).toBe(false);
    expect(body.error).toBe("Auth required");
  });
});

// Wave-5 row 176 — founder-scoped GET happy 200. Uses the active_wholesale
// variant per the plan §J.2 activation-order pin because the attributed
// founder (qa-founder-attributed-1@blockid.au by default) is the caller
// whose session must clear the projects.user_id === user.id gate on the
// GET path. Read-only against showcase_reviews so no per-test seeding
// fires; the projectId is resolved via findFirstProjectIdForUser() so a
// fresh CI host that never planted a workspace for that founder simply
// skips instead of tripping the 404 not_found branch.
test.describe("Showcase-reviews founder-scoped GET — P10 wave-5 row 176 happy path", () => {
  let fixture: TempResellerFixture | null = null;
  let fixtureError: string | null = null;

  test.beforeAll(async () => {
    try {
      fixture = await loadTempReseller("active_wholesale");
    } catch (err) {
      fixtureError = (err as Error).message;
    }
  });

  test("happy — attributed founder GET returns 200 with reviews array", async ({
    page,
  }) => {
    if (fixtureError) {
      test.skip(true, `${tempResellerSkipReason("active_wholesale")} (${fixtureError})`);
      return;
    }
    if (!fixture) {
      test.skip(true, tempResellerSkipReason("active_wholesale"));
      return;
    }
    if (!fixture.attributedFounderEmail) {
      test.skip(
        true,
        `${tempResellerSkipReason("active_wholesale")} — attributedFounderEmail null (attributed founder app_users row missing on this host).`,
      );
      return;
    }

    const supabase = loadSupabaseAdmin();
    if (!supabase) {
      test.skip(true, supabaseAdminSkipReason());
      return;
    }

    const founderUserId = await findUserIdByEmail(
      supabase,
      fixture.attributedFounderEmail,
    );
    if (!founderUserId) {
      test.skip(
        true,
        `attributed founder app_users row not found for ${fixture.attributedFounderEmail} — reseed via scripts/seed-test-users.mjs`,
      );
      return;
    }

    const projectId = await findFirstProjectIdForUser(supabase, founderUserId);
    if (!projectId) {
      test.skip(
        true,
        `attributed founder ${fixture.attributedFounderEmail} owns no projects.id yet — seed via /workspace UI or backfill so the GET happy path can clear the projects.user_id gate.`,
      );
      return;
    }

    try {
      await loginAs(page, fixture.attributedFounderEmail);
    } catch (err) {
      test.skip(
        true,
        `Founder QA account not seeded: ${(err as Error).message}. Run scripts/seed-test-users.mjs to populate /tmp/blockid-qa-accounts.txt.`,
      );
      return;
    }

    const resp = await page.request.get(`${ROUTE}?projectId=${projectId}`);
    expect(
      resp.status(),
      `happy GET returned ${resp.status()} — expected 200 after projects.user_id === user.id gate clears. Body: ${await resp.text()}`,
    ).toBe(200);
    const body = (await resp.json()) as {
      ok: boolean;
      reviews?: unknown;
      error?: string;
    };
    expect(
      body.ok,
      `happy body.ok should be true: ${JSON.stringify(body)}`,
    ).toBe(true);
    expect(
      Array.isArray(body.reviews),
      `happy body.reviews should be an array (possibly empty): ${JSON.stringify(body)}`,
    ).toBe(true);
  });
});
