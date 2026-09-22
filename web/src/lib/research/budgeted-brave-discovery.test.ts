import { expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverWithBraveBudget } from "./budgeted-brave-discovery";
import type { BraveResearchBudget } from "../reanalysis/research-cost-policy";
const time = Date.parse("2026-09-22T12:00:00Z");
const input = { jobId: "durable-job-1", questionId: "job1-q05", batchId: "batch-1", month: "2026-09",
  approvedPublicQueries: [{ id: "q1", query: "business public market competitors", approvedForPublicSearch: true as const }] };
const policy = (): BraveResearchBudget => ({ provider: "brave", accountId: "provider-account", observedAt: new Date(time).toISOString(), expiresAt: new Date(time+60_000).toISOString(), providerPolicyConfirmed: true,
  questionId: input.questionId, batchId: input.batchId, day: "2026-09-22", month: input.month,
  used: { question: 0, batch: 0, day: 0, month: 0 }, remainingFreeQueries: null,
  paid: { ownerPolicyId: "owner-paid-policy", currency: "USD", monthlyCapMicroUsd: 5_000,
    committedMicroUsd: 0, reservedMicroUsd: 0, pricePerQueryMicroUsd: 5000, quoteExpiresAt: new Date(time+60_000).toISOString() } });
const response = () => Response.json({ type: "search", query: { original: "query" }, web: { results: [{ url: "https://example.com/product", description: "NEVER RETAIN THIS SNIPPET" }] } });
async function isolated(fn: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), "budgeted-discovery-"));
  try { await fn(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}
const deps = (directory: string, fetcher = vi.fn(async () => response())) => ({ directory, apiKey: "synthetic-test-key", readPolicy: async () => policy(), assertAuthorized: vi.fn(async () => {}), fetch: fetcher as typeof fetch, now: () => time });
it("persists reservation before real adapter fetch; retries cannot spend twice", () => isolated(async directory => {
  const fetcher = vi.fn(async () => {
    expect(JSON.parse(await readFile(join(directory, "2026-09.json"), "utf8")).entries).toHaveLength(1);
    return response();
  });
  const d = deps(directory, fetcher);
  const first = await discoverWithBraveBudget(input, d);
  expect(first.discovery.status).toBe("complete");
  expect(first.discovery.candidates[0].citable).toBe(false);
  expect(d.assertAuthorized).toHaveBeenCalledTimes(2);
  expect((await discoverWithBraveBudget(input, d)).budgetDecisions[0].reason).toBe("replay_requires_reconciliation");
  expect(fetcher).toHaveBeenCalledTimes(1);
  const ledger = await readFile(join(directory, "2026-09.json"), "utf8");
  expect(ledger).not.toContain(input.approvedPublicQueries[0].query);
  expect(ledger).not.toContain("example.com");
  expect(JSON.stringify(first)).not.toContain("NEVER RETAIN");
}));
it("does not refund or retry an ambiguous network failure", () => isolated(async directory => {
  const fetcher = vi.fn(async (): Promise<Response> => { throw Error("transport interrupted"); });
  const d = deps(directory, fetcher);
  expect((await discoverWithBraveBudget(input, d)).discovery.status).toBe("unavailable");
  expect((await discoverWithBraveBudget(input, d)).budgetDecisions[0].dispatchAllowed).toBe(false);
  expect(fetcher).toHaveBeenCalledTimes(1);
}));
it("concurrent workers dispatch a stable query at most once", () => isolated(async directory => {
  const d = deps(directory);
  const results = await Promise.all([discoverWithBraveBudget(input, d), discoverWithBraveBudget(input, d)]);
  expect(results.filter(r => r.discovery.status === "complete")).toHaveLength(1);
  expect(d.fetch).toHaveBeenCalledTimes(1);
}));
it("enforces paid cap at the outbound boundary, not after response", () => isolated(async directory => {
  const d = deps(directory);
  const result = await discoverWithBraveBudget({ ...input, approvedPublicQueries: [...input.approvedPublicQueries,
    { id: "q2", query: "business market alternative pricing", approvedForPublicSearch: true }] }, d);
  expect(d.fetch).toHaveBeenCalledTimes(1);
  expect(result.discovery.status).toBe("partial");
  expect(result.budgetDecisions[1].reason).toBe("brave_paid_budget_exhausted");
}));
it("revocation while reserving prevents dispatch and leaves a conservative reservation", () => isolated(async directory => {
  const d = deps(directory);
  d.assertAuthorized.mockImplementationOnce(async () => {}).mockImplementation(async () => { throw Error("revoked"); });
  const result = await discoverWithBraveBudget(input, d);
  expect(result.discovery.status).toBe("unavailable");
  expect(d.fetch).not.toHaveBeenCalled();
  expect(JSON.parse(await readFile(join(directory, "2026-09.json"), "utf8")).entries).toHaveLength(1);
}));
it("old jobs cannot silently spend again after month rollover", () => isolated(async directory => {
  const d = { ...deps(directory), now: () => Date.parse("2026-10-01T00:00:00Z") };
  const result = await discoverWithBraveBudget(input, d);
  expect(result.budgetDecisions[0].reason).toBe("reservation_period_mismatch");
  expect(d.fetch).not.toHaveBeenCalled();
}));
it("missing key, invalid queries and cancelled jobs never reserve or fetch", () => isolated(async directory => {
  const d = deps(directory);
  await discoverWithBraveBudget(input, { ...d, apiKey: undefined });
  await discoverWithBraveBudget({ ...input, approvedPublicQueries: [{ ...input.approvedPublicQueries[0], query: "secret=private" }] }, d);
  await discoverWithBraveBudget(input, { ...d, signal: AbortSignal.abort() });
  expect(d.fetch).not.toHaveBeenCalled();
  await expect(readFile(join(directory, "2026-09.json"))).rejects.toMatchObject({ code: "ENOENT" });
}));
