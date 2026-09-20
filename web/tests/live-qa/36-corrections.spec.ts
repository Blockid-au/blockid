/**
 * 36 — Founder correction workflow (G21 P1-C; post-ship review lane 8):
 *
 *   • anonymous POST /api/corrections → 401 (nothing filed);
 *   • the QA founder files ONE correction on the QA project via
 *     POST /api/corrections → 201 { correction: { status: "open" } }.
 *     Idempotent: the spec first reads GET /api/corrections?project= and
 *     re-uses an open "[live-qa]" row when one exists (the API has no
 *     delete; the project is erased by the teardown, corrections cascade),
 *     so a re-run never files a second row or e-mails the admin twice;
 *   • the row appears on /workspace/evidence/corrections (list + open badge)
 *     and GET /api/corrections?project= lists it;
 *   • admin accept is NOT exercised — there is no admin seat in live-qa —
 *     the founder is asserted unable to call PATCH /api/admin/corrections/[id]
 *     (403 non-admin; 404 accepted for a route that hides itself).
 *
 * No credits are spent, no score or record changes (a correction is a
 * logged request only).
 */
import { test, expect } from "./fixtures";
import { getScratch, setScratch } from "./lib/run-state";
import { anonRequest, evidence, get, patch, post } from "./lib/api";

interface CorrectionRow {
  id: string;
  project_id: string;
  kind: string;
  target_ref: string | null;
  message: string;
  status: "open" | "accepted" | "rejected";
  resolution: string | null;
  created_at: string;
}

const QA_MARK = "[live-qa]";
const QA_TARGET = "dimension:tre";
const QA_MESSAGE = `${QA_MARK} Traction figure is stale — the MRR shown predates the last connector refresh. Filed by the live-QA suite; safe to reject.`;

test.describe("36 — corrections (G21 P1-C)", () => {
  test("anon → 401; the founder files ONE correction on the QA project (idempotent) → open row", async ({ api, qa }, testInfo) => {
    test.skip(!qa.projectId, "no QA project id in the run state");
    const anon = await anonRequest(qa.baseURL);
    try {
      const a = await post(anon, "/api/corrections", { projectId: qa.projectId, kind: "stale_data", targetRef: QA_TARGET, message: QA_MESSAGE });
      expect(a.status).toBe(401);
    } finally {
      await anon.dispose();
    }

    const before = await get<{ ok: boolean; corrections: CorrectionRow[] }>(api, `/api/corrections?project=${qa.projectId}`);
    expect(before.status).toBe(200);
    expect(before.body.ok).toBe(true);
    let row = (before.body.corrections ?? []).find((c) => c.status === "open" && c.message.startsWith(QA_MARK)) ?? null;
    let filed = false;
    if (!row) {
      const r = await post<{ ok: boolean; correction?: CorrectionRow; error?: string; message?: string }>(api, "/api/corrections", { projectId: qa.projectId, kind: "stale_data", targetRef: QA_TARGET, message: QA_MESSAGE });
      await evidence(testInfo, "POST /api/corrections", { status: r.status, body: r.body });
      expect(r.status).toBe(201);
      expect(r.body.ok).toBe(true);
      row = r.body.correction!;
      filed = true;
    }
    expect(row).toMatchObject({ project_id: qa.projectId, kind: "stale_data", target_ref: QA_TARGET, status: "open", resolution: null });
    setScratch("correctionId", row.id);
    await evidence(testInfo, "QA correction", { id: row.id, filed, reused: !filed, openBefore: (before.body.corrections ?? []).filter((c) => c.status === "open").length });

    // bad body shapes never create a row
    const badKind = await post(api, "/api/corrections", { projectId: qa.projectId, kind: "vibes", message: "x" });
    const badTarget = await post(api, "/api/corrections", { projectId: qa.projectId, kind: "stale_data", targetRef: "nope", message: "x" });
    expect(badKind.status).toBe(400);
    expect(badTarget.status).toBe(400);
  });

  test("the correction appears on /workspace/evidence/corrections with the open badge; the owner sees the access panel + form", async ({ page, visit, qa }, testInfo) => {
    test.skip(!qa.projectId, "no QA project id in the run state");
    const id = getScratch("correctionId");
    test.skip(!id, "no correction filed by the previous test");
    await visit("/workspace/evidence/corrections");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Corrections/);
    const list = page.getByTestId("corrections-list");
    await expect(list).toBeVisible({ timeout: 30_000 });
    await expect(list).toContainText(QA_MARK);
    const openRows = list.locator('[data-correction-status="open"]');
    expect(await openRows.count()).toBeGreaterThanOrEqual(1);
    // the founder (owner) sees the data-ethics panel and the form (owner only)
    await expect(page.getByTestId("data-ethics-panel")).toBeVisible();
    await expect(page.getByTestId("corrections-form")).toBeVisible();
    await evidence(testInfo, "/workspace/evidence/corrections", { openRows: await openRows.count(), listText: (await list.innerText()).slice(0, 400) });
  });

  test("GET /api/corrections?project= lists it; the founder cannot resolve it (admin route 403/404)", async ({ api, qa }, testInfo) => {
    test.skip(!qa.projectId, "no QA project id in the run state");
    const id = getScratch("correctionId");
    test.skip(!id, "no correction filed by the previous test");
    const list = await get<{ ok: boolean; corrections: CorrectionRow[] }>(api, `/api/corrections?project=${qa.projectId}`);
    expect(list.status).toBe(200);
    const mine = list.body.corrections.find((c) => c.id === id);
    expect(mine, "the filed correction is listed").toBeTruthy();
    expect(mine!.status).toBe("open");
    // wrong / missing project id shapes
    const bad = await get(api, "/api/corrections?project=nope");
    expect(bad.status).toBe(400);
    const other = await get(api, "/api/corrections?project=00000000-0000-4000-8000-00000000c0de");
    expect([403, 404]).toContain(other.status);

    // no admin seat in live-qa: the founder must be refused by the admin route (403 non-admin, or 404 if the route hides itself)
    const resolve = await patch<{ ok: boolean; error?: string }>(api, `/api/admin/corrections/${id}`, { decision: "reject", resolution: "live-qa must not be able to do this" });
    await evidence(testInfo, "PATCH /api/admin/corrections/[id] as founder", { status: resolve.status, body: resolve.body });
    expect([403, 404]).toContain(resolve.status);
    expect(resolve.body.ok).not.toBe(true);
    // and the row is still open
    const after = await get<{ ok: boolean; corrections: CorrectionRow[] }>(api, `/api/corrections?project=${qa.projectId}`);
    expect(after.body.corrections.find((c) => c.id === id)?.status).toBe("open");
  });
});
