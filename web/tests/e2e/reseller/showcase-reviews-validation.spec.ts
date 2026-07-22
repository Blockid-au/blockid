// GET /api/showcase-reviews input-validation contract —
// P10 dry-run per plan § B9_reviews_surface (Track B B9 shipped tick 53) and
// § J.2 (Playwright must cover the Track B B9 review capture surface so a
// regression in the auth → projectId parse → owner-check ordering surfaces
// before the endpoint fires the projects SELECT or the showcase_reviews
// SELECT).
//
// showcase-reviews-authz.spec.ts already probes the four POST harness-free
// validators (invalid_json / missing_token / invalid_rating / invalid_token)
// and the GET unauthenticated (401) branch. This spec closes the two GET
// branches its header explicitly listed as needing the QA harness:
//
//   1. projectId_required — GET without ?projectId=       → 400 { ok:false, error:"projectId required" }
//                           (bails after getCurrentUser passes but before
//                            getSupabaseAdmin, projects SELECT, or
//                            showcase_reviews SELECT)
//   2. not_found          — GET with a random uuid        → 404 { ok:false, error:"Not found" }
//                           projectId that resolves to no
//                           projects row (projects SELECT
//                           returns null → guard trips
//                           before showcase_reviews SELECT)
//
// Route reference: web/src/app/api/showcase-reviews/route.ts
//   Line 107-110: getCurrentUser null                        → 401 Auth required
//   Line 112-116: !projectId                                 → 400 projectId required
//   Line 118-121: getSupabaseAdmin() null                    → 503 Storage not configured
//   Line 123-130: projects SELECT + owner check              → 404 Not found
//   Line 132-141: showcase_reviews SELECT                    → 500 Read failed / 200
//
// Rows 1-2 cover Line 112-116 + Line 123-130 exclusively. Both sit BEHIND
// getCurrentUser so they need a real authenticated QA session; the harness's
// admin account is used purely as a source of that session (the route is
// NOT reseller-scoped — any logged-in QA account would work — but reusing
// loadResellerHarness() keeps the harness-provisioning surface identical
// to reveal-email-validation / drawer-validation / reports-signed-url-
// validation / billing-validation, so one env-var flip lights up all five
// specs at once).
//
// Twin of reports-signed-url-validation (tick 119) / drawer-validation
// (tick 118) / reveal-email-validation (tick 117) / billing-validation
// (tick 120) — same structural shape (pre-auth authz covered elsewhere,
// post-auth validators covered here). Differs from the customer-scoped
// drawer/reveal-email pair in one dimension only: this route uses
// getCurrentUser + projects.user_id owner-check rather than scopedReseller
// + decideReveal(uuid + allowedCustomerIds), and the response envelope
// carries `error` string field rather than `reason` string field —
// showcase-reviews predates the reseller-lens ({ok:false, reason:<code>})
// convention.
//
// Deliberately out of scope (needs per-test seeding which plan §J.2 forbids
// or would break sibling specs sharing the same worker):
//   - not_configured (503) — needs SUPABASE_URL/SERVICE_ROLE unset which
//     would break every other Playwright spec in the same worker.
//   - read_failed (500) — needs the showcase_reviews SELECT to error, which
//     requires per-test tampering plan §J.2 forbids. Would need to fire
//     against a real project row owned by the harness admin so the owner-
//     check passes but the SELECT hits a Storage error.
//   - Happy path (200 with reviews array) — needs a projects row owned by
//     the harness admin plus optionally seeded showcase_reviews rows so the
//     joined SELECT returns realistic data. Belongs to the temp-reseller
//     mint fixture follow-up alongside the deferred happy-path rows from
//     credit-grant / requests / drawer / reveal-email / create-startup /
//     sandbox-setup / me / admin-* / billing / reports-signed-url specs
//     (ticks 94..120).
//   - POST reviewer-flow rows beyond the four already-covered pre-write
//     validators — expired_token (403) / missing_investor_email (400) /
//     data_room_not_linked (409) / upsert_failed (500) / happy path (200)
//     all need seeded data_room_access_tokens + data_rooms + projects
//     state plan §J.2 forbids.
//
// Random UUID that is astronomically unlikely to match any real projects
// row so the not_found branch fires deterministically. Same "00000000..."
// convention already used by the OUT_OF_SCOPE_UUID sentinels in
// reveal-email-validation / drawer-validation so a future collision with a
// live projects.id would break all three specs in lockstep — cheap to
// re-anchor if that ever happens.

import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/accounts";
import { harnessSkipReason, loadResellerHarness } from "../fixtures/reseller";

const ROUTE = "/api/showcase-reviews";
const NOT_FOUND_PROJECT_ID = "00000000-0000-4000-8000-000000000002";

test.describe("Showcase-reviews GET input validation — P10 dry-run", () => {
  const harness = loadResellerHarness();
  test.skip(!harness, harnessSkipReason());

  test("projectId_required — GET without ?projectId returns 400 projectId required", async ({
    page,
  }) => {
    await loginAs(page, harness!.admin.email);
    const resp = await page.request.get(ROUTE);
    expect(
      resp.status(),
      `projectId_required returned ${resp.status()} — expected 400 before getSupabaseAdmin, projects SELECT, or showcase_reviews SELECT. Body: ${await resp.text()}`,
    ).toBe(400);
    const body = (await resp.json()) as { ok: boolean; error?: string };
    expect(
      body.ok,
      `projectId_required body.ok should be false: ${JSON.stringify(body)}`,
    ).toBe(false);
    expect(body.error).toBe("projectId required");
  });

  test("not_found — GET with unknown projectId returns 404 Not found", async ({
    page,
  }) => {
    await loginAs(page, harness!.admin.email);
    const resp = await page.request.get(
      `${ROUTE}?projectId=${NOT_FOUND_PROJECT_ID}`,
    );
    expect(
      resp.status(),
      `not_found returned ${resp.status()} — expected 404 after projects SELECT returns no row, before showcase_reviews SELECT. Body: ${await resp.text()}`,
    ).toBe(404);
    const body = (await resp.json()) as { ok: boolean; error?: string };
    expect(
      body.ok,
      `not_found body.ok should be false: ${JSON.stringify(body)}`,
    ).toBe(false);
    expect(body.error).toBe("Not found");
  });
});
