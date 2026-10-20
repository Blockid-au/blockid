// A3 (pricing v5 §7.4, G35) — AI provider balances, burn, runway and alerts.
//
// One hourly pass (/api/cron/ai-balance) produces, per provider:
//   balance_usd        DeepInfra  GET /v1/me?checklist=true → checklist.stripe_balance
//                                 (negative = prepaid funds) minus `recent` (usage
//                                 since the last invoice, not yet deducted);
//                                 `suspended` / overdue invoices / a reached spend
//                                 `limit` are critical on their own.
//                      OpenRouter GET /api/v1/credits (total_credits − total_usage)
//                                 + GET /api/v1/key (usage_daily/weekly, free-model
//                                 daily request counter).
//                      Gemini     estimated: monthly budget (GEMINI_MONTHLY_BUDGET_USD,
//                                 default US$10) − month-to-date ledger spend.
//                      Groq / Cerebras / SambaNova  free tiers — no balance; status
//                                 from the provider probe + recent 401/402/429 health rows.
//   burn_usd_per_day   trailing 7 closed days of content/reports/ai-spend-history.jsonl
//                      + today's ai-spend-daily.json, per provider (OpenRouter: the
//                      key's own usage counters when larger).
//   runway_days        balance ÷ burn (null when burn is 0).
//   level              warn  < 14 days or < US$10 · critical < 3 days or < US$3
//                      (a monthly budget scales the US$ floors to ≤ 25 % / 10 % of it).
//
// Effects (written to content/reports/ai-balance-flags.json, read by the
// dispatcher through lib/ai/balance-flags.ts):
//   DeepInfra critical  → report-scoped jobs queued; every other call free-tier only.
//   OpenRouter critical → paid OpenRouter ids off (`:free` keeps serving).
// Alerts: ops (Telegram → ops-alert e-mail fallback) + a founder_notifications
// row, deduped per (provider, level, UTC day).
//
// GET-only network, keys never logged or written. Pure + injectable so the
// acceptance suite runs on mocked fetch and a temp dir.

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { BalanceFlags } from "./balance-flags";

export const WARN_RUNWAY_DAYS = 14;
export const CRITICAL_RUNWAY_DAYS = 3;
export const WARN_BALANCE_USD = 10;
export const CRITICAL_BALANCE_USD = 3;
export const DEFAULT_GEMINI_MONTHLY_BUDGET_USD = 10;
export const BURN_WINDOW_DAYS = 7;
const DAY_MS = 86_400_000;
const FETCH_TIMEOUT_MS = 10_000;
/** Probe / health evidence older than this is ignored for the free tiers. */
const HEALTH_MAX_AGE_MS = 2 * 60 * 60_000;

export const DEEPINFRA_ME_URL = "https://api.deepinfra.com/v1/me?checklist=true";
export const OPENROUTER_CREDITS_URL = "https://openrouter.ai/api/v1/credits";
export const OPENROUTER_KEY_URL = "https://openrouter.ai/api/v1/key";

export type BalanceLevel = "ok" | "warn" | "critical" | "unknown";
export type BalanceProvider = "deepinfra" | "openrouter" | "gemini" | "groq" | "cerebras" | "sambanova";
export const BALANCE_PROVIDERS: readonly BalanceProvider[] = ["deepinfra", "openrouter", "gemini", "groq", "cerebras", "sambanova"];

export interface ProviderBalance {
  provider: BalanceProvider;
  kind: "prepaid" | "monthly_budget" | "free_tier";
  configured: boolean;
  balance_usd: number | null;
  burn_usd_per_day: number | null;
  runway_days: number | null;
  level: BalanceLevel;
  reasons: string[];
  source: string;
  checked_at: string;
  details?: Record<string, number | string | boolean | null>;
  /** Low balance on a provider we deliberately do not spend on (no paid burn):
   *  routing flags still apply, but no ops/founder alert is sent (G35 alert fatigue). */
  alert_suppressed?: string;
}

export interface BalancesSnapshot {
  updated_at: string;
  thresholds: { warn_days: number; critical_days: number; warn_usd: number; critical_usd: number; burn_window_days: number };
  providers: Record<BalanceProvider, ProviderBalance>;
  flags: BalanceFlags;
}

