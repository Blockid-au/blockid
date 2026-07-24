// POST /api/reseller/create-startup input-validation contract — P10 dry-run
// per plan §C.1.5 (wholesale provisioning form) and §J.2 (Playwright must
// cover the reseller-admin endpoints so a regression in
// normaliseCreateStartupInput surfaces before the endpoint fires DB writes).
//
// This spec probes the four normalise-error branches surfaced by
// web/src/lib/reseller/create-startup.ts::normaliseCreateStartupInput():
//   1. invalid_email        — blank/malformed founder_email
//   2. company_name_required — blank company_name
//   3. invalid_plan_tier    — plan_tier !== WHOLESALE_PLAN_ID
//   4. invalid_discount_tier — tier outside {0,10,20,30,40}
//
// Each row POSTs a deliberately-malformed body, expects HTTP 400, and asserts
// body.reason matches the CreateStartupError enum literal. No DB writes fire
// on the 400 path (the route bails at the normalise gate before touching
// app_users / projects / reseller_attributions), so the spec runs safely
// against staging without pollution.
//
// Skips:
//   describe-scope on loadResellerHarness() (needs QA_RESELLER_ADMIN_EMAIL +
//     QA_RESELLER_ATTRIBUTED_CUSTOMER_ID) — same posture as
//     audit-log-writes.spec.ts, audit-anomaly-scan.spec.ts,
//     attribution-timing.spec.ts.
//
// Downstream reasons (reseller_not_active / capability_disabled /
// billing_model_not_wholesale / tier_not_allowed / existing_active_attribution
// / promotion_code_missing) fire from decideCreateStartup() after the
// normalise gate. Those need a real reseller row with specific column values
// (e.g. billing_model='retail' for billing_model_not_wholesale) — asserting
// them here would either need per-test row seeding (forbidden by plan §J.2)
// or a bespoke harness that mints a temp reseller with the target state.
// Tracked in the "deliberately out of scope" list of the tick 94 log entry.

import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/accounts";
import { harnessSkipReason, loadResellerHarness } from "../fixtures/reseller";

interface ValidationCase {
  label: string;
  body: Record<string, unknown>;
  expectedReason:
    | "invalid_email"
    | "company_name_required"
    | "invalid_plan_tier"
    | "invalid_discount_tier";
}

// Common valid fields — each case overrides exactly one field to trip its
// target gate, so a passing assertion proves that specific branch fires
// (rather than an earlier-in-order gate absorbing the failure). Gate order
// per normaliseCreateStartupInput: email → company → plan_tier → discount_tier.
const VALID_BASE = {
  founder_email: "qa-createstartup-probe@blockid.au",
  company_name: "QA Probe Co",
  plan_tier: "founder_growth",
  discount_tier: 20,
};

const CASES: ValidationCase[] = [
  {
    label: "invalid_email — blank founder_email",
    body: { ...VALID_BASE, founder_email: "" },
    expectedReason: "invalid_email",
  },
  {
    label: "company_name_required — blank company_name",
    body: { ...VALID_BASE, company_name: "   " },
    expectedReason: "company_name_required",
  },
  {
    label: "invalid_plan_tier — non-wholesale plan_tier",
    body: { ...VALID_BASE, plan_tier: "founder_scale" },
    expectedReason: "invalid_plan_tier",
  },
  {
    label: "invalid_discount_tier — tier outside {0,10,20,30,40}",
    body: { ...VALID_BASE, discount_tier: 15 },
    expectedReason: "invalid_discount_tier",
  },
];

