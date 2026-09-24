import { mkdirSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";

const home = mkdtempSync(join(tmpdir(), "report-spend-"));
// Production has ~/.local/state; the ledger root itself is created (0700) by the module.
mkdirSync(join(home, ".local/state"), { recursive: true });
vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return { ...actual, userInfo: () => ({ ...actual.userInfo(), homedir: home }) };
});

import { createReportAttemptBudget } from "./report-attempt-budget";
import { reserveResearchAttempt, settleResearchAttempt } from "./research-attempt-budget";

afterAll(() => vi.restoreAllMocks());

const FLASH = "deepseek-ai/DeepSeek-V4-Flash";
const payload = (n: number) => JSON.stringify({ model: FLASH, messages: [{ role: "user", content: "x".repeat(n) }] });
let scopeN = 0;
const scope = () => `blockid:analysis:test-${++scopeN}`;
function ledgerFor(): { entries: Array<Record<string, unknown>> } {
  const root = join(home, ".local/state/blockid-report-spend");
  const dir = readdirSync(root).map((d) => join(root, d)).sort().at(-1)!;
  return JSON.parse(readFileSync(join(dir, "ledger.json"), "utf8"));
}

describe("report attempt budget (G33-T06)", () => {
  it("reserves against the request's bytes, not the model's full context window", async () => {
    const budget = createReportAttemptBudget(scope());
    const body = payload(18_000);
    const permit = await reserveResearchAttempt(budget, FLASH, body, 2600);
    const bytes = Buffer.byteLength(body);
    expect(permit.maximumInputTokens).toBe(bytes);
    // 18 KB × $0.09/M + 2 600 × $0.18/M ≈ US$0.0021 (was 1 048 576 × $0.09/M ≈ US$0.094).
    expect(permit.maximumCostMicroUsd).toBeLessThan(3_000);
    await settleResearchAttempt(budget, permit, { prompt_tokens: 4_500, completion_tokens: 1_200 });
  });

  it("24/09 repro: eight timed-out attempts no longer exhaust the US$0.50 scope", async () => {
    const budget = createReportAttemptBudget(scope());
    for (let i = 0; i < 20; i++) {
      const permit = await reserveResearchAttempt(budget, FLASH, payload(18_000 + i), 2600);
      await settleResearchAttempt(budget, permit); // unknown outcome (timeout) → full hold retained
    }
    // The CEO summary still gets a reservation after 20 unknown attempts.
    const summary = await reserveResearchAttempt(budget, "deepseek-ai/DeepSeek-V3.2", payload(30_000), 3000);
    expect(summary.dispatchAllowed).toBe(true);
  });

  it("an in-flight attempt is never duplicated; a settled one may be re-dispatched under a new identity", async () => {
    const budget = createReportAttemptBudget(scope());
    const body = payload(1_000);
    const first = await reserveResearchAttempt(budget, FLASH, body, 500);
    await expect(reserveResearchAttempt(budget, FLASH, body, 500)).rejects.toThrow("reservation unavailable");
    await settleResearchAttempt(budget, first); // timed out → unknown, hold kept
    const retry = await reserveResearchAttempt(budget, FLASH, body, 500);
    expect(retry.attemptId).not.toBe(first.attemptId);
    expect(retry.retryOf).toBe(first.attemptId);
    await settleResearchAttempt(budget, retry, { prompt_tokens: 300, completion_tokens: 200 });
    const entries = ledgerFor().entries;
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ state: "unknown" });
    expect(entries[1]).toMatchObject({ state: "reported_usage", retryOf: first.attemptId });
  });

  it("G33-T16f: twenty parallel reservations on one scope all get a permit (lock wait), and a refusal names its reason", async () => {
    const budget = createReportAttemptBudget(scope());
    const permits = await Promise.all(Array.from({ length: 20 }, (_, i) => reserveResearchAttempt(budget, FLASH, payload(5_000 + i), 1500)));
    expect(permits.every((p) => p.dispatchAllowed)).toBe(true);
    const body = payload(7_777);
    await reserveResearchAttempt(budget, FLASH, body, 500);
    await expect(reserveResearchAttempt(budget, FLASH, body, 500)).rejects.toThrow(/reservation unavailable \(report attempt replay denied\)/);
  });

  it("usage above the byte ceiling is not accepted as reported usage", async () => {
    const budget = createReportAttemptBudget(scope());
    const body = payload(100);
    const permit = await reserveResearchAttempt(budget, FLASH, body, 500);
    await expect(settleResearchAttempt(budget, permit, { prompt_tokens: Buffer.byteLength(body) + 1, completion_tokens: 10 })).rejects.toThrow("exceeds certified ceiling");
  });

  it("still enforces the US$0.50 cap", async () => {
    const budget = createReportAttemptBudget(scope());
    // Context-sized prompts (163 840-token ceiling on V3.2 ≈ US$0.043 each) left
    // unknown: eleven fit under US$0.50, the twelfth is refused.
    const V32 = "deepseek-ai/DeepSeek-V3.2";
    for (let i = 0; i < 11; i++) {
      const p = await reserveResearchAttempt(budget, V32, payload(200_000 + i), 1000);
      await settleResearchAttempt(budget, p);
    }
    await expect(reserveResearchAttempt(budget, V32, payload(200_100), 1000)).rejects.toThrow("reservation unavailable");
  });
});
