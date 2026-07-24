// POST /api/auth/register — anonymous body-shape contract for the
// card-required signup model (2026-07-24 directive).
//
// The current password-based registration endpoint does not yet enforce
// payment_method_id in the request body (the full Stripe Elements
// integration is a separate front-end unit). This spec pins the two
// invariants that already hold and MUST continue to hold once the card
// gate lands:
//   1. Anonymous POST without email / password → 400.
//   2. The response envelope stays { ok:false, error:string } so the
//      forthcoming payment_method_required branch reuses the same shape.
//
// When the payment_method_id gate ships, add a third case here that
// POSTs a valid email+password WITHOUT payment_method_id and asserts
// 400 { error: 'payment_method_required' } — same envelope, just a new
// reason string.

import { test, expect } from "@playwright/test";

const REGISTER = "/api/auth/register";

test.describe("POST /api/auth/register — card-required contract", () => {
  test.setTimeout(15_000);

  test("rejects a body missing required fields with 400 + envelope", async ({ request }) => {
    const res = await request.post(REGISTER, {
      data: {},
      headers: { "content-type": "application/json" },
    });
    expect([400, 429]).toContain(res.status()); // 429 tolerated on shared rate-limit
    if (res.status() === 400) {
      const body = await res.json();
      expect(body).toMatchObject({ ok: false });
      expect(typeof body.error).toBe("string");
    }
  });

  test("rejects invalid email early — proves the shared error envelope holds", async ({ request }) => {
    const res = await request.post(REGISTER, {
      data: { email: "not-an-email", password: "secret1234" },
      headers: { "content-type": "application/json" },
    });
    expect([400, 429]).toContain(res.status());
    if (res.status() === 400) {
      const body = await res.json();
      expect(body).toMatchObject({ ok: false });
      // Envelope contract for the forthcoming payment_method_required branch.
      expect(typeof body.error).toBe("string");
    }
  });
});
