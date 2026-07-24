// /api/auth/register-with-card — card-upfront signup contract.
//
// Pins the invariants the client + email + support docs depend on:
//   1. A request without payment_method_id returns 400 { error: "payment_method_required" }.
//   2. A request without terms_accepted returns 400 { error: "terms_required" }.
//   3. A request with an unsupported plan_id returns 400 { error: "unsupported_plan" }.
//   4. The legacy /api/auth/register endpoint keeps returning the shared
//      { ok:false, error } envelope so admin-provisioning flows still work.
//
// The happy-path (200 with trial.end_at ~7d out) requires a real Stripe
// test card token — that lives in the integration suite behind
// STRIPE_TEST_SECRET_KEY. This spec runs at unit-test speed against the
// deployed API surface without touching Stripe.

import { test, expect } from "@playwright/test";

const REGISTER_CARD = "/api/auth/register-with-card";
const REGISTER_LEGACY = "/api/auth/register";

test.describe("POST /api/auth/register-with-card — card required contract", () => {
  test.setTimeout(15_000);

  test("missing payment_method_id → 400 payment_method_required", async ({ request }) => {
    const res = await request.post(REGISTER_CARD, {
      data: {
        email: `no-card+${Date.now()}@example.test`,
        password: "aStrongPassword1",
        display_name: "No Card",
        account_type: "founder",
        plan_id: "founder_starter",
        terms_accepted: true,
      },
      headers: { "content-type": "application/json" },
    });
    expect([400, 429]).toContain(res.status());
    if (res.status() === 400) {
      const body = await res.json();
      expect(body).toMatchObject({ ok: false, error: "payment_method_required" });
    }
  });

  test("missing terms_accepted → 400 terms_required", async ({ request }) => {
    const res = await request.post(REGISTER_CARD, {
      data: {
        email: `no-terms+${Date.now()}@example.test`,
        password: "aStrongPassword1",
        display_name: "No Terms",
        account_type: "founder",
        plan_id: "founder_starter",
        payment_method_id: "pm_test_fake",
      },
      headers: { "content-type": "application/json" },
    });
    expect([400, 429]).toContain(res.status());
    if (res.status() === 400) {
      const body = await res.json();
      expect(body).toMatchObject({ ok: false, error: "terms_required" });
    }
  });

  test("unsupported plan_id → 400 unsupported_plan", async ({ request }) => {
    const res = await request.post(REGISTER_CARD, {
      data: {
        email: `bad-plan+${Date.now()}@example.test`,
        password: "aStrongPassword1",
        display_name: "Bad Plan",
        account_type: "founder",
        plan_id: "founder_free", // deliberately excluded from new-signup tiers
        payment_method_id: "pm_test_fake",
        terms_accepted: true,
      },
      headers: { "content-type": "application/json" },
    });
    expect([400, 429]).toContain(res.status());
    if (res.status() === 400) {
      const body = await res.json();
      expect(body).toMatchObject({ ok: false, error: "unsupported_plan" });
    }
  });
});

test.describe("POST /api/auth/register — legacy admin-provisioning envelope", () => {
  test.setTimeout(15_000);

  test("still returns { ok:false, error:string } for empty bodies", async ({ request }) => {
    const res = await request.post(REGISTER_LEGACY, {
      data: {},
      headers: { "content-type": "application/json" },
    });
    expect([400, 429]).toContain(res.status());
    if (res.status() === 400) {
      const body = await res.json();
      expect(body).toMatchObject({ ok: false });
      expect(typeof body.error).toBe("string");
    }
  });
});
