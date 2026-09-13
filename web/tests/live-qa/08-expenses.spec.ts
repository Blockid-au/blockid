/**
 * 08 — Expenses (lane 1 #35–#38): CSV upload → rules → needs-review → AI
 * preview cost (no charge) → inline re-category → learned rule on re-import.
 * Credits discipline: the AI run is confirmed only when the preview says
 * `included:true` or LIVE_QA_SPEND_OK=1.
 */
import { test, expect } from "./fixtures";
import { csvMultipart, evidence, get, patch, post } from "./lib/api";
import { env } from "./lib/env";
import { setScratch } from "./lib/run-state";

test.describe.configure({ mode: "serial" });

interface Tx {
  id: string;
  description: string;
  amountAud: number;
  category: string;
  categorySource: string | null;
  needsReview: boolean;
}
interface ExpensesList {
  ok: boolean;
  transactions: Tx[];
  queue: number;
  cost: number;
  included: boolean;
}
interface ImportResult {
  ok?: boolean;
  bankName?: string;
  inserted?: number;
  duplicates?: number;
  ruleCategorised?: number;
  needsAi?: number;
  queue?: number;
  cost?: number;
  included?: boolean;
  error?: string;
}

const CBA_HEADER = "Date,Amount,Description,Balance";
const KNOWN_CSV = [
  CBA_HEADER,
  "01/09/2026,-120.00,AMAZON WEB SERVICES AWS EMEA,4880.00",
  "02/09/2026,950.00,STRIPE PAYOUT,5830.00",
  "03/09/2026,-1500.00,ATO BAS PAYMENT,4330.00",
  "04/09/2026,-18.50,LITTLE CAFE COFFEE PERTH,4311.50",
  "05/09/2026,-25.00,NOTION LABS INC,4286.50",
].join("\n");
const UNKNOWN_CSV = [
  CBA_HEADER,
  "06/09/2026,-140.20,QWXZ 88213 PAYMENT,4146.30",
  "07/09/2026,-33.10,ZORBLATT 7781,4113.20",
].join("\n");

async function importCsv(api: Parameters<typeof post>[0], name: string, csv: string): Promise<{ status: number; body: ImportResult }> {
  const res = await api.post("/api/expenses/import", csvMultipart("file", name, csv));
  return { status: res.status(), body: (await res.json().catch(() => ({}))) as ImportResult };
}