/** One ledger day (ai-spend-history.jsonl row / ai-spend-daily.json). */
export interface SpendDay {
  day: string;
  spent_usd: number;
  by_provider?: Record<string, number>;
}

// ── Levels ────────────────────────────────────────────────────────────

export function levelFor(balanceUsd: number | null, runwayDays: number | null, floors: { warn: number; critical: number } = { warn: WARN_BALANCE_USD, critical: CRITICAL_BALANCE_USD }): { level: BalanceLevel; reasons: string[] } {
  if (balanceUsd === null) return { level: "unknown", reasons: ["balance unavailable"] };
  const reasons: string[] = [];
  let level: BalanceLevel = "ok";
  const bump = (to: BalanceLevel, why: string) => {
    reasons.push(why);
    if (to === "critical" || (to === "warn" && level === "ok")) level = to;
  };
  if (balanceUsd < floors.critical) bump("critical", `balance US$${balanceUsd.toFixed(2)} < US$${floors.critical}`);
  else if (balanceUsd < floors.warn) bump("warn", `balance US$${balanceUsd.toFixed(2)} < US$${floors.warn}`);
  if (runwayDays !== null) {
    if (runwayDays < CRITICAL_RUNWAY_DAYS) bump("critical", `runway ${runwayDays.toFixed(1)} d < ${CRITICAL_RUNWAY_DAYS} d`);
    else if (runwayDays < WARN_RUNWAY_DAYS) bump("warn", `runway ${runwayDays.toFixed(1)} d < ${WARN_RUNWAY_DAYS} d`);
  }
  return { level, reasons };
}

const round = (n: number, dp = 4) => Math.round(n * 10 ** dp) / 10 ** dp;

export function runwayDays(balanceUsd: number | null, burnPerDay: number | null): number | null {
  if (balanceUsd === null || burnPerDay === null || burnPerDay <= 0) return null;
  return round(Math.max(0, balanceUsd) / burnPerDay, 2);
}

// ── Burn ──────────────────────────────────────────────────────────────

/**
 * Average daily burn for `provider` over the last BURN_WINDOW_DAYS closed days
 * plus today. Today counts as the elapsed fraction of the UTC day (floored at
 * 6 h, so one early call cannot extrapolate to a huge rate). Null when the
 * ledger has no data at all for the window.
 */
export function trailingBurnUsd(history: readonly SpendDay[], today: SpendDay | null, provider: string, now: number): { burnPerDay: number | null; daysObserved: number; spentInWindow: number } {
  const todayKey = new Date(now).toISOString().slice(0, 10);
  const from = new Date(now - BURN_WINDOW_DAYS * DAY_MS).toISOString().slice(0, 10);
  const seen = new Set<string>();
  let spent = 0;
  let days = 0;
  for (const row of history) {
    if (!row || typeof row.day !== "string" || row.day >= todayKey || row.day < from || seen.has(row.day)) continue;
    seen.add(row.day);
    spent += Math.max(0, row.by_provider?.[provider] ?? 0);
    days += 1;
  }
  let todayFraction = 0;
  if (today && today.day === todayKey) {
    spent += Math.max(0, today.by_provider?.[provider] ?? 0);
    const midnight = Date.parse(`${todayKey}T00:00:00Z`);
    todayFraction = Math.max(0.25, Math.min(1, (now - midnight) / DAY_MS));
  }
  const denom = days + todayFraction;
  if (denom <= 0) return { burnPerDay: null, daysObserved: 0, spentInWindow: 0 };
  return { burnPerDay: round(spent / denom, 6), daysObserved: round(denom, 2), spentInWindow: round(spent, 6) };
}

/** Month-to-date spend for `provider` from the ledger (UTC month). */
export function monthToDateUsd(history: readonly SpendDay[], today: SpendDay | null, provider: string, now: number): number {
  const month = new Date(now).toISOString().slice(0, 7);
  const todayKey = new Date(now).toISOString().slice(0, 10);
  const seen = new Set<string>();
  let sum = 0;
  for (const row of history) {
    if (!row || typeof row.day !== "string" || !row.day.startsWith(month) || row.day >= todayKey || seen.has(row.day)) continue;
    seen.add(row.day);
    sum += Math.max(0, row.by_provider?.[provider] ?? 0);
  }
  if (today && today.day === todayKey) sum += Math.max(0, today.by_provider?.[provider] ?? 0);
  return round(sum, 6);
}

