// POST /api/reseller/sandbox/setup pre-write authorization contract —
// P10 dry-run per plan §U.4 (sandbox mechanics) and §J.2 (Playwright must
// cover the reseller-admin endpoints so a regression in the auth → feature-
// gate → scope → role gate ordering surfaces before the endpoint fires the
// projects INSERT or the reseller_audit_log(provision_sandbox) row).
//
// The sandbox-setup route has NO input-validation branches — it takes no
// body — so the pre-write assertions probe the auth chain instead. Two
// branches are harness-free and safe against staging (no rows written to
// projects or reseller_audit_log):
//
//   1. unauthenticated       — POST with no session          → 401 error="Authentication required"
//                              (gateRequireFeature bails before scope/DB read)
//   2. non_reseller_admin    — POST as a founder QA account  → 402 error="feature_locked", feature="reseller.console"
//                              (gateRequireFeature bails because founder plans
//                              do not grant reseller.console; scopedReseller
//                              never runs and reseller_admins is never queried)
//
// Route reference: web/src/app/api/reseller/sandbox/setup/route.ts
//   Line 41-43: gateRequireFeature("reseller.console") → 401/402 before scope
//   Line 45-53: scopedReseller(user) throws            → 403 { reason: err.code }
//   Line 55-60: canProvisionSandbox(scope.role) false  → 403 { reason: "insufficient_role" }
//   Line 62-65: getSupabaseAdmin() null                → 503 { reason: "not_configured" }
//   Line 67-74: scope.sandboxProjectId() truthy        → 200 { ok:true, already_existed:true }
//   Line 76-80: !self (reseller_admins → no resellers) → 404 { reason: "reseller_missing" }
//   Line 89-115: projects.insert() OR audit failure    → 500 / race → 200 already_existed
//
// Skips:
//   Row 2 skips at test-scope if the qa-founder-1 account is not seeded
//   (loginAs throws). Row 1 always runs — no harness required — so this spec
//   lights up in CI on the next `npx playwright test` pass alongside
//   code-validate.spec.ts.
//
// Deliberately out of scope (needs the reseller QA harness or per-test
// seeding which plan §J.2 forbids):
//   - insufficient_role (403) — needs a reseller admin with role='viewer';
//     QA harness assumes owner/admin.
//   - no_membership (403 via scopedReseller) — would need a user who has
//     reseller.console entitlement but no reseller_admins row; that's an
//     inconsistent state that never occurs in production because the two
//     are provisioned together.
//   - reseller_missing (404) — needs a reseller_admins row without a
//     matching resellers row (edge case; per-test seeding).
//   - not_configured (503) — needs SUPABASE_URL/SERVICE_ROLE unset which
//     would break every other Playwright spec running in the same worker.
//   - already_existed (200 idempotent replay) — needs a sandbox project
//     already provisioned for the harness reseller; folded into the
//     temp-reseller mint fixture follow-up alongside ticks 94/95/96/97.
//   - Happy path (200 with project_id/slug/name) — fires the projects
//     INSERT + reseller_audit_log write against the harness reseller;
//     belongs to the temp-reseller mint fixture follow-up.

import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/accounts";

const NON_RESELLER_FOUNDER_EMAIL =
  process.env.QA_UNATTRIBUTED_FOUNDER_EMAIL ?? "qa-founder-1@blockid.au";

test.describe("Reseller sandbox-setup pre-write authorization — P10 dry-run", () => {
  test("unauthenticated — POST with no session returns 401", async ({ request }) => {
    const resp = await request.post(`/api/reseller/sandbox/setup`);
    expect(
      resp.status(),
      `unauthenticated returned ${resp.status()} — expected 401 before scope or DB read. Body: ${await resp.text()}`,
    ).toBe(401);
    const body = (await resp.json()) as { ok: boolean; error?: string };
    expect(body.ok, `unauthenticated body.ok should be false: ${JSON.stringify(body)}`).toBe(false);
    expect(body.error).toBe("Authentication required");
  });

  test("non_reseller_admin — POST as a founder QA account returns 402 feature_locked", async ({
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
    const resp = await page.request.post(`/api/reseller/sandbox/setup`);
    expect(
      resp.status(),
      `non_reseller_admin returned ${resp.status()} — expected 402 (feature_locked) before scope/DB read. Body: ${await resp.text()}`,
    ).toBe(402);
    const body = (await resp.json()) as {
      ok: boolean;
      error?: string;
      feature?: string;
      reason?: string;
    };
    expect(body.ok, `non_reseller_admin body.ok should be false: ${JSON.stringify(body)}`).toBe(false);
    expect(body.error).toBe("feature_locked");
    expect(body.feature).toBe("reseller.console");
  });
});
