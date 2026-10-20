// A1 acceptance (pricing v5 §7.4) — nightly price-feed sync on mocked fetch.
import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MODEL_CATALOG, catalogPrice } from "./model-catalog";
import {
  DEEPINFRA_FEED_URL, DEEPINFRA_LIST_URL, OPENROUTER_FEED_URL,
  buildRenewalProposal, comparePrices, parseDeepInfraOpenAIModels, parseOpenRouterModels, pctChange, runPriceSync,
  type PinnedPolicy, type PriceSyncPaths,
} from "./price-feed";

const NOW = Date.parse("2026-10-20T02:13:00Z");
const DAY = 86_400_000;
const V4 = "deepseek-ai/DeepSeek-V4-Flash";

/** The pinned report policy as report-attempt-budget.ts holds it today. */
const PINNED: PinnedPolicy["pinned"] = {
  "deepseek-ai/DeepSeek-V3.2": { input: 260, output: 380, context: 163840 },
  "Qwen/Qwen3-235B-A22B-Instruct-2507": { input: 90, output: 550, context: 262144 },
  "deepseek-ai/DeepSeek-V4-Flash": { input: 90, output: 180, context: 1048576 },
  "Qwen/Qwen3-VL-235B-A22B-Instruct": { input: 200, output: 880, context: 262144 },
};
const policy = (expiresAt: string): PinnedPolicy => ({ id: "deepinfra-standard-2026-09-23", expiresAt, pinned: PINNED });

/** Feeds built from the catalogue's own prices, with per-id overrides. */
function feeds(overrides: Record<string, { in: number; out: number } | null> = {}) {
  const di = MODEL_CATALOG.filter((m) => m.provider === "deepinfra").flatMap((m) => {
    const o = overrides[m.id];
    if (o === null) return [];
    const p = o ?? catalogPrice(m)!;
    return [{ id: m.id, object: "model", metadata: { pricing: { input_tokens: p.in, output_tokens: p.out }, context_length: m.contextTokens, discount: null } }];
  });
  const or = MODEL_CATALOG.filter((m) => m.provider === "openrouter").map((m) => ({ id: m.id, context_length: m.contextTokens, pricing: { prompt: "0", completion: "0" } }));
  return { di: { object: "list", data: di }, or: { data: [...or, { id: "openrouter/auto", pricing: { prompt: "-1", completion: "-1" } }] } };
}

function mockFetch(f: ReturnType<typeof feeds>, opts: { diStatus?: number } = {}) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    expect(init?.method).toBe("GET"); // never a completion
    if (url === DEEPINFRA_FEED_URL) return new Response(JSON.stringify(f.di), { status: opts.diStatus ?? 200 });
    if (url === DEEPINFRA_LIST_URL) return new Response("[]", { status: 200 });
    if (url === OPENROUTER_FEED_URL) return new Response(JSON.stringify(f.or), { status: 200 });
    throw new Error(`unexpected url ${url}`);
  });
}

let dir: string;
let paths: PriceSyncPaths;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "price-feed-"));
  paths = { feed: join(dir, "ai-price-feed.json"), history: join(dir, "ai-price-feed-history.jsonl"), renewal: join(dir, "ai-price-policy-renewal.json"), alertState: join(dir, "state", "alert.json") };
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("parsers", () => {
  it("DeepInfra openai feed is USD/1M; OpenRouter USD/token strings → USD/1M; router -1 prices skipped", () => {
    expect(parseDeepInfraOpenAIModels({ data: [{ id: V4, metadata: { pricing: { input_tokens: 0.09, output_tokens: 0.18 }, context_length: 1048576 } }, { id: "embed", metadata: { pricing: {} } }] }))
      .toEqual({ [V4]: { in: 0.09, out: 0.18, context: 1048576, discount: null, discountEndsAt: null, deprecated: false, replacedBy: null } });
    const or = parseOpenRouterModels({ data: [{ id: "deepseek/deepseek-v3.2", pricing: { prompt: "0.00000028", completion: "0.00000042" } }, { id: "openrouter/auto", pricing: { prompt: "-1", completion: "-1" } }] });
    expect(or["deepseek/deepseek-v3.2"]).toMatchObject({ in: 0.28, out: 0.42 });
    expect(or["openrouter/auto"]).toBeUndefined();
  });

  it("pctChange takes the larger in/out move; a zero price becoming non-zero is 100 %", () => {
    expect(pctChange({ in: 0.1, out: 0.2 }, { in: 0.106, out: 0.2 })).toBeCloseTo(6, 6);
    expect(pctChange({ in: 0, out: 0 }, { in: 0.1, out: 0 })).toBe(100);
    expect(pctChange({ in: 0, out: 0 }, { in: 0, out: 0 })).toBe(0);
  });
});