// ── Provider readers ──────────────────────────────────────────────────

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

async function getJson(fetchImpl: FetchLike, url: string, key: string): Promise<{ status: number; json: unknown }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, { method: "GET", headers: { authorization: `Bearer ${key}`, accept: "application/json" }, signal: ctrl.signal });
    const text = await res.text();
    let json: unknown = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, json };
  } finally {
    clearTimeout(t);
  }
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const errText = (err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  return /abort/i.test(msg) ? `timeout after ${FETCH_TIMEOUT_MS}ms` : msg.slice(0, 120);
};

export interface DeepInfraChecklist {
  balanceUsd: number | null;
  stripeBalance: number | null;
  recentUsage: number | null;
  limit: number | null;
  suspended: boolean;
  overdueInvoices: number;
  topup: boolean;
}

/** `/v1/me?checklist=true` (or `/payment/checklist`) → spendable balance. */
export function parseDeepInfraChecklist(json: unknown): DeepInfraChecklist {
  const root = (json ?? {}) as Record<string, unknown>;
  const c = (root.checklist && typeof root.checklist === "object" ? root.checklist : root) as Record<string, unknown>;
  const stripe = num(c.stripe_balance);
  const recent = num(c.recent) ?? 0;
  // stripe_balance: negative = funds ready to spend, positive = money owed.
  const balance = stripe === null ? null : round(-stripe - Math.max(0, recent), 4);
  return {
    balanceUsd: balance,
    stripeBalance: stripe,
    recentUsage: num(c.recent),
    limit: num(c.limit),
    suspended: c.suspended === true,
    overdueInvoices: num(c.overdue_invoices) ?? 0,
    topup: c.topup === true,
  };
}

export async function readDeepInfraBalance(fetchImpl: FetchLike, key: string | undefined, burn: number | null, now: number): Promise<ProviderBalance> {
  const base = { provider: "deepinfra" as const, kind: "prepaid" as const, source: DEEPINFRA_ME_URL, checked_at: new Date(now).toISOString(), burn_usd_per_day: burn };
  if (!key) return { ...base, configured: false, balance_usd: null, runway_days: null, level: "unknown", reasons: ["DEEPINFRA_API_KEY not set"] };
  try {
    const r = await getJson(fetchImpl, DEEPINFRA_ME_URL, key);
    if (r.status === 401 || r.status === 403) return { ...base, configured: true, balance_usd: null, runway_days: null, level: "critical", reasons: [`key rejected (HTTP ${r.status})`] };
    if (r.status !== 200) return { ...base, configured: true, balance_usd: null, runway_days: null, level: "unknown", reasons: [`checklist HTTP ${r.status}`] };
    const c = parseDeepInfraChecklist(r.json);
    const runway = runwayDays(c.balanceUsd, burn);
    const { level, reasons } = levelFor(c.balanceUsd, runway);
    let lvl = level;
    if (c.suspended) { lvl = "critical"; reasons.unshift("account suspended"); }
    if (c.overdueInvoices > 0) { lvl = "critical"; reasons.unshift(`${c.overdueInvoices} overdue invoice(s)`); }
    if (c.limit !== null && c.recentUsage !== null && c.recentUsage >= c.limit) { lvl = "critical"; reasons.unshift(`spend limit US$${c.limit} reached`); }
    return {
      ...base, configured: true, balance_usd: c.balanceUsd, runway_days: runway, level: lvl, reasons,
      details: { stripe_balance: c.stripeBalance, usage_since_invoice: c.recentUsage, limit: c.limit, suspended: c.suspended, auto_topup: c.topup },
    };
  } catch (err) {
    return { ...base, configured: true, balance_usd: null, runway_days: null, level: "unknown", reasons: [errText(err)] };
  }
}

