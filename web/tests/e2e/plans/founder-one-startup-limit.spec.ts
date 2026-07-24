// Founder 1-startup limit — write-path enforcement (2026-07-24 directive).
//
// Contract: web/src/lib/plans/startup-limit.ts
//   - `account_type = 'founder'` (or null / unknown) may only own ONE active
//     startup. A second POST /api/projects returns 403 with body
//     { ok:false, error:'founder_one_startup_limit', hint_upgrade_url }.
//   - `account_type = 'accelerator' | 'incubator' | 'reseller' | 'affiliate'
//     | 'advisor' | 'investor_angel' | 'investor_vc' | 'journalist'` bypasses.
//
// We prefer the QA login fixture; when the seed file is missing the tests
// skip rather than red-fail on a fresh dev box (matches next-step-nudge
// pattern).

import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/accounts";

const CREATE = "/api/projects";
const FOUNDER_EMAIL = process.env.QA_FOUNDER_LIMIT_EMAIL ?? "qa+founder@blockid.au";
const ACCEL_EMAIL = process.env.QA_ACCEL_LIMIT_EMAIL ?? "qa+accelerator@blockid.au";

test.describe("Founder 1-startup limit — /api/projects", () => {
  test.setTimeout(30_000);

  test("anonymous callers cannot create a project", async ({ request }) => {
    const res = await request.post(CREATE, {
      data: { name: "Anon Startup" },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body).toMatchObject({ ok: false });
  });

  test("second create for a founder returns 403 founder_one_startup_limit", async ({
    page,
    request,
  }) => {
    let loginOk = false;
    try {
      await loginAs(page, FOUNDER_EMAIL);
      loginOk = true;
    } catch {
      // fixture missing — skip
    }
    test.skip(
      !loginOk,
      `QA founder ${FOUNDER_EMAIL} not seeded — run scripts/seed-test-users.mjs`,
    );

    // Reuse the page cookies for the API request context.
    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

    // We do NOT assume this founder already has 0 projects. The invariant
    // this test pins is: at some point on a founder account you MUST hit
    // the guard. Try up to 2 creates; the SECOND one is guaranteed to 403
    // because after the first create the founder is at the cap.
    const attempt = async () =>
      request.post(CREATE, {
        headers: { cookie: cookieHeader, "content-type": "application/json" },
        data: { name: `qa-limit-${Date.now()}` },
      });

    const first = await attempt();
    // First may be 201 (had zero) or 403 (already had one). Either way,
    // the follow-up MUST be 403.
    if (first.status() === 403) {
      const body = await first.json();
      expect(body).toMatchObject({
        ok: false,
        error: "founder_one_startup_limit",
        hint_upgrade_url: "/pricing?highlight=accelerator",
      });
      return;
    }
    expect(first.status()).toBe(201);

    const second = await attempt();
    expect(second.status()).toBe(403);
    const body = await second.json();
    expect(body).toMatchObject({
      ok: false,
      error: "founder_one_startup_limit",
      hint_upgrade_url: "/pricing?highlight=accelerator",
    });
  });

  test("accelerator accounts bypass the 1-startup limit", async ({
    page,
    request,
  }) => {
    let loginOk = false;
    try {
      await loginAs(page, ACCEL_EMAIL);
      loginOk = true;
    } catch {
      // fixture missing — skip
    }
    test.skip(
      !loginOk,
      `QA accelerator ${ACCEL_EMAIL} not seeded — run scripts/seed-test-users.mjs`,
    );

    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

    // Two back-to-back creates. Both must succeed OR fail with a
    // NON-founder-gate reason (e.g. plan seat cap). The one status we
    // must never see is 403 with founder_one_startup_limit.
    for (let i = 0; i < 2; i++) {
      const res = await request.post(CREATE, {
        headers: { cookie: cookieHeader, "content-type": "application/json" },
        data: { name: `qa-accel-${Date.now()}-${i}` },
      });
      if (res.status() === 403) {
        const body = await res.json();
        expect(body.error).not.toBe("founder_one_startup_limit");
      }
    }
  });
});
