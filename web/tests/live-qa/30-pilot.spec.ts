/**
 * 30 — Evaluator pilot lane (G16-C):
 *
 *   • ANONYMOUS /pilot renders 200, indexable (F-3), with the offer v2
 *     terms, the 7 success criteria, the application form and the
 *     data-ownership sentence verbatim;
 *   • POST /api/pilot/apply with the honeypot filled → 204, so the lane
 *     never stores an application on production (the happy path is pinned
 *     by the colocated route test against a temp root — a real submission
 *     here would page ops and mail a fake applicant every Sunday);
 *   • the admin routes answer 401 to an anonymous caller and 403 to the QA
 *     founder account, and the pilot-expiry cron 401s without CRON_SECRET;
 *   • /admin/pilots redirects the QA founder away (never renders the
 *     ledger to a non-admin).
 *
 * Nothing in this lane starts a pilot: that is the main session's manual
 * post-deploy step (docs/ops/pilots.md § Throw-away pilot), because it
 * changes a real account's plan and grants credits.
 */
import { test, expect } from "./fixtures";
import { anonRequest, del, evidence, get, post } from "./lib/api";

const DATA_SENTENCE = "Your data belongs to your startup. We store it so every report builds on your own evidence and the AI reasons on your case. Founder-consented access tiers control who sees what.";

test.describe("Pilot lane — public offer page", () => {
  test("/pilot → 200, indexable, offer terms + 7 criteria + form + data sentence verbatim", async ({ page, qa }, testInfo) => {
    const res = await page.goto(`${qa.baseURL}/pilot`, { waitUntil: "domcontentloaded" });
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Free cohort scoring for one intake");
    await expect(page.getByTestId("pilot-terms")).toBeVisible();
    await expect(page.getByTestId("pilot-terms")).toContainText("up to 60 applicants");
    await expect(page.getByTestId("pilot-terms")).toContainText("30 days");
    await expect(page.getByTestId("pilot-terms")).toContainText("5 pilots");
    await expect(page.getByTestId("pilot-terms")).toContainText("no card required");
    await expect(page.getByTestId("pilot-criteria").locator("tbody tr")).toHaveCount(7);
    await expect(page.getByTestId("pilot-in-return").locator("li")).toHaveCount(4);
    await expect(page.getByTestId("pilot-data-principle")).toHaveText(DATA_SENTENCE);
    await expect(page.getByTestId("pilot-apply-form")).toBeVisible();
    for (const name of ["program_name", "contact_name", "email", "cohort_size", "intake_month", "message"]) {
      await expect(page.locator(`[data-testid="pilot-apply-form"] [name="${name}"]`)).toHaveCount(1);
    }
    const robots = await page.locator('meta[name="robots"]').getAttribute("content");
    const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
    await evidence(testInfo, "/pilot", { robots, canonical, title: await page.title() });
    expect(robots ?? "").toMatch(/index/);
    expect(robots ?? "").not.toMatch(/noindex/);
    expect(canonical).toBe("https://blockid.au/pilot");
  });

  test("POST /api/pilot/apply with the honeypot filled → 204 (nothing stored, nothing sent)", async ({ qa }, testInfo) => {
    const anon = await anonRequest(qa.baseURL);
    try {
      const res = await anon.post("/api/pilot/apply", {
        data: {
          program_name: "QA Live Pilot (honeypot)",
          contact_name: "QA Live",
          email: qa.email,
          cohort_size: 12,
          intake_month: "2027-01",
          message: "live-qa lane 30 — must never be stored",
          company_website: "http://spam.example",
        },
      });
      await evidence(testInfo, "POST /api/pilot/apply (honeypot)", { status: res.status() });
      expect(res.status()).toBe(204);

      const bad = await anon.post("/api/pilot/apply", { data: { program_name: "x", contact_name: "", email: "nope", cohort_size: 0, intake_month: "Jan" } });
      const body = (await bad.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      await evidence(testInfo, "POST /api/pilot/apply (invalid)", { status: bad.status(), body });
      expect(bad.status()).toBe(400);
      expect(body.error).toBe("invalid_input");
    } finally {
      await anon.dispose();
    }
  });
});

test.describe("Pilot lane — admin surfaces are closed", () => {
  test("anonymous → 401 on GET/POST /api/admin/pilots, DELETE /api/admin/pilots/[id] and the pilot-expiry cron", async ({ qa }, testInfo) => {
    const anon = await anonRequest(qa.baseURL);
    try {
      const list = await get<{ ok: boolean; error?: string }>(anon, "/api/admin/pilots");
      const start = await post<{ ok: boolean; error?: string }>(anon, "/api/admin/pilots", { email: qa.email, program_name: "QA Live — must not start" });
      const end = await del<{ ok: boolean; error?: string }>(anon, "/api/admin/pilots/qa-live-nope");
      const cron = await anon.get("/api/cron/pilot-expiry?dry=1");
      await evidence(testInfo, "anon admin routes", { list: list.status, start: start.status, end: end.status, cron: cron.status() });
      expect(list.status).toBe(401);
      expect(start.status).toBe(401);
      expect(start.body.ok).toBe(false);
      expect(end.status).toBe(401);
      expect(cron.status()).toBe(401);
    } finally {
      await anon.dispose();
    }
  });

  test("QA founder (signed in, not admin) → 403 on the admin routes; /admin/pilots never renders the ledger", async ({ api, page, qa }, testInfo) => {
    const list = await get<{ ok: boolean; error?: string }>(api, "/api/admin/pilots");
    const start = await post<{ ok: boolean; error?: string }>(api, "/api/admin/pilots", { email: qa.email, program_name: "QA Live — must not start" });
    await evidence(testInfo, "founder admin routes", { list: list.status, start: start.status, body: start.body });
    expect(list.status).toBe(403);
    expect(start.status).toBe(403);
    expect(start.body).toMatchObject({ ok: false, error: "not_admin" });

    await page.goto(`${qa.baseURL}/admin/pilots`, { waitUntil: "domcontentloaded" });
    await evidence(testInfo, "/admin/pilots as founder", { url: page.url() });
    expect(new URL(page.url()).pathname).not.toBe("/admin/pilots");
    expect(await page.getByTestId("pilots-table").count()).toBe(0);
    expect(await page.getByTestId("pilot-start-form").count()).toBe(0);
  });
});
