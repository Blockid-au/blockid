// POST /api/admin/resellers pre-write authorization contract —
// P10 dry-run per plan §C.5 (admin surfaces) and §J.2 (Playwright must
// cover the admin surfaces so a regression in the requireAdmin() gate
// ordering surfaces before the endpoint parses the body, normalises the
// code, or writes the resellers INSERT row).
//
// Mirrors admin-reseller-patch-authz.spec.ts (tick 103),
// admin-requests-patch-authz.spec.ts (tick 105),
// admin-reseller-delete-authz.spec.ts (tick 106),
// admin-requests-list-authz.spec.ts (tick 107), and
// admin-resellers-list-authz.spec.ts (tick 108) — same requireAdmin()
// chokepoint from web/src/lib/reseller/require-admin.ts (see
// route.ts:60-68), same { ok:false, reason: AdminGateError.code }
// envelope pair at HTTP 401 for BOTH the no_user and not_admin branches
// (route.ts:64-66). Symmetric shape means a refactor that collapses the
// two 401 reasons into a single "unauthorised", swaps requireAdmin() for
// a bespoke inline check, or flips the status code to 403 lights up in
// all six specs on the next `npx playwright test` pass.
//
// Two branches are harness-free and safe against staging (no resellers
// INSERT fires, no body JSON parse runs, no code normalisation fires,
// no wholesale/GST/ABN validation fires, no resellers row is written):
//
//   1. unauthenticated  — POST with no session       → 401 { ok:false, reason:"no_user" }
//                          (getCurrentUser null → requireAdmin throws
//                          AdminGateError("no_user") → gate returns 401
//                          BEFORE JSON parse, normaliseResellerCode,
//                          display_name check, wholesale GST/ABN
//                          validation, getSupabaseAdmin, or resellers
//                          INSERT)
//   2. non_admin        — POST as a founder QA account → 401 { ok:false, reason:"not_admin" }
//                          (getCurrentUser resolves but user.role !== "admin"
//                          and user.email !== ADMIN_EMAIL → isAdmin false →
//                          requireAdmin throws AdminGateError("not_admin") →
//                          gate returns 401 BEFORE JSON parse,
//                          normaliseResellerCode, display_name check,
//                          wholesale GST/ABN validation, getSupabaseAdmin,
//                          or resellers INSERT)
//
// Route reference: web/src/app/api/admin/resellers/route.ts
//   Line 60-68:  gate() — getCurrentUser + requireAdmin → 401 no_user / not_admin
//   Line 70-75:  JSON parse                  → 400 invalid_body
//   Line 77-80:  normaliseResellerCode       → 400 code_required
//   Line 81-83:  display_name check          → 400 display_name_required
//   Line 87-100: wholesale invariants        → 400 wholesale_requires_gst / wholesale_requires_abn
//   Line 102-105: getSupabaseAdmin           → 503 not_configured
//   Line 107-142: resellers INSERT           → 409 code_taken / 500 insert_failed / 201 ok
//
// Skips:
//   Row 2 skips at test-scope if the qa-founder-1 account is not seeded
//   (loginAs throws). Row 1 always runs — no harness required — so this
//   spec lights up in CI on the next `npx playwright test` pass alongside
//   the five sibling admin authz specs.
//
// Deliberately out of scope (needs the admin QA harness or per-test
// seeding which plan §J.2 forbids):
//   - invalid_body (400) — sits BEHIND requireAdmin (route.ts:70 vs :62),
//     needs an admin session PLUS a non-JSON body.
//   - code_required (400) — sits BEHIND requireAdmin (route.ts:77 vs :62),
//     needs an admin session PLUS an omitted/blank code field.
//   - display_name_required (400) — sits BEHIND requireAdmin (route.ts:81
//     vs :62), needs an admin session PLUS an omitted display_name.
//   - wholesale_requires_gst / wholesale_requires_abn (400) — sits BEHIND
//     requireAdmin (route.ts:87-100 vs :62), needs an admin session PLUS
//     a wholesale body missing gst_registered or ABN in NN NNN NNN NNN
//     format per U.15.1 D2-CFO-01 + D4-CLO-03.
//   - code_taken (409) — sits BEHIND requireAdmin, needs an admin session
//     PLUS a code already present in resellers.
//   - not_configured (503) — needs SUPABASE_URL/SERVICE_ROLE unset which
//     would break every other Playwright spec in the same worker.
//   - insert_failed (500) — needs a broken resellers INSERT which
//     requires per-test tampering plan §J.2 forbids.
//   - Happy path (201) — ACTIVATED wave-5 row 165 (tick 180) below via
//     loadAdminHarness() (qa-admin-1@blockid.au). Uses a per-run unique
//     probe code prefix (`PROBETICK180<random>`) so successive CI worker
//     runs never collide on the resellers_code_key UNIQUE index — a
//     rerun after a failed cleanup just mints a fresh code and the
//     stale row keeps its status='terminated' bucket without ever
//     blocking a subsequent tick. Retail billing_model chosen so the
//     wholesale GST/ABN gate at route.ts:87-100 never fires — the happy
//     assertion pins the INSERT branch, not the wholesale invariants
//     (those are row 166's territory, already covered by tick 179).
//     afterAll flips the row to status='terminated' via the sibling
//     DELETE /api/admin/resellers/[code] endpoint (soft-delete per
//     route.ts:220-224) so a live production run never accumulates
//     status='active' probe rows — the terminated bucket is discarded
//     by every downstream aggregate (portfolio, phase-distribution,
//     integrations catalogue, commission accrual) so the residue is
//     inert. Reseller_promotion_codes cleanup is a no-op here because
//     the POST route does NOT invoke decideCodeMint (that's the
//     /api/reseller/requests approve-side of P9.4); the resellers row
//     itself is the only downstream artefact.
//
// Placeholder body used on both rows: an object with a lowercase-kebab
// code and a display_name, safe enough that even if the requireAdmin
// gate silently fell open the eventual INSERT would still hit the
// code_taken / insert_failed branches rather than persist a real row.
// Both harness-free rows return BEFORE JSON parse fires (row 1 bails in
// gate() → getCurrentUser; row 2 bails in gate() → requireAdmin), so
// the placeholder body never reaches the resellers table.

