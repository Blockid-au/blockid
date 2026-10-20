// A3 acceptance (pricing v5 §7.4) — balance / runway / alerts on mocked fetch.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEEPINFRA_ME_URL, OPENROUTER_CREDITS_URL, OPENROUTER_KEY_URL,
  budgetFloors, levelFor, parseDeepInfraChecklist, readFreeTierStatus, readGeminiBudget, runBalanceCheck, trailingBurnUsd,
  type BalanceCheckDeps, type SpendDay,
} from "./balances";
import { balanceRoutedProviders, effectiveBalanceFlags } from "./balance-flags";

const NOW = Date.parse("2026-10-20T12:00:00Z");
const DAY = 86_400_000;

/** Seven closed days of DeepInfra spend at US$1/day + half a day today. */
function history(perDay = 1, provider = "deepinfra"): SpendDay[] {
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(NOW - (i + 1) * DAY).toISOString().slice(0, 10);
    return { day, spent_usd: perDay, by_provider: { [provider]: perDay } };
  });
}
const today = (usd: number, provider = "deepinfra"): SpendDay => ({ day: "2026-10-20", spent_usd: usd, by_provider: { [provider]: usd } });

interface Accounts { diBalance: number; diRecent?: number; suspended?: boolean; orCredits: number; orUsage: number; orWeekly?: number }
function mockFetch(a: Accounts) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    expect(init?.method).toBe("GET");
    expect((init?.headers as Record<string, string>).authorization).toMatch(/^Bearer /);
    if (url === DEEPINFRA_ME_URL) return new Response(JSON.stringify({ uid: "u", checklist: { stripe_balance: -a.diBalance, recent: a.diRecent ?? 0, limit: null, suspended: a.suspended ?? false, overdue_invoices: 0, topup: false } }), { status: 200 });
    if (url === OPENROUTER_CREDITS_URL) return new Response(JSON.stringify({ data: { total_credits: a.orCredits, total_usage: a.orUsage } }), { status: 200 });
    if (url === OPENROUTER_KEY_URL) return new Response(JSON.stringify({ data: { usage_daily: 0, usage_weekly: a.orWeekly ?? 0, free_model_daily_requests: { used: 59, limit: 1000, remaining: 941 } } }), { status: 200 });
    throw new Error(`unexpected ${url}`);
  });
}

let dir: string;
const send = vi.fn(async () => true);
const notifyFounder = vi.fn(async () => true);
function deps(a: Accounts, spend: { history: SpendDay[]; today: SpendDay | null }, now = NOW): BalanceCheckDeps {
  return {
    paths: { balances: join(dir, "ai-balances.json"), flags: join(dir, "ai-balance-flags.json"), alertState: join(dir, "state", "alerts.json") },
    keys: { deepinfra: "di-test", openrouter: "or-test" },
    configured: { gemini: false, groq: true, cerebras: false, sambanova: false },
    readSpend: () => spend,
    readProbes: () => ({ groq: { status: "valid", http_status: 200, checked_at: new Date(now - 60_000).toISOString() } }),
    readHealth: () => [{ provider: "groq", model: "openai/gpt-oss-120b", http_status: 200, checked_at: new Date(now - 60_000).toISOString() }],
    send,
    notifyFounder,
    fetchImpl: mockFetch(a),
    now: () => now,
  };
}
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ai-balances-"));
  send.mockClear();
  notifyFounder.mockClear();
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const healthyOpenRouter = { orCredits: 30, orUsage: 5 };

