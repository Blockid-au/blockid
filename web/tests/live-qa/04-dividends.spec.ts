/**
 * 04 — Dividends (lane 1 #4–#10): empty state → record → statements
 * preview (cost line, no charge) → register PDF is application/pdf → DRIP
 * add / preview / revoke → FY tax-statement preview.
 * Builds on the cap table from 03; `ensureCapTable` recreates the minimum
 * via the API when this file is run on its own.
 */
import { test, expect } from "./fixtures";
import { evidence, get, post, del } from "./lib/api";
import { env } from "./lib/env";
import { setScratch } from "./lib/run-state";



interface StatementsList {
  ok: boolean;
  cost: number;
  included: boolean;
  records: Array<{ id: string; period: string; registerUrl: string; totalDividendAud: number; payoutCount: number; statements: unknown[] }>;
}

async function ensureCapTable(api: Parameters<typeof get>[0]): Promise<{ samId: string }> {
  const ct = await get<{ shareClasses: Array<{ id: string; name: string }>; shareholders: Array<{ id: string; name: string }> }>(api, "/api/cap-table");
  let classId = ct.body.shareClasses?.find((c) => c.name === "Ordinary")?.id;
  if (!classId) {
    const c = await post<{ shareClass: { id: string } }>(api, "/api/cap-table", { action: "add_class", data: { name: "Ordinary" } });
    if (c.status !== 201) throw new Error(`add_class → ${c.status} ${c.text.slice(0, 200)}`);
    classId = c.body.shareClass.id;
  }
  const need = [
    { name: "QA Founder", role: "founder", sharesHeld: 700000 },
    { name: "Sam Cofounder", role: "co-founder", sharesHeld: 300000, email: "sam.cofounder@example.com" },
  ];
  for (const s of need) {
    if (ct.body.shareholders?.some((x) => x.name === s.name)) continue;
    const r = await post(api, "/api/cap-table", { action: "add_shareholder", data: { ...s, shareClassId: classId, pricePerShare: 0.001, roundName: "Founding" } });
    if (r.status !== 201) throw new Error(`add_shareholder ${s.name} → ${r.status} ${r.text.slice(0, 200)}`);
  }
  const after = await get<{ shareholders: Array<{ id: string; name: string }> }>(api, "/api/cap-table");
  const sam = after.body.shareholders.find((x) => x.name === "Sam Cofounder");
  if (!sam) throw new Error("Sam Cofounder missing after ensureCapTable");
  setScratch("capTable.samId", sam.id);
  return { samId: sam.id };
}

