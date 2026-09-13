/**
 * 06 — Fundraise (lane 1 #12–#13, P0 F1 regression): wizard creates a round
 * (POST /api/fundraise must not 500), the round page shows the progress bar,
 * a commitment is added and moved soft → committed, the Open-round button
 * carries the data-room cost copy and is NOT clicked unless LIVE_QA_SPEND_OK.
 * Growth-only because a round is priced against the cap table (03).
 */
import { test, expect } from "./fixtures";
import { evidence, get, patch, post } from "./lib/api";
import { env } from "./lib/env";
import { setScratch } from "./lib/run-state";



interface Round {
  id: string;
  round_name: string;
  status: string;
  target_amount: number;
  share_price?: number;
}
interface Commitment {
  id: string;
  investor_name: string;
  amount_aud: number;
  status: string;
}
interface Summary {
  targetAud: number;
  softAud: number;
  committedAud: number;
  counts: Record<string, number>;
}

test.describe("Fundraise rounds", () => {
  test("wizard → Calculate Share Price saves a round (POST /api/fundraise 200, not 500)", async ({ page, visit, growth, api }, testInfo) => {
    void growth;
    await visit("/workspace/fundraise");
    await expect(page.getByRole("heading", { name: /Fundraise Wizard/ })).toBeVisible({ timeout: 30_000 });
    // The wizard's <label>s are not associated with their inputs (lane-1
    // F16, P3, open) — locate by the label's sibling instead of getByLabel.
    await page.locator('label:has-text("Round Name") + select').selectOption({ label: "Seed" });
    await page.locator('label:has-text("Target Raise (AUD)") + div input').fill("500000");
    await page.locator('label:has-text("Pre-Money Valuation (AUD)") + div input').fill("4000000");
    const [res] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith("/api/fundraise") && r.request().method() === "POST", { timeout: 45_000 }),
      page.getByRole("button", { name: /Calculate Share Price/ }).click(),
    ]);
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; round?: Round; error?: string };
    await evidence(testInfo, "POST /api/fundraise", { status: res.status(), ok: body.ok, error: body.error, round: body.round ? { id: body.round.id, status: body.round.status, share_price: body.round.share_price } : null });
    expect(res.status(), "round creation must not 500 (lane-1 F1 / lane-2 P1-1 regression)").toBe(200);
    expect(body.ok).toBe(true);
    expect(body.round?.id).toBeTruthy();
    setScratch("fundraise.roundId", body.round!.id);
    await expect(page.getByRole("heading", { name: /Step 2: Share Price Calculator/ })).toBeVisible({ timeout: 30_000 });

    const list = await get<{ ok: boolean; rounds: Round[] }>(api, "/api/fundraise");
    expect(list.body.rounds.some((r) => r.id === body.round!.id)).toBe(true);
  });

  test("wizard inputs are reachable by their labels (lane-1 F16 — expected to fail until fixed)", async ({ page, visit, growth }) => {
    void growth;
    test.fail(true, "lane-1 F16 (P3): fundraise wizard <label>s have no htmlFor/id — flips to 'unexpected pass' once fixed");
    await visit("/workspace/fundraise");
    await expect(page.getByLabel("Target Raise (AUD)")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByLabel("Pre-Money Valuation (AUD)")).toBeVisible({ timeout: 5_000 });
  });

  test("round page: progress bar, empty commitments, Open-round copy names the data-room cost", async ({ page, visit, growth, qa, api }, testInfo) => {
    void growth;
    const roundId = qa.scratch["fundraise.roundId"] as string;
    expect(roundId).toBeTruthy();
    const detail = await get<{ ok: boolean; round: Round; commitments: Commitment[]; summary: Summary; dataRoom: unknown; projectDataRoom: unknown }>(api, `/api/fundraise/${roundId}`);
    await evidence(testInfo, "GET round", { status: detail.status, body: detail.body });
    expect(detail.status, `GET /api/fundraise/${roundId} must resolve the round the wizard just created (it is listed by GET /api/fundraise)`).toBe(200);

    await visit(`/workspace/fundraise/${roundId}`);
    await expect(page.getByTestId("fundraise-round")).toBeVisible({ timeout: 30_000 });
    const bar = page.getByTestId("round-progress-bar");
    await expect(bar).toBeVisible();
    const activate = page.getByTestId("round-activate");
    await expect(activate).toBeVisible();
    const copy = await activate.innerText();
    await evidence(testInfo, "round page", { progress: await bar.getAttribute("aria-label"), activate: copy });
    const hasRoom = Boolean(detail.body.dataRoom || detail.body.projectDataRoom);
    expect(copy).toMatch(hasRoom ? /Open round — links your data room/ : /Open round — generates your data room \(3 credits\)/);
    if ((detail.body.commitments ?? []).length === 0) {
      await expect(page.getByTestId("commitments-empty")).toBeVisible();
    }
  });

  test("add a soft-circled commitment through the form, then move it to committed", async ({ page, visit, growth, qa, api }, testInfo) => {
    void growth;
    const roundId = qa.scratch["fundraise.roundId"] as string;
    await visit(`/workspace/fundraise/${roundId}`);
    const form = page.getByTestId("commitment-form");
    await expect(form).toBeVisible({ timeout: 30_000 });
    await form.getByLabel("Investor name").fill("Jane Angel");
    await form.getByLabel("Fund / organisation").fill("Angel Co");
    await form.getByLabel("Amount (A$)").fill("250000");
    await form.getByRole("button", { name: /Add commitment/ }).click();
    const table = page.getByTestId("commitments-table");
    await expect(table).toBeVisible({ timeout: 30_000 });
    await expect(table).toContainText("Jane Angel");

    const status = table.getByRole("combobox", { name: "Status for Jane Angel" });
    await expect(status).toHaveValue("soft");
    await status.selectOption("committed");
    await expect.poll(async () => (await get<{ summary: Summary }>(api, `/api/fundraise/${roundId}/commitments`)).body.summary?.committedAud, { timeout: 30_000 }).toBe(250000);
    const after = await get<{ commitments: Commitment[]; summary: Summary }>(api, `/api/fundraise/${roundId}/commitments`);
    await evidence(testInfo, "commitments", after.body);
    const jane = after.body.commitments.find((c) => c.investor_name === "Jane Angel");
    expect(jane?.status).toBe("committed");
    setScratch("fundraise.commitmentId", jane!.id);
    await expect(page.getByTestId("round-progress-bar")).toHaveAttribute("aria-label", /committed A\$250,000/);
  });

  test("commitment validation + PATCH status ladder via API", async ({ api, growth, qa }, testInfo) => {
    void growth;
    const roundId = qa.scratch["fundraise.roundId"] as string;
    const commitmentId = qa.scratch["fundraise.commitmentId"] as string;
    const badAmount = await post(api, `/api/fundraise/${roundId}/commitments`, { investorName: "Nobody", amountAud: -5 });
    const badStatus = await post(api, `/api/fundraise/${roundId}/commitments`, { investorName: "Nobody", amountAud: 10, status: "maybe" });
    const foreignRound = await get(api, "/api/fundraise/00000000-0000-4000-8000-000000000000");
    const activateViaPatch = await patch(api, `/api/fundraise/${roundId}`, { status: "active" });
    const signed = await patch<{ ok: boolean; commitment: Commitment }>(api, `/api/fundraise/${roundId}/commitments/${commitmentId}`, { status: "signed" });
    await evidence(testInfo, "validation", { badAmount: badAmount.body, badStatus: badStatus.body, foreignRound: foreignRound.status, activateViaPatch: activateViaPatch.body, signed: signed.body.commitment?.status });
    expect(badAmount.status).toBe(400);
    expect(badStatus.status).toBe(400);
    expect(foreignRound.status).toBe(404);
    expect(activateViaPatch.status).toBe(409);
    expect(activateViaPatch.body.error).toBe("use_activate_route");
    expect(signed.status).toBe(200);
    expect(signed.body.commitment.status).toBe("signed");
  });

  test("Open round (activate) is only exercised with LIVE_QA_SPEND_OK=1 — it may compile a 3-credit data room", async ({ api, growth, qa, credits }, testInfo) => {
    void growth;
    test.skip(!env.spendOk, "activating a round may spend 3 credits on the data room — skipped (LIVE_QA_SPEND_OK not set)");
    const roundId = qa.scratch["fundraise.roundId"] as string;
    const before = await credits.snapshot();
    const r = await post<{ ok: boolean; round: Round; alreadyActive: boolean; dataRoom: { id: string | null; attached: string; creditsUsed?: number; reason?: string } }>(api, `/api/fundraise/${roundId}/activate`);
    const after = await credits.snapshot();
    await evidence(testInfo, "activate", { status: r.status, body: r.body, credits: { before, after } });
    expect(r.status).toBe(200);
    expect(r.body.round.status).toBe("active");
    if (r.body.dataRoom.attached === "generated") expect(after).toBe(before - 3);
    else expect(after).toBe(before);
  });
});
