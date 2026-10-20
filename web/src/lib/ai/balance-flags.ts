// A3 (pricing v5 §7.4, G35) — the runtime routing flags the hourly
// /api/cron/ai-balance check writes and the dispatcher (ai-client.ts) plus the
// paid-report drain read.
//
//   deepinfra_critical       DeepInfra balance / runway is critical (or the
//                            account is suspended). Report-scoped jobs are
//                            QUEUED — AICapacityError "provider_budget", never
//                            failed and never switched to another provider
//                            (G30 founder policy: report scope = DeepInfra-only,
//                            no paid spillover). Every other call is routed to
//                            the zero-marginal-cost tiers only (free providers
//                            whose models clear the capability floor, then the
//                            Claude CLI subscription as the last resort).
//   openrouter_paid_disabled OpenRouter credit is critical → only `:free` ids
//                            are dialled; nothing else changes.
//
// The file is tiny and read synchronously with a 60 s cache. It fails OPEN
// (no flags) when missing, unreadable or older than BALANCE_FLAGS_MAX_AGE_MS,
// so a dead cron can never pin routing in the degraded mode forever.
//
// Uses `fs` (not node:fs) so the ai-client suite's fs mock serves it.

import * as fs from "fs";
import { runtimeReportsPath } from "@/lib/runtime-paths";

export const BALANCE_FLAGS_FILE_NAME = "ai-balance-flags.json";
/** Three missed hourly runs → the flags are ignored. */
export const BALANCE_FLAGS_MAX_AGE_MS = 3 * 60 * 60_000;
/** How long a queued report job should wait before retrying while DeepInfra is critical. */
export const PROVIDER_BUDGET_RETRY_AFTER_SEC = 15 * 60;
const CACHE_MS = 60_000;

export interface BalanceFlags {
  updated_at: string;
  deepinfra_critical: boolean;
  openrouter_paid_disabled: boolean;
  /** Short human reasons per flag (for the admin page / logs). */
  reasons?: Partial<Record<"deepinfra_critical" | "openrouter_paid_disabled", string>>;
}

export const NO_BALANCE_FLAGS: BalanceFlags = Object.freeze({ updated_at: "", deepinfra_critical: false, openrouter_paid_disabled: false }) as BalanceFlags;

export function balanceFlagsFile(): string {
  return runtimeReportsPath(BALANCE_FLAGS_FILE_NAME);
}

/** Validate a parsed flags object; fresh → the flags, otherwise NO_BALANCE_FLAGS. Pure. */
export function effectiveBalanceFlags(raw: unknown, now: number = Date.now()): BalanceFlags {
  if (!raw || typeof raw !== "object") return NO_BALANCE_FLAGS;
  const o = raw as Record<string, unknown>;
  const at = typeof o.updated_at === "string" ? Date.parse(o.updated_at) : NaN;
  if (!Number.isFinite(at) || now - at > BALANCE_FLAGS_MAX_AGE_MS || at - now > 5 * 60_000) return NO_BALANCE_FLAGS;
  return {
    updated_at: o.updated_at as string,
    deepinfra_critical: o.deepinfra_critical === true,
    openrouter_paid_disabled: o.openrouter_paid_disabled === true,
    ...(o.reasons && typeof o.reasons === "object" ? { reasons: o.reasons as BalanceFlags["reasons"] } : {}),
  };
}

let cache: { at: number; flags: BalanceFlags } | null = null;

/** The current flags (cached 60 s, fail-open). */
export function readBalanceFlags(now: number = Date.now()): BalanceFlags {
  if (cache && now - cache.at < CACHE_MS) return effectiveBalanceFlags(cache.flags, now);
  let parsed: unknown = null;
  try { parsed = JSON.parse(fs.readFileSync(balanceFlagsFile(), "utf-8")); } catch { parsed = null; }
  const flags = effectiveBalanceFlags(parsed, now);
  cache = { at: now, flags };
  return flags;
}

export function _resetBalanceFlagsCache(): void {
  cache = null;
}

/** Tier names as ai-client's PROVIDER_TIER_BASE spells them. */
export type RoutingTier = "quality" | "quality-cost" | "subscription" | "free" | "paid";

/**
 * Pure routing rule for an UNSCOPED call while DeepInfra is critical: keep the
 * free-tier providers only (their ladders already apply the capability floor),
 * in their existing order. The Claude CLI subscription is used only when no
 * free provider is configured — it is an internal last resort, and the
 * dispatcher's tier order would otherwise rank it above the free tier for
 * report / synthesis classes. Without the flag the list is returned unchanged.
 */
export function balanceRoutedProviders<P extends string>(providers: readonly P[], flags: BalanceFlags, tierOf: (p: P) => RoutingTier): P[] {
  if (!flags.deepinfra_critical) return [...providers];
  const free = providers.filter((p) => tierOf(p) === "free");
  return free.length > 0 ? free : providers.filter((p) => tierOf(p) === "subscription");
}