export async function readOpenRouterBalance(fetchImpl: FetchLike, key: string | undefined, ledgerBurn: number | null, now: number): Promise<ProviderBalance> {
  const base = { provider: "openrouter" as const, kind: "prepaid" as const, source: OPENROUTER_CREDITS_URL, checked_at: new Date(now).toISOString() };
  if (!key) return { ...base, configured: false, balance_usd: null, burn_usd_per_day: ledgerBurn, runway_days: null, level: "unknown", reasons: ["OPENROUTER_API_KEY not set"] };
  try {
    const [credits, keyInfo] = await Promise.all([getJson(fetchImpl, OPENROUTER_CREDITS_URL, key), getJson(fetchImpl, OPENROUTER_KEY_URL, key).catch(() => ({ status: 0, json: null }))]);
    if (credits.status === 401 || credits.status === 403) return { ...base, configured: true, balance_usd: null, burn_usd_per_day: ledgerBurn, runway_days: null, level: "critical", reasons: [`key rejected (HTTP ${credits.status})`] };
    const d = ((credits.json as { data?: Record<string, unknown> } | null)?.data ?? {}) as Record<string, unknown>;
    const total = num(d.total_credits), used = num(d.total_usage);
    if (credits.status !== 200 || total === null) return { ...base, configured: true, balance_usd: null, burn_usd_per_day: ledgerBurn, runway_days: null, level: "unknown", reasons: [`credits HTTP ${credits.status}`] };
    const balance = round(total - (used ?? 0), 4);
    const k = (keyInfo.status === 200 ? ((keyInfo.json as { data?: Record<string, unknown> } | null)?.data ?? {}) : {}) as Record<string, unknown>;
    const weekly = num(k.usage_weekly), daily = num(k.usage_daily);
    const keyBurn = weekly !== null ? Math.max(weekly / 7, daily ?? 0) : null;
    const burn = keyBurn !== null || ledgerBurn !== null ? round(Math.max(keyBurn ?? 0, ledgerBurn ?? 0), 6) : null;
    const runway = runwayDays(balance, burn);
    const { level, reasons } = levelFor(balance, runway);
    const free = (k.free_model_daily_requests && typeof k.free_model_daily_requests === "object" ? k.free_model_daily_requests : {}) as Record<string, unknown>;
    const freeRemaining = num(free.remaining), freeLimit = num(free.limit);
    let lvl = level;
    if (freeRemaining !== null && freeRemaining <= 0) {
      reasons.push(`free-model daily requests exhausted (${freeLimit ?? "?"}/day)`);
      if (lvl === "ok") lvl = "warn";
    }
    // Paid OpenRouter is optional (G30: DeepInfra is the paid primary). A low
    // balance with zero paid burn only means paid OR models stay off — the flag
    // still applies, but it is not worth a daily e-mail. Free-request exhaustion
    // and rejected keys still alert.
    const freeExhausted = freeRemaining !== null && freeRemaining <= 0;
    const alertSuppressed = lvl !== "ok" && !freeExhausted && (burn ?? 0) === 0
      ? "no paid OpenRouter usage — paid OR models stay disabled, :free models unaffected"
      : undefined;
    return {
      ...base, configured: true, balance_usd: balance, burn_usd_per_day: burn, runway_days: runway, level: lvl, reasons,
      details: { total_credits: total, total_usage: used, usage_daily: daily, usage_weekly: weekly, free_requests_remaining: freeRemaining, free_requests_limit: freeLimit },
      ...(alertSuppressed ? { alert_suppressed: alertSuppressed } : {}),
    };
  } catch (err) {
    return { ...base, configured: true, balance_usd: null, burn_usd_per_day: ledgerBurn, runway_days: null, level: "unknown", reasons: [errText(err)] };
  }
}

/** Monthly-budget floors: min(US$10, 25 % of budget) / min(US$3, 10 %). */
export function budgetFloors(budgetUsd: number): { warn: number; critical: number } {
  return { warn: Math.min(WARN_BALANCE_USD, budgetUsd * 0.25), critical: Math.min(CRITICAL_BALANCE_USD, budgetUsd * 0.1) };
}

export interface ProbeStatusRow {
  status?: string;
  http_status?: number;
  checked_at?: string;
  detail?: string;
}
export interface HealthRow {
  provider?: string;
  model?: string;
  http_status?: number;
  checked_at?: string;
}

