// P12.9 — Playwright E2E for the admin user-management surfaces landed in
// P12.5 (create), P12.6 (permissions), and the pre-existing DELETE handler
// on /api/admin/users/[id] used by the P12 delete flow.
//
// The three routes share the SAME requireAdmin() chokepoint from
// web/src/lib/reseller/require-admin.ts, but — unlike the reseller admin
// endpoints (which collapse both gate branches into 401) — the app_users
// endpoints split the two envelopes at HTTP 401 no_user (getCurrentUser
// null) vs HTTP 403 not_admin (session resolved but role/email mismatch).
// See web/src/app/api/admin/users/create/route.ts:42-49,
// web/src/app/api/admin/users/[id]/permissions/route.ts:46-53, and
// web/src/app/api/admin/users/[id]/route.ts:40-46 + 145-151 for the
// { ok:false, reason: err.code } envelope and the 401 vs 403 split. The
// symmetric assertions below light up on the first playwright pass if a
// refactor collapses the two reasons into a single "unauthorised", swaps
// requireAdmin() for a bespoke inline check, drops the not_admin branch,
// or flips the 401/403 boundary.
//
// Three harness-free branches per route stay safe against staging (no
// app_users row is minted, no permissions column mutates, no soft-delete
// UPDATE fires): unauthenticated (row 1) and non_admin (row 2) exercise
// gate branches BEFORE JSON parse, validateCreateUserBody /
// validatePermissionBody / reason-required, getSupabaseAdmin, or any DB
// SELECT/INSERT/UPDATE. Row 2 skips at test-scope when the qa-founder-1
// account is not seeded — same discipline as the sibling admin-reseller-*
// authz specs.
//
// A fourth describe covers the P12.9 happy-path flow — create → grant
// permission → revoke permission → soft-delete — end-to-end against the
// admin QA harness (qa-admin-1@blockid.au). Each subtest depends on the
// previous one via a shared { userId } capture so the four routes run as
// a single ordered flow rather than four disjoint 200 assertions. State-
// pollution posture: create mints a unique probe email
// (p12-9-probe-<uuid>@blockid.qa) so successive CI worker runs never
// collide on app_users_email_unique; delete anonymises the row to
// deleted-<id>@removed.blockid.local so the residue is inert and
// downstream aggregates (portfolio, credit_balances, sessions) do not
// carry probe rows. afterAll is a no-op — the anonymised row cannot
// be re-created and holds no PII.
//
// Deliberately out of scope (needs richer per-test seeding):
//   - invalid_body / invalid_email / segment_invalid / account_type_
//     invalid / plan_invalid / plan_slug_invalid / credits_invalid /
//     display_name_too_long (400) — all sit BEHIND requireAdmin at
//     create/route.ts:59-62, need an admin session PLUS a malformed body.
//   - action_invalid / permission_invalid / permission_slug_invalid
//     (400) — sit BEHIND requireAdmin at permissions/route.ts:69-71.
//   - cannot_change_own_permissions (400) / cannot_delete_self (400) —
//     need the admin harness targeting its OWN id; covered by the happy-
//     path body pattern (permission grant against a probe id, not self).
//   - email_taken (409) — sits BEHIND requireAdmin + validateCreateUser
//     Body, needs an admin session PLUS an already-seeded email.
//   - not_configured (503) — needs SUPABASE_URL/SERVICE_ROLE unset which
//     would break every other Playwright spec in the same worker.
//   - insert_failed / update_failed / delete_failed (500) — need a
//     broken DB write which requires per-test tampering plan §J.2
//     forbids.
//
// Ships alongside P12.5-P12.8 to close the goal file exit criterion
// "Playwright E2E green for create/delete/permission flows (P12.9)" at
// docs/plans/reseller-module-goal.md P12_user_management § exit_criteria.

import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/accounts";
import { adminHarnessSkipReason, loadAdminHarness } from "../fixtures/reseller";

const NON_ADMIN_FOUNDER_EMAIL =
  process.env.QA_UNATTRIBUTED_FOUNDER_EMAIL ?? "qa-founder-1@blockid.au";

const CREATE_ROUTE = "/api/admin/users/create";
// Placeholder id shape (UUID v4) is enough to survive Next's dynamic-
// segment parser and reach the requireAdmin gate. The gate returns before
// the id is consulted so the value never has to resolve to a real row.
const PROBE_UUID = "00000000-0000-4000-8000-000000000000";
const USER_ROUTE = (id: string) => `/api/admin/users/${id}`;
const PERMISSIONS_ROUTE = (id: string) => `/api/admin/users/${id}/permissions`;

// Placeholder bodies used on both harness-free rows: shape-valid enough
// that even if requireAdmin silently fell open the eventual write would
// still hit the email_taken / not_found / update_failed branches rather
// than persist a real row. Both rows bail in requireAdmin() BEFORE JSON
// parse fires so the placeholder body never reaches the DB.
const CREATE_BODY = {
  email: "unauthenticated-placeholder@example.invalid",
  segment: "founder",
  account_type: "founder",
  plan: "free",
};
const PERMISSIONS_BODY = { action: "grant", permission: "reports.export" };
const DELETE_BODY = { reason: "unauthenticated placeholder — should not reach DB" };

