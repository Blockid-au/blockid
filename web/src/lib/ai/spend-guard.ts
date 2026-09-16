// S31-A — cost + quota guardrails for the paid AI tiers.
//
//   AI_DAILY_SPEND_CAP_AUD   (default 50)  — once the estimated paid spend for
//                            the current UTC day reaches this, every PAID
//                            provider (Anthropic API key, Haiku direct,
//                            DeepInfra, OpenAI, Gemini, OpenRouter paid) is
//                            skipped by the dispatcher. Free tiers and the
//                            Claude subscription OAuth path keep serving.
//   OPENROUTER_MIN_CREDIT_USD (default 2) — OpenRouter is skipped when the
//                            probe reports fewer credits than this, so the
//                            account is never drained to zero mid-report.
//   AI_USD_AUD_RATE          (default 1.55) — the FX used for the AUD cap.
//
// The ledger is one small JSON file per day (content/reports/ai-spend-daily
// .json, rewritten in place, the previous day is dropped) so a restart never
// forgets the day's spend. Every write is fail-open: an unwritable disk must
// not block an AI call — it just means the cap is enforced from memory.
//
// When the cap trips, the founder is told ONCE per day: a
// `founder_notifications` row (kind `ai_capacity`, dedupe key
// `ai_capacity:cap:<day>`) plus a Telegram line. Both are best-effort.

import * as fs from "fs";

export const DEFAULT_DAILY_CAP_AUD = 50;
export const DEFAULT_OPENROUTER_MIN_CREDIT_USD = 2;
export const DEFAULT_USD_AUD_RATE = 1.55;
export const SPEND_LEDGER_FILE = "/home/dovanlong/blockid.au/web/content/reports/ai-spend-daily.json";

/** S-R3 cost telemetry: one bucket per report tier (goal doc §3 D9 COGS check). */
export interface ReportSpendBucket {
  count: number;
  spent_usd: number;
  calls: number;
  /** Highest single-report cost seen today. */
  max_usd: number;
  /** Cost of the most recent report. */
  last_usd: number;
  last_at: string;
}

export interface DailySpend {
  /** UTC day, "2026-09-13". */
  day: string;
  spent_usd: number;
  calls: number;
  by_provider: Record<string, number>;
  /** ISO ts of the once-per-day cap notification, if sent. */
  cap_notified_at?: string;
  /** S-R3: real per-report cost sums (Σ callAI cost_usd), keyed by tier. */
  reports?: Record<string, ReportSpendBucket>;
}

