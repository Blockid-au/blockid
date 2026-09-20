/**
 * 32 — Billing lane (G18-D, 2026-09-19): self-serve cancel + portal truth.
 *
 *   • signed-in QA founder (Free, or DB-elevated Growth with NO Stripe
 *     customer) → `/workspace/billing` answers 200, shows the Current Plan
 *     card, and renders NO cancel section / cancel button (there is no
 *     subscription to cancel);
 *   • `POST /api/stripe/cancel` → 404 `no_subscription` (never a 500);
 *   • `POST /api/stripe/reactivate` → 404 (nothing scheduled);
 *   • `POST /api/stripe/portal` → 404 (no Stripe customer) — the
 *     configuration self-provisioning path (503 `portal_configuration_
 *     unavailable`) can only be exercised by a customer that exists in
 *     Stripe; see docs/ops/billing-portal.md "Live check";
 *   • `GET /api/stripe/trial-status` → 200 `inTrial: false`, and carries the
 *     G18-D trial-truth fields;
 *   • anonymous `POST /api/stripe/cancel` → 401.
 *
 * No real subscription can be created here (spend is off), so the
 * trialing / active / scheduled rows of the cancel table are pinned by the
 * unit tests (api/stripe/cancel/route.test.ts, lib/billing/*.test.ts).
 * Nothing here changes the QA account.
 */
import { test, expect } from "./fixtures";
import { anonRequest, evidence, get, post } from "./lib/api";

interface CancelResponse {
  ok: boolean;
  reason?: string;
  message?: string;
  state?: string;
}

interface TrialStatus {
  ok: boolean;
  inTrial: boolean;
  daysLeft: number;
  trialEnd: string | null;
  planId: string | null;
  status: string | null;
  cancelAtPeriodEnd?: boolean;
  trialDays?: number | null;
  firstChargeOn?: string | null;
  currentPeriodEnd?: string | null;
}

test.describe("Billing — self-serve cancel truth (no subscription)", () => {
  test("/workspace/billing renders the Current Plan card and no cancel section for an account without a subscription", async ({ page, visit, qa }, testInfo) => {
    await visit("/workspace/billing");
    await expect(page.getByRole("heading", { level: 1, name: /Billing/ })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("heading", { level: 2, name: /Current Plan/ })).toBeVisible();
    // The cancel section only mounts for a live Stripe subscription.
    const cancelSection = page.locator('[data-testid="cancel-subscription-section"]');
    const cancelButton = page.locator('[data-testid="cancel-subscription"]');
    const resumeButton = page.locator('[data-testid="resume-subscription"]');
    await evidence(testInfo, "billing page", {
      url: page.url(),
      plan: qa.plan,
      elevated: qa.elevated,
      cancelSections: await cancelSection.count(),
      cancelButtons: await cancelButton.count(),
      resumeButtons: await resumeButton.count(),
    });
    expect(await cancelSection.count()).toBe(0);
    expect(await cancelButton.count()).toBe(0);
    expect(await resumeButton.count()).toBe(0);
    // A "Manage Billing" button only appears with a Stripe customer; the QA
    // account never checked out, so it must not be offered either.
    expect(await page.getByRole("button", { name: /Manage Billing/ }).count()).toBe(0);
  });

  test("POST /api/stripe/cancel without a subscription → 404 no_subscription; reactivate → 404; portal → 404 (no customer)", async ({ api }, testInfo) => {
    const cancel = await post<CancelResponse>(api, "/api/stripe/cancel", { reason: "other" });
    const reactivate = await post<CancelResponse>(api, "/api/stripe/reactivate", {});
    const portal = await post<CancelResponse>(api, "/api/stripe/portal", {});
    await evidence(testInfo, "cancel / reactivate / portal", {
      cancel: { status: cancel.status, body: cancel.body },
      reactivate: { status: reactivate.status, body: reactivate.body },
      portal: { status: portal.status, body: portal.body },
    });
    expect(cancel.status).toBe(404);
    expect(cancel.body.ok).toBe(false);
    expect(cancel.body.reason).toBe("no_subscription");
    expect(reactivate.status).toBe(404);
    expect(reactivate.body.ok).toBe(false);
    // No Stripe customer → the portal route stops before Stripe. A 503 here
    // would mean the customer exists but the portal configuration could not
    // be created — see docs/ops/billing-portal.md.
    expect(portal.status).toBe(404);
    expect(portal.body.ok).toBe(false);
  });

  test("GET /api/stripe/trial-status reports no trial and carries the G18-D trial-truth fields", async ({ api }, testInfo) => {
    const res = await get<TrialStatus>(api, "/api/stripe/trial-status");
    await evidence(testInfo, "trial-status", res.body);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.inTrial).toBe(false);
    expect(res.body.daysLeft).toBe(0);
    // A row may or may not exist for the QA account; when it does, the new
    // fields must be present (null is fine — nothing is trialing).
    if (res.body.status !== null && res.body.status !== undefined) {
      expect("trialDays" in res.body).toBe(true);
      expect("firstChargeOn" in res.body).toBe(true);
      expect("currentPeriodEnd" in res.body).toBe(true);
      expect(res.body.firstChargeOn).toBeNull();
    }
  });

  test("anonymous POST /api/stripe/cancel and /api/stripe/reactivate → 401", async ({ qa }, testInfo) => {
    const anon = await anonRequest(qa.baseURL);
    let cancelStatus = 0;
    let reactivateStatus = 0;
    try {
      cancelStatus = (await post(anon, "/api/stripe/cancel", { reason: "other" })).status;
      reactivateStatus = (await post(anon, "/api/stripe/reactivate", {})).status;
    } finally {
      await anon.dispose();
    }
    await evidence(testInfo, "anonymous", { cancelStatus, reactivateStatus });
    expect(cancelStatus).toBe(401);
    expect(reactivateStatus).toBe(401);
  });
});
