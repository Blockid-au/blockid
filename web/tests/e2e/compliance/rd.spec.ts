// E2E — GET /api/compliance/rd-calendar returns FY entries with a valid
// 10-month AusIndustry deadline schedule.

import { test, expect } from "@playwright/test";
import { getAccount, loginAs } from "../fixtures/accounts";

const QA_EMAIL = "qa-founder-1@blockid.au";

test.describe("Compliance — R&D Tax Incentive calendar", () => {
  test.setTimeout(30_000);

  test("returns current + prior 3 FYs with 10-month deadlines", async ({
    page,
  }) => {
    try {
      getAccount(QA_EMAIL);
    } catch {
      test.skip(true, `${QA_EMAIL} not seeded`);
      return;
    }
    await loginAs(page, QA_EMAIL);

    const res = await page.request.get("/api/compliance/rd-calendar");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.calendar)).toBe(true);
    expect(body.calendar.length).toBe(4);
    for (const row of body.calendar) {
      expect(row.fy_label).toMatch(/^FY \d{4}-\d{2}$/);
      expect(row.activity_start).toMatch(/^\d{4}-07-01$/);
      expect(row.activity_end).toMatch(/^\d{4}-06-30$/);
      // Deadline is activity_end + 10 months → April 30.
      expect(row.registration_deadline).toMatch(/^\d{4}-04-30$/);
      expect([
        "future",
        "open",
        "closing_soon",
        "last_call",
        "overdue",
      ]).toContain(row.status);
    }
    expect(typeof body.disclaimer).toBe("string");
    expect(body.disclaimer.length).toBeGreaterThan(20);
  });

  test("401 for unauthenticated", async ({ request }) => {
    const res = await request.get("/api/compliance/rd-calendar");
    expect(res.status()).toBe(401);
  });
});
