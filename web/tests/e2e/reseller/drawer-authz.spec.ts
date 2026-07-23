// GET /api/reseller/customers/[id]/drawer pre-read authorization contract —
// P10 dry-run mirror of reveal-email-authz.spec.ts (tick 100).
//
// Per plan § U.7 the drawer is the second reseller-admin route that uses the
// direct getCurrentUser() + scopedReseller() chain (route.ts:47 + :54) rather
// than gateRequireFeature(). The response envelope is therefore
// { ok: false, reason: <string> } rather than the { ok: false, error, feature }
// shape gateRequireFeature emits. Two branches are harness-free and safe
// against staging (no app_users SELECT fires and no
// reseller_audit_log(view_customer_drawer) row is written):
//
//   1. unauthenticated      — GET with no session          → 401 { ok:false, reason:"unauthorised" }
//                             (getCurrentUser null → returns before scope, decideReveal,
//                             app_users SELECT, parallel fan-out, or audit log)
//   2. non_reseller_admin   — GET as a founder QA account  → 403 { ok:false, reason:"no_membership" }
//                             (scopedReseller throws ResellerScopeError code="no_membership"
//                             because reseller_admins has no active row for a founder;
//                             decideReveal never runs, no DB reads, no audit row)
//
// Route reference: web/src/app/api/reseller/customers/[id]/drawer/route.ts
//   Line 47-50: getCurrentUser() null           → 401 { reason: "unauthorised" }
//   Line 52-60: scopedReseller(user) throws     → 403 { reason: err.code }
//   Line 62-68: decideReveal(id, allowed)       → 400 invalid_uuid / 403 not_in_scope
//   Line 70-73: getSupabaseAdmin() null         → 503 { reason: "not_configured" }
//   Line 77-87: app_users SELECT + not_found    → 500 lookup_failed / 404 not_found
//   Line 90-135: fan-out + db.auditLog          → 500 audit_failed
//   Line 148:   200 { ok: true, overview, progression, svi_curve, reports }
//
// Skips:
//   Row 2 skips at test-scope if the qa-founder-1 account is not seeded
//   (loginAs throws). Row 1 always runs — no harness required — so this
//   spec lights up in CI on the next `npx playwright test` pass alongside
//   reveal-email-authz.spec.ts.
//
// Deliberately out of scope (needs the reseller QA harness or per-test
// seeding which plan §J.2 forbids):
//   - invalid_uuid (400) — sits BEHIND scopedReseller (route.ts:64 vs :54),
//     so surfacing it needs a real reseller-admin session and any
//     ill-formed id path segment.
//   - not_in_scope (403 via decideReveal) — same reason as invalid_uuid.
//   - not_found (404) — needs a well-formed UUID inside allowedCustomerIds
//     but not present in app_users; per-test seeding constraint.
//   - not_configured (503) — needs SUPABASE_URL/SERVICE_ROLE unset which
//     would break every other Playwright spec running in the same worker.
//   - lookup_failed / audit_failed (500) — requires per-test tampering that
//     plan §J.2 forbids.
//   - revoked / no_reseller (403 via scopedReseller) — inconsistent states
//     that never occur in production because reseller_admins.status='active'
//     is provisioned alongside the resellers row.
//   - Happy path (200 with overview + progression + svi_curve + reports) —
//     ACTIVATED as P10 wave-2 row 146 below via loadTempReseller(
//     "active_wholesale") + fixture.adminEmail loginAs + fixture.attributedUserId
//     in the URL path; skips when the fixture is null, adminUserId is null
//     (reseller_admins mirror missing), or attributionExists is false
//     (reseller_attributions row missing — allowedCustomerIds() would 403).
//
// Placeholder UUID used in the URL path: 00000000-0000-0000-0000-000000000000.
// Both harness-free rows return BEFORE the id path param is inspected
// (row 1 bails in getCurrentUser; row 2 bails in scopedReseller), so the
// placeholder value never reaches decideReveal — any string that satisfies
// Next.js dynamic-segment matching would work, but a valid-shaped UUID
// keeps the URL well-formed against router validation and mirrors the
// shape the real UI GETs from drawer-opener.tsx.

import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/accounts";
import {
  loadTempReseller,
  tempResellerSkipReason,
  type TempResellerFixture,
} from "../fixtures/reseller";

