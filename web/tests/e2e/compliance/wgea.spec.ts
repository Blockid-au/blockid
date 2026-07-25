// E2E — POST /api/compliance/wgea-threshold flags the 100-employee crossing.
// Mirrors the gst.spec.ts shape (P1n-persist route hookup).

import { test, expect } from "@playwright/test";
import { getAccount, loginAs } from "../fixtures/accounts";

const QA_EMAIL = "qa-founder-1@blockid.au";

test.describe("Compliance — WGEA 100-employee threshold", () => {
  test.setTimeout(30_000);

  test("headcount ≥ 100 → action=report_required, urgency=critical", async ({
    page,
  }) => {
    try {
      getAccount(QA_EMAIL);
    } catch {
      test.skip(true, `${QA_EMAIL} not seeded`);
      return;
    }
    await loginAs(page, QA_EMAIL);

    const res = await page.request.post("/api/compliance/wgea-threshold", {
      data: {
        current_headcount_au: 120,
        has_previously_reported: false,
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.result.action_required).toBe("report_required");
    expect(body.result.urgency).toBe("critical");
    expect(body.result.is_relevant_employer).toBe(true);
    expect(body.result.is_above_threshold).toBe(true);
    expect(body.result.threshold_headcount).toBe(100);
    expect(typeof body.result.next_report_due_iso).toBe("string");
    expect(typeof body.result.disclaimer).toBe("string");
  });

  test("headcount well below 100 → action=not_required, urgency=ok", async ({
    page,
  }) => {
    try {
      getAccount(QA_EMAIL);
    } catch {
      test.skip(true, `${QA_EMAIL} not seeded`);
      return;
    }
    await loginAs(page, QA_EMAIL);

    const res = await page.request.post("/api/compliance/wgea-threshold", {
      data: {
        current_headcount_au: 12,
        has_previously_reported: false,
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.result.action_required).toBe("not_required");
    expect(body.result.urgency).toBe("ok");
    expect(body.result.is_above_threshold).toBe(false);
    expect(body.result.is_relevant_employer).toBe(false);
  });

  test("headcount in 80–99 warning band → approaching_threshold", async ({
    page,
  }) => {
    try {
      getAccount(QA_EMAIL);
    } catch {
      test.skip(true, `${QA_EMAIL} not seeded`);
      return;
    }
    await loginAs(page, QA_EMAIL);

    const res = await page.request.post("/api/compliance/wgea-threshold", {
      data: {
        current_headcount_au: 88,
        has_previously_reported: false,
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.result.action_required).toBe("approaching_threshold");
    expect(body.result.urgency).toBe("warning");
    expect(body.result.is_above_threshold).toBe(false);
  });

  test("missing required fields → 400", async ({ page }) => {
    try {
      getAccount(QA_EMAIL);
    } catch {
      test.skip(true, `${QA_EMAIL} not seeded`);
      return;
    }
    await loginAs(page, QA_EMAIL);
    const res = await page.request.post("/api/compliance/wgea-threshold", {
      data: { current_headcount_au: 50 }, // missing has_previously_reported
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("missing_required_fields");
    expect(Array.isArray(body.required)).toBe(true);
    expect(body.required).toContain("has_previously_reported");
  });

  test("unauthenticated → 401 with disclaimer", async ({ request }) => {
    const res = await request.post("/api/compliance/wgea-threshold", {
      data: { current_headcount_au: 50, has_previously_reported: false },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("unauthenticated");
    expect(typeof body.disclaimer).toBe("string");
  });

  test("GET returns latest snapshot for the caller", async ({ page }) => {
    try {
      getAccount(QA_EMAIL);
    } catch {
      test.skip(true, `${QA_EMAIL} not seeded`);
      return;
    }
    await loginAs(page, QA_EMAIL);
    const res = await page.request.get("/api/compliance/wgea-threshold");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(typeof body.disclaimer).toBe("string");
  });
});
