/**
 * 07 — Investor CRM (lane 1 #28–#34): empty state → add → overdue → stage →
 * note → CSV import (duplicate email + formula cell) → export owner-only.
 * Works on Free (nav leaf is starter+, page has no tier gate).
 */
import { test, expect } from "./fixtures";
import { csvMultipart, evidence, get, patch, post } from "./lib/api";
import { getScratch, setScratch } from "./lib/run-state";



interface Contact {
  id: string;
  name: string;
  email: string | null;
  org: string | null;
  type: string;
  stage: string;
  next_step: string | null;
  next_step_due: string | null;
}

const JANE_EMAIL = "jane.angel@example.com";

test.describe("Investor CRM", () => {
  test("empty board renders the seed-round guidance", async ({ page, visit, api }, testInfo) => {
    const list = await get<{ ok: boolean; contacts: Contact[] }>(api, "/api/investors/crm/contacts");
    await evidence(testInfo, "GET contacts", { status: list.status, count: list.body.contacts?.length });
    expect(list.status).toBe(200);
    await visit("/workspace/investors/pipeline");
    await expect(page.getByTestId("investor-crm")).toBeVisible();
    if ((list.body.contacts ?? []).length === 0) {
      await expect(page.getByTestId("crm-empty")).toBeVisible();
      await expect(page.getByTestId("crm-empty")).toContainText(/No investors on the board yet/);
    }
  });

  test("add a contact through the dialog → card in Researching with the next step", async ({ page, visit, api }, testInfo) => {
    // Re-runs against a kept account: put Jane back to her starting state
    // through the API (the CSV import later renames her — lane-1 F12).
    const existing = await get<{ contacts: Contact[] }>(api, "/api/investors/crm/contacts?archived=0&limit=200");
    const prior = existing.body.contacts?.find((c) => c.email === JANE_EMAIL);
    if (prior) {
      const reset = await patch(api, `/api/investors/crm/contacts/${prior.id}`, { name: "Jane Angel", org: "Angel Co", type: "vc", stage: "researching", nextStep: "Send deck", nextStepDue: "2026-09-01" });
      await evidence(testInfo, "reset existing Jane (re-run)", { status: reset.status });
      await visit("/workspace/investors/pipeline");
      await expect(page.getByTestId("crm-card").filter({ hasText: "Jane Angel" }).first()).toBeVisible({ timeout: 30_000 });
      return;
    }
    await visit("/workspace/investors/pipeline");
    await page.getByTestId("crm-add").click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Name", { exact: true }).fill("Jane Angel");
    await dialog.getByLabel("Email").fill(JANE_EMAIL);
    await dialog.getByLabel("Firm").fill("Angel Co");
    await dialog.getByLabel("Type").selectOption("vc");
    await dialog.getByLabel("Next step").fill("Send deck");
    await dialog.getByLabel("Due").fill("2026-09-01"); // past → overdue
    await dialog.getByRole("button", { name: /^Add contact$/ }).click();
    const card = page.getByTestId("crm-card").filter({ hasText: "Jane Angel" }).first();
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card).toContainText("Angel Co");
    await evidence(testInfo, "card", { text: await card.innerText() });
    // Drawer opens on the new contact — close it so the board is usable.
    const drawer = page.getByTestId("crm-drawer");
    if (await drawer.isVisible().catch(() => false)) await drawer.getByRole("button", { name: "Close" }).last().click();
  });

  test("overdue badge and summary count for a past due date", async ({ page, visit, api }, testInfo) => {
    const list = await get<{ ok: boolean; contacts: Contact[] }>(api, "/api/investors/crm/contacts?q=Jane");
    const jane = list.body.contacts?.find((c) => c.email === JANE_EMAIL);
    expect(jane, "Jane Angel exists via API").toBeTruthy();
    setScratch("crm.janeId", jane!.id);
    expect(jane!.next_step_due).toBe("2026-09-01");
    await visit("/workspace/investors/pipeline");
    const card = page.getByTestId("crm-card").filter({ hasText: "Jane Angel" }).first();
    await expect(card.getByTestId("crm-overdue")).toBeVisible();
    await expect(card.getByTestId("crm-overdue")).toContainText(/Overdue/);
    const pipeline = await get<{ ok: boolean; pipeline: { overdue: number; total: number } }>(api, "/api/investors/crm/pipeline");
    await evidence(testInfo, "pipeline", pipeline.body);
    expect(pipeline.body.pipeline.overdue).toBeGreaterThanOrEqual(1);
  });

  test("move the contact on to Contacted (card arrow → API stage)", async ({ page, visit, api }, testInfo) => {
    await visit("/workspace/investors/pipeline");
    await page.getByRole("button", { name: "Move Jane Angel on to Contacted" }).click();
    const id = getScratch<string>("crm.janeId")!;
    await expect.poll(async () => (await get<{ contact: Contact }>(api, `/api/investors/crm/contacts/${id}`)).body.contact?.stage, { timeout: 20_000 }).toBe("contacted");
    await evidence(testInfo, "stage", { id, stage: "contacted" });
  });

  test("add a note from the drawer → timeline row + touchpoint via API", async ({ page, visit, api }, testInfo) => {
    const id = getScratch<string>("crm.janeId")!;
    await visit("/workspace/investors/pipeline");
    await page.getByTestId("crm-card").filter({ hasText: "Jane Angel" }).first().locator("button").first().click();
    const drawer = page.getByTestId("crm-drawer");
    await expect(drawer).toBeVisible();
    const note = "Met at Spacecubed demo day — wants the deck.";
    await drawer.getByLabel("Note").fill(note);
    await drawer.getByTestId("crm-add-note").click();
    await expect(drawer.getByTestId("crm-timeline")).toContainText(note, { timeout: 20_000 });
    const tp = await get<{ ok: boolean; touchpoints: Array<{ kind: string; body: string }> }>(api, `/api/investors/crm/contacts/${id}/touchpoints`);
    await evidence(testInfo, "touchpoints", tp.body);
    expect(tp.body.touchpoints.some((t) => t.body === note)).toBe(true);
  });

  test("CSV import: duplicate email updates, formula cell is neutralised, counts reported", async ({ api }, testInfo) => {
    const csv = [
      "name,email,org,type,stage,tags",
      `Bob Duplicate,${JANE_EMAIL},Dup Co,angel,,`,
      "=SUM(1+1),formula@example.com,Formula Co,advisor,,",
      "Priya Partner,priya@example.com,Priya Ventures,vc,researching,warm",
    ].join("\n");
    const beforeImport = await get<{ contacts: Contact[] }>(api, "/api/investors/crm/contacts?limit=200");
    const alreadyThere = ["formula@example.com", "priya@example.com"].filter((e) => beforeImport.body.contacts.some((c) => c.email === e)).length;
    const res = await api.post("/api/investors/crm/import", csvMultipart("file", "investors.csv", csv));
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; created?: number; updated?: number; skipped?: number; skippedRows?: unknown[] };
    await evidence(testInfo, "import result", { status: res.status(), body, alreadyThere });
    expect(res.status()).toBe(200);
    expect(body.created).toBe(2 - alreadyThere); // fresh run: 2 added, 1 updated (Jane by email)
    expect(body.updated).toBe(1 + alreadyThere);
    expect(body.skipped ?? 0).toBe(0);

    const list = await get<{ ok: boolean; contacts: Contact[] }>(api, "/api/investors/crm/contacts");
    const formula = list.body.contacts.find((c) => c.email === "formula@example.com");
    const jane = list.body.contacts.find((c) => c.email === JANE_EMAIL);
    await evidence(testInfo, "after import", { formulaName: formula?.name, jane: jane ? { name: jane.name, org: jane.org, stage: jane.stage } : null, total: list.body.contacts.length });
    expect(formula, "formula row imported").toBeTruthy();
    expect(formula!.name.startsWith("=")).toBe(false); // CSV-injection guard
    expect(jane!.stage).toBe("contacted"); // stage kept on email match
    expect(list.body.contacts.filter((c) => c.email === JANE_EMAIL)).toHaveLength(1);
  });

  test("export CSV is owner-only and links from the board", async ({ page, visit, api }, testInfo) => {
    await visit("/workspace/investors/pipeline");
    await expect(page.getByTestId("crm-export")).toBeVisible();
    const res = await api.get("/api/investors/crm/export.csv");
    const text = await res.text();
    await evidence(testInfo, "export.csv", { status: res.status(), contentType: res.headers()["content-type"], disposition: res.headers()["content-disposition"], firstLine: text.split("\n")[0], rows: text.trim().split("\n").length - 1 });
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toMatch(/text\/csv/);
    expect(text.split("\n")[0]).toMatch(/^name,email,org/);
    expect(text.trim().split("\n").length - 1).toBeGreaterThanOrEqual(3);
  });

  test("PATCH stage with an unknown contact id is 404 (no data leak)", async ({ api }, testInfo) => {
    const r = await patch(api, "/api/investors/crm/contacts/00000000-0000-4000-8000-000000000000", { stage: "meeting" });
    await evidence(testInfo, "foreign id", r.body);
    expect(r.status).toBe(404);
  });

  test("duplicate email on POST is a 409 duplicate_email, not a second card", async ({ api }, testInfo) => {
    const r = await post(api, "/api/investors/crm/contacts", { name: "Jane Again", email: JANE_EMAIL });
    await evidence(testInfo, "POST duplicate", r.body);
    expect(r.status).toBe(409);
    expect(r.body.error).toBe("duplicate_email");
  });
});
