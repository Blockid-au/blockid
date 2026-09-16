/**
 * 10 — Clean room (lane 1 #45–#47): computed rows are decided by the data
 * room (no tick control, API 409 computed_task), a founder tick persists
 * across reload, unknown task ids are 400. Growth-only.
 */
import { test, expect } from "./fixtures";
import { evidence, get, patch } from "./lib/api";



interface Checklist {
  ok: boolean;
  checklist: {
    done: number;
    total: number;
    pct: number;
    roomExists: boolean;
    stages: Array<{ id: string; tasks: Array<{ id: string; source: "founder" | "computed" | "either"; label: string; done: boolean }> }>;
  };
}

const flat = (c: Checklist) => c.checklist.stages.flatMap((s) => s.tasks);

test.describe("Clean room", () => {
  test("computed tasks reflect the data-room settings and cannot be ticked", async ({ page, visit, growth, api }, testInfo) => {
    void growth;
    const c = await get<Checklist>(api, "/api/data-room/clean-room");
    await evidence(testInfo, "GET", { status: c.status, done: c.body.checklist?.done, total: c.body.checklist?.total, roomExists: c.body.checklist?.roomExists, tasks: flat(c.body).map((t) => ({ id: t.id, source: t.source, done: t.done })) });
    expect(c.status).toBe(200);
    expect(c.body.checklist.total).toBe(16);
    const computed = flat(c.body).filter((t) => t.source === "computed");
    expect(computed.length).toBe(6);

    const r = await patch(api, "/api/data-room/clean-room", { taskId: "classify-sections", done: true });
    await evidence(testInfo, "PATCH computed", r.body);
    expect(r.status).toBe(409);
    expect(r.body.error).toBe("computed_task");

    await visit("/workspace/exit/clean-room");
    await expect(page).toHaveURL(/\/workspace\/clean-room/);
    await expect(page.getByTestId("clean-room")).toBeVisible({ timeout: 30_000 });
    if (!c.body.checklist.roomExists) {
      await expect(page.getByTestId("clean-room-no-room")).toBeVisible();
    }
    const computedRow = page.locator('[data-testid="clean-room-task"][data-source="computed"]').first();
    await expect(computedRow).toBeVisible();
    await expect(computedRow.getByTestId("clean-room-tick")).toHaveCount(0);
    await expect(computedRow.getByTestId("clean-room-task-status")).toContainText(/Decided by the data room/);
  });

  test("founder-ticked task persists across reload and moves the progress", async ({ page, visit, growth, api }, testInfo) => {
    void growth;
    const before = await get<Checklist>(api, "/api/data-room/clean-room");
    const task = flat(before.body).find((t) => t.id === "scope-team")!;
    expect(task).toBeTruthy();
    if (task.done) await patch(api, "/api/data-room/clean-room", { taskId: "scope-team", done: false });

    await visit("/workspace/exit/clean-room");
    const row = page.locator('[data-testid="clean-room-task"][data-task="scope-team"]');
    await expect(row).toBeVisible({ timeout: 30_000 });
    await row.getByTestId("clean-room-tick").click();
    await expect(row).toHaveAttribute("data-done", "1", { timeout: 30_000 });
    await expect(row.getByTestId("clean-room-task-status")).toContainText(/Ticked/);

    await page.reload({ waitUntil: "domcontentloaded" });
    const again = page.locator('[data-testid="clean-room-task"][data-task="scope-team"]');
    await expect(again).toHaveAttribute("data-done", "1", { timeout: 30_000 });
    const after = await get<Checklist>(api, "/api/data-room/clean-room");
    await evidence(testInfo, "after tick", { done: after.body.checklist.done, total: after.body.checklist.total, pct: after.body.checklist.pct, progress: await page.getByTestId("clean-room-progress").innerText() });
    expect(after.body.checklist.done).toBe(before.body.checklist.done + (task.done ? 0 : 1));
    await expect(page.getByTestId("clean-room-progress")).toContainText(new RegExp(`${after.body.checklist.done} of 16 tasks`));
  });

  test("unknown task id → 400, oversized note → 413", async ({ api, growth }, testInfo) => {
    void growth;
    const unknown = await patch(api, "/api/data-room/clean-room", { taskId: "not-a-task", done: true });
    const big = await patch(api, "/api/data-room/clean-room", { taskId: "scope-team", done: true, note: "x".repeat(5000) });
    await evidence(testInfo, "validation", { unknown: unknown.body, big: { status: big.status, body: big.body } });
    expect(unknown.status).toBe(400);
    expect(big.status).toBe(413);
  });
});