function dayOf(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function dailyCapAud(): number {
  return envNumber("AI_DAILY_SPEND_CAP_AUD", DEFAULT_DAILY_CAP_AUD);
}
export function openRouterMinCreditUsd(): number {
  return envNumber("OPENROUTER_MIN_CREDIT_USD", DEFAULT_OPENROUTER_MIN_CREDIT_USD);
}
export function usdToAudRate(): number {
  return envNumber("AI_USD_AUD_RATE", DEFAULT_USD_AUD_RATE);
}

let memo: DailySpend | null = null;

function fresh(now: number): DailySpend {
  return { day: dayOf(now), spent_usd: 0, calls: 0, by_provider: {} };
}

export function readDailySpend(now: number = Date.now()): DailySpend {
  const today = dayOf(now);
  if (memo && memo.day === today) return memo;
  try {
    const parsed = JSON.parse(fs.readFileSync(SPEND_LEDGER_FILE, "utf-8")) as Partial<DailySpend>;
    if (parsed && parsed.day === today && typeof parsed.spent_usd === "number") {
      memo = {
        day: today,
        spent_usd: parsed.spent_usd,
        calls: typeof parsed.calls === "number" ? parsed.calls : 0,
        by_provider: parsed.by_provider && typeof parsed.by_provider === "object" ? parsed.by_provider : {},
        cap_notified_at: typeof parsed.cap_notified_at === "string" ? parsed.cap_notified_at : undefined,
        reports: parsed.reports && typeof parsed.reports === "object" ? parsed.reports : undefined,
      };
      return memo;
    }
  } catch {
    /* no ledger yet / unreadable → fresh day */
  }
  memo = fresh(now);
  return memo;
}

function persist(s: DailySpend): void {
  memo = s;
  try {
    fs.writeFileSync(SPEND_LEDGER_FILE, JSON.stringify(s));
  } catch {
    /* fail-open: the in-memory ledger still enforces the cap */
  }
}

/** Add an estimated paid cost. Free-tier calls should pass 0 (they still
 *  count as calls, which the status page reports). */
export function recordPaidSpend(provider: string, usd: number, now: number = Date.now()): DailySpend {
  const s = { ...readDailySpend(now), by_provider: { ...readDailySpend(now).by_provider } };
  const add = Number.isFinite(usd) && usd > 0 ? usd : 0;
  s.spent_usd += add;
  s.calls += 1;
  s.by_provider[provider] = (s.by_provider[provider] ?? 0) + add;
  persist(s);
  return s;
}

/**
 * S-R3 cost telemetry: record one finished report's REAL cost (the sum of
 * `cost_usd` the provider chain reported per call — not a per-call constant)
 * under its tier so `ai-spend-daily.json` carries the D9 COGS check
 * (standard ≤ A$0.60 median). Does not touch `spent_usd` / `calls` — every
 * underlying call was already recorded by `recordPaidSpend` in ai-client;
 * this is the per-report view of the same money.
 */
export function recordReportSpend(tier: string, usd: number, calls: number, now: number = Date.now()): DailySpend {
  const cur = readDailySpend(now);
  const s: DailySpend = { ...cur, by_provider: { ...cur.by_provider }, reports: { ...(cur.reports ?? {}) } };
  const add = Number.isFinite(usd) && usd > 0 ? usd : 0;
  const prev = s.reports![tier] ?? { count: 0, spent_usd: 0, calls: 0, max_usd: 0, last_usd: 0, last_at: "" };
  s.reports![tier] = {
    count: prev.count + 1,
    spent_usd: prev.spent_usd + add,
    calls: prev.calls + (Number.isFinite(calls) && calls > 0 ? Math.floor(calls) : 0),
    max_usd: Math.max(prev.max_usd, add),
    last_usd: add,
    last_at: new Date(now).toISOString(),
  };
  persist(s);
  return s;
}

export function dailySpendAud(now: number = Date.now()): number {
  return readDailySpend(now).spent_usd * usdToAudRate();
}

export function isDailyCapReached(now: number = Date.now()): boolean {
  const cap = dailyCapAud();
  if (cap <= 0) return false; // 0 = cap disabled
  return dailySpendAud(now) >= cap;
}

export interface SpendGuardStatus {
  day: string;
  spent_usd: number;
  spent_aud: number;
  cap_aud: number;
  cap_reached: boolean;
  calls: number;
  by_provider: Record<string, number>;
}

export function getSpendGuardStatus(now: number = Date.now()): SpendGuardStatus {
  const s = readDailySpend(now);
  const spentAud = s.spent_usd * usdToAudRate();
  const cap = dailyCapAud();
  return {
    day: s.day,
    spent_usd: Math.round(s.spent_usd * 10000) / 10000,
    spent_aud: Math.round(spentAud * 100) / 100,
    cap_aud: cap,
    cap_reached: cap > 0 && spentAud >= cap,
    calls: s.calls,
    by_provider: s.by_provider,
  };
}

// ── Founder notification (once per UTC day) ───────────────────────────

/** Resolve the platform founder's app_users id (ADMIN_EMAIL). Cached. */
let founderIdMemo: { id: string | null; at: number } | null = null;
async function founderUserId(): Promise<string | null> {
  if (founderIdMemo && Date.now() - founderIdMemo.at < 60 * 60_000) return founderIdMemo.id;
  try {
    const { getSupabaseAdmin } = await import("@/lib/supabase");
    const supabase = getSupabaseAdmin();
    if (!supabase) return null;
    const email = (process.env.ADMIN_EMAIL ?? "admin@blockid.au").trim().toLowerCase();
    const { data } = await supabase.from("app_users").select("id").eq("email", email).maybeSingle();
    const id = (data as { id?: string } | null)?.id ?? null;
    founderIdMemo = { id, at: Date.now() };
    return id;
  } catch {
    return null;
  }
}

/**
 * Tell the founder the paid tier is paused for the day. Returns true when a
 * notification was attempted this call (false = already sent today or
 * nothing to send). Never throws.
 */
export async function notifyCapReached(
  reason: "daily_cap" | "openrouter_low_credit",
  detail: Record<string, unknown> = {},
  now: number = Date.now(),
): Promise<boolean> {
  const s = readDailySpend(now);
  if (s.cap_notified_at) return false;
  persist({ ...s, cap_notified_at: new Date(now).toISOString() });
  const status = getSpendGuardStatus(now);
  const line = reason === "daily_cap"
    ? `AI paid tier paused: A$${status.spent_aud.toFixed(2)} of the A$${status.cap_aud} daily cap spent (${status.calls} calls). Free tiers + Claude subscription keep serving; paid resumes at 00:00 UTC or raise AI_DAILY_SPEND_CAP_AUD.`
    : `OpenRouter paused: credit below US$${openRouterMinCreditUsd()} floor. Top up at openrouter.ai/credits or lower OPENROUTER_MIN_CREDIT_USD.`;
  try {
    const uid = await founderUserId();
    if (uid) {
      const { insertNotification } = await import("@/lib/notifications");
      await insertNotification({
        userId: uid,
        kind: "ai_capacity",
        payload: { reason, ...status, ...detail },
        dedupeKey: `ai_capacity:${reason}:${s.day}`,
        throttleMs: 24 * 60 * 60_000,
      });
    }
  } catch {
    /* best-effort */
  }
  try {
    const { sendTelegram } = await import("@/lib/telegram");
    await sendTelegram(`⚠️ ${line}`);
  } catch {
    /* best-effort */
  }
  console.warn(`[ai-client:spend-guard] ${line}`);
  return true;
}

/** Test-only. */
export function _resetSpendGuardForTests(): void {
  memo = null;
  founderIdMemo = null;
}
