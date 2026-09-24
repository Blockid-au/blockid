/**
 * 43 — The free allowance: two free business reports per e-mail, address
 * required before the run, the third run is the A$3 quote (G25-C, 2026-09-21).
 *
 * Founder decision 2026-09-21: "cho phép phân tích 2 lần đầu miễn phí, nhưng
 * cần ghi nhận email để gởi report về và ghi nhận vào hệ thống số lượng
 * người submit và nhận report biz".
 *
 * Spend 0 by construction: every assertion below stops at the GATE, which
 * runs before the pipeline and before any model call —
 *
 *   • a guest POST /api/intake without an address → 400 email_required;
 *     a disposable inbox → 400 email_disposable; a filled honeypot → 400;
 *   • with LIVE_QA_ALLOW_DB the two free reports for the run's QA address
 *     are SEEDED in `free_report_grants` (no run), so the next submission —
 *     as a guest giving that address, and as the signed-in founder whose
 *     account it is — answers 200 `free_allowance_used` with the A$3 quote
 *     and no analysisId (the same address is never double-granted);
 *   • the trusted /api/status carries the `free_reports` block with the
 *     seeded rows counted; the erasure dry-run for the QA account lists
 *     `free_report_grants` (0440) so the teardown's --write removes them.
 *
 * The real first / second free run (G28-C: the v3 Trusted Business Report
 * through the ReportV2 pipeline, ~US$0.07 a run) is exercised only with
 * LIVE_QA_SPEND_OK, as the signed-in founder, and asserts
 * `freeReport.sequenceNo` 1 then 2, the poll's `kind: "v2"` document with 8
 * chapters, the PDF twin, and the ledger row stamped `sent`. Without the
 * flag the lane still probes the signed-link structure (404, no leak).
 *
 * Credits are snapshotted around every step: nothing here may move them.
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

import { test, expect } from "./fixtures";
import { anonRequest, evidence, json, post } from "./lib/api";
import { countFreeReportGrants, dbAllowed, deleteFreeReportGrants, freeReportGrantDelivery, freeReportGrantsTableExists, seedFreeReportGrants } from "./lib/db";
import { env } from "./lib/env";

const WEB_DIR = path.resolve(__dirname, "..", "..");

/** The app's identity for the allowance — lib/reports/free-grants.ts hashReportEmail(normaliseReportEmail(e)). */
function emailHashFor(email: string): string {
  const clean = email.trim().toLowerCase();
  const at = clean.lastIndexOf("@");
  let local = clean.slice(0, at);
  const domain = clean.slice(at + 1);
  const plus = local.indexOf("+");
  if (plus > 0) local = local.slice(0, plus);
  if (domain === "gmail.com" || domain === "googlemail.com") local = local.replace(/\./g, "");
  return createHash("sha256").update(`free-report:${local}@${domain}`, "utf8").digest("hex");
}

interface IntakeReply {
  ok?: boolean;
  reason?: string;
  used?: number;
  price?: { sku: string; amount_cents: number; label: string };
  next?: string;
  payHref?: string;
  analysisId?: string | null;
  freeReport?: { sequenceNo: number | null; remaining: number; queued: boolean; emailTo: string | null } | null;
}

/** GET /api/analyses/[id]/full-report (G28-C shape) — only what the lane reads. */
interface FullReportPoll {
  ok?: boolean;
  status?: string | null;
  kind?: "v2" | "s32";
  report?: unknown;
  reportV2?: {
    tier?: string;
    source?: string;
    cover?: { svi?: { band?: string } };
    dimensions?: unknown[];
    quality?: { degradedSections?: string[] };
  } & Record<string, unknown>;
  error?: string | null;
  emailedAt?: string | null;
}

const IDEA = { text: "A marketplace for surplus building materials in regional NSW — contractors list leftover stock, builders buy at a discount." };