// Tick 377 — reseller_attributions row-cluster cross-column invariant summary
// (option (i) from tick 376 next-picks). Cross-surface twin-lift of the tick
// 376 module-scope summary that landed on create-startup-authz.spec.ts (the
// write-path pre-auth surface) onto create-startup-validation.spec.ts (the
// write-path input-validation surface). Raises 2/16 surface parity on the
// reseller_attributions row cluster — matches the tick 375 twin-lift posture
// of tick 374 onto credit-grant-validation.spec.ts, which closed 2/2 parity
// on the credit-grant write-path pair. Post-tick 377, the reseller_
// attributions row cluster carries 2 module-scope summaries: 1 on create-
// startup-authz.spec.ts (tick 376) + 1 on create-startup-validation.spec.ts
// (this tick) — with 14 sibling reseller_attributions-touching surfaces
// still pending: attribution-timing.spec.ts, drawer-authz.spec.ts, drawer-
// validation.spec.ts, me-attribution.spec.ts, scope-boundary.spec.ts,
// reveal-email-authz.spec.ts, reveal-email-validation.spec.ts, credit-grant-
// authz.spec.ts, credit-grant-validation.spec.ts, audit-log-writes.spec.ts,
// audit-anomaly-scan.spec.ts, sandbox-setup-authz.spec.ts, admin-reseller-
// detail-authz.spec.ts, admin-reseller-detail-validation.spec.ts.
//
// The reseller_attributions row cluster carries FIVE invariants at
// web/supabase/migrations/0091_reseller_module_foundations.sql:112-142
// (IDENTICAL to the tick 376 summary):
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
// Writer-side source: IDENTICAL to tick 376 — DB CHECK + partial-unique
// guards at 0091:112-142 wrap every reseller_attributions insert; enforcement
// happens at DB write time. Route-side callers precompose the insert payload
// under an always-'project' discriminator — the 'user' branch of ck_subject_
// fk_matches_type is UNREACHABLE-BY-CONSTRUCTION from EVERY current write
// path across the codebase (grep audit: web/src/lib/reseller/retail-
// attribution.ts:165-172 + web/src/app/api/reseller/create-startup/route.ts:
// 301-313 both hard-code subject_type='project' + subject_project_id=<uuid>
// + subject_user_id=null; no code path ever inserts subject_type='user').
// The 'user' branch remains enforceable at the DB layer (e.g. against a
// hypothetical admin manual backfill via /admin/affiliate) but never fires
// from user-space route code.
//
// Application write path anchor for THIS surface: IDENTICAL to tick 376 —
// the create-startup execute() at web/src/app/api/reseller/create-startup/
// route.ts:301-313 populates subject_type='project', subject_project_id=
// <projects.id from step (b)>, subject_user_id=null, source=plan.attribution
// .source (∈ {code, provisioned, admin_manual} per decideCreateStartup
// normalisation), status defaults to 'active' at the DB — one row per happy
// POST always sits on the project branch of ck_subject_fk_matches_type, the
// 'active' branch of the status CHECK, and one of the three allowed source
// enum values.
//
// Runtime enforcement on THIS spec: rows 1-4 (invalid_email / company_name_
// required / invalid_plan_tier / invalid_discount_tier) all return AT the
// normaliseCreateStartupInput gate at web/src/lib/reseller/create-startup.ts
// BEFORE the route's decideCreateStartup → execute() → reseller_attributions
// insert chain fires, so NONE of them exercise any CHECK branch or the
// partial-unique index. The normalise-error branches sit UPSTREAM of the DB
// write path — bail-before-insert semantics DIFFER from tick 376's create-
// startup-authz surface where rows 1-2 bail at the gateRequireFeature /
// scopedReseller auth layer BEFORE normalise even runs. On this spec every
// row reaches normalise (loginAs succeeds via the shared reseller harness)
// but none reach the DB. Zero rows on this surface reach line 301-313;
// happy-path 200 (fires the insert + magic-link + welcome email + wholesale
// subscription) is deliberately out-of-scope per the top-of-file comment
// (folded into the temp-reseller mint fixture follow-up alongside ticks 94/
// 95/96/97/98).
//
// Coverage-per-guard posture on this surface: 'project' branch of ck_
// subject_fk_matches_type has ZERO-COVERAGE-PER-GUARD (no row reaches the
// insert); 'user' branch has ZERO-COVERAGE-PER-GUARD AND is UNREACHABLE-BY-
// CONSTRUCTION from all write paths; status CHECK 'active' branch has ZERO-
// COVERAGE-PER-GUARD (defaults on insert); status 'revoked' branch is
// UNREACHABLE from insert (only settable via the admin revoke endpoint at
// web/src/app/api/admin/affiliate/attributions/[attributionId]/revoke/
// route.ts which flips an existing row rather than inserting one); source
// CHECK all three enum branches have ZERO-COVERAGE-PER-GUARD (all three
// remain reachable via {code, provisioned, admin_manual} routing on the
// happy path); partial-unique index has ZERO-COVERAGE-PER-GUARD (no insert
// contends against it on this surface). ZERO-COVERAGE-PER-GUARD posture
// IDENTICAL to tick 376 — both surfaces of the create-startup write-path
// pair now carry the ZERO-COVERAGE-PER-GUARD × UNREACHABLE-BY-CONSTRUCTION
// documentation for the reseller_attributions row cluster at module scope,
// mirroring the tick 374/375 credit-grant-authz + credit-grant-validation
// pair on the grant-branch subset.
//
// Symmetric-cluster posture: IDENTICAL to tick 376 — the create-startup
// write-path cluster is a SYMMETRIC subset (project-branch only) of the
// full reseller_attributions row cluster. The 'user'-branch complement is
// ASYMMETRIC AND UNREACHABLE-BY-CONSTRUCTION across the entire codebase —
// no spec pair could ever cover it without a synthetic DB-level backfill
// test that plan §J.2 forbids. Full 16-surface × 5-invariant saturation
// (80 module-scope summaries) would collate ZERO-COVERAGE-PER-GUARD ×
// UNREACHABLE-BY-CONSTRUCTION documentation across every touching spec,
// matching the asymmetric-complement posture the credit-grant cluster
// carries for its sandbox_spend branch (2-surface half already at 8/8 per
// tick 375 close-out; sandbox-spend half remains at 0/8 pending future
// ticks). Post-tick 377, the create-startup write-path pair reaches 2/2
// surface parity within the SYMMETRIC subset — matches the tick 375 close-
// out shape on the credit-grant write-path pair.
//
// Diagnostic delta of this pass:
//   - No production code touched, no fixture change, no route change, no
//     new imports, no new module-scope constants.
//   - Doc-block placed after the CASES const (line 80) and before the first
//     test.describe (line 82), matching the tick 375 placement on credit-
//     grant-validation.spec.ts (after the OUT_OF_SCOPE_UUID const, before
//     the first test.describe) and the tick 376 placement on the paired
//     create-startup-authz.spec.ts (after the NON_RESELLER_FOUNDER_EMAIL
//     const, before the first test.describe).

test.describe("Reseller create-startup input validation — P10 dry-run", () => {
  const harness = loadResellerHarness();
  test.skip(!harness, harnessSkipReason());

  for (const c of CASES) {
    test(c.label, async ({ page }) => {
      await loginAs(page, harness!.admin.email);
      const resp = await page.request.post(`/api/reseller/create-startup`, {
        data: c.body,
        headers: { "content-type": "application/json" },
      });
      expect(
        resp.status(),
        `${c.label} returned ${resp.status()} — expected 400 (normalise gate rejects before decideCreateStartup / DB writes). Body: ${await resp.text()}`,
      ).toBe(400);
      const body = (await resp.json()) as { ok: boolean; reason: string; message?: string };
      expect(body.ok, `${c.label} body.ok should be false: ${JSON.stringify(body)}`).toBe(false);
      expect(
        body.reason,
        `${c.label} expected reason='${c.expectedReason}' but got '${body.reason}'`,
      ).toBe(c.expectedReason);
      expect(
        body.message,
        `${c.label} response should include human-readable message from CREATE_STARTUP_ERROR_MESSAGES`,
      ).toBeTruthy();
    });
  }
});
