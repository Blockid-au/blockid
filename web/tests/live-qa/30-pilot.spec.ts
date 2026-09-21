/**
 * 30 — Pilot lane, retired state (G16-C → G25, 2026-09-21 "bỏ luôn coupon
 * và pilot"):
 *
 *   • the public pilot URLs are gone: /pilot/investor 301s to
 *     /solutions/investor, /pilot to /solutions/accelerator, /vi/pilot to
 *     /vi/solutions/accelerator, and the old workspace kit
 *     /workspace/accelerator/pilot to /workspace/accelerator/onboarding;
 *   • POST /api/pilot/apply no longer exists (404 — the retired form's
 *     route is deleted, nothing can be stored);
 *   • the admin ledger routes still answer 401 to an anonymous caller and
 *     403 to the QA founder; POST /api/admin/pilots answers 410
 *     `pilots_retired` to an admin (asserted by the colocated route test —
 *     the lane has no admin session) and the pilot-expiry cron 401s
 *     without CRON_SECRET;
 *   • /admin/pilots redirects the QA founder away (never renders the
 *     ledger to a non-admin).
 *
 * Nothing in this lane can start a pilot any more — the start path is gone.
 */
import { test, expect } from "./fixtures";
import { anonRequest, del, evidence, get, post } from "./lib/api";

const REDIRECTS: ReadonlyArray<[string, string]> = [
  ["/pilot/investor", "/solutions/investor"],
  ["/pilot", "/solutions/accelerator"],
  ["/vi/pilot", "/vi/solutions/accelerator"],
  ["/workspace/accelerator/pilot", "/workspace/accelerator/onboarding"],
];

test.describe("Pilot lane — retired public surfaces", () => {
  test("every retired pilot URL answers 301 to its persona / onboarding page; the destinations render", async ({ qa }, testInfo) => {
    const anon = await anonRequest(qa.baseURL);
    try {
      const hops: Record<string, { status: number; location: string | undefined }> = {};
      for (const [from, to] of REDIRECTS) {
        const res = await anon.get(from, { maxRedirects: 0 });
        hops[from] = { status: res.status(), location: res.headers()["location"] };
        expect(res.status(), from).toBe(301);
        expect(res.headers()["location"] ?? "", from).toMatch(new RegExp(`${to.replace(/\//g, "\\/")}$`));
      }
      await evidence(testInfo, "retired pilot redirects", hops);
      for (const to of ["/solutions/investor", "/solutions/accelerator", "/vi/solutions/accelerator"]) {
        const res = await anon.get(to);
        expect(res.status(), to).toBe(200);
        const html = await res.text();
        expect(html, to).not.toMatch(/Cohort Validation Pilot|paid pilot|thí điểm/i);
      }
    } finally {
      await anon.dispose();
    }
  });

  test("POST /api/pilot/apply is gone (404) — the retired form cannot store anything", async ({ qa }, testInfo) => {
    const anon = await anonRequest(qa.baseURL);
    try {
      const res = await anon.post("/api/pilot/apply", {
        data: { program_name: "QA Live Pilot (retired)", contact_name: "QA Live", email: qa.email, cohort_size: 12, intake_month: "2027-01", message: "live-qa lane 30 — must never be stored" },
      });
      await evidence(testInfo, "POST /api/pilot/apply (retired)", { status: res.status() });
      expect(res.status()).toBe(404);
    } finally {
      await anon.dispose();
    }
  });
});

test.describe("Pilot lane — admin ledger surfaces are closed", () => {
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
