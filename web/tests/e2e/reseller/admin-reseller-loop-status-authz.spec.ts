// GET /api/admin/reseller-loop/status pre-read authorization contract —
// P10 dry-run per plan §C.5 (admin surfaces) and §J.2 (Playwright must
// cover the admin surfaces so a regression in the requireAdmin() gate
// ordering surfaces before the endpoint reads /tmp/blockid-reseller-
// monitor.txt or the two on-disk JSONL logs it tails).
//
// Mirrors admin-resellers-list-authz.spec.ts (tick 108),
// admin-reseller-detail-authz.spec.ts, admin-reseller-patch-authz.spec.ts
// (tick 103), admin-reseller-delete-authz.spec.ts (tick 106),
// admin-requests-list-authz.spec.ts (tick 107) and
// admin-requests-patch-authz.spec.ts (tick 105) — same requireAdmin()
// chokepoint from web/src/lib/reseller/require-admin.ts (see
// route.ts:41-49), same { ok:false, reason: AdminGateError.code }
// envelope pair at HTTP 401 for BOTH the no_user and not_admin branches
// (route.ts:45-47). Symmetric shape means a refactor that collapses the
// two 401 reasons into a single "unauthorised", swaps requireAdmin() for
// a bespoke inline check, or flips the status code to 403 lights up in
// all seven specs on the next `npx playwright test` pass.
//
// This spec closes the last uncovered admin surface under /api/admin/**
// whose requireAdmin() gate was not yet regression-guarded at the
// Playwright lens — every sibling admin reseller endpoint already has
// one. Both harness-free branches are safe against staging: the on-disk
// reads under Promise.all (route.ts:51-56) never fire, and the response
// never includes the /tmp snapshot or the tick history, so no reseller-
// scoped state is observable from an unauthorised probe.
//
// Two branches are harness-free and safe against staging (no on-disk
// reads fire, no write is issued, no admin state changes):
//
//   1. unauthenticated  — GET with no session       → 401 { ok:false, reason:"no_user" }
//                          (getCurrentUser null → requireAdmin throws
//                          AdminGateError("no_user") → gate returns 401
//                          BEFORE the Promise.all safeRead fan-out fires
//                          against /tmp/blockid-reseller-monitor.txt,
//                          reseller-monitor.jsonl, reseller-goal-
//                          history.jsonl, or /tmp/blockid-reseller-goal-done)
//   2. non_admin        — GET as a founder QA account → 401 { ok:false, reason:"not_admin" }
//                          (getCurrentUser resolves but user.role !== "admin"
//                          and user.email !== ADMIN_EMAIL → isAdmin false →
//                          requireAdmin throws AdminGateError("not_admin") →
//                          gate returns 401 BEFORE the Promise.all fan-out)
//
// Route reference: web/src/app/api/admin/reseller-loop/status/route.ts
//   Line 41-49:  getCurrentUser + requireAdmin → 401 no_user / not_admin
//   Line 51-56:  Promise.all safeRead of MONITOR_TXT + MONITOR_JSONL +
//                HISTORY_JSONL + DONE_MARKER
//   Line 58-76:  tailLines + JSON.parse fan-out for monitor + tick rows
//   Line 78-88:  200 { ok:true, complete, completed_at, snapshot,
//                     monitor_history, tick_history, generated_at }
//
// Skips:
//   Row 2 skips at test-scope if the qa-founder-1 account is not seeded
//   (loginAs throws). Row 1 always runs — no harness required — so this
//   spec lights up in CI on the next `npx playwright test` pass alongside
//   the six sibling admin authz specs.
//
// Deliberately out of scope (needs the admin QA harness or per-test
// seeding which plan §J.2 forbids):
//   - Happy path (200 with monitor_history + tick_history) — ACTIVATED
//     wave-5 row 173 (tick 161). Opens via loadAdminHarness()
//     (qa-admin-1@blockid.au) so the requireAdmin() gate at route.ts:41-49
//     passes. Read-only GET — no writes fire, so this row is idempotent
//     under CI replay. The on-disk sources tail every tick (safeRead against
//     /tmp + JSONL logs) so ARRAY LENGTHS and CONTENT are NOT pinned; the
//     assertions cover only the envelope shape (ok=true, complete boolean,
//     completed_at string|null, snapshot string, monitor_history array,
//     tick_history array, generated_at ISO string) so a route regression
//     that dropped a field or flipped an array to an object surfaces here.
//     Non-Stripe / non-GST — this endpoint reads /tmp + on-disk JSONL only.
//
// The GET handler takes no query params, so both harness-free rows return
// BEFORE any URL parse fires — no path segment or search string is needed
// on either request.

import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/accounts";
import { adminHarnessSkipReason, loadAdminHarness } from "../fixtures/reseller";

const NON_ADMIN_FOUNDER_EMAIL =
  process.env.QA_UNATTRIBUTED_FOUNDER_EMAIL ?? "qa-founder-1@blockid.au";

const ROUTE = "/api/admin/reseller-loop/status";

const ISO_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

