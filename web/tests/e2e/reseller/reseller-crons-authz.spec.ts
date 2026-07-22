// Reseller cron CRON_SECRET Bearer pre-execution authorization contract —
// P10 dry-run per plan §J.2 (Playwright must cover the reseller-scoped
// endpoints so a regression in the shared cron gate surfaces before the
// endpoint reads / writes any reseller_* table).
//
// Sweeps the /api/cron/reseller-* surface for the identical CRON_SECRET
// Bearer gate used by every reseller-scoped cron route. Five routes share
// the exact same pattern at the top of their GET handler:
//
//   const cronSecret = process.env.CRON_SECRET;
//   const auth = req.headers.get("authorization");
//   if (cronSecret && auth !== `Bearer ${cronSecret}`) {
//     return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
//   }
//
// Only fires when CRON_SECRET is set — routes are fail-open by design when
// the env var is unset (dev + CI use). This spec test.skip()s when CRON_SECRET
// is not in the Playwright env so a local `npx playwright test` pass doesn't
// hard-fail on a legitimately-open host.
//
// Sixth reseller-scoped cron /api/cron/reseller-audit-anomaly-scan is
// covered by audit-anomaly-scan.spec.ts (tick 90) on its own happy-path
// harness. Its 401 gate is identical to the five below; adding a redundant
// row here would double-count that route so it's excluded on purpose.
//
// Route references (all identical shape — line numbers pinned so a shape
// drift in any one lights up alongside this spec):
//   web/src/app/api/cron/reseller-clear-commissions/route.ts:29-33
//   web/src/app/api/cron/reseller-monthly-reconciliation/route.ts:65-69
//   web/src/app/api/cron/reseller-monthly-report/route.ts:45-49
//   web/src/app/api/cron/reseller-stripe-sync/route.ts:46-50
//   web/src/app/api/cron/reseller-weekly-digest/route.ts:70-74
//
// Deliberately out of scope (would need per-test tampering plan §J.2 forbids
// or would break sibling specs sharing the same worker):
//   - not_configured (503) — needs SUPABASE_URL/SERVICE_ROLE unset.
//   - stripe_not_configured (503, reseller-stripe-sync only) — needs
//     STRIPE_SECRET_KEY unset which would break the checkout specs.
//   - Full happy-path body pins (per-route response envelope details) —
//     folded into route-specific specs (reseller-monthly-report has its
//     own harness at reports-signed-url-authz.spec.ts; reseller-audit-
//     anomaly-scan has audit-anomaly-scan.spec.ts). This file pins the
//     HTTP method contract at row 162 (below): GET with correct Bearer
//     → 200 (happy) OR 503 (not_configured / stripe_not_configured);
//     POST/PUT/DELETE/PATCH with correct Bearer → 405 (Next.js App
//     Router default when the handler is not exported). Deeper body
//     pins stay in the route-specific specs so a wire-envelope drift
//     surfaces there, not here.

import { test, expect } from "@playwright/test";

interface CronRoute {
  slug: string;
  path: string;
}

const ROUTES: CronRoute[] = [
  { slug: "reseller-clear-commissions", path: "/api/cron/reseller-clear-commissions" },
  {
    slug: "reseller-monthly-reconciliation",
    path: "/api/cron/reseller-monthly-reconciliation?skip_email=1",
  },
  {
    slug: "reseller-monthly-report",
    path: "/api/cron/reseller-monthly-report?skip_email=1",
  },
  { slug: "reseller-stripe-sync", path: "/api/cron/reseller-stripe-sync" },
  {
    slug: "reseller-weekly-digest",
    path: "/api/cron/reseller-weekly-digest?skip_email=1",
  },
];