test.describe("Admin users create — P12.9 pre-write authorization branches", () => {
  test("unauthenticated — POST with no session returns 401 no_user", async ({
    request,
  }) => {
    const resp = await request.post(CREATE_ROUTE, { data: CREATE_BODY });
    expect(
      resp.status(),
      `unauthenticated returned ${resp.status()} — expected 401 before JSON parse, validateCreateUserBody, getSupabaseAdmin, email-taken guard, or the app_users INSERT. Body: ${await resp.text()}`,
    ).toBe(401);
    const body = (await resp.json()) as { ok: boolean; reason?: string };
    expect(body.ok).toBe(false);
    expect(body.reason).toBe("no_user");
  });

  test("non_admin — POST as a founder QA account returns 403 not_admin", async ({
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
    const resp = await page.request.post(CREATE_ROUTE, { data: CREATE_BODY });
    expect(
      resp.status(),
      `non_admin returned ${resp.status()} — expected 403 not_admin (note create/permissions/delete return 403 for not_admin, unlike /api/admin/resellers which returns 401). Body: ${await resp.text()}`,
    ).toBe(403);
    const body = (await resp.json()) as { ok: boolean; reason?: string };
    expect(body.ok).toBe(false);
    expect(body.reason).toBe("not_admin");
  });
});

test.describe("Admin users permissions — P12.9 pre-write authorization branches", () => {
  test("unauthenticated — POST with no session returns 401 no_user", async ({
    request,
  }) => {
    const resp = await request.post(PERMISSIONS_ROUTE(PROBE_UUID), {
      data: PERMISSIONS_BODY,
    });
    expect(
      resp.status(),
      `unauthenticated returned ${resp.status()} — expected 401 before self-mutation guard, JSON parse, validatePermissionBody, getSupabaseAdmin, target lookup, or the app_users UPDATE. Body: ${await resp.text()}`,
    ).toBe(401);
    const body = (await resp.json()) as { ok: boolean; reason?: string };
    expect(body.ok).toBe(false);
    expect(body.reason).toBe("no_user");
  });

  test("non_admin — POST as a founder QA account returns 403 not_admin", async ({
    page,
  }) => {
    try {
      await loginAs(page, NON_ADMIN_FOUNDER_EMAIL);
    } catch (err) {
      test.skip(
        true,
        `Non-admin founder account not seeded: ${(err as Error).message}.`,
      );
      return;
    }
    const resp = await page.request.post(PERMISSIONS_ROUTE(PROBE_UUID), {
      data: PERMISSIONS_BODY,
    });
    expect(
      resp.status(),
      `non_admin returned ${resp.status()} — expected 403 not_admin before self-mutation guard, JSON parse, validatePermissionBody, or any DB read. Body: ${await resp.text()}`,
    ).toBe(403);
    const body = (await resp.json()) as { ok: boolean; reason?: string };
    expect(body.ok).toBe(false);
    expect(body.reason).toBe("not_admin");
  });
});

test.describe("Admin users delete — P12.9 pre-write authorization branches", () => {
  test("unauthenticated — DELETE with no session returns 401 no_user", async ({
    request,
  }) => {
    const resp = await request.delete(USER_ROUTE(PROBE_UUID), {
      data: DELETE_BODY,
    });
    expect(
      resp.status(),
      `unauthenticated returned ${resp.status()} — expected 401 before self-delete guard, JSON parse, reason-required check, getSupabaseAdmin, target lookup, or the anonymisation UPDATE. Body: ${await resp.text()}`,
    ).toBe(401);
    const body = (await resp.json()) as { ok: boolean; reason?: string };
    expect(body.ok).toBe(false);
    expect(body.reason).toBe("no_user");
  });

  test("non_admin — DELETE as a founder QA account returns 403 not_admin", async ({
    page,
  }) => {
    try {
      await loginAs(page, NON_ADMIN_FOUNDER_EMAIL);
    } catch (err) {
      test.skip(
        true,
        `Non-admin founder account not seeded: ${(err as Error).message}.`,
      );
      return;
    }
    const resp = await page.request.delete(USER_ROUTE(PROBE_UUID), {
      data: DELETE_BODY,
    });
    expect(
      resp.status(),
      `non_admin returned ${resp.status()} — expected 403 not_admin before self-delete guard, JSON parse, or any DB write. Body: ${await resp.text()}`,
    ).toBe(403);
    const body = (await resp.json()) as { ok: boolean; reason?: string };
    expect(body.ok).toBe(false);
    expect(body.reason).toBe("not_admin");
  });
});

// P12.9 happy path — the create → grant permission → revoke permission
// → soft-delete flow against the admin QA harness (qa-admin-1). Each
// step reads the shared `probe.userId` captured by the previous step so
// the four routes run as one ordered flow rather than four disjoint
// 200 assertions. `test.describe.serial` pins execution order so a
// failure in create short-circuits the downstream permission + delete
// steps (which would otherwise 404 not_found on a null probe.userId).
test.describe.serial(
  "Admin users create → grant → revoke → delete — P12.9 happy path",
  () => {
    const harness = loadAdminHarness();
    test.skip(!harness, adminHarnessSkipReason());

    const probeEmail = `p12-9-probe-${randomUUID()}@blockid.qa`;
    const probe: { userId: string | null } = { userId: null };
    // "reports.export" is deliberately absent from user-panels.ts
    // KNOWN_PERMISSIONS so the audit row surfaces was_known=false — the
    // detail panel already amber-rings unknown entries so the write is
    // not silent and the assertion below pins the ad-hoc-slug branch
    // that P12.6's PERMISSION_SLUG regex was designed to allow.
    const probePermission = "reports.export";

    test("create — POST returns 200 with a fresh app_users row", async ({
      page,
    }) => {
      try {
        await loginAs(page, harness!.admin.email);
      } catch (err) {
        test.skip(
          true,
          `Admin QA account not seeded: ${(err as Error).message}.`,
        );
        return;
      }

      const resp = await page.request.post(CREATE_ROUTE, {
        data: {
          email: probeEmail,
          segment: "founder",
          account_type: "founder",
          plan: "free",
          display_name: `P12.9 probe — ${probeEmail}`,
        },
      });
      expect(
        resp.status(),
        `create returned ${resp.status()} — expected 200 after requireAdmin() passes, validateCreateUserBody normalises the body, getSupabaseAdmin resolves, the email-taken guard misses (probeEmail is per-run unique), and the app_users INSERT commits. Body: ${await resp.text()}`,
      ).toBe(200);
      const body = (await resp.json()) as {
        ok?: boolean;
        user?: { id?: string; email?: string; plan?: string };
      };
      expect(body.ok).toBe(true);
      expect(body.user?.email).toBe(probeEmail);
      expect(body.user?.plan).toBe("free");
      expect(typeof body.user?.id).toBe("string");
      if (body.user?.id) probe.userId = body.user.id;
    });

    test("grant — POST /permissions appends the probe permission", async ({
      page,
    }) => {
      if (!probe.userId) {
        test.skip(true, "create step did not capture a probe userId — grant step cannot proceed.");
        return;
      }
      await loginAs(page, harness!.admin.email);
      const resp = await page.request.post(PERMISSIONS_ROUTE(probe.userId), {
        data: { action: "grant", permission: probePermission },
      });
      expect(
        resp.status(),
        `grant returned ${resp.status()} — expected 200 after requireAdmin() passes, the self-mutation guard misses (probe.userId !== harness admin id), validatePermissionBody accepts the ad-hoc slug per PERMISSION_SLUG, and the app_users UPDATE commits. Body: ${await resp.text()}`,
      ).toBe(200);
      const body = (await resp.json()) as {
        ok?: boolean;
        action?: string;
        permission?: string;
        was_known?: boolean;
        permissions?: string[];
        unchanged?: boolean;
      };
      expect(body.ok).toBe(true);
      expect(body.unchanged).not.toBe(true);
      expect(body.action).toBe("grant");
      expect(body.permission).toBe(probePermission);
      expect(body.was_known).toBe(false);
      expect(Array.isArray(body.permissions)).toBe(true);
      expect(body.permissions).toContain(probePermission);
    });

    test("revoke — POST /permissions drops the probe permission", async ({
      page,
    }) => {
      if (!probe.userId) {
        test.skip(true, "create step did not capture a probe userId — revoke step cannot proceed.");
        return;
      }
      await loginAs(page, harness!.admin.email);
      const resp = await page.request.post(PERMISSIONS_ROUTE(probe.userId), {
        data: { action: "revoke", permission: probePermission },
      });
      expect(
        resp.status(),
        `revoke returned ${resp.status()} — expected 200 after applyPermissionMutation drops the entry the grant step appended. Body: ${await resp.text()}`,
      ).toBe(200);
      const body = (await resp.json()) as {
        ok?: boolean;
        permissions?: string[];
      };
      expect(body.ok).toBe(true);
      expect(Array.isArray(body.permissions)).toBe(true);
      expect(body.permissions ?? []).not.toContain(probePermission);
    });

    test("delete — DELETE anonymises the probe row", async ({ page }) => {
      if (!probe.userId) {
        test.skip(true, "create step did not capture a probe userId — delete step cannot proceed.");
        return;
      }
      await loginAs(page, harness!.admin.email);
      const resp = await page.request.delete(USER_ROUTE(probe.userId), {
        data: { reason: "p12.9 e2e cleanup" },
      });
      expect(
        resp.status(),
        `delete returned ${resp.status()} — expected 200 after requireAdmin() passes, the self-delete guard misses, reason is non-empty, and the anonymisation UPDATE commits. Body: ${await resp.text()}`,
      ).toBe(200);
      const body = (await resp.json()) as {
        ok?: boolean;
        anonymised_email?: string;
      };
      expect(body.ok).toBe(true);
      expect(body.anonymised_email).toBe(
        `deleted-${probe.userId}@removed.blockid.local`,
      );
    });
  },
);