import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/accounts";
import { adminHarnessSkipReason, loadAdminHarness } from "../fixtures/reseller";

const NON_ADMIN_FOUNDER_EMAIL =
  process.env.QA_UNATTRIBUTED_FOUNDER_EMAIL ?? "qa-founder-1@blockid.au";

const ROUTE = "/api/admin/resellers";
const CREATE_BODY = {
  code: "test-placeholder-code",
  display_name: "POST placeholder — should not reach DB",
};

// Row 165 happy path — per-run unique code so a live-CI rerun after a
// failed afterAll cleanup mints a fresh row rather than colliding on
// resellers_code_key. normaliseResellerCode strips non-alphanumeric +
// uppercases (attribution.ts:25-29) so the raw string can carry
// hex-encoded randomness and normalisation still resolves it to a
// unique canonical code. Kept short (< 20 chars) to fit typical
// resellers.code column conventions without over-consuming index space.
function mintProbeCode(): string {
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `PROBETICK180${random}`;
}

test.describe("Admin resellers POST pre-write authorization — P10 wave-5 row 165 pre-write branches", () => {
  test("unauthenticated — POST with no session returns 401 no_user", async ({
    request,
  }) => {
    const resp = await request.post(ROUTE, { data: CREATE_BODY });
    expect(
      resp.status(),
      `unauthenticated returned ${resp.status()} — expected 401 before JSON parse, normaliseResellerCode, display_name check, wholesale GST/ABN validation, getSupabaseAdmin, or the resellers INSERT. Body: ${await resp.text()}`,
    ).toBe(401);
    const body = (await resp.json()) as { ok: boolean; reason?: string };
    expect(
      body.ok,
      `unauthenticated body.ok should be false: ${JSON.stringify(body)}`,
    ).toBe(false);
    expect(body.reason).toBe("no_user");
  });

  test("non_admin — POST as a founder QA account returns 401 not_admin", async ({
    page,
  }) => {
    try {
      await loginAs(page, NON_ADMIN_FOUNDER_EMAIL);
    } catch (err) {
      test.skip(
        true,
        `Non-admin founder account not seeded: ${(err as Error).message}. ` +
          `Run scripts/seed-test-users.mjs to populate /tmp/blockid-qa-accounts.txt.`,
      );
      return;
    }
    const resp = await page.request.post(ROUTE, { data: CREATE_BODY });
    expect(
      resp.status(),
      `non_admin returned ${resp.status()} — expected 401 not_admin before JSON parse, normaliseResellerCode, display_name check, wholesale GST/ABN validation, getSupabaseAdmin, or the resellers INSERT. Body: ${await resp.text()}`,
    ).toBe(401);
    const body = (await resp.json()) as { ok: boolean; reason?: string };
    expect(
      body.ok,
      `non_admin body.ok should be false: ${JSON.stringify(body)}`,
    ).toBe(false);
    expect(body.reason).toBe("not_admin");
  });
});

