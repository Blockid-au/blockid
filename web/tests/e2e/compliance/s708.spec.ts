// E2E — POST /api/compliance/s708 captures an expiring-soon wholesale
// investor certificate and mirrors it into the data room.

import { test, expect } from "@playwright/test";
import { getAccount, loginAs } from "../fixtures/accounts";

const QA_EMAIL = "qa-founder-1@blockid.au";

function isoDaysAgo(days: number): string {
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

test.describe("Compliance — s708(8) wholesale cert", () => {
  test.setTimeout(30_000);

  test("POST captures a cert expiring within 60 days as 'expiring_soon'", async ({
    page,
  }) => {
    try {
      getAccount(QA_EMAIL);
    } catch {
      test.skip(true, `${QA_EMAIL} not seeded`);
      return;
    }
    await loginAs(page, QA_EMAIL);

    // Cert dated ~2 years ago minus 45 days → expires in ~45 days.
    const certDate = isoDaysAgo(730 - 45);
    const res = await page.request.post("/api/compliance/s708", {
      data: {
        investor_email: `angel-${Date.now()}@example.com`,
        certifying_accountant_name: "Jane Ledger",
        certifying_accountant_firm: "Ledger CA",
        cert_type: "net_assets",
        cert_date: certDate,
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.record.status).toBe("expiring_soon");
    expect(body.record.days_to_expiry).toBeGreaterThanOrEqual(0);
    expect(body.record.days_to_expiry).toBeLessThanOrEqual(60);
    expect(typeof body.disclaimer).toBe("string");
  });

  test("GET returns the founder's cert list with summary", async ({ page }) => {
    try {
      getAccount(QA_EMAIL);
    } catch {
      test.skip(true, `${QA_EMAIL} not seeded`);
      return;
    }
    await loginAs(page, QA_EMAIL);
    const res = await page.request.get("/api/compliance/s708");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.certs)).toBe(true);
    expect(body.summary).toBeTruthy();
    expect(typeof body.summary.total).toBe("number");
  });

  test("validation error on bogus expiry_date", async ({ page }) => {
    try {
      getAccount(QA_EMAIL);
    } catch {
      test.skip(true, `${QA_EMAIL} not seeded`);
      return;
    }
    await loginAs(page, QA_EMAIL);
    const res = await page.request.post("/api/compliance/s708", {
      data: {
        investor_email: "x@example.com",
        certifying_accountant_name: "Jane",
        certifying_accountant_firm: "CA",
        cert_type: "net_assets",
        cert_date: "2024-01-01",
        expiry_date: "2030-01-01", // >2yr from cert_date → should fail
      },
    });
    expect(res.status()).toBe(400);
  });
});
