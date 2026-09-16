// Colocated vitest for the S31-A spend guard (spend-guard.ts): the daily AUD
// cap, the OpenRouter credit floor, the day-rollover and the once-per-day
// founder notification. Disk is mocked so the ledger never touches the repo.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fsMock = vi.hoisted(() => {
  const files = new Map<string, string>();
  return {
    files,
    readFileSync: (p: string) => {
      const v = files.get(p);
      if (v === undefined) throw Object.assign(new Error(`ENOENT ${p}`), { code: "ENOENT" });
      return v;
    },
    writeFileSync: (p: string, c: string) => { files.set(p, c); },
  };
});
vi.mock("fs", () => ({ default: fsMock, readFileSync: fsMock.readFileSync, writeFileSync: fsMock.writeFileSync }));

const notif = vi.hoisted(() => ({ insert: vi.fn(async () => true), telegram: vi.fn(async () => true) }));
vi.mock("@/lib/notifications", () => ({ insertNotification: notif.insert }));
vi.mock("@/lib/telegram", () => ({ sendTelegram: notif.telegram }));
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "founder-1" } }) }) }) }),
  }),
}));

import {
  DEFAULT_DAILY_CAP_AUD,
  DEFAULT_OPENROUTER_MIN_CREDIT_USD,
  SPEND_LEDGER_FILE,
  _resetSpendGuardForTests,
  dailyCapAud,
  getSpendGuardStatus,
  isDailyCapReached,
  notifyCapReached,
  openRouterMinCreditUsd,
  readDailySpend,
  recordPaidSpend,
  recordReportSpend,
} from "./spend-guard";

const DAY1 = Date.UTC(2026, 8, 13, 10, 0, 0);
const DAY2 = Date.UTC(2026, 8, 14, 0, 0, 1);

beforeEach(() => {
  fsMock.files.clear();
  _resetSpendGuardForTests();
  notif.insert.mockClear();
  notif.telegram.mockClear();
  delete process.env.AI_DAILY_SPEND_CAP_AUD;
  delete process.env.OPENROUTER_MIN_CREDIT_USD;
  delete process.env.AI_USD_AUD_RATE;
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); });

describe("defaults + env", () => {
  it("cap defaults to A$50 and the OpenRouter floor to US$2; env overrides; garbage falls back", () => {
    expect(DEFAULT_DAILY_CAP_AUD).toBe(50);
    expect(DEFAULT_OPENROUTER_MIN_CREDIT_USD).toBe(2);
    expect(dailyCapAud()).toBe(50);
    expect(openRouterMinCreditUsd()).toBe(2);
    process.env.AI_DAILY_SPEND_CAP_AUD = "120";
    process.env.OPENROUTER_MIN_CREDIT_USD = "5";
    expect(dailyCapAud()).toBe(120);
    expect(openRouterMinCreditUsd()).toBe(5);
    process.env.AI_DAILY_SPEND_CAP_AUD = "abc";
    expect(dailyCapAud()).toBe(50);
  });
});

