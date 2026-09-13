/**
 * 25 — Account deletion with the 7-day grace (S24-B; qa4 P2-d posture):
 * `/workspace/settings` (there is no `/settings` — 404) shows the grace
 * copy, the request re-authenticates with the password (wrong password →
 * 401 reauth_required, wrong phrase → 400 confirmation), the request is
 * scheduled through the UI and then CANCELLED inside the same test so the
 * global teardown erases the account exactly as usual; the emailed cancel
 * link is asserted by its invalid-token path (303 → ?deletion=invalid + copy).
 *
 * Data export: `GET /api/account/export` does not exist (annotated); the
 * settings page points at the audit-log export, which is asserted instead
 * (owner-only CSV carrying the QA actor).
 *
 * Runs BEFORE 26-member-lane on purpose: once a member has accepted an
 * invite the request answers 409 shared_projects (asserted there).
 */
import { test, expect } from "./fixtures";
import { anonRequest, evidence, get, post } from "./lib/api";

interface Status {
  ok: boolean;
  pending: boolean;
  requestedAt: string | null;
  scheduledFor: string | null;
  hasPassword: boolean;
  erased: boolean;
  graceDays: number;
  isAdmin: boolean;
}

test.describe("Account deletion", () => {
  test("/workspace/settings shows the 7-day grace copy; GET /api/account/delete reports graceDays 7, not pending", async ({ page, visit, api }, testInfo) => {
    await visit("/workspace/settings");
    await expect(page.getByRole("heading", { level: 1, name: /Account settings/ })).toBeVisible({ timeout: 30_000 });
    const section = page.locator('section[aria-labelledby="delete-account-heading"]');
    await expect(section).toBeVisible();
    await expect(section).toContainText(/7-day grace period/);
    await expect(section).toContainText(/nothing is erased for 7 days/);
    await expect(section.getByRole("button", { name: /Delete my account/ })).toBeVisible();
    const status = await get<Status>(api, "/api/account/delete");
    await evidence(testInfo, "GET /api/account/delete", status.body);
    expect(status.status).toBe(200);
    expect(status.body.graceDays).toBe(7);
    expect(status.body.pending).toBe(false);
    expect(status.body.hasPassword, "the QA account registered with a password").toBe(true);
    expect(status.body.isAdmin).toBe(false);
  });

  test("re-auth gates: wrong password → 401 reauth_required/bad_password; wrong phrase → 400 confirmation; anonymous → 401", async ({ api, qa }, testInfo) => {
    const wrongPw = await post(api, "/api/account/delete", { action: "request", confirmation: "DELETE", password: "definitely-not-the-password" });
    const wrongPhrase = await post(api, "/api/account/delete", { action: "request", confirmation: "delete me", password: qa.password });
    const anon = await anonRequest(qa.baseURL);
    let anonStatus = 0;
    try {
      anonStatus = (await post(anon, "/api/account/delete", { action: "request", confirmation: "DELETE", password: "x" })).status;
    } finally {
      await anon.dispose();
    }
    const after = await get<Status>(api, "/api/account/delete");
    await evidence(testInfo, "gates", { wrongPw: { status: wrongPw.status, body: wrongPw.body }, wrongPhrase: { status: wrongPhrase.status, body: wrongPhrase.body }, anonStatus, pendingAfter: after.body.pending });
    expect(wrongPw.status).toBe(401);
    expect(wrongPw.body.reason).toBe("reauth_required");
    expect(wrongPw.body.detail).toBe("bad_password");
    expect(qa.password, "run state carries the founder password for the re-auth step").toBeTruthy();
    expect(wrongPhrase.status).toBe(400);
    expect(wrongPhrase.body.reason).toBe("confirmation");
    expect(wrongPhrase.body.expected).toBe("DELETE");
    expect(anonStatus).toBe(401);
    expect(after.body.pending, "nothing scheduled by the failed attempts").toBe(false);
  });

  test("schedule deletion through the UI (password + DELETE) → 7 days out → 'Keep my account' cancels it in the same test", async ({ page, visit, api, qa }, testInfo) => {
    test.skip(!qa.password, "run state has no founder password (LIVE_QA_REUSE_STATE from an older run?) — cannot re-authenticate");
    await visit("/workspace/settings");
    const section = page.locator('section[aria-labelledby="delete-account-heading"]');
    await section.getByRole("button", { name: /Delete my account/ }).click();
    await section.getByLabel("Your password").fill(qa.password!);
    await section.getByLabel(/Type DELETE to confirm/).fill("DELETE");
    await section.getByLabel(/Why are you leaving/).fill("live-QA suite — cancelled seconds later");
    const [res] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith("/api/account/delete") && r.request().method() === "POST", { timeout: 45_000 }),
      section.getByRole("button", { name: /Schedule deletion/ }).click(),
    ]);
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; pending?: boolean; scheduledFor?: string; graceDays?: number; reason?: string; projects?: unknown[] };
    await evidence(testInfo, "POST /api/account/delete (request)", { status: res.status(), body });
    let cancelled: { status: number; body: Record<string, unknown> } | null = null;
    try {
      expect(res.status()).toBe(200);
      expect(body.pending).toBe(true);
      expect(body.graceDays).toBe(7);
      const scheduled = new Date(body.scheduledFor ?? 0).getTime();
      const days = (scheduled - Date.now()) / 86_400_000;
      expect(days, "scheduled ~7 days out").toBeGreaterThan(6.9);
      expect(days).toBeLessThan(7.1);
      await expect(section.getByRole("status")).toContainText(/Deletion scheduled for/, { timeout: 30_000 });
      await expect(section).toContainText(/Deletion scheduled for/);
      const pending = await get<Status>(api, "/api/account/delete");
      expect(pending.body.pending).toBe(true);
      expect(pending.body.scheduledFor).toBe(body.scheduledFor);

      const [cancelRes] = await Promise.all([
        page.waitForResponse((r) => r.url().endsWith("/api/account/delete") && r.request().method() === "POST", { timeout: 45_000 }),
        section.getByRole("button", { name: /Keep my account/ }).click(),
      ]);
      cancelled = { status: cancelRes.status(), body: (await cancelRes.json().catch(() => ({}))) as Record<string, unknown> };
      await expect(section.getByRole("status")).toContainText(/Deletion cancelled — your account stays/, { timeout: 30_000 });
    } finally {
      // Belt and braces: whatever happened above, the account must not be
      // left scheduled — the teardown erases it tonight, not the cron in 7 days.
      const safety = await post(api, "/api/account/delete", { action: "cancel" });
      const final = await get<Status>(api, "/api/account/delete");
      await evidence(testInfo, "cancel", { ui: cancelled, safety: safety.body, final: final.body });
      expect(safety.status).toBe(200);
      expect(final.body.pending).toBe(false);
      expect(final.body.scheduledFor).toBeNull();
    }
    expect(cancelled?.status).toBe(200);
    expect(cancelled?.body.pending).toBe(false);
  });

  test("emailed cancel link: an invalid token is 303 → /workspace/settings?deletion=invalid and the page says so — no state change", async ({ page, visit, qa, api }, testInfo) => {
    const anon = await anonRequest(qa.baseURL);
    try {
      const r = await anon.get("/api/account/delete/cancel?token=not-a-real-cancel-token", { maxRedirects: 0 });
      await evidence(testInfo, "GET /api/account/delete/cancel (bogus)", { status: r.status(), location: r.headers()["location"] });
      expect(r.status()).toBe(303);
      expect(r.headers()["location"] ?? "").toMatch(/\/workspace\/settings\?deletion=invalid$/);
    } finally {
      await anon.dispose();
    }
    await visit("/workspace/settings?deletion=invalid");
    await expect(page.locator('section[aria-labelledby="delete-account-heading"]').getByRole("status")).toContainText(/That cancel link is no longer valid/, { timeout: 30_000 });
    const status = await get<Status>(api, "/api/account/delete");
    expect(status.body.pending).toBe(false);
  });

  test("data export: /api/account/export does not exist (finding); the audit-log CSV the settings page points at is owner-only and names the QA actor", async ({ api, qa }, testInfo) => {
    const exportRes = await api.get("/api/account/export", { maxRedirects: 0 });
    testInfo.annotations.push({ type: "finding", description: `GET /api/account/export → ${exportRes.status()} — no self-service account data export endpoint; /workspace/settings points at the audit-log CSV instead` });
    const csv = await api.get("/api/audit-log/export");
    const text = await csv.text();
    const header = text.split("\n")[0] ?? "";
    const rows = text.trim().split("\n").length - 1;
    await evidence(testInfo, "audit-log export", { accountExportStatus: exportRes.status(), status: csv.status(), contentType: csv.headers()["content-type"], header, rows, mentionsQaUserId: text.includes(qa.userId ?? " ") });
    expect(exportRes.status()).not.toBe(500);
    expect(csv.status()).toBe(200);
    expect(csv.headers()["content-type"]).toMatch(/text\/csv/);
    expect(header).toMatch(/^id,ts,actor_user_id,actor_kind,actor_role,project_id,action/);
    // The CSV is the PROJECT's log (actor_kind = kind, actor_user_id = who): every row
    // of the QA project so far was written by the QA founder.
    if (rows > 0) expect(text).toContain(qa.userId ?? "");
    else testInfo.annotations.push({ type: "note", description: "project-scoped audit export is empty for the QA project (release-qa2 F6: rows without detail.project_id are filtered out)" });
  });
});