test.describe("Reseller cron CRON_SECRET Bearer pre-execution auth — P10 dry-run", () => {
  const cronSecret = process.env.CRON_SECRET;
  test.skip(
    !cronSecret,
    "CRON_SECRET is not set in the Playwright env — the reseller-* cron routes are fail-open in this configuration. Set CRON_SECRET (matching the value used by the running Next.js server) before running this spec so the 401 branch is testable.",
  );

  for (const route of ROUTES) {
    test(`${route.slug} — GET with no Authorization header returns 401 unauthorized`, async ({
      request,
    }) => {
      const resp = await request.get(route.path);
      expect(
        resp.status(),
        `${route.slug} returned ${resp.status()} — expected 401 before getSupabaseAdmin or any reseller_* SELECT. Body: ${await resp.text()}`,
      ).toBe(401);
      const body = (await resp.json()) as { ok: boolean; reason?: string };
      expect(
        body.ok,
        `${route.slug} body.ok should be false: ${JSON.stringify(body)}`,
      ).toBe(false);
      expect(body.reason).toBe("unauthorized");
    });

    test(`${route.slug} — GET with wrong Bearer token returns 401 unauthorized`, async ({
      request,
    }) => {
      const resp = await request.get(route.path, {
        headers: { authorization: "Bearer this-is-not-the-cron-secret" },
      });
      expect(
        resp.status(),
        `${route.slug} returned ${resp.status()} — expected 401 for a wrong Bearer token before getSupabaseAdmin or any reseller_* SELECT. Body: ${await resp.text()}`,
      ).toBe(401);
      const body = (await resp.json()) as { ok: boolean; reason?: string };
      expect(
        body.ok,
        `${route.slug} body.ok should be false: ${JSON.stringify(body)}`,
      ).toBe(false);
      expect(body.reason).toBe("unauthorized");
    });
  }
});