describe("ledger", () => {
  it("accumulates paid spend per provider, persists, and reads back", () => {
    recordPaidSpend("claude-apikey", 0.5, DAY1);
    recordPaidSpend("deepinfra", 0.25, DAY1);
    recordPaidSpend("groq", 0, DAY1);
    const s = readDailySpend(DAY1);
    expect(s.day).toBe("2026-09-13");
    expect(s.spent_usd).toBeCloseTo(0.75, 8);
    expect(s.calls).toBe(3);
    expect(s.by_provider).toEqual({ "claude-apikey": 0.5, deepinfra: 0.25, groq: 0 });
    expect(JSON.parse(fsMock.files.get(SPEND_LEDGER_FILE) ?? "{}").spent_usd).toBeCloseTo(0.75, 8);
    _resetSpendGuardForTests();
    expect(readDailySpend(DAY1).spent_usd).toBeCloseTo(0.75, 8);
  });

  it("rolls over at UTC midnight — yesterday's spend never blocks today", () => {
    recordPaidSpend("claude-apikey", 100, DAY1);
    expect(isDailyCapReached(DAY1)).toBe(true);
    expect(isDailyCapReached(DAY2)).toBe(false);
    expect(readDailySpend(DAY2).spent_usd).toBe(0);
  });

  it("ignores a negative / NaN cost", () => {
    recordPaidSpend("x", -3, DAY1);
    recordPaidSpend("x", Number.NaN, DAY1);
    expect(readDailySpend(DAY1).spent_usd).toBe(0);
  });

  // S-R3 cost telemetry: per-report real cost sums by tier.
  it("recordReportSpend keeps a per-tier report bucket (count / sum / max / last) without double-counting spent_usd", () => {
    recordPaidSpend("deepinfra", 0.02, DAY1);
    recordReportSpend("standard", 0.02, 27, DAY1);
    recordReportSpend("standard", 0.05, 30, DAY1 + 1000);
    recordReportSpend("free", 0, 15, DAY1 + 2000);
    const s = readDailySpend(DAY1);
    expect(s.spent_usd).toBeCloseTo(0.02, 8);
    expect(s.calls).toBe(1);
    expect(s.reports?.standard).toMatchObject({ count: 2, spent_usd: 0.07, calls: 57, max_usd: 0.05, last_usd: 0.05 });
    expect(s.reports?.free).toMatchObject({ count: 1, spent_usd: 0, calls: 15 });
    _resetSpendGuardForTests();
    expect(readDailySpend(DAY1).reports?.standard?.count).toBe(2);
  });
});

describe("cap", () => {
  it("is reached when USD × FX ≥ cap (default FX 1.55); 0 disables it", () => {
    recordPaidSpend("claude-apikey", 32, DAY1); // 32 × 1.55 = 49.6 < 50
    expect(isDailyCapReached(DAY1)).toBe(false);
    recordPaidSpend("claude-apikey", 0.3, DAY1); // 50.07
    expect(isDailyCapReached(DAY1)).toBe(true);
    const st = getSpendGuardStatus(DAY1);
    expect(st.cap_reached).toBe(true);
    expect(st.spent_aud).toBeCloseTo(50.07, 2);
    expect(st.cap_aud).toBe(50);
    process.env.AI_DAILY_SPEND_CAP_AUD = "0";
    expect(isDailyCapReached(DAY1)).toBe(false);
  });
});

describe("notifyCapReached — once per day", () => {
  it("writes ONE ai_capacity notification to the founder + one Telegram line, then stays quiet for the day", async () => {
    recordPaidSpend("claude-apikey", 40, DAY1);
    expect(await notifyCapReached("daily_cap", { provider: "claude-apikey" }, DAY1)).toBe(true);
    expect(notif.insert).toHaveBeenCalledTimes(1);
    const args = notif.insert.mock.calls[0][0] as unknown as { userId: string; kind: string; dedupeKey: string; payload: Record<string, unknown> };
    expect(args.userId).toBe("founder-1");
    expect(args.kind).toBe("ai_capacity");
    expect(args.dedupeKey).toBe("ai_capacity:daily_cap:2026-09-13");
    expect(args.payload.reason).toBe("daily_cap");
    expect(args.payload.provider).toBe("claude-apikey");
    expect(notif.telegram).toHaveBeenCalledTimes(1);
    expect(String(notif.telegram.mock.calls[0][0])).toMatch(/daily cap/);
    expect(await notifyCapReached("daily_cap", {}, DAY1 + 60_000)).toBe(false);
    expect(notif.insert).toHaveBeenCalledTimes(1);
    // Next day → allowed again.
    expect(await notifyCapReached("openrouter_low_credit", {}, DAY2)).toBe(true);
    expect(String(notif.telegram.mock.calls[1][0])).toMatch(/OpenRouter/);
  });
});