const NON_RESELLER_FOUNDER_EMAIL =
  process.env.QA_UNATTRIBUTED_FOUNDER_EMAIL ?? "qa-founder-1@blockid.au";

const PLACEHOLDER_CUSTOMER_ID = "00000000-0000-0000-0000-000000000000";
const ROUTE = `/api/reseller/customers/${PLACEHOLDER_CUSTOMER_ID}/drawer`;
const DRAWER_ROUTE = (customerId: string) =>
  `/api/reseller/customers/${customerId}/drawer`;

// Deterministic mask shape produced by maskEmail() at
// web/src/lib/reseller/customer-reveal.ts:34-42 — the sole normaliser on the
// drawer route's overview.masked_email write path (buildOverviewSummary at
// web/src/lib/reseller/customer-drawer.ts pipes app_users.email through
// maskEmail before the wire). Shape is `<1-2 non-@ chars>***@<domain>` per
// the branch split at customer-reveal.ts:40-41 (local.length <= 2 → 1 char;
// local.length > 2 → 2 chars). Existing pins on this row already assert
// typeof string + .toContain("@") + .toMatch(/\*/) which are strictly weaker
// than MASKED_EMAIL_RE; landing the shape pin catches a regression that
// leaked plaintext through the drawer route (e.g. a bypass of maskEmail in
// buildOverviewSummary) or that changed the mask envelope shape without
// updating this pin. Landed tick 233 in the same twin-symmetrisation
// discipline as tick 231 option (j) + tick 232 option (l) — hoist the shape
// invariant to a module-scope constant so both drawer spec files (authz +
// validation) point at the same literal.
const MASKED_EMAIL_RE = /^[^@\s]{1,2}\*\*\*@[^@\s]+$/;

test.describe("Reseller customer-drawer pre-read authorization — P10 dry-run", () => {
  test("unauthenticated — GET with no session returns 401 unauthorised", async ({
    request,
  }) => {
    const resp = await request.get(ROUTE);
    expect(
      resp.status(),
      `unauthenticated returned ${resp.status()} — expected 401 before scope, decideReveal, app_users SELECT, parallel fan-out, or audit log. Body: ${await resp.text()}`,
    ).toBe(401);
    const body = (await resp.json()) as { ok: boolean; reason?: string };
    expect(
      body.ok,
      `unauthenticated body.ok should be false: ${JSON.stringify(body)}`,
    ).toBe(false);
    expect(body.reason).toBe("unauthorised");
  });

  test("non_reseller_admin — GET as a founder QA account returns 403 no_membership", async ({
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
      `non_reseller_admin returned ${resp.status()} — expected 403 no_membership before decideReveal, app_users SELECT, parallel fan-out, or audit log. Body: ${await resp.text()}`,
    ).toBe(403);
    const body = (await resp.json()) as { ok: boolean; reason?: string };
    expect(
      body.ok,
      `non_reseller_admin body.ok should be false: ${JSON.stringify(body)}`,
    ).toBe(false);
    expect(body.reason).toBe("no_membership");
  });
});