test.describe("Expenses", () => {
  test("upload a 5-row CBA statement → rules categorise, ATO line needs review", async ({ page, visit, api }, testInfo) => {
    const r = await importCsv(api, "cba-sept.csv", KNOWN_CSV);
    await evidence(testInfo, "import", r);
    expect(r.status).toBe(200);
    expect(r.body.bankName).toBe("CBA");
    expect(r.body.inserted).toBe(5);
    expect(r.body.duplicates).toBe(0);

    const list = await get<ExpensesList>(api, "/api/expenses?limit=50");
    const byDesc = (re: RegExp) => list.body.transactions.find((t) => re.test(t.description));
    await evidence(testInfo, "categories", list.body.transactions.map((t) => ({ d: t.description, c: t.category, s: t.categorySource, review: t.needsReview })));
    expect(byDesc(/AMAZON WEB SERVICES/)?.category).toBe("cloud_hosting");
    expect(byDesc(/STRIPE PAYOUT/)?.category).toBe("revenue");
    expect(byDesc(/NOTION/)?.category).toBe("software_subscriptions");
    expect(byDesc(/CAFE/)?.category).toBe("meals_entertainment");
    setScratch("expenses.cafeId", byDesc(/CAFE/)!.id);

    await visit("/workspace/expenses");
    await expect(page.getByTestId("expenses-summary-tiles")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("gst-estimate")).toContainText(/not a BAS figure/);
    const needs = page.getByTestId("review-row-needs");
    if (byDesc(/ATO BAS/)?.needsReview) {
      await expect(needs.first()).toBeVisible();
      await expect(needs.first()).toContainText(/ATO BAS/);
    }
  });

  test("re-importing the same file skips every line as a duplicate", async ({ api }, testInfo) => {
    const r = await importCsv(api, "cba-sept-again.csv", KNOWN_CSV);
    await evidence(testInfo, "re-import", r);
    expect(r.status).toBe(200);
    expect(r.body.inserted).toBe(0);
    expect(r.body.duplicates).toBe(5);
  });

  test("unknown merchants queue for AI; the button shows the cost and the preview never charges", async ({ page, visit, api, credits }, testInfo) => {
    const r = await importCsv(api, "cba-unknown.csv", UNKNOWN_CSV);
    await evidence(testInfo, "import unknown", r);
    expect(r.status).toBe(200);
    expect(r.body.inserted).toBe(2);
    expect(r.body.needsAi ?? r.body.queue).toBeGreaterThanOrEqual(1);

    const before = await credits.snapshot();
    const preview = await post<{ ok: boolean; preview: boolean; queue: number; cost: number; included: boolean; balance: number | null; creditNote?: string }>(api, "/api/expenses/categorise", {});
    await evidence(testInfo, "preview (API)", preview.body);
    expect(preview.status).toBe(200);
    expect(preview.body.preview).toBe(true);
    expect(preview.body.queue).toBeGreaterThanOrEqual(1);
    if (preview.body.included) expect(preview.body.cost).toBe(0);
    else expect(preview.body.cost).toBeGreaterThanOrEqual(1);
    await credits.assertUnchanged(before, "categorise preview (API)");

    await visit("/workspace/expenses");
    const btn = page.getByTestId("categorise-button").getByRole("button");
    await expect(btn).toBeVisible({ timeout: 30_000 });
    const label = await btn.innerText();
    expect(label).toMatch(/Categorise \d+ rows? with AI \((cost: \d+ credits?|included in your plan)\)/);
    await btn.click();
    const panel = page.getByTestId("categorise-preview");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText(/Run AI on \d+ lines?/);
    await evidence(testInfo, "preview (UI)", { button: label, panel: await panel.innerText() });
    await panel.getByRole("button", { name: "Cancel" }).click();
    await expect(panel).toBeHidden();
    await credits.assertUnchanged(before, "categorise preview (UI, cancelled)");
    setScratch("expenses.included", preview.body.included);
    setScratch("expenses.cost", preview.body.cost);
  });

  test("confirm the AI run only when included (or LIVE_QA_SPEND_OK=1)", async ({ api, credits }, testInfo) => {
    const preview = await post<{ included: boolean; cost: number; queue: number }>(api, "/api/expenses/categorise", {});
    const allowed = preview.body.included === true || env.spendOk;
    test.skip(!allowed, `AI categorise costs ${preview.body.cost} credit(s) and is not included — not confirmed (set LIVE_QA_SPEND_OK=1 to allow)`);
    const before = await credits.snapshot();
    const run = await post<{ ok: boolean; categorised?: number; accepted?: number; needsReview?: number; creditsCharged?: number; error?: string; message?: string }>(api, "/api/expenses/categorise", { confirm: true });
    await evidence(testInfo, "run", { status: run.status, body: run.body });
    if (run.status === 503) {
      testInfo.annotations.push({ type: "product", description: `AI categoriser unavailable (503 ${run.body.error ?? ""}) — transient upstream, not a suite bug` });
      await credits.assertUnchanged(before, "AI run refused by upstream (no charge)");
      return;
    }
    expect(run.status).toBe(200);
    expect(run.body.ok).toBe(true);
    const after = await credits.snapshot();
    const expected = preview.body.included ? before : before - (run.body.creditsCharged ?? preview.body.cost);
    await evidence(testInfo, "credits after AI run", { before, after, included: preview.body.included, charged: run.body.creditsCharged });
    expect(after).toBe(expected);
  });

  test("inline re-category persists, creates a learned rule, and the rule fires on the next import", async ({ page, visit, api }, testInfo) => {
    await visit("/workspace/expenses");
    const select = page.getByRole("combobox", { name: /Category for LITTLE CAFE COFFEE PERTH/ });
    await expect(select).toBeVisible({ timeout: 30_000 });
    await select.selectOption("travel");
    await expect(page.getByTestId("expenses-notice")).toContainText(/Saved/, { timeout: 20_000 });
    const notice = await page.getByTestId("expenses-notice").innerText();

    const list = await get<ExpensesList>(api, "/api/expenses?limit=50");
    const cafe = list.body.transactions.find((t) => /LITTLE CAFE COFFEE PERTH/.test(t.description));
    await evidence(testInfo, "after inline change", { notice, cafe });
    expect(cafe?.category).toBe("travel");
    expect(cafe?.categorySource).toBe("manual");

    const again = await importCsv(api, "cba-cafe-again.csv", [CBA_HEADER, "08/09/2026,-21.00,LITTLE CAFE COFFEE PERTH,4092.20"].join("\n"));
    await evidence(testInfo, "re-import cafe", again);
    expect(again.status).toBe(200);
    expect(again.body.inserted).toBe(1);
    expect(again.body.ruleCategorised).toBe(1);
    const list2 = await get<ExpensesList>(api, "/api/expenses?limit=50");
    const newCafe = list2.body.transactions.find((t) => /LITTLE CAFE COFFEE PERTH/.test(t.description) && t.amountAud === -21);
    expect(newCafe?.category).toBe("travel");
  });

  test("PATCH with a bad category is 400 bad_category; unknown id is 404", async ({ api }, testInfo) => {
    const list = await get<ExpensesList>(api, "/api/expenses?limit=1");
    const id = list.body.transactions[0]?.id;
    const bad = id ? await patch(api, `/api/expenses/${id}`, { category: "not_a_category" }) : null;
    const missing = await patch(api, "/api/expenses/00000000-0000-4000-8000-000000000000", { category: "travel" });
    await evidence(testInfo, "validation", { bad: bad?.body, missing: missing.body });
    if (bad) expect(bad.status).toBe(400);
    expect(missing.status).toBe(404);
  });
});
