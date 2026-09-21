/**
 * 39 — Outcome ledger (G21 P3-A):
 *
 *   • anonymous POST /api/projects/[id]/outcomes → 401 (nothing recorded);
 *   • the QA founder (owner of the QA project) records ONE outcome via
 *     POST /api/projects/[id]/outcomes → 201 { outcome: { status: "proposed",
 *     source: "founder" } }. Idempotent: the spec first reads the GET list and
 *     re-uses an existing "[live-qa]" row when one exists (the API has no
 *     delete; the project is erased by the teardown, outcomes cascade), and a
 *     repeated POST with the same (kind, day, source) answers 200 duplicate
 *     rather than a second row;
 *   • the row appears on /workspace/evidence/outcomes (proposals list) and
 *     the trajectory section renders; GET lists it with counts + viewer flags;
 *   • the owner may confirm a founder-sourced proposal (PATCH → confirmed) —
 *     exercised only when the row was recorded by THIS run so a re-run never
 *     re-resolves; a second PATCH answers 409;
 *   • /methodology/calibration renders the score → outcome section: the honest
 *     empty state or a table with "n =".
 *
 * No credits are spent, no score changes (an outcome is an observation).
 * A 503 { reason: "migration_pending" } (0427 not applied yet) skips the
 * write tests with that reason rather than failing the run.
 */
import { test, expect } from "./fixtures";
import { getScratch, setScratch } from "./lib/run-state";
import { anonRequest, evidence, get, patch, post } from "./lib/api";

interface OutcomeRow {
  id: string;
  project_id: string;
  kind: string;
  observed_at: string;
  value: Record<string, unknown>;
  source: string;
  status: "proposed" | "confirmed" | "rejected";
  note: string | null;
}
interface ListBody {
  ok: boolean;
  error?: string;
  reason?: string;
  outcomes: OutcomeRow[];
  counts: { proposed: number; confirmed: number; rejected: number };
  viewer: { kind: string; can_record: boolean; can_resolve: boolean };
}

const QA_MARK = "[live-qa]";
const QA_BODY = { kind: "product_release", observedAt: "2026-09-01", value: { tag: "live-qa-v1", repo: "blockid/live-qa", source_url: "https://blockid.au/changelog" }, note: `${QA_MARK} Release recorded by the live-QA suite; safe to reject.` };