export function readGeminiBudget(opts: { configured: boolean; budgetUsd: number; history: readonly SpendDay[]; today: SpendDay | null; now: number; probe?: ProbeStatusRow | null }): ProviderBalance {
  const { configured, budgetUsd, history, today, now, probe } = opts;
  const base = { provider: "gemini" as const, kind: "monthly_budget" as const, source: "ledger: ai-spend-history.jsonl + ai-spend-daily.json vs GEMINI_MONTHLY_BUDGET_USD", checked_at: new Date(now).toISOString() };
  const burn = trailingBurnUsd(history, today, "gemini", now).burnPerDay;
  if (!configured) return { ...base, configured: false, balance_usd: null, burn_usd_per_day: burn, runway_days: null, level: "unknown", reasons: ["GOOGLE_GEMINI_API_KEY not set"] };
  const mtd = monthToDateUsd(history, today, "gemini", now);
  const remaining = round(budgetUsd - mtd, 4);
  const runway = runwayDays(remaining, burn);
  const { level, reasons } = levelFor(remaining, runway, budgetFloors(budgetUsd));
  let lvl = level;
  if (probe && probe.status === "invalid_key") { lvl = "critical"; reasons.unshift("key rejected"); }
  else if (probe && probe.status === "quota_exceeded" && lvl === "ok") { lvl = "warn"; reasons.push(`quota exceeded (HTTP ${probe.http_status ?? "?"})`); }
  return { ...base, configured: true, balance_usd: remaining, burn_usd_per_day: burn, runway_days: runway, level: lvl, reasons, details: { monthly_budget_usd: budgetUsd, month_to_date_usd: mtd } };
}

/**
 * Free tiers have no balance: the level comes from the provider probe verdict
 * and the share of recent model health rows that answered 401 / 402 / 429.
 */
export function readFreeTierStatus(provider: "groq" | "cerebras" | "sambanova", opts: { configured: boolean; probe?: ProbeStatusRow | null; health: readonly HealthRow[]; now: number }): ProviderBalance {
  const { configured, probe, health, now } = opts;
  const base = { provider, kind: "free_tier" as const, balance_usd: null, burn_usd_per_day: 0, runway_days: null, source: "ai-provider-status.json + ai-model-health.json", checked_at: new Date(now).toISOString() };
  if (!configured) return { ...base, configured: false, level: "unknown", reasons: ["not configured"] };
  const recent = health.filter((h) => h.provider === provider && typeof h.checked_at === "string" && now - Date.parse(h.checked_at) <= HEALTH_MAX_AGE_MS);
  const count = (codes: number[]) => recent.filter((h) => typeof h.http_status === "number" && codes.includes(h.http_status)).length;
  const authOrPay = count([401, 402, 403]);
  const limited = count([429]);
  const reasons: string[] = [];
  let level: BalanceLevel = "ok";
  const probeFresh = probe && typeof probe.checked_at === "string" && now - Date.parse(probe.checked_at) <= HEALTH_MAX_AGE_MS;
  if (probeFresh && probe!.status === "invalid_key") { level = "critical"; reasons.push(`key rejected (HTTP ${probe!.http_status ?? 401})`); }
  else if (probeFresh && probe!.status === "quota_exceeded") {
    if (probe!.http_status === 402) { level = "critical"; reasons.push("payment required / free tier spent (HTTP 402)"); }
    else { level = "warn"; reasons.push(`quota / rate limited (HTTP ${probe!.http_status ?? 429})`); }
  }
  if (recent.length > 0) {
    if (authOrPay * 2 >= recent.length) { level = "critical"; reasons.push(`${authOrPay}/${recent.length} recent health checks 401/402`); }
    else if (limited * 2 >= recent.length && level === "ok") { level = "warn"; reasons.push(`${limited}/${recent.length} recent health checks 429`); }
  }
  if (!probeFresh && recent.length === 0) return { ...base, configured: true, level: "unknown", reasons: ["no probe / health data in the last 2 h"] };
  // A free tier we never pay for (no burn) that answers 402 is simply unfunded:
  // the dispatcher already skips it, the admin card shows it — no daily e-mail.
  // A rejected key (401/403) still alerts: that is a configuration fault.
  const unfunded = level !== "ok" && !reasons.some((r) => r.startsWith("key rejected")) && (probe?.status === "quota_exceeded" || authOrPay > 0);
  return {
    ...base, configured: true, level, reasons, details: { recent_checks: recent.length, http_401_402: authOrPay, http_429: limited, probe_status: probe?.status ?? null },
    ...(unfunded ? { alert_suppressed: "free tier unfunded (402 / quota) — skipped by routing, shown on /admin/ai-health" } : {}),
  };
}