// P10 wave-2 row 146 — active_wholesale variant probes the drawer happy
// path (reseller-admin session → 200 with overview + progression + svi_curve
// + reports). Per docs/plans/p10-deferred-spec-activation-order.md wave 2:
//   146 | drawer-authz.spec.ts | active_wholesale | happy 200 with
//         overview/progression/svi_curve/reports | 200
//
// Route order per web/src/app/api/reseller/customers/[id]/drawer/route.ts:
//   Line 47-50: getCurrentUser null                        → 401 (row 1)
//   Line 52-60: scopedReseller throws                      → 403 (row 2 / no_membership)
//   Line 62-68: decideReveal(id, allowedCustomerIds)       → 400 invalid_uuid / 403 not_in_scope
//   Line 70-73: getSupabaseAdmin() null                    → 503 not_configured
//   Line 77-87: app_users lookup                           → 500 lookup_failed / 404 not_found
//   Line 90-135: parallel fan-out + auditLog               → 500 audit_failed
//   Line 148:   200 { overview, progression, svi_curve, reports } ← THIS
//
// Fixture wiring (wave-2 helper landed tick 147; this tick reuses it):
//   - loadTempReseller("active_wholesale") reads the QAPROBEWHOLESALEACTIVE
//     seed row + resolves adminEmail via the P10 Option A per-variant slot
//     (qa-reseller-wholesale-active@blockid.au) + mirrors reseller_admins.
//   - fixture.attributionExists asserts the seeder also planted a
//     reseller_attributions row so scopedReseller().allowedCustomerIds()
//     surfaces fixture.attributedUserId. Without the row the drawer route
//     returns 403 not_in_scope (see route.ts:64-68); the fixture flag lets
//     the spec skip cleanly rather than false-fail as a code regression.
//   - loginAs(page, fixture.adminEmail) opens the reseller-admin session
//     against the DISTINCT per-variant app_users row so scopedReseller()
//     .maybeSingle() does not PGRST116-collide with other variants.
//
// Skip conditions (mirrors wave-1 posture verbatim):
//   - loadTempReseller returns null when SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
//     are unset or the QAPROBEWHOLESALEACTIVE seed row is missing.
//   - fixture.adminUserId null (variant admin row missing or reseller_admins
//     mirror not seeded — scopedReseller would 403 no_membership).
//   - fixture.attributedUserId null (attributed founder not in app_users).
//   - fixture.attributionExists false (reseller_attributions row missing —
//     drawer would 403 not_in_scope).
//   - loginAs throws when /tmp/blockid-qa-accounts.txt has no row for the
//     resolved admin email.
//
// Non-Stripe / non-GST discipline: the drawer route reads app_users +
// svi_analyses + revenue_events + credit_transactions + credit_balances
// and writes one reseller_audit_log row. No promotion_code lookup, no
// Stripe network call, no InfoVision dependency. P8.5 + P1.5 remain
// neither a dependency nor a consequence.
test.describe("Reseller customer-drawer — P10 wave-2 happy path", () => {
  test("active_wholesale — GET as reseller-admin returns 200 with overview + progression + svi_curve + reports", async ({
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
      `active_wholesale returned ${resp.status()} — expected 200 with drawer envelope. Body: ${await resp.text()}`,
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
      svi_curve?: Array<{ month: string; score: number }>;
      reports?: Array<{ id: string; title: string; type: string }>;
      reason?: string;
    };
    expect(
      body.ok,
      `active_wholesale body.ok should be true: ${JSON.stringify(body)}`,
    ).toBe(true);
    // Shape assertions per U.7 three-tab drawer contract (customer-drawer.ts).
    // Overview must exist with a masked_email (never plaintext) + a signup_at
    // ISO string + a numeric credits_balance (0 default, never undefined).
    expect(body.overview, "overview missing").toBeDefined();
    expect(typeof body.overview?.masked_email).toBe("string");
    expect(body.overview?.masked_email ?? "").toContain("@");
    expect(body.overview?.masked_email ?? "").toMatch(/\*/);
    // Tick 233 — tighten from loose `contains @ + matches *` to the exact
    // shape emitted by maskEmail() (see MASKED_EMAIL_RE above). Catches a
    // regression that leaked a plaintext email through the drawer route or
    // that changed the mask envelope (e.g. widened the prefix from 1-2 chars
    // to 3+, dropped the '@' separator, or swapped '***' for another
    // literal). Twin sibling landed same tick at
    // drawer-validation.spec.ts:masked_email row 147.
    expect(body.overview?.masked_email ?? "").toMatch(MASKED_EMAIL_RE);
    expect(typeof body.overview?.signup_at).toBe("string");
    expect(typeof body.overview?.credits_balance).toBe("number");
    // Tick 225 — extend row 146 with shape pins on the five previously-silent
    // OverviewSummary fields the route SELECT + buildOverviewSummary always
    // emit (customer-drawer.ts:54-63). Same discipline as tick 223 row 161 +
    // tick 224 row 156 in the reseller-requests spec pair: shape pins only,
    // no VALUE assertions on fields that drift across staging seed rewrites.
    //   - display_name: nullable string per app_users.display_name column
    //     (nullable text in migration 0005) so a null here is a legitimate
    //     founder-with-no-display-name signal, not a route regression.
    //   - last_active_at: nullable string per app_users.last_login_at column
    //     (nullable timestamptz in 0035) so a null here signals a founder
    //     who signed up but never logged back in, not a regression.
    //   - onboarding_completed: boolean per buildOverviewSummary's `!!` coercion
    //     of nullable app_users.onboarding_completed (customer-drawer.ts:282)
    //     — always boolean at the wire, never null, never undefined.
    //   - plan_label: nullable string per buildOverviewSummary's latestPlan
    //     accumulator (customer-drawer.ts:264+283) — null when the founder
    //     has zero revenue_events rows with a plan_id (fresh signup that
    //     never subscribed), string when they've hit checkout at least once.
    //   - mrr_aud_cents: number per buildOverviewSummary's `mrr` accumulator
    //     (customer-drawer.ts:263+285) — always number at the wire (0 when
    //     no recurring events in the last 31 days).
    // Null-or-typeof-string pattern chosen over `x === null || (typeof x ===
    // "string" && x.length > 0)` so the pin does not accidentally forbid an
    // empty-string display_name — assertion scope is shape only per the
    // tick 223+224 discipline.
    expect(
      body.overview?.display_name === null ||
        typeof body.overview?.display_name === "string",
    ).toBe(true);
    expect(
      body.overview?.last_active_at === null ||
        typeof body.overview?.last_active_at === "string",
    ).toBe(true);
    expect(typeof body.overview?.onboarding_completed).toBe("boolean");
    expect(
      body.overview?.plan_label === null ||
        typeof body.overview?.plan_label === "string",
    ).toBe(true);
    expect(typeof body.overview?.mrr_aud_cents).toBe("number");
    // Progression must be an array; the drawer synthesises at least a signup
    // event from app_users.created_at even when the founder has zero SVI runs,
    // so an empty array would signal a route regression.
    expect(Array.isArray(body.progression)).toBe(true);
    expect((body.progression ?? []).length).toBeGreaterThan(0);
    expect(body.progression?.[0]?.kind).toBe("signup");
    // Tick 225 — pin progression[0].ts + .label as string. Both are required
    // fields on ProgressionEvent (customer-drawer.ts:28-39); the signup event
    // pushed at line 122-126 always carries app_users.created_at as ts and
    // the literal "Signed up" as label. A regression that dropped either
    // from the row shape would break the drawer client renderer.
    expect(typeof body.progression?.[0]?.ts).toBe("string");
    expect(typeof body.progression?.[0]?.label).toBe("string");
    // Tick 228 — option (f): extend progression[0] with shape pins on the four
    // optional fields declared on ProgressionEvent (customer-drawer.ts:32-38).
    // Tick 230 — option (h): tighten the phase-1 triple to VALUE equality so
    // a regression that mis-maps PHASE_BY_KIND[signup] (progression-linkage.ts:
    // 24) away from 1, drops chapterSlugForPhase(1) from "01-vision" (via a
    // startup-journey.ts:76-78 slug rename), or changes the href builder from
    // "/guide/<slug>" surfaces as an exact miss rather than a silent shape-
    // pin pass. detail stays null-or-typeof-string discipline: buildProgression
    // Timeline at customer-drawer.ts:122-126 sets only kind/ts/label on the
    // signup push (JSON.stringify drops the missing key so the client reads
    // undefined; other kinds set detail to string | null per lines 145 / 153-
    // 156 / 164 / 177 / 189). Loose `== null` catches both null and undefined.
    // Trade-off called out in tick 228's diagnostic block: VALUE pins couple
    // the spec to the "01-vision" slug so a future phase-1 rename forces a
    // synchronised bump here + startup-journey.ts + PHASE_LABELS + guide
    // route generateStaticParams. Accepted because the coupling is a
    // single-source-of-truth chain that the reseller / guide / product tour
    // surfaces all pin the same way (chapterSlugForPhase from B7 tour-state
    // is reused in B8 progression-linkage, both citing startup-journey.ts as
    // the sole source), so a phase-1 rename that missed this pin would have
    // missed the tour-state + phase-distribution surfaces too.
    expect(
      body.progression?.[0]?.detail == null ||
        typeof body.progression?.[0]?.detail === "string",
    ).toBe(true);
    expect(body.progression?.[0]?.phase).toBe(1);
    expect(body.progression?.[0]?.chapterSlug).toBe("01-vision");
    expect(body.progression?.[0]?.href).toBe("/guide/01-vision");
    // svi_curve + reports may be empty arrays for a founder with no analyses
    // but MUST be arrays — a null here would flag the client renderer.
    expect(Array.isArray(body.svi_curve)).toBe(true);
    expect(Array.isArray(body.reports)).toBe(true);
  });
});