test.describe("39 — outcomes (G21 P3-A)", () => {
  test("anon → 401; the founder records ONE outcome on the QA project (idempotent) → proposed row; duplicate → 200", async ({ api, qa }, testInfo) => {
    test.skip(!qa.projectId, "no QA project id in the run state");
    const anon = await anonRequest(qa.baseURL);
    try {
      const a = await post(anon, `/api/projects/${qa.projectId}/outcomes`, QA_BODY);
      expect(a.status).toBe(401);
    } finally {
      await anon.dispose();
    }

    const before = await get<ListBody>(api, `/api/projects/${qa.projectId}/outcomes`);
    if (before.status === 503 && before.body.reason === "migration_pending") {
      await evidence(testInfo, "GET outcomes — 0427 pending", { status: before.status, body: before.body });
      test.skip(true, "migration 0427 not applied yet — outcome ledger unavailable");
    }
    expect(before.status).toBe(200);
    expect(before.body.ok).toBe(true);
    expect(before.body.viewer).toMatchObject({ kind: "owner", can_record: true, can_resolve: true });
    let row = (before.body.outcomes ?? []).find((o) => o.note?.startsWith(QA_MARK)) ?? null;
    let recorded = false;
    if (!row) {
      const r = await post<{ ok: boolean; outcome?: OutcomeRow; duplicate?: boolean; error?: string; message?: string }>(api, `/api/projects/${qa.projectId}/outcomes`, QA_BODY);
      await evidence(testInfo, "POST /api/projects/[id]/outcomes", { status: r.status, body: r.body });
      expect(r.status).toBe(201);
      expect(r.body.ok).toBe(true);
      row = r.body.outcome!;
      recorded = true;
    }
    expect(row).toMatchObject({ project_id: qa.projectId, kind: "product_release", source: "founder" });
    expect(["proposed", "confirmed", "rejected"]).toContain(row.status);
    expect(row).not.toHaveProperty("recorded_by");
    setScratch("outcomeId", row.id);
    setScratch("outcomeRecordedThisRun", recorded ? "1" : "0");

    // same (kind, day, source) again → the existing row, never a second one
    const dup = await post<{ ok: boolean; duplicate?: boolean; outcome?: OutcomeRow }>(api, `/api/projects/${qa.projectId}/outcomes`, QA_BODY);
    expect(dup.status).toBe(200);
    expect(dup.body.duplicate).toBe(true);
    expect(dup.body.outcome?.id).toBe(row.id);

    // bad bodies never create a row
    const badKind = await post(api, `/api/projects/${qa.projectId}/outcomes`, { ...QA_BODY, kind: "ipo" });
    const badValue = await post(api, `/api/projects/${qa.projectId}/outcomes`, { kind: "funding_raised", observedAt: "2026-09-01", value: {} });
    const badDate = await post(api, `/api/projects/${qa.projectId}/outcomes`, { ...QA_BODY, observedAt: "2099-01-01" });
    expect(badKind.status).toBe(400);
    expect(badValue.status).toBe(400);
    expect(badDate.status).toBe(400);
    await evidence(testInfo, "QA outcome", { id: row.id, recorded, reused: !recorded, status: row.status });
  });

  test("the outcome appears on /workspace/evidence/outcomes with the trajectory; GET lists it with counts", async ({ page, visit, api, qa }, testInfo) => {
    test.skip(!qa.projectId, "no QA project id in the run state");
    const id = getScratch("outcomeId");
    test.skip(!id, "no outcome recorded by the previous test");
    await visit("/workspace/evidence/outcomes");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Outcomes/);
    await expect(page.getByTestId("trajectory-timeline")).toBeVisible({ timeout: 30_000 });
    const client = page.getByTestId("outcomes-client");
    await expect(client).toBeVisible();
    await expect(client).toContainText(QA_MARK);
    await expect(page.getByTestId("outcomes-form")).toBeVisible();
    const trajectoryState = await page.getByTestId("trajectory-timeline").getAttribute("data-trajectory-state");
    await evidence(testInfo, "/workspace/evidence/outcomes", { trajectoryState, text: (await client.innerText()).slice(0, 400) });

    const list = await get<ListBody>(api, `/api/projects/${qa.projectId}/outcomes`);
    expect(list.status).toBe(200);
    const mine = list.body.outcomes.find((o) => o.id === id);
    expect(mine, "the recorded outcome is listed").toBeTruthy();
    expect(list.body.counts.proposed + list.body.counts.confirmed + list.body.counts.rejected).toBeGreaterThanOrEqual(1);
    // unknown / foreign project shapes
    expect((await get(api, "/api/projects/nope/outcomes")).status).toBe(404);
    expect((await get(api, "/api/projects/00000000-0000-4000-8000-00000000c0de/outcomes")).status).toBe(404);
  });

  test("the owner CANNOT confirm their own founder-recorded proposal (403 — P3 review: self-declared outcomes never feed calibration); bad decision → 400; a stranger's id → 404", async ({ api, qa }, testInfo) => {
    test.skip(!qa.projectId, "no QA project id in the run state");
    const id = getScratch("outcomeId");
    test.skip(!id, "no outcome recorded by the previous test");
    const bad = await patch(api, `/api/outcomes/${id}`, { decision: "maybe" });
    expect(bad.status).toBe(400);
    const stranger = await patch(api, "/api/outcomes/00000000-0000-4000-8000-00000000c0de", { decision: "confirm" });
    expect(stranger.status).toBe(404);
    if (getScratch("outcomeRecordedThisRun") !== "1") {
      await evidence(testInfo, "PATCH skipped — row reused from an earlier run", { id });
      return;
    }
    const own = await patch<{ ok: boolean; outcome?: OutcomeRow; error?: string; message?: string }>(api, `/api/outcomes/${id}`, { decision: "confirm", note: `${QA_MARK} confirmed by the suite` });
    await evidence(testInfo, "PATCH /api/outcomes/[id] (own founder row)", { status: own.status, body: own.body });
    expect(own.status).toBe(403);
    expect(own.body.error).toBe("forbidden");
    // The row stays a proposal — BlockID or an evaluator confirms it.
    const list = await get<ListBody>(api, `/api/projects/${qa.projectId}/outcomes`);
    expect(list.body.outcomes.find((o) => o.id === id)?.status).toBe("proposed");
  });

  test("/methodology/calibration renders the score → outcome section: empty state or a table with n =", async ({ page, visit }, testInfo) => {
    await visit("/methodology/calibration");
    const section = page.locator("#outcomes");
    await expect(section).toBeVisible({ timeout: 30_000 });
    const empty = page.getByTestId("outcome-calibration-empty");
    const table = page.getByTestId("outcome-calibration-table");
    const isEmpty = (await empty.count()) > 0;
    if (isEmpty) {
      await expect(empty).toContainText(/Fewer than 10 companies/);
    } else {
      await expect(table).toBeVisible();
      await expect(table).toContainText(/n = \d+/);
    }
    const text = await section.innerText();
    expect(text).not.toMatch(/\bpredicts?\b|prediction accuracy/i);
    await evidence(testInfo, "/methodology/calibration#outcomes", { empty: isEmpty, text: text.slice(0, 300) });
  });
});