// ── Runner ────────────────────────────────────────────────────────────

export interface BalanceCheckPaths {
  balances: string;
  flags: string;
  /** Alert dedup marker (keys `provider:level:day`). */
  alertState: string;
}

export interface FounderNotice {
  provider: BalanceProvider;
  level: "warn" | "critical";
  dedupeKey: string;
  payload: Record<string, unknown>;
}

export interface BalanceCheckDeps {
  paths: BalanceCheckPaths;
  keys: { deepinfra?: string; openrouter?: string };
  configured: { gemini: boolean; groq: boolean; cerebras: boolean; sambanova: boolean };
  geminiMonthlyBudgetUsd?: number;
  readSpend: () => { history: SpendDay[]; today: SpendDay | null };
  readProbes: () => Partial<Record<string, ProbeStatusRow>>;
  readHealth: () => HealthRow[];
  /** Ops alert (Telegram → e-mail fallback). */
  send: (text: string) => Promise<boolean>;
  /** founder_notifications row; best effort. */
  notifyFounder?: (notice: FounderNotice) => Promise<boolean>;
  fetchImpl?: FetchLike;
  now?: () => number;
}

export interface BalanceCheckResult extends BalancesSnapshot {
  alerts: Array<{ key: string; sent: boolean }>;
}

async function atomicWrite(file: string, body: string): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  const tmp = `${file}.tmp.${process.pid}.${Date.now()}`;
  await writeFile(tmp, body);
  await rename(tmp, file);
}

async function readJson<T>(file: string): Promise<T | null> {
  try { return JSON.parse(await readFile(file, "utf8")) as T; } catch { return null; }
}

/** Flags from this pass; an `unknown` (unreadable) provider keeps its previous flag. */
export function computeFlags(providers: Record<BalanceProvider, ProviderBalance>, prior: BalanceFlags | null, now: number): BalanceFlags {
  const di = providers.deepinfra, or = providers.openrouter;
  const deepinfraCritical = di.level === "unknown" ? Boolean(prior?.deepinfra_critical) : di.level === "critical";
  const openrouterOff = or.level === "unknown" ? Boolean(prior?.openrouter_paid_disabled) : or.level === "critical";
  const reasons: BalanceFlags["reasons"] = {};
  if (deepinfraCritical) reasons.deepinfra_critical = di.level === "unknown" ? `carried forward (${di.reasons.join("; ")})` : di.reasons.join("; ");
  if (openrouterOff) reasons.openrouter_paid_disabled = or.level === "unknown" ? `carried forward (${or.reasons.join("; ")})` : or.reasons.join("; ");
  return { updated_at: new Date(now).toISOString(), deepinfra_critical: deepinfraCritical, openrouter_paid_disabled: openrouterOff, reasons };
}

const fmtUsd = (n: number | null) => (n === null ? "n/a" : `US$${n.toFixed(2)}`);

export function formatBalanceAlert(p: ProviderBalance, flags: BalanceFlags): string {
  const head = `AI balance ${p.level.toUpperCase()} — ${p.provider}`;
  const lines = [
    head,
    `balance ${fmtUsd(p.balance_usd)} · burn ${p.burn_usd_per_day === null ? "n/a" : `US$${p.burn_usd_per_day.toFixed(4)}/day`} · runway ${p.runway_days === null ? "n/a" : `${p.runway_days.toFixed(1)} d`}`,
    `why: ${p.reasons.join("; ") || "—"}`,
  ];
  if (p.provider === "deepinfra" && p.level === "critical" && flags.deepinfra_critical) lines.push("Effect: report jobs are QUEUED (not failed, no provider switch); all other AI calls run on the free tier only. Top up DeepInfra to resume.");
  if (p.provider === "openrouter" && p.level === "critical" && flags.openrouter_paid_disabled) lines.push("Effect: paid OpenRouter models disabled; :free models keep serving.");
  lines.push("Admin: /admin/ai-health");
  return lines.join("\n");
}