test.describe("43 — free allowance (G25-C)", () => {
  test("guest without an address → 400 email_required; disposable → 400; honeypot → 400 — nothing runs", async ({ qa, credits }, testInfo) => {
    const before = await credits.snapshot();
    const anon = await anonRequest(qa.baseURL);
    try {
      const none = await post<IntakeReply>(anon, "/api/intake", { ...IDEA, tier: "free" });
      const disposable = await post<IntakeReply>(anon, "/api/intake", { ...IDEA, tier: "free", email: "someone@mailinator.com" });
      const bot = await post<IntakeReply>(anon, "/api/intake", { ...IDEA, tier: "free", email: qa.email, company_website: "https://spam.example" });
      await evidence(testInfo, "gate refusals", { none: { status: none.status, body: none.body }, disposable: { status: disposable.status, body: disposable.body }, bot: { status: bot.status, body: bot.body } });
      expect(none.status).toBe(400);
      expect(none.body.reason).toBe("email_required");
      expect(none.body.analysisId ?? null).toBeNull();
      expect(disposable.status).toBe(400);
      expect(disposable.body.reason).toBe("email_disposable");
      expect(bot.status).toBe(400);
      expect(bot.body.reason).toBe("email_invalid");
    } finally {
      await anon.dispose();
    }
    await credits.assertUnchanged(before, "gate refusals");
  });

  // G28-C — the free run IS the v3 document: the ReportV2 pipeline (the paid
  // Trusted Business Report's) runs on the row, the poll carries `kind: "v2"`
  // + `reportV2` (8 chapters), the PDF is the TBR twin, and the ledger row is
  // stamped `sent` when the e-mail (investment view + signed page / PDF links)
  // goes out. Spend: two standard-tier runs (~US$0.07 each) — behind the flag.
  test("with LIVE_QA_SPEND_OK: signed-in first run → free report 1 of 2 = the v3 document (poll, PDF, ledger sent); second → 2 of 2 (real runs)", async ({ api, qa, credits }, testInfo) => {
    test.skip(!env.spendOk, "LIVE_QA_SPEND_OK unset — a real free run writes a full Trusted Business Report (model spend)");
    test.setTimeout(20 * 60_000);
    const before = await credits.snapshot();
    const first = await post<IntakeReply>(api, "/api/intake", { ...IDEA, tier: "free" }, { timeoutMs: 120_000 });
    const second = await post<IntakeReply>(api, "/api/intake", { ...IDEA, tier: "free" }, { timeoutMs: 120_000 });
    await evidence(testInfo, "two free runs", { first: { status: first.status, freeReport: first.body.freeReport, analysisId: first.body.analysisId }, second: { status: second.status, freeReport: second.body.freeReport } });
    expect(first.status).toBe(200);
    expect(first.body.ok).toBe(true);
    expect(first.body.freeReport?.sequenceNo).toBe(1);
    expect(first.body.freeReport?.remaining).toBe(1);
    expect(second.body.freeReport?.sequenceNo).toBe(2);
    expect(second.body.freeReport?.remaining).toBe(0);
    if (dbAllowed() && freeReportGrantsTableExists()) expect(countFreeReportGrants(qa.email)).toBe(2);
    await credits.assertUnchanged(before, "two free runs never touch credits");

    // The first row: poll until the pipeline lands (≤ 12 min), then the document.
    const id = first.body.analysisId;
    expect(typeof id).toBe("string");
    let view: FullReportPoll = {};
    await expect.poll(async () => {
      const r = await json<FullReportPoll>(api, "GET", `/api/analyses/${id}/full-report`);
      view = r.body;
      return r.body.status;
    }, { timeout: 12 * 60_000, intervals: [10_000, 15_000, 20_000] }).toMatch(/^(done|failed)$/);
    await evidence(testInfo, "free run 1 — the v3 document", {
      status: view.status,
      kind: view.kind,
      error: view.error ?? null,
      chapters: view.reportV2?.dimensions?.length ?? null,
      sections: view.reportV2 ? Object.keys(view.reportV2) : null,
      degraded: view.reportV2?.quality?.degradedSections ?? null,
      band: view.reportV2?.cover?.svi?.band ?? null,
      emailedAt: view.emailedAt ?? null,
    });
    // G33-T02 (24/09 live test): a failed or empty run is the product being down,
    // not a lane bug to annotate away — it fails the lane unless the operator
    // explicitly runs an outage drill with LIVE_QA_ALLOW_DEGRADED=1.
    const degradedCount = Array.isArray(view.reportV2?.quality?.degradedSections) ? view.reportV2!.quality!.degradedSections!.length : null;
    if (env.allowDegraded && (view.status === "failed" || (degradedCount ?? 0) > 1)) {
      testInfo.annotations.push({ type: "not-exercised", description: `free run 1 ${view.status === "failed" ? `failed (${view.error ?? "no error"})` : `degraded ${degradedCount}/8`} — accepted under LIVE_QA_ALLOW_DEGRADED` });
      return;
    }
    expect(view.status, `free run 1 failed on the live pipeline: ${view.error ?? "no error"}`).toBe("done");
    expect(degradedCount, "free run 1 degraded chapters (≤ 1 allowed)").not.toBeNull();
    expect(degradedCount!).toBeLessThanOrEqual(1);
    expect(view.kind).toBe("v2");
    expect(view.report ?? null).toBeNull();
    expect(view.reportV2?.dimensions).toHaveLength(8);
    for (const key of ["cover", "executive", "valuation", "dimensions", "phaseGates", "moneyOnTable", "actionPlan", "appendix"]) expect(view.reportV2).toHaveProperty(key);
    expect(view.reportV2?.tier).toBe("standard");
    expect(view.reportV2?.source).toBe("pipeline");

    // The PDF twin, through the cookie path.
    const pdf = await api.get(`/api/analyses/${id}/report.pdf`, { timeout: 120_000 });
    await evidence(testInfo, "free run 1 — PDF", { status: pdf.status(), type: pdf.headers()["content-type"], disposition: pdf.headers()["content-disposition"], bytes: (await pdf.body()).byteLength });
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-type"]).toContain("application/pdf");
    expect(pdf.headers()["content-disposition"]).toContain("blockid-business-report");

    // The ledger: grant 1 attached to the row and stamped `sent` once the e-mail went out.
    if (dbAllowed() && freeReportGrantsTableExists()) {
      await expect.poll(() => freeReportGrantDelivery(qa.email, 1)?.status ?? null, { timeout: 3 * 60_000, intervals: [5_000, 10_000] }).toBe("sent");
      expect(freeReportGrantDelivery(qa.email, 1)?.analysisId).toBe(id);
    }
  });

  test("structure (no spend): a signed-link probe never leaks — unknown id + bad token → 404 on the poll, the PDF and the page", async ({ qa }, testInfo) => {
    const anon = await anonRequest(qa.baseURL);
    try {
      const id = "0d4f7c1e-9b2a-4c3d-8e5f-6a7b8c9d0e1f";
      const poll = await json<Record<string, unknown>>(anon, "GET", `/api/analyses/${id}/full-report?token=1.nope`);
      const pdf = await anon.get(`/api/analyses/${id}/report.pdf?token=1.nope`);
      const row = await json<Record<string, unknown>>(anon, "GET", `/api/analyses/${id}?token=1.nope`);
      const page = await anon.get(`/analyze/${id}?t=1.nope`);
      await evidence(testInfo, "signed-link probe", { poll: poll.status, pdf: pdf.status(), row: row.status, page: page.status() });
      expect(poll.status).toBe(404);
      expect(pdf.status()).toBe(404);
      expect(row.status).toBe(404);
      // The shell renders (the client fetch then lands on the one "not found" panel).
      expect(page.status()).toBe(200);
    } finally {
      await anon.dispose();
    }
  });

  test("third run → 200 free_allowance_used with the A$3 quote, as a guest AND as the account (never double-granted); nothing runs", async ({ api, qa, credits }, testInfo) => {
    test.skip(!dbAllowed(), "LIVE_QA_ALLOW_DB unset — the two free reports are seeded in the ledger, not run");
    test.skip(!freeReportGrantsTableExists(), "free_report_grants is not in the database yet — apply supabase/migrations/0439_free_report_grants.sql");
    const before = await credits.snapshot();
    const seeded = seedFreeReportGrants(qa.email, emailHashFor(qa.email));
    expect(seeded, "two rows for the QA address").toBeGreaterThanOrEqual(2);

    const anon = await anonRequest(qa.baseURL);
    try {
      const guest = await post<IntakeReply>(anon, "/api/intake", { ...IDEA, tier: "free", email: qa.email.toUpperCase() });
      const account = await post<IntakeReply>(api, "/api/intake", { ...IDEA, tier: "free" });
      await evidence(testInfo, "third run = the quote", { guest: { status: guest.status, body: guest.body }, account: { status: account.status, body: account.body } });
      for (const r of [guest, account]) {
        expect(r.status).toBe(200);
        expect(r.body.ok).toBe(false);
        expect(r.body.reason).toBe("free_allowance_used");
        expect(r.body.used).toBe(2);
        expect(r.body.next).toBe("pay");
        expect(r.body.price).toEqual({ sku: "sku_trust_report_5aud", amount_cents: 300, label: "A$3 inc. GST" });
        expect(r.body.payHref).toBe("/workspace/reports/business");
        expect(r.body.analysisId ?? null).toBeNull();
      }
    } finally {
      await anon.dispose();
    }
    await credits.assertUnchanged(before, "the quote spends nothing");
  });

  test("trusted /api/status carries free_reports with the ledger counted; /admin/funnel is founder-denied", async ({ api, qa }, testInfo) => {
    const token = process.env.STATUS_FULL_TOKEN || process.env.CRON_SECRET || "";
    test.skip(!token, "needs STATUS_FULL_TOKEN or CRON_SECRET (qa-live.sh loads .env.runtime) for the trusted payload");
    const anon = await anonRequest(qa.baseURL);
    try {
      const r = await json<{ free_reports?: Record<string, unknown> }>(anon, "GET", "/api/status", undefined, { Authorization: `Bearer ${token}` });
      const pub = await json<Record<string, unknown>>(anon, "GET", "/api/status");
      await evidence(testInfo, "status free_reports", { status: r.status, free_reports: r.body.free_reports ?? null, publicHasBlock: pub.body.free_reports !== undefined });
      expect(r.status).toBe(200);
      expect(r.body).toHaveProperty("free_reports");
      const fr = r.body.free_reports as Record<string, unknown>;
      expect(Object.keys(fr).sort()).toEqual(["cap", "converted_to_paid", "delivered", "last_7_days", "submitted", "today", "unique_emails"]);
      expect(typeof fr.cap).toBe("number");
      expect(Array.isArray(fr.last_7_days) && (fr.last_7_days as unknown[]).length === 7).toBe(true);
      if (dbAllowed() && freeReportGrantsTableExists() && countFreeReportGrants(qa.email) >= 2) {
        // The trusted payload caches the ledger for 60 s (FREE_REPORT_METRICS_CACHE_MS) — the rows seeded
        // a moment ago may sit behind a colder snapshot. Poll until the cache turns over.
        await expect.poll(async () => {
          const again = await json<{ free_reports?: Record<string, unknown> }>(anon, "GET", "/api/status", undefined, { Authorization: `Bearer ${token}` });
          return Number((again.body.free_reports as Record<string, unknown> | undefined)?.submitted ?? 0);
        }, { timeout: 90_000, intervals: [5_000, 10_000, 15_000] }).toBeGreaterThanOrEqual(2);
        expect(fr.unique_emails as number).toBeGreaterThanOrEqual(0);
      }
      expect(pub.body, "the public payload never carries the ledger").not.toHaveProperty("free_reports");
      // The admin block is admin-only: the founder account is sent away.
      const admin = await api.get("/admin/funnel", { maxRedirects: 0 });
      expect([302, 303, 307, 308, 403, 404]).toContain(admin.status());
    } finally {
      await anon.dispose();
    }
  });

  test("erasure covers the ledger: the account erase dry-run lists free_report_grants (0440); rows go with the teardown's --write", async ({ qa }, testInfo) => {
    test.skip(!dbAllowed(), "LIVE_QA_ALLOW_DB unset");
    test.skip(!freeReportGrantsTableExists(), "free_report_grants is not in the database yet (0439)");
    const rows = countFreeReportGrants(qa.email);
    const envFile = existsSync(path.join(WEB_DIR, ".env")) ? ["--env-file=.env"] : [];
    const r = spawnSync("node", [...envFile, "scripts/db/erase-account.mjs", "--email", qa.email, "--dry-run", "--json"], { cwd: WEB_DIR, encoding: "utf8", timeout: 120_000 });
    const out = `${r.stdout ?? ""}`.trim();
    let step: { table: string; rows?: number; skipped?: string } | null = null;
    try {
      const report = JSON.parse(out.slice(out.indexOf("{"))) as { steps?: Array<{ table: string; rows?: number; skipped?: string }> };
      step = report.steps?.find((s) => s.table === "free_report_grants") ?? null;
    } catch {
      step = null;
    }
    await evidence(testInfo, "erase dry-run", { exit: r.status, rowsBefore: rows, step, stderr: (r.stderr ?? "").slice(0, 400) });
    expect(r.status, "dry-run ran against the QA account").toBe(0);
    if (!step) {
      // 0440 not applied yet: the RPC does not know the table. Say so, and
      // clean the seeded rows ourselves so nothing is left behind.
      testInfo.annotations.push({ type: "not-exercised", description: "erase_account() predates 0440 — free_report_grants not in the erasure map yet; seeded rows removed by the lane" });
      const removed = deleteFreeReportGrants(qa.email);
      expect(countFreeReportGrants(qa.email)).toBe(0);
      await evidence(testInfo, "lane cleanup", { removed });
      return;
    }
    expect(step.skipped ?? null).toBeNull();
    expect(step.rows ?? 0).toBe(rows);
  });
});