// P10 wave-4 row 162 — HTTP method contract with the harness admin (CRON_SECRET
// is the "admin" for cron routes — no per-variant reseller fixture applies
// here because the routes never call scopedReseller()). Per
// docs/plans/p10-deferred-spec-activation-order.md wave 4:
//   162 | reseller-crons-authz.spec.ts | (n/a — admin only) |
//         HTTP method contract with harness admin | 200/405
//
// What this pins (per plan §J.2 and route contract):
//   1. GET with `Authorization: Bearer ${CRON_SECRET}` → status ∈ {200, 503}.
//      200 = happy path fired (reseller_* SELECT ran to completion + response
//      envelope emitted); 503 = pre-check sentinel (`not_configured` when
//      SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY unset, or the
//      `stripe_not_configured` variant on reseller-stripe-sync when
//      STRIPE_SECRET_KEY unset). Both status codes prove the auth gate at
//      the top of every handler let the Bearer through. Anything ELSE
//      (401 / 500 / 403 / 4xx) is a regression: 401 means the shared
//      auth block drifted; 5xx means the route leaked a query error past
//      the graceful branches; 4xx means a downstream handler added a
//      validator that the docs did not.
//   2. POST / PUT / DELETE / PATCH with the same correct Bearer → 405
//      Method Not Allowed. All five routes export ONLY `GET` (verified at
//      grep in tick 162), so Next.js App Router auto-rejects other verbs
//      with 405 + `Allow: GET` header BEFORE the handler body would fire.
//      This row nails that dispatch contract so a well-meaning refactor
//      that adds a POST handler (e.g. "manual trigger from admin UI")
//      surfaces here before it can bypass the CRON_SECRET Bearer gate.
//
// Why bundle both halves in one describe: they share the same skip guard
// (CRON_SECRET unset → skip) and iterate the same ROUTES array. A separate
// describe would double the test-scope skip check without adding coverage.
//
// State-pollution posture:
//   - reseller-clear-commissions: writes reseller_commission_events rows ONLY
//     when the view surfaces pending_clearance rows past pending_until. On a
//     fresh test host with no commissions, the endpoint returns 200 with
//     cleared:0 and writes nothing. Idempotent under CI replay.
//   - reseller-monthly-reconciliation: `?skip_email=1` suppresses the email;
//     the query itself is read-only.
//   - reseller-monthly-report: `?skip_email=1` suppresses the email + the
//     signed-URL upload branch does NOT fire when Supabase storage is
//     unconfigured (returns { upload_errors: [] } inline). Read-only under
//     dev/CI envs without a `reseller-reports` bucket.
//   - reseller-stripe-sync: iterates promotion codes but writes nothing on
//     drift-free hosts. When STRIPE_SECRET_KEY is unset (typical dev/CI),
//     the route returns 503 stripe_not_configured BEFORE any Stripe network
//     call — auth gate proven without touching Stripe.
//   - reseller-weekly-digest: `?skip_email=1` suppresses email; digest
//     aggregation is read-only.
//
// POST rejection is stateless — Next.js dispatches 405 before any handler
// import fires, so no side effects can leak. Perfectly idempotent.
//
// Skip conditions (mirrors the sibling describe block above verbatim):
//   - CRON_SECRET unset in the Playwright env → describe-scope skip (the
//     routes are fail-open when CRON_SECRET is unset, so a Bearer-authed
//     assertion would false-fail against an intentionally-open host).
//
// Non-Stripe / non-GST discipline: none of these routes hit Stripe in the
// GET-with-Bearer branch under an unconfigured-Stripe env (the sync route
// short-circuits at 503 before the retrieve loop). Row 162 remains neither
// a dependency nor a consequence of P8.5 (Stripe env vars) or P1.5
// (InfoVision seed).
test.describe("Reseller cron HTTP method contract with harness admin — P10 wave-4 row 162", () => {
  const cronSecret = process.env.CRON_SECRET;
  test.skip(
    !cronSecret,
    "CRON_SECRET is not set in the Playwright env — the reseller-* cron routes are fail-open in this configuration so a Bearer-authed contract assertion would false-fail. Set CRON_SECRET (matching the value used by the running Next.js server) before running this spec.",
  );

  const authHeader = { authorization: `Bearer ${cronSecret ?? ""}` };

  for (const route of ROUTES) {
    test(`${route.slug} — GET with correct Bearer passes auth (200 happy OR 503 not_configured)`, async ({
      request,
    }) => {
      const resp = await request.get(route.path, { headers: authHeader });
      const status = resp.status();
      const bodyText = await resp.text();
      expect(
        [200, 503].includes(status),
        `${route.slug} returned ${status} — expected 200 (happy) OR 503 (not_configured / stripe_not_configured). A 401 here means the shared CRON_SECRET gate drifted; a 5xx (other than 503) means a query error leaked past the graceful reason branch. Body: ${bodyText}`,
      ).toBe(true);
      const body = JSON.parse(bodyText) as { ok?: boolean; reason?: string };
      expect(
        typeof body.ok,
        `${route.slug} body.ok should be a boolean (200 → true, 503 → false). Body: ${bodyText}`,
      ).toBe("boolean");
      if (status === 503) {
        expect(
          body.ok,
          `${route.slug} 503 body.ok must be false: ${bodyText}`,
        ).toBe(false);
        expect(
          ["not_configured", "stripe_not_configured"].includes(body.reason ?? ""),
          `${route.slug} 503 body.reason should be not_configured or stripe_not_configured, got ${body.reason}. Body: ${bodyText}`,
        ).toBe(true);
      } else {
        expect(
          body.ok,
          `${route.slug} 200 body.ok must be true: ${bodyText}`,
        ).toBe(true);
      }
    });

    test(`${route.slug} — POST with correct Bearer returns 405 (only GET exported)`, async ({
      request,
    }) => {
      const resp = await request.post(route.path, {
        headers: authHeader,
        data: {},
      });
      expect(
        resp.status(),
        `${route.slug} POST returned ${resp.status()} — expected 405 Method Not Allowed. All five reseller-* cron routes export only GET; a 200 / 401 / 404 here means a POST handler was added (potentially bypassing the CRON_SECRET Bearer gate).`,
      ).toBe(405);
    });
  }
});
