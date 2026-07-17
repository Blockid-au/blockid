/**
 * Regression — Equity Request-a-Call intake.
 *
 * The /api/equity/request endpoint MUST:
 *   1. Reject unauthenticated calls with 401.
 *   2. Validate min-length message + ack_disclaimer + ack_independent_counsel.
 *   3. Return 202 on happy path (never 200) so callers know the offer is
 *      queued for pending_review, not accepted.
 *   4. Never leak a Stripe checkout URL or activate any offer server-side.
 *   5. Fail-closed if consent_events row cannot be written.
 */

import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/accounts";

const HAPPY_BODY = {
  company_name: "QA Test Startup Pty Ltd",
  stage: "pre-seed",
  equity_pct_requested: 7,
  scope: ["svi_valuation", "cap_table_esop"],
  message:
    "We're a pre-seed team of two founders building an Australian compliance ML platform. " +
    "Looking for equity-for-solution partners to help us reach cap-table + investor-facing surfaces before Q4.",
  ack_disclaimer: true,
  ack_independent_counsel: true,
};

test.describe("Regression — /api/equity/request", () => {
  test("unauthenticated → 401", async ({ request }) => {
    const res = await request.post("/api/equity/request", {
      data: HAPPY_BODY,
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(401);
  });

  test("missing ack fields → 400 with issues", async ({ page, request }) => {
    await loginAs(page, "qa-founder-2@blockid.au");
    const bad = { ...HAPPY_BODY, ack_disclaimer: false, ack_independent_counsel: false } as unknown as Record<string, unknown>;
    const res = await request.post("/api/equity/request", { data: bad, failOnStatusCode: false });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(Array.isArray(body.issues)).toBe(true);
  });

  test("message under 100 chars → 400", async ({ page, request }) => {
    await loginAs(page, "qa-founder-2@blockid.au");
    const shortMsg = { ...HAPPY_BODY, message: "too short" };
    const res = await request.post("/api/equity/request", { data: shortMsg, failOnStatusCode: false });
    expect(res.status()).toBe(400);
  });

  test("happy path → 202 with request_id + consent_id, no Stripe url", async ({ page, request }) => {
    await loginAs(page, "qa-founder-2@blockid.au");
    const res = await request.post("/api/equity/request", { data: HAPPY_BODY, failOnStatusCode: false });
    expect(res.status()).toBe(202);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.status).toBe("pending_review");
    expect(typeof body.request_id).toBe("string");
    expect(typeof body.consent_id).toBe("string");
    // Server must never return a checkout URL or offer-accept token.
    expect(body.url ?? body.checkout_url ?? body.accept_token).toBeUndefined();
  });
});