describe("A3 acceptance — DeepInfra US$2 with burn", () => {
  it("→ critical, flag set, exactly ONE critical alert (ops + founder) per UTC day", async () => {
    const spend = { history: history(1), today: today(0.5) };
    const r = await runBalanceCheck(deps({ diBalance: 2, ...healthyOpenRouter }, spend));
    expect(r.providers.deepinfra).toMatchObject({ level: "critical", balance_usd: 2 });
    expect(r.providers.deepinfra.burn_usd_per_day).toBeCloseTo(7.5 / 7.5, 6); // US$7.5 over 7.5 days
    expect(r.providers.deepinfra.runway_days).toBeCloseTo(2, 2);
    expect(r.flags).toMatchObject({ deepinfra_critical: true, openrouter_paid_disabled: false });
    expect(JSON.parse(readFileSync(join(dir, "ai-balance-flags.json"), "utf8"))).toMatchObject({ deepinfra_critical: true });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toMatch(/AI balance CRITICAL — deepinfra/);
    expect(send.mock.calls[0][0]).toMatch(/report jobs are QUEUED/);
    expect(notifyFounder).toHaveBeenCalledTimes(1);
    expect(notifyFounder.mock.calls[0][0]).toMatchObject({ provider: "deepinfra", level: "critical", dedupeKey: "ai_balance:deepinfra:critical:2026-10-20" });
    expect(r.alerts).toEqual([{ key: "deepinfra:critical:2026-10-20", sent: true }]);

    // the next 23 hourly runs the same UTC day → no further alert, flag stays set
    for (let h = 1; h < 12; h += 1) {
      const again = await runBalanceCheck(deps({ diBalance: 2, ...healthyOpenRouter }, spend, NOW + h * 3600_000));
      expect(again.flags.deepinfra_critical).toBe(true);
      expect(again.alerts).toEqual([]);
    }
    expect(send).toHaveBeenCalledTimes(1);
    expect(notifyFounder).toHaveBeenCalledTimes(1);

    // next UTC day, still critical → one more alert
    await runBalanceCheck(deps({ diBalance: 1.5, ...healthyOpenRouter }, spend, NOW + DAY));
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("the flag routes non-report classes to the free tier and queues report jobs (pure routing rule + reader)", () => {
    const flags = effectiveBalanceFlags({ updated_at: new Date(NOW).toISOString(), deepinfra_critical: true, openrouter_paid_disabled: false }, NOW);
    const tiers: Record<string, "quality" | "quality-cost" | "subscription" | "free" | "paid"> = { "claude-apikey": "quality", deepinfra: "quality-cost", gemini: "quality-cost", "claude-oauth": "subscription", groq: "free", openrouter: "free", "claude-haiku-direct": "paid" };
    const all = ["claude-apikey", "deepinfra", "gemini", "claude-oauth", "groq", "openrouter", "claude-haiku-direct"];
    expect(balanceRoutedProviders(all, flags, (p) => tiers[p])).toEqual(["groq", "openrouter"]);
    // no free provider configured → the subscription last resort, never paid
    expect(balanceRoutedProviders(["deepinfra", "claude-oauth", "gemini"], flags, (p) => tiers[p])).toEqual(["claude-oauth"]);
    // without the flag nothing changes
    expect(balanceRoutedProviders(all, effectiveBalanceFlags(null, NOW), (p) => tiers[p])).toEqual(all);
    // stale flags (cron dead > 3 h) fail open
    expect(effectiveBalanceFlags({ updated_at: new Date(NOW - 4 * 3600_000).toISOString(), deepinfra_critical: true }, NOW).deepinfra_critical).toBe(false);
  });

  it("recovery: a topped-up account clears the flag on the next run", async () => {
    await runBalanceCheck(deps({ diBalance: 2, ...healthyOpenRouter }, { history: history(1), today: today(0.5) }));
    const r = await runBalanceCheck(deps({ diBalance: 100, ...healthyOpenRouter }, { history: history(1), today: today(0.5) }, NOW + 3600_000));
    expect(r.providers.deepinfra.level).toBe("ok");
    expect(r.flags.deepinfra_critical).toBe(false);
  });

  it("an unreadable DeepInfra checklist keeps the previous flag (no flapping on a transient error)", async () => {
    await runBalanceCheck(deps({ diBalance: 2, ...healthyOpenRouter }, { history: history(1), today: today(0.5) }));
    const d = deps({ diBalance: 2, ...healthyOpenRouter }, { history: history(1), today: today(0.5) }, NOW + 3600_000);
    d.fetchImpl = vi.fn(async (url: string) => url === DEEPINFRA_ME_URL ? new Response("bad gateway", { status: 502 }) : (mockFetch({ diBalance: 0, ...healthyOpenRouter }))(url, { method: "GET", headers: { authorization: "Bearer x" } }));
    const r = await runBalanceCheck(d);
    expect(r.providers.deepinfra.level).toBe("unknown");
    expect(r.flags.deepinfra_critical).toBe(true);
    expect(r.flags.reasons?.deepinfra_critical).toMatch(/carried forward/);
  });
});

describe("A3 acceptance — OpenRouter low", () => {
  it("credit US$1.55 → critical: only the paid-OpenRouter flag is set; DeepInfra untouched", async () => {
    const r = await runBalanceCheck(deps({ diBalance: 67.37, orCredits: 30, orUsage: 28.45 }, { history: history(0.01), today: today(0.005) }));
    expect(r.providers.openrouter).toMatchObject({ level: "critical", balance_usd: 1.55 });
    expect(r.providers.openrouter.details).toMatchObject({ free_requests_remaining: 941 });
    expect(r.providers.deepinfra.level).toBe("ok");
    expect(r.flags).toMatchObject({ openrouter_paid_disabled: true, deepinfra_critical: false });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toMatch(/paid OpenRouter models disabled; :free models keep serving/);
  });

  it("credit US$8 with no burn → warn only (no flag)", async () => {
    const r = await runBalanceCheck(deps({ diBalance: 67, orCredits: 10, orUsage: 2 }, { history: [], today: null }));
    expect(r.providers.openrouter.level).toBe("warn");
    expect(r.flags.openrouter_paid_disabled).toBe(false);
  });
});

describe("levels, burn and free tiers", () => {
  it("thresholds: warn < 14 d or < US$10; critical < 3 d or < US$3", () => {
    expect(levelFor(50, 20).level).toBe("ok");
    expect(levelFor(9.99, null).level).toBe("warn");
    expect(levelFor(50, 13.9).level).toBe("warn");
    expect(levelFor(2.99, null).level).toBe("critical");
    expect(levelFor(50, 2.9).level).toBe("critical");
    expect(levelFor(null, null).level).toBe("unknown");
    expect(budgetFloors(10)).toEqual({ warn: 2.5, critical: 1 });
    expect(budgetFloors(200)).toEqual({ warn: 10, critical: 3 });
  });

  it("burn = trailing 7 closed days + today's elapsed fraction (floored at 6 h); duplicates and older days ignored", () => {
    const h = [...history(1), { day: "2026-10-01", spent_usd: 99, by_provider: { deepinfra: 99 } }, history(1)[0]];
    expect(trailingBurnUsd(h, today(0.5), "deepinfra", NOW)).toMatchObject({ burnPerDay: 1, daysObserved: 7.5 });
    const early = Date.parse("2026-10-20T00:30:00Z");
    expect(trailingBurnUsd([], today(0.25), "deepinfra", early).burnPerDay).toBe(1); // 0.25 / 0.25 day floor
    expect(trailingBurnUsd([], null, "deepinfra", NOW).burnPerDay).toBeNull();
  });

  it("checklist parsing: negative stripe_balance is spendable, `recent` usage is deducted", () => {
    expect(parseDeepInfraChecklist({ checklist: { stripe_balance: -67.53, recent: 0.16, suspended: false } })).toMatchObject({ balanceUsd: 67.37, suspended: false });
    expect(parseDeepInfraChecklist({ stripe_balance: 4, recent: 0 }).balanceUsd).toBe(-4); // money owed
  });

  it("a suspended DeepInfra account is critical whatever the balance", async () => {
    const r = await runBalanceCheck(deps({ diBalance: 500, suspended: true, ...healthyOpenRouter }, { history: [], today: null }));
    expect(r.providers.deepinfra.level).toBe("critical");
    expect(r.providers.deepinfra.reasons[0]).toBe("account suspended");
  });

  it("free tiers: 402 probe → critical, mostly-429 health → warn, nothing recent → unknown", () => {
    const fresh = new Date(NOW - 60_000).toISOString();
    expect(readFreeTierStatus("cerebras", { configured: true, probe: { status: "quota_exceeded", http_status: 402, checked_at: fresh }, health: [], now: NOW }).level).toBe("critical");
    expect(readFreeTierStatus("groq", { configured: true, probe: { status: "valid", checked_at: fresh }, health: [{ provider: "groq", http_status: 429, checked_at: fresh }, { provider: "groq", http_status: 429, checked_at: fresh }, { provider: "groq", http_status: 200, checked_at: fresh }], now: NOW }).level).toBe("warn");
    expect(readFreeTierStatus("sambanova", { configured: true, probe: null, health: [], now: NOW }).level).toBe("unknown");
    expect(readFreeTierStatus("sambanova", { configured: false, probe: null, health: [], now: NOW }).level).toBe("unknown");
  });

  it("Gemini: month-to-date ledger vs the monthly budget", () => {
    const g = readGeminiBudget({ configured: true, budgetUsd: 10, history: history(1, "gemini"), today: today(0.5, "gemini"), now: NOW });
    expect(g.details).toMatchObject({ month_to_date_usd: 7.5 });
    expect(g.balance_usd).toBe(2.5);
    expect(g.level).toBe("critical"); // runway 2.5 d
  });
});