test.describe("Dividends", () => {
  test("empty state before any dividend is declared (Growth: statements are included)", async ({ page, visit, growth, api }, testInfo) => {
    void growth;
    const list = await get<StatementsList>(api, "/api/dividends/statements");
    await evidence(testInfo, "GET statements", list.body);
    expect(list.status).toBe(200);
    expect(list.body.included).toBe(true);
    await visit("/workspace/finance/dividends");
    await expect(page.getByTestId("dividend-statements-panel")).toBeVisible({ timeout: 30_000 });
    if (list.body.records.length === 0) {
      await expect(page.getByTestId("statements-empty")).toContainText(/No dividend has been declared yet/);
    }
    await expect(page.getByTestId("drip-panel")).toBeVisible();
    await expect(page.getByTestId("annual-tax-statements-panel")).toBeVisible();
  });

  test("record a dividend (A$10,000 of A$20,000 net income, period 2026-06) against the cap table", async ({ api, growth }, testInfo) => {
    void growth;
    await ensureCapTable(api);
    const existing = await get<StatementsList>(api, "/api/dividends/statements");
    let record = existing.body.records.find((r) => r.period === "2026-06");
    if (!record) {
      const r = await post<{ ok: boolean; totalDividend: number; payouts: unknown[]; error?: string }>(api, "/api/dividends", { record: true, netIncome: 20000, distributionPct: 50, period: "2026-06" });
      await evidence(testInfo, "POST /api/dividends", { status: r.status, totalDividend: r.body.totalDividend, payouts: r.body.payouts?.length, error: r.body.error });
      expect(r.status).toBe(200);
      expect(r.body.totalDividend).toBe(10000);
      expect(r.body.payouts).toHaveLength(2);
      const after = await get<StatementsList>(api, "/api/dividends/statements");
      record = after.body.records.find((x) => x.period === "2026-06");
    }
    expect(record, "record listed by /api/dividends/statements").toBeTruthy();
    setScratch("dividends.recordId", record!.id);
    setScratch("dividends.registerUrl", record!.registerUrl);
  });

  test("'Issue statements' shows the cost line before anything is charged; cancel leaves the balance", async ({ page, visit, growth, api, qa, credits }, testInfo) => {
    void growth;
    const recordId = qa.scratch["dividends.recordId"] as string;
    const before = await credits.snapshot();
    const preview = await post<{ ok: boolean; preview: boolean; cost: number; listedCost: number; included: boolean; balance: number | null; creditNote: string; toIssue: string[] }>(api, `/api/dividends/${recordId}/statements`, {});
    await evidence(testInfo, "API preview", preview.body);
    expect(preview.status).toBe(200);
    expect(preview.body.preview).toBe(true);
    expect(preview.body.listedCost).toBe(2);
    expect(preview.body.included).toBe(true);
    expect(preview.body.cost).toBe(0);
    expect(preview.body.creditNote).not.toMatch(/Charged to your credits/);
    await credits.assertUnchanged(before, "statements preview (API)");

    await visit("/workspace/finance/dividends");
    const record = page.getByTestId("dividend-record").filter({ has: page.getByTestId("issue-statements") }).first();
    const issue = record.getByTestId("issue-statements");
    await expect(issue).toBeVisible({ timeout: 30_000 });
    await expect(issue).toContainText(/Issue statements \(included in your plan\)/);
    await issue.click();
    const panel = page.getByTestId("statements-preview");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText(/Confirm before anything is charged/);
    await expect(panel).toContainText(/Cost:\s*included/);
    await expect(panel).not.toContainText(/Charged to your credits/);
    await evidence(testInfo, "UI preview", { text: await panel.innerText() });
    await panel.getByRole("button", { name: "Cancel" }).click();
    await expect(panel).toBeHidden();
    await credits.assertUnchanged(before, "statements preview (UI, cancelled)");
  });

  test("confirm issuing the statements only because it is included (or LIVE_QA_SPEND_OK=1)", async ({ api, growth, qa, credits }, testInfo) => {
    void growth;
    const recordId = qa.scratch["dividends.recordId"] as string;
    const preview = await post<{ included: boolean; cost: number; toIssue: string[] }>(api, `/api/dividends/${recordId}/statements`, {});
    const allowed = preview.body.included === true || env.spendOk;
    test.skip(!allowed, `issuing costs ${preview.body.cost} credit(s) and is not included — not confirmed`);
    if (preview.body.toIssue.length === 0) {
      testInfo.annotations.push({ type: "note", description: "statements already issued for this record" });
      return;
    }
    const before = await credits.snapshot();
    const r = await post<{ ok: boolean; issuedCount: number; failedCount: number; creditsCharged: number; error?: string }>(api, `/api/dividends/${recordId}/statements`, { confirm: true });
    await evidence(testInfo, "confirm", { status: r.status, issued: r.body.issuedCount, failed: r.body.failedCount, charged: r.body.creditsCharged, error: r.body.error });
    expect(r.status).toBe(200);
    expect(r.body.issuedCount).toBeGreaterThanOrEqual(1);
    expect(r.body.failedCount ?? 0).toBe(0);
    if (preview.body.included) await credits.assertUnchanged(before, "included statements issue");
  });

  test("register PDF download responds with application/pdf", async ({ api, growth, qa }, testInfo) => {
    void growth;
    const url = qa.scratch["dividends.registerUrl"] as string;
    const res = await api.get(url, { headers: { accept: "application/pdf" } });
    const buf = await res.body();
    await evidence(testInfo, "register.pdf", { url, status: res.status(), contentType: res.headers()["content-type"], disposition: res.headers()["content-disposition"], bytes: buf.length, magic: buf.subarray(0, 5).toString("latin1") });
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toMatch(/application\/pdf/);
    expect(res.headers()["content-disposition"]).toMatch(/dividend-register-2026-06\.pdf/);
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(5_000);
  });

  test("DRIP: add a 40 % election for Sam → row + next-allocation preview → revoke", async ({ page, visit, growth, api, qa }, testInfo) => {
    void growth;
    const samId = qa.scratch["capTable.samId"] as string;
    expect(samId, "Sam's shareholder id from the cap table").toBeTruthy();
    // Start clean if a previous attempt in this run left an active election.
    const current = await get<{ elections: Array<{ id: string; shareholderId?: string; shareholder_id?: string; active: boolean }> }>(api, "/api/dividends/drip/elections");
    for (const e of current.body.elections ?? []) if (e.active) await del(api, "/api/dividends/drip/elections", { id: e.id });

    await visit("/workspace/finance/dividends");
    const drip = page.getByTestId("drip-panel");
    await drip.getByTestId("drip-add").click();
    await expect(drip.getByTestId("drip-form")).toBeVisible();
    await drip.getByTestId("drip-shareholder").selectOption(samId);
    await drip.getByTestId("drip-pct").fill("40");
    await drip.getByTestId("drip-save").click();
    const row = drip.getByTestId("drip-election-row").filter({ hasText: "Sam Cofounder" }).first();
    await expect(row).toBeVisible({ timeout: 30_000 });
    await expect(row).toHaveAttribute("data-active", "1");
    await expect(row).toContainText(/40/);
    const previewVisible = await drip.getByTestId("drip-preview").isVisible().catch(() => false);
    const previewText = previewVisible ? await drip.getByTestId("drip-preview").innerText() : null;
    await evidence(testInfo, "after add", { row: await row.innerText(), preview: previewText, notice: await drip.getByTestId("drip-notice-ok").innerText().catch(() => null) });
    if (previewVisible) expect(previewText).toMatch(/Next allocation — dividend 2026-06/);

    await row.getByTestId("drip-revoke").click();
    await expect(row).toHaveAttribute("data-active", "0", { timeout: 30_000 });
    await expect(row).toContainText(/Revoked/);
    await expect(row.getByTestId("drip-revoke")).toHaveCount(0);
    const after = await get<{ elections: Array<{ active: boolean }> }>(api, "/api/dividends/drip/elections");
    await evidence(testInfo, "after revoke", after.body.elections);
    expect(after.body.elections.some((e) => e.active)).toBe(false);
  });

  test("DRIP API: foreign shareholder is 404, participation > 100 is 400", async ({ api, growth }, testInfo) => {
    void growth;
    const foreign = await post(api, "/api/dividends/drip/elections", { shareholderId: "00000000-0000-4000-8000-000000000000", participationPct: 10 });
    const range = await post(api, "/api/dividends/drip/elections", { shareholderId: "00000000-0000-4000-8000-000000000000", participationPct: 120 });
    await evidence(testInfo, "validation", { foreign: foreign.body, range: range.body });
    expect(foreign.status).toBe(404);
    expect(range.status).toBe(400);
  });

  test("annual tax statements: FY picker, preview is cost-first and never charges", async ({ page, visit, growth, api, credits }, testInfo) => {
    void growth;
    const before = await credits.snapshot();
    const fyList = await get<{ ok: boolean; fy: string; options: string[]; cost: number; listedCost: number; included: boolean; shareholders: unknown[] }>(api, "/api/dividends/tax-statements?fy=2025-26");
    await evidence(testInfo, "GET tax-statements 2025-26", fyList.body);
    expect(fyList.status).toBe(200);
    expect(fyList.body.listedCost).toBe(2);
    expect(fyList.body.included).toBe(true);
    expect(fyList.body.cost).toBe(0); // lane-2 P3-e fix: `cost` is what the caller pays

    const preview = await post<{ ok: boolean; preview?: boolean; cost?: number; included?: boolean; toGenerate?: string[]; error?: string; message?: string; creditNote?: string }>(api, "/api/dividends/tax-statements", { fy: "2025-26" });
    await evidence(testInfo, "POST preview", preview.body);
    expect([200, 409]).toContain(preview.status);
    if (preview.status === 200) {
      expect(preview.body.preview).toBe(true);
      expect(preview.body.cost).toBe(0);
    } else {
      expect(preview.body.error).toBe("no_statements");
    }
    const bad = await post(api, "/api/dividends/tax-statements", { fy: "nope" });
    expect(bad.status).toBe(400);
    await credits.assertUnchanged(before, "tax statements preview (API)");

    await visit("/workspace/finance/dividends");
    const panel = page.getByTestId("annual-tax-statements-panel");
    const picker = panel.getByTestId("tax-fy-picker");
    await expect(picker).toBeVisible({ timeout: 30_000 });
    await picker.selectOption({ value: "2025-26" });
    const generate = panel.getByTestId("generate-tax-statements");
    if (await generate.count()) {
      await expect(generate).toContainText(/included in your plan/);
      await generate.click();
      const p = panel.getByTestId("tax-preview");
      await expect(p).toBeVisible();
      await expect(p).toContainText(/Confirm before anything is charged/);
      await expect(p).toContainText(/Cost:\s*included/);
      await evidence(testInfo, "UI preview", { text: await p.innerText() });
      await p.getByRole("button", { name: "Cancel" }).click();
      await expect(p).toBeHidden();
    } else {
      await expect(panel.getByTestId("tax-empty")).toContainText(/No distribution statement was paid in FY 2025-26/);
    }
    await credits.assertUnchanged(before, "tax statements preview (UI)");
  });
});
