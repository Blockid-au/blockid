/**
 * 03 — Cap table (lane 1 #16–#18): build a class + two shareholders (UI +
 * API), share-price card provenance (F3 fix: no fabricated SVI 100), board
 * resolution preview shows the cost first and never charges.
 * Growth-only (page gate cap_table.write, API gate share_management).
 */
import { test, expect } from "./fixtures";
import { evidence, get, post } from "./lib/api";
import { setScratch } from "./lib/run-state";



interface CapTable {
  ok: boolean;
  shareClasses: Array<{ id: string; name: string }>;
  shareholders: Array<{ id: string; name: string; shares_held: number; ownership_pct: number; role?: string }>;
  summary: { totalIssued: number; fullyDilutedTotal: number };
}

test.describe("Cap table", () => {
  test("page opens on Growth and the Ordinary class is created (UI)", async ({ page, visit, growth, api }, testInfo) => {
    void growth;
    const existing = await get<CapTable>(api, "/api/cap-table");
    expect(existing.status).toBe(200);
    await visit("/workspace/cap-table");
    await expect(page).toHaveURL(/\/workspace\/cap-table/);
    await expect(page.getByRole("heading", { name: "Cap Table" })).toBeVisible({ timeout: 30_000 });

    if (!existing.body.shareClasses.some((c) => c.name === "Ordinary")) {
      const classesToggle = page.getByRole("button", { name: /^Share Classes/ });
      if (await classesToggle.count()) {
        const open = await page.getByRole("button", { name: /^Add Class$/ }).count();
        if (!open) await classesToggle.click();
      }
      await page.getByRole("button", { name: /^Add Class$/ }).first().click();
      await expect(page.getByRole("heading", { name: "Add Share Class" })).toBeVisible();
      await page.getByLabel("Class Name *").fill("Ordinary");
      await page.getByRole("button", { name: /^Add Class$/ }).last().click();
    }
    await expect.poll(async () => (await get<CapTable>(api, "/api/cap-table")).body.shareClasses.some((c) => c.name === "Ordinary"), { timeout: 30_000 }).toBe(true);
    const ct = await get<CapTable>(api, "/api/cap-table");
    setScratch("capTable.ordinaryClassId", ct.body.shareClasses.find((c) => c.name === "Ordinary")!.id);
    await evidence(testInfo, "share classes", ct.body.shareClasses);
  });

  test("add the founder through the form and the co-founder through the API → 70 % / 30 %", async ({ page, visit, growth, api, qa }, testInfo) => {
    void growth;
    const classId = qa.scratch["capTable.ordinaryClassId"] as string | undefined;
    const before = await get<CapTable>(api, "/api/cap-table");
    if (!before.body.shareholders.some((s) => s.name === "QA Founder")) {
      await visit("/workspace/cap-table");
      await page.getByRole("button", { name: /Add Shareholder/ }).first().click();
      await expect(page.getByRole("heading", { name: "Add Shareholder" })).toBeVisible();
      await page.getByLabel("Name *").fill("QA Founder");
      await page.getByLabel("Email").fill(qa.email);
      await page.getByLabel("Role").selectOption("founder");
      if (classId) await page.getByLabel("Share Class").selectOption(classId);
      await page.getByLabel("Shares").fill("700000");
      await page.getByRole("button", { name: /^Add Shareholder$/ }).last().click();
      await expect.poll(async () => (await get<CapTable>(api, "/api/cap-table")).body.shareholders.some((s) => s.name === "QA Founder"), { timeout: 30_000 }).toBe(true);
    }
    if (!before.body.shareholders.some((s) => s.name === "Sam Cofounder")) {
      const r = await post(api, "/api/cap-table", {
        action: "add_shareholder",
        data: { name: "Sam Cofounder", email: "sam.cofounder@example.com", role: "co-founder", shareClassId: classId, sharesHeld: 300000, pricePerShare: 0.001, roundName: "Founding" },
      });
      await evidence(testInfo, "POST add_shareholder", { status: r.status, body: r.body });
      expect(r.status).toBe(201);
    }
    const ct = await get<CapTable>(api, "/api/cap-table");
    const founder = ct.body.shareholders.find((s) => s.name === "QA Founder");
    const sam = ct.body.shareholders.find((s) => s.name === "Sam Cofounder");
    await evidence(testInfo, "cap table", { shareholders: ct.body.shareholders, summary: ct.body.summary });
    expect(founder?.shares_held).toBe(700000);
    expect(sam?.shares_held).toBe(300000);
    expect(Math.round(founder!.ownership_pct)).toBe(70);
    expect(Math.round(sam!.ownership_pct)).toBe(30);
    setScratch("capTable.samId", sam!.id);
    setScratch("capTable.founderId", founder!.id);
  });

  test("share-price card is honest without an SVI score (no fabricated SVI 100 — lane-1 F3 fix)", async ({ page, visit, growth, api }, testInfo) => {
    void growth;
    const sp = await get<{ ok: boolean; sharePrice: { ok: boolean; reason: string | null; sourceLabel?: string; methodNote?: string }; inputs: { svi: number | null } }>(api, "/api/share-price");
    await evidence(testInfo, "GET /api/share-price", sp.body);
    expect(sp.status).toBe(200);
    expect(sp.body.inputs.svi, "a fresh account must not be priced on the column-default SVI of 100").not.toBe(100);
    await visit("/workspace/cap-table");
    const card = page.getByTestId("share-price-card");
    await expect(card).toBeVisible({ timeout: 30_000 });
    const text = await card.innerText();
    await evidence(testInfo, "card", { text, method: await card.getAttribute("data-method") });
    if (sp.body.sharePrice.ok) {
      await expect(card.getByTestId("share-price-source")).toBeVisible();
      expect(sp.body.inputs.svi).not.toBeNull();
    } else {
      await expect(card.getByTestId("share-price-reason")).toBeVisible();
      await expect(card.getByTestId("share-price-mid")).toHaveCount(0);
      expect(text).not.toMatch(/A\$1\.0875/);
    }
  });

  test("board resolution on a share issue: preview shows the cost first, cancel never charges", async ({ page, visit, growth, api, credits }, testInfo) => {
    void growth;
    const issues = await get<{ ok: boolean; issues: Array<{ id: string; allotteeName: string; shares: number }> }>(api, "/api/cap-table/issues");
    await evidence(testInfo, "issues", issues.body);
    expect(issues.status).toBe(200);
    expect(issues.body.issues.length, "share issues exist for the two allotments").toBeGreaterThanOrEqual(1);
    const issue = issues.body.issues[0];
    setScratch("capTable.issueId", issue.id);

    const before = await credits.snapshot();
    const preview = await post<{ ok: boolean; preview: boolean; cost: number; listedCost: number; included: boolean; balance: number | null; creditNote: string }>(api, `/api/board-resolutions/share-issue/${issue.id}`, {});
    await evidence(testInfo, "API preview", preview.body);
    expect(preview.status).toBe(200);
    expect(preview.body.preview).toBe(true);
    expect(preview.body.listedCost).toBe(1);
    expect(preview.body.included).toBe(true); // Growth
    expect(preview.body.cost).toBe(0);
    expect(preview.body.creditNote).not.toMatch(/Charged to your credits/); // lane-2 P3-d fix
    await credits.assertUnchanged(before, "board resolution preview (API)");

    await visit("/workspace/cap-table");
    const section = page.getByTestId("share-issues");
    await expect(section).toBeVisible({ timeout: 30_000 });
    const start = section.getByTestId("board-resolution-start").first();
    await expect(start).toHaveText(/Board resolution/);
    await start.click();
    const panel = page.getByTestId("board-resolution-preview").first();
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId("board-resolution-cost")).toContainText(/Cost: included in your plan/);
    await expect(panel.getByTestId("board-resolution-confirm")).toContainText(/Generate \(included in your plan\)/);
    await evidence(testInfo, "UI preview", { text: await panel.innerText() });
    await panel.getByTestId("board-resolution-cancel").click();
    await expect(panel).toBeHidden();
    await credits.assertUnchanged(before, "board resolution preview (UI, cancelled)");
  });

  test("board resolution for a foreign / unknown record is 404 (lane-2 P3-b fix)", async ({ api, growth }, testInfo) => {
    void growth;
    const r = await get(api, "/api/board-resolutions/share-issue/00000000-0000-4000-8000-000000000000");
    await evidence(testInfo, "foreign GET", { status: r.status, body: r.body });
    expect(r.status).toBe(404);
  });

  test("POST /api/cap-table needs share_management — the Growth account passes, a bad action is 400", async ({ api, growth }, testInfo) => {
    void growth;
    const r = await post(api, "/api/cap-table", { action: "not_an_action", data: {} });
    await evidence(testInfo, "bad action", { status: r.status, body: r.body });
    expect([400, 422]).toContain(r.status);
  });
});
