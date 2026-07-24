// E2E — POST /api/compliance/gst-threshold flags the A$75k crossing.

import { test, expect } from "@playwright/test";
import { getAccount, loginAs } from "../fixtures/accounts";

const QA_EMAIL = "qa-founder-1@blockid.au";

test.describe("Compliance — GST A$75k threshold", () => {
  test.setTimeout(30_000);

  test("projection that crosses A$75k → urgency=warning", async ({ page }) => {
    try {
      getAccount(QA_EMAIL);
    } catch {
      test.skip(true, `${QA_EMAIL} not seeded`);
      return;
    }
    await loginAs(page, QA_EMAIL);

    // 12 actual months of $4k each = $48k (below). Projected ramp to
    // $8k/month for 12 months = $96k (above threshold).
    const actual = Array(12).fill(4_000);
    const projected = Array(12).fill(8_000);

    const res = await page.request.post("/api/compliance/gst-threshold", {
      data: {
        monthly_turnover_last_12_months: actual,
        projected_next_12_months: projected,
        registered_for_gst: false,
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.result.urgency).toBe("warning");
    expect(body.result.action_required).toBe("register_within_21_days");
    expect(body.result.is_above_threshold).toBe(true);
    expect(typeof body.result.disclaimer).toBe("string");
  });

  test("already-registered → urgency=ok, action=already_registered", async ({
    page,
  }) => {
    try {
      getAccount(QA_EMAIL);
    } catch {
      test.skip(true, `${QA_EMAIL} not seeded`);
      return;
    }
    await loginAs(page, QA_EMAIL);
    const res = await page.request.post("/api/compliance/gst-threshold", {
      data: {
        monthly_turnover_last_12_months: Array(12).fill(10_000),
        registered_for_gst: true,
        registration_date: "2025-06-01",
        abn: "79 659 615 111",
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.result.urgency).toBe("ok");
    expect(body.result.action_required).toBe("already_registered");
  });

  test("GET returns latest snapshot", async ({ page }) => {
    try {
      getAccount(QA_EMAIL);
    } catch {
      test.skip(true, `${QA_EMAIL} not seeded`);
      return;
    }
    await loginAs(page, QA_EMAIL);
    const res = await page.request.get("/api/compliance/gst-threshold");
    expect(res.status()).toBe(200);
  });
});