// P10 wave-5 row 165 happy path — admin harness + retail body + probe
// code cleanup. Per docs/plans/p10-deferred-spec-activation-order.md
// wave-5 table row 165 (`admin-resellers-create-authz.spec.ts` × (n/a)
// × happy 201 with new reseller row). The row is the last wave-5
// admin-surface leaf; every sibling admin-authz spec (list/detail/patch/
// delete/loop-status/requests-list/requests-patch) already carries a
// happy 200 branch. Closes the P10 admin-surface authz matrix so the
// P10 exit criterion §420 "admin-facing endpoints regression-guarded
// at the Playwright lens" holds symmetrically across GET/POST/PATCH/
// DELETE for /api/admin/resellers[/:code] and /api/admin/reseller-
// requests[/:id].
//
// State-pollution posture: POST writes a fresh resellers row with
// status='active'; afterAll DELETEs it (soft-delete → status=
// 'terminated' per route.ts:220-224). The row survives in the DB after
// the run but is idempotent under CI replay because every subsequent
// run mints a fresh probe code via mintProbeCode(). If afterAll's
// DELETE fails, the row stays status='active' but its code is unique
// per run so a future POST never collides. Cleanup is best-effort —
// the test itself does NOT reassert on the DELETE response so a
// cleanup 5xx does not mask the primary 201 assertion.
//
// Non-Stripe / non-GST discipline: retail billing_model so route.ts:87-
// 100 skips the wholesale GST/ABN gate; no Stripe network call fires,
// no revenue_events row is written, no reseller_promotion_codes row is
// minted (that pipeline runs in /api/reseller/requests approve-side of
// P9.4, not the direct create endpoint). P8.5 + P1.5 remain neither a
// dependency nor a consequence.
test.describe("Admin resellers POST — P10 wave-5 row 165 happy path", () => {
  const harness = loadAdminHarness();
  test.skip(!harness, adminHarnessSkipReason());

  const probeCode = mintProbeCode();
  let createdCode: string | null = null;

  test.afterAll(async ({ request }) => {
    if (!createdCode) return;
    try {
      await request.delete(`${ROUTE}/${createdCode.toLowerCase()}`);
    } catch {
      // Cleanup is best-effort — a network flake or session drop must
      // not mask the primary 201 assertion. See state-pollution posture
      // in the describe docblock: successive probe codes never collide,
      // so a stale status='active' row is inert.
    }
  });

  test("happy — POST as qa-admin-1 with unique probe code returns 201 with reseller row", async ({
    page,
  }) => {
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

    const resp = await page.request.post(ROUTE, {
      data: {
        code: probeCode,
        display_name: `Probe tick 180 — ${probeCode}`,
        billing_model: "retail",
      },
    });
    expect(
      resp.status(),
      `happy POST returned ${resp.status()} — expected 201 after requireAdmin() passes, JSON.parse succeeds, normaliseResellerCode resolves the probe code, display_name is present, the retail branch skips the wholesale GST/ABN gate, getSupabaseAdmin resolves, and the resellers INSERT commits. A 400 code_required means normalisation rejected the probe (attribution.ts:25-29). A 400 display_name_required means the display_name field dropped. A 409 code_taken means a prior run's cleanup failed AND the mintProbeCode() collision guard held — unexpected. A 503 not_configured means SUPABASE_URL/SERVICE_ROLE is unset. A 500 insert_failed means the resellers INSERT hit a DB error (route.ts:137-142). Body: ${await resp.text()}`,
    ).toBe(201);

    const body = (await resp.json()) as {
      ok?: unknown;
      reseller?: {
        code?: unknown;
        display_name?: unknown;
        billing_model?: unknown;
        status?: unknown;
      };
    };

    expect(
      body.ok,
      `happy body.ok should be true (route.ts:136 returns {ok:true, reseller:data}): ${JSON.stringify(body).slice(0, 200)}`,
    ).toBe(true);
    expect(
      body.reseller,
      `happy body.reseller should be present so the .select().single() row surfaces to the admin caller: ${JSON.stringify(body).slice(0, 200)}`,
    ).toBeTruthy();

    // Capture the DB-normalised code for afterAll cleanup. Guarded by
    // typeof check so an unexpected null shape does not throw here and
    // still leaves createdCode=null for the afterAll no-op branch.
    if (body.reseller && typeof body.reseller.code === "string") {
      createdCode = body.reseller.code;
    }

    expect(
      body.reseller?.code,
      `happy body.reseller.code should match the normalised probe (attribution.ts uppercases + strips non-alphanumeric): ${JSON.stringify(body.reseller).slice(0, 200)}`,
    ).toBe(probeCode);
    expect(
      body.reseller?.billing_model,
      `happy body.reseller.billing_model should be 'retail' per the POSTed body: ${JSON.stringify(body.reseller).slice(0, 200)}`,
    ).toBe("retail");
    expect(
      body.reseller?.status,
      `happy body.reseller.status should default to 'active' per route.ts:121: ${JSON.stringify(body.reseller).slice(0, 200)}`,
    ).toBe("active");
  });
});
