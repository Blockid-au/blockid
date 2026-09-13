/**
 * 05 — Term-sheet compare guidance (lane 1 #19) and exit acqui-hire (#20).
 * The exit method cards only render once a cap table exists (04-cap-table),
 * so the acqui-hire journey is Growth-only.
 */
import { test, expect } from "./fixtures";
import { evidence, post } from "./lib/api";

test.describe.configure({ mode: "serial" });

test.describe("Term sheet compare", () => {
  test("with fewer than two analysed sheets the compare view shows guidance, no picker", async ({ page, visit }, testInfo) => {
    await visit("/workspace/term-sheet");
    await expect(page.getByTestId("term-sheet-compare")).toBeVisible();
    const empty = page.getByTestId("compare-empty");
    await expect(empty).toBeVisible();
    await expect(empty).toContainText("Analyse at least two term sheets to compare them.");
    await expect(page.getByTestId("compare-options")).toHaveCount(0);
    await expect(page.getByTestId("compare-start")).toHaveCount(0);
    await evidence(testInfo, "compare-empty", { text: await empty.innerText() });
  });

  test("compare API rejects 1 id / duplicate ids with 400 and never charges", async ({ api, credits }, testInfo) => {
    const before = await credits.snapshot();
    const one = await post(api, "/api/term-sheet/compare", { ids: ["00000000-0000-4000-8000-000000000001"] });
    const dup = await post(api, "/api/term-sheet/compare", { ids: ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000001"] });
    const foreign = await post(api, "/api/term-sheet/compare", { ids: ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002"] });
    await evidence(testInfo, "validation", { one: one.body, dup: dup.body, foreign: { status: foreign.status, body: foreign.body } });
    expect(one.status).toBe(400);
    expect(dup.status).toBe(400);
    expect([404, 400]).toContain(foreign.status);
    await credits.assertUnchanged(before, "term-sheet compare validation");
  });
});

test.describe("Exit modelling — acqui-hire", () => {
  test("acqui-hire renders its assumptions and computes the price build-up for a team of 8", async ({ page, visit, growth, api }, testInfo) => {
    void growth;
    await visit("/workspace/exit");
    const card = page.getByRole("button", { name: /Acqui-hire/ });
    await expect(card, "method cards render once a cap table exists").toBeVisible({ timeout: 30_000 });
    await card.click();
    await expect(page.getByTestId("acqui-hire-fields")).toBeVisible();
    await page.getByTestId("acqui-team-size").fill("8");
    await page.getByTestId("acqui-per-engineer").fill("1000000");
    await page.getByTestId("acqui-retention-pct").fill("40");
    await page.getByTestId("acqui-retention-years").selectOption("3");
    await page.getByTestId("acqui-ip-premium").fill("0");
    await page.getByRole("button", { name: /Calculate Exit/ }).click();
    const breakdown = page.getByTestId("acqui-hire-breakdown");
    await expect(breakdown).toBeVisible({ timeout: 45_000 });
    const text = await breakdown.innerText();
    await evidence(testInfo, "breakdown", { text, equity: await page.getByTestId("acqui-equity").innerText() });
    expect(text).toMatch(/Team \(8 × \$1\.00M\)/);
    expect(text).toMatch(/Retention pool \(40%, 3 yrs\)/);
    expect(await page.getByTestId("acqui-equity").innerText()).toMatch(/\$4\.80M/);

    const apiRes = await post<{ ok: boolean; result?: unknown; error?: string }>(api, "/api/exit-model", {
      method: "acqui_hire",
      acquiHire: { teamSize: 8, perEngineerValueAud: 1_000_000, retentionBonusShare: 0.4, retentionYears: 3, ipPremiumAud: 0 },
    });
    await evidence(testInfo, "POST /api/exit-model", { status: apiRes.status, ok: apiRes.body.ok, error: apiRes.body.error });
    expect(apiRes.status).toBe(200);
  });

  test("teamSize 0 is rejected with a 400 (no fabricated result)", async ({ api, growth }, testInfo) => {
    void growth;
    const r = await post(api, "/api/exit-model", { method: "acqui_hire", acquiHire: { teamSize: 0, retentionYears: 3 } });
    await evidence(testInfo, "teamSize 0", r.body);
    expect(r.status).toBe(400);
  });
});