export async function runBalanceCheck(deps: BalanceCheckDeps): Promise<BalanceCheckResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = (deps.now ?? Date.now)();
  const day = new Date(now).toISOString().slice(0, 10);
  let spend: { history: SpendDay[]; today: SpendDay | null } = { history: [], today: null };
  try { spend = deps.readSpend(); } catch { /* no ledger → burn unknown */ }
  let probes: Partial<Record<string, ProbeStatusRow>> = {};
  try { probes = deps.readProbes() ?? {}; } catch { /* none */ }
  let health: HealthRow[] = [];
  try { health = deps.readHealth() ?? []; } catch { /* none */ }

  const burnOf = (p: string) => trailingBurnUsd(spend.history, spend.today, p, now).burnPerDay;
  const [deepinfra, openrouter] = await Promise.all([
    readDeepInfraBalance(fetchImpl, deps.keys.deepinfra, burnOf("deepinfra"), now),
    readOpenRouterBalance(fetchImpl, deps.keys.openrouter, burnOf("openrouter"), now),
  ]);
  const providers: Record<BalanceProvider, ProviderBalance> = {
    deepinfra,
    openrouter,
    gemini: readGeminiBudget({ configured: deps.configured.gemini, budgetUsd: deps.geminiMonthlyBudgetUsd ?? DEFAULT_GEMINI_MONTHLY_BUDGET_USD, history: spend.history, today: spend.today, now, probe: probes.gemini }),
    groq: readFreeTierStatus("groq", { configured: deps.configured.groq, probe: probes.groq, health, now }),
    cerebras: readFreeTierStatus("cerebras", { configured: deps.configured.cerebras, probe: probes.cerebras, health, now }),
    sambanova: readFreeTierStatus("sambanova", { configured: deps.configured.sambanova, probe: probes.sambanova, health, now }),
  };
  const prior = await readJson<BalanceFlags>(deps.paths.flags);
  const flags = computeFlags(providers, prior, now);
  const snapshot: BalancesSnapshot = {
    updated_at: new Date(now).toISOString(),
    thresholds: { warn_days: WARN_RUNWAY_DAYS, critical_days: CRITICAL_RUNWAY_DAYS, warn_usd: WARN_BALANCE_USD, critical_usd: CRITICAL_BALANCE_USD, burn_window_days: BURN_WINDOW_DAYS },
    providers,
    flags,
  };
  // Flags first: routing must follow the balance even when the alert path fails.
  await atomicWrite(deps.paths.flags, JSON.stringify(flags, null, 2));
  await atomicWrite(deps.paths.balances, JSON.stringify(snapshot, null, 2));

  // Alerts — one per (provider, level, UTC day). The marker is written BEFORE
  // sending so a crash between send and write cannot double-alert.
  const state = (await readJson<{ sent?: Record<string, string> }>(deps.paths.alertState)) ?? {};
  const sent: Record<string, string> = Object.fromEntries(Object.entries(state.sent ?? {}).filter(([k]) => {
    const d = k.split(":").pop() ?? "";
    return d >= new Date(now - 3 * DAY_MS).toISOString().slice(0, 10);
  }));
  const due = BALANCE_PROVIDERS.map((p) => providers[p]).filter((p) => (p.level === "warn" || p.level === "critical") && !p.alert_suppressed && !sent[`${p.provider}:${p.level}:${day}`]);
  for (const p of due) sent[`${p.provider}:${p.level}:${day}`] = snapshot.updated_at;
  if (due.length > 0) {
    try { await atomicWrite(deps.paths.alertState, JSON.stringify({ sent }, null, 2)); } catch { /* still alert */ }
  }
  const alerts: Array<{ key: string; sent: boolean }> = [];
  for (const p of due) {
    const key = `${p.provider}:${p.level}:${day}`;
    let ok = false;
    try { ok = await deps.send(formatBalanceAlert(p, flags)); } catch { ok = false; }
    if (deps.notifyFounder) {
      try {
        await deps.notifyFounder({
          provider: p.provider,
          level: p.level as "warn" | "critical",
          dedupeKey: `ai_balance:${key}`,
          payload: { reason: "ai_balance", provider: p.provider, level: p.level, balance_usd: p.balance_usd, burn_usd_per_day: p.burn_usd_per_day, runway_days: p.runway_days, reasons: p.reasons },
        });
      } catch { /* best effort */ }
    }
    alerts.push({ key, sent: ok });
  }
  return { ...snapshot, alerts };
}