describe("runPriceSync (acceptance)", () => {
  const send = vi.fn(async () => true);
  beforeEach(() => send.mockClear());
  const far = policy(new Date(NOW + 30 * DAY).toISOString());

  it("a 6 % price move on a catalogued model alerts ops — once per UTC day", async () => {
    const f = feeds({ [V4]: { in: 0.0954, out: 0.18 } }); // +6 % input
    const r = await runPriceSync({ policy: far, paths, send, fetchImpl: mockFetch(f), now: () => NOW });
    expect(r.alertable.map((c) => c.id)).toEqual([V4]);
    expect(r.alertable[0]).toMatchObject({ status: "changed", admitted: true, changePct: 6 });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toMatch(/DeepSeek-V4-Flash \[REPORT-ADMITTED\]: 0\.09\/0\.18 → 0\.0954\/0\.18/);
    // second run the same UTC day → no second alert
    const again = await runPriceSync({ policy: far, paths, send, fetchImpl: mockFetch(f), now: () => NOW + 3600_000 });
    expect(again).toMatchObject({ alerted: false, alertSkippedReason: "already_alerted_today" });
    expect(send).toHaveBeenCalledTimes(1);
    // next UTC day → alerts again while the drift persists
    await runPriceSync({ policy: far, paths, send, fetchImpl: mockFetch(f), now: () => NOW + DAY });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("a 4 % move is recorded as minor drift but does not alert", async () => {
    const f = feeds({ [V4]: { in: 0.0936, out: 0.18 } }); // +4 %
    const r = await runPriceSync({ policy: far, paths, send, fetchImpl: mockFetch(f), now: () => NOW });
    expect(r.comparisons.find((c) => c.id === V4)).toMatchObject({ status: "drift_minor", changePct: 4 });
    expect(r.alertable).toEqual([]);
    expect(r).toMatchObject({ alerted: false, alertSkippedReason: "nothing_to_report" });
    expect(send).not.toHaveBeenCalled();
    const history = readFileSync(paths.history, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(history).toHaveLength(1);
    expect(history[0].changed).toEqual([{ provider: "deepinfra", id: V4, from: { in: 0.09, out: 0.18 }, to: { in: 0.0936, out: 0.18 }, pct: 4 }]);
  });

  it("a catalogued model that disappears from its feed alerts", async () => {
    const r = await runPriceSync({ policy: far, paths, send, fetchImpl: mockFetch(feeds({ "zai-org/GLM-5.3-Flash": null })), now: () => NOW });
    expect(r.alertable).toEqual([expect.objectContaining({ id: "zai-org/GLM-5.3-Flash", status: "missing" })]);
    expect(send.mock.calls[0][0]).toMatch(/GLM-5\.3-Flash: no longer in the public feed/);
  });

  it("unchanged prices → snapshot written with catalogued rows only, no alert, no renewal outside the window", async () => {
    const r = await runPriceSync({ policy: far, paths, send, fetchImpl: mockFetch(feeds()), now: () => NOW });
    expect(r.comparisons.every((c) => c.status === "unchanged")).toBe(true);
    expect(send).not.toHaveBeenCalled();
    expect(existsSync(paths.renewal)).toBe(false);
    const snap = JSON.parse(readFileSync(paths.feed, "utf8"));
    expect(snap.summary).toMatchObject({ changed: 0, missing: 0, feed_errors: 0 });
    expect(Object.keys(snap.feeds.openrouter.rows)).not.toContain("openrouter/auto");
  });

  it("policy expiring in ≤ 7 days with unchanged admitted prices → renewal proposal (+30 d) written, alerted, never applied", async () => {
    const soon = policy("2026-10-25T00:00:00Z"); // 4.9 days
    const r = await runPriceSync({ policy: soon, paths, send, fetchImpl: mockFetch(feeds()), now: () => NOW });
    expect(r.renewal).toMatchObject({ status: "proposed", proposed_expires_at: "2026-11-24T00:00:00Z", auto_applied: false });
    const written = JSON.parse(readFileSync(paths.renewal, "utf8"));
    expect(written.status).toBe("proposed");
    expect(written.evidence).toHaveLength(4);
    expect(written.evidence.every((e: { unchanged: boolean }) => e.unchanged)).toBe(true);
    expect(written.apply_steps.join(" ")).toMatch(/REPORT_PRICE_POLICY_EXPIRES_AT = "2026-11-24T00:00:00Z"/);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toMatch(/renewal proposal to 2026-11-24T00:00:00Z .*founder approval required, not applied/);
  });

  it("policy in the window but an admitted price changed → blocked, no extension proposed", async () => {
    const soon = policy("2026-10-25T00:00:00Z");
    const r = await runPriceSync({ policy: soon, paths, send, fetchImpl: mockFetch(feeds({ "deepseek-ai/DeepSeek-V3.2": { in: 0.28, out: 0.38 } })), now: () => NOW });
    expect(r.renewal).toMatchObject({ status: "blocked_price_changed", proposed_expires_at: null });
    expect(send.mock.calls[0][0]).toMatch(/admitted price CHANGED/);
  });

  it("a DeepInfra feed outage → feed_error rows, renewal blocked (unverified), ops told", async () => {
    const r = await runPriceSync({ policy: policy("2026-10-25T00:00:00Z"), paths, send, fetchImpl: mockFetch(feeds(), { diStatus: 503 }), now: () => NOW });
    expect(r.feeds.deepinfra).toMatchObject({ ok: false, error: "HTTP 503" });
    expect(r.comparisons.filter((c) => c.provider === "deepinfra").every((c) => c.status === "feed_error")).toBe(true);
    expect(r.renewal?.status).toBe("blocked_feed_unavailable");
    expect(send.mock.calls[0][0]).toMatch(/deepinfra price feed unavailable/);
  });

  it("uses the API key only when the anonymous DeepInfra GET is refused", async () => {
    const f = feeds();
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      const auth = (init?.headers as Record<string, string> | undefined)?.authorization;
      if (url === DEEPINFRA_FEED_URL) return new Response(JSON.stringify(f.di), { status: auth ? 200 : 401 });
      if (url === DEEPINFRA_LIST_URL) return new Response("[]", { status: 200 });
      return new Response(JSON.stringify(f.or), { status: 200 });
    });
    const r = await runPriceSync({ policy: far, paths, send, fetchImpl, now: () => NOW, deepinfraApiKey: "di-test" });
    expect(r.feeds.deepinfra.ok).toBe(true);
    expect(fetchImpl.mock.calls.filter(([u]) => u === DEEPINFRA_FEED_URL)).toHaveLength(2);
  });
});

describe("buildRenewalProposal / comparePrices", () => {
  it("outside the 7-day window → null", () => {
    expect(buildRenewalProposal(policy(new Date(NOW + 8 * DAY).toISOString()), undefined, NOW)).toBeNull();
  });
  it("manual-priced rows (Groq / Gemini / Claude) are not feed-checked", () => {
    const rows = comparePrices({});
    expect(rows.some((c) => c.id === "gemini-2.5-flash")).toBe(false);
    expect(rows.every((c) => c.status === "feed_error")).toBe(true);
  });
});
