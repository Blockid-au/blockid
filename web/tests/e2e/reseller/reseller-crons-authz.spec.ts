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
//   - Happy path (200) — reads real reseller_* tables and, on
//     reseller-weekly-digest / reseller-monthly-report, sends real email;
//     folded into the temp-reseller mint fixture follow-up alongside the
//     deferred rows from ticks 94..111.

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