test.describe("Admin reseller-loop status pre-read authorization — P10 dry-run", () => {
  test("unauthenticated — GET with no session returns 401 no_user", async ({
    request,
  }) => {
    const resp = await request.get(ROUTE);
    expect(
      resp.status(),
      `unauthenticated returned ${resp.status()} — expected 401 before the Promise.all safeRead fan-out fires against /tmp/blockid-reseller-monitor.txt or the two JSONL logs. Body: ${await resp.text()}`,
    ).toBe(401);
    const body = (await resp.json()) as { ok: boolean; reason?: string };
    expect(
      body.ok,
      `unauthenticated body.ok should be false: ${JSON.stringify(body)}`,
    ).toBe(false);
    expect(body.reason).toBe("no_user");
  });

  test("non_admin — GET as a founder QA account returns 401 not_admin", async ({
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
    const resp = await page.request.get(ROUTE);
    expect(
      resp.status(),
      `non_admin returned ${resp.status()} — expected 401 not_admin before the Promise.all safeRead fan-out fires against /tmp/blockid-reseller-monitor.txt or the two JSONL logs. Body: ${await resp.text()}`,
    ).toBe(401);
    const body = (await resp.json()) as { ok: boolean; reason?: string };
    expect(
      body.ok,
      `non_admin body.ok should be false: ${JSON.stringify(body)}`,
    ).toBe(false);
    expect(body.reason).toBe("not_admin");
  });
});

test.describe("Admin reseller-loop status — P10 wave-5 row 173 happy path", () => {
  const harness = loadAdminHarness();
  test.skip(!harness, adminHarnessSkipReason());

  test("happy — GET as qa-admin-1 returns 200 with snapshot + tail arrays", async ({
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

    const resp = await page.request.get(ROUTE);
    expect(
      resp.status(),
      `happy returned ${resp.status()} — expected 200 after requireAdmin() passes. Body: ${await resp.text()}`,
    ).toBe(200);

    const body = (await resp.json()) as {
      ok?: unknown;
      complete?: unknown;
      completed_at?: unknown;
      snapshot?: unknown;
      monitor_history?: unknown;
      tick_history?: unknown;
      generated_at?: unknown;
    };

    expect(
      body.ok,
      `happy body.ok should be true: ${JSON.stringify(body).slice(0, 200)}`,
    ).toBe(true);
    expect(
      typeof body.complete,
      `happy body.complete should be boolean: ${JSON.stringify(body).slice(0, 200)}`,
    ).toBe("boolean");
    // completed_at is either an ISO string (when DONE_MARKER present) or null.
    if (body.completed_at !== null) {
      expect(
        typeof body.completed_at,
        `happy body.completed_at should be string or null: ${JSON.stringify(body).slice(0, 200)}`,
      ).toBe("string");
    }
    // Complete/completed_at pair must be consistent — if complete then
    // completed_at is a non-empty string; if not complete then it's null.
    if (body.complete === true) {
      expect(
        typeof body.completed_at === "string" &&
          (body.completed_at as string).length > 0,
        `happy body.completed_at should be non-empty string when complete=true: ${JSON.stringify(body).slice(0, 200)}`,
      ).toBe(true);
    } else {
      expect(body.completed_at).toBeNull();
    }
    expect(
      typeof body.snapshot,
      `happy body.snapshot should be string (empty when /tmp/blockid-reseller-monitor.txt absent): ${JSON.stringify(body).slice(0, 200)}`,
    ).toBe("string");
    expect(
      Array.isArray(body.monitor_history),
      `happy body.monitor_history should be an array (tailLines→JSON.parse fan-out): ${JSON.stringify(body).slice(0, 200)}`,
    ).toBe(true);
    expect(
      Array.isArray(body.tick_history),
      `happy body.tick_history should be an array (tailLines→JSON.parse fan-out): ${JSON.stringify(body).slice(0, 200)}`,
    ).toBe(true);
    // Do NOT pin monitor_history.length or tick_history.length — the on-disk
    // JSONL logs mutate every tick (cron writes reseller-monitor.jsonl every
    // minute; the autonomous loop writes reseller-goal-history.jsonl every
    // tick); fresh CI hosts hold 0 rows; production hosts hold up to 30/40.
    // Every parsed row is a plain object (JSON.parse fallback returns null →
    // .filter(Boolean) drops non-objects), so a regression that swapped the
    // fan-out to return raw strings surfaces here.
    for (const row of (body.monitor_history as unknown[]) ?? []) {
      expect(
        row !== null && typeof row === "object" && !Array.isArray(row),
        `monitor_history row should be a plain object: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
    }
    for (const row of (body.tick_history as unknown[]) ?? []) {
      expect(
        row !== null && typeof row === "object" && !Array.isArray(row),
        `tick_history row should be a plain object: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
    }
    expect(
      typeof body.generated_at === "string" &&
        ISO_RE.test(body.generated_at as string),
      `happy body.generated_at should be ISO-8601 string: ${JSON.stringify(body).slice(0, 200)}`,
    ).toBe(true);
  });
});
