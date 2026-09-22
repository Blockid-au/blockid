import { createHash } from "node:crypto";
import { z } from "zod";

const counterSchema = z.object({ used: z.number().int().nonnegative(), limit: z.number().int().positive(), remaining: z.number().int().nonnegative() });
export interface FreeQuotaObservation {
  accountId: string; checkedAt: string; utcDay: string;
  used: number; limit: number; remaining: number;
}
export type FreeQuotaRead = { status: "observed"; observation: FreeQuotaObservation } | { status: "unavailable"; reason: string };

/** Server-authorized credential/account mapping only; never returns key, labels or full provider response. */
export async function observeOpenRouterFreeQuota(auth: { accountId: string; apiKey: string; authorized: boolean }, deps: { fetch: typeof fetch; now: () => number }): Promise<FreeQuotaRead> {
  if (!auth.authorized || !auth.accountId || !auth.apiKey) return { status: "unavailable", reason: "authorized_account_required" };
  try {
    const response = await deps.fetch("https://openrouter.ai/api/v1/key", { method: "GET", headers: { Authorization: `Bearer ${auth.apiKey}` }, redirect: "error", signal: AbortSignal.timeout(5000), cache: "no-store" });
    if (!response.ok) return { status: "unavailable", reason: `quota_http_${response.status}` };
    const raw = await response.text();
    if (raw.length > 65536) return { status: "unavailable", reason: "quota_response_too_large" };
    const parsed = counterSchema.safeParse(JSON.parse(raw)?.data?.free_model_daily_requests);
    if (!parsed.success || parsed.data.used + parsed.data.remaining !== parsed.data.limit) return { status: "unavailable", reason: "free_request_counter_unknown" };
    const checkedAt = new Date(deps.now()).toISOString();
    return { status: "observed", observation: { accountId: auth.accountId, checkedAt, utcDay: checkedAt.slice(0, 10), ...parsed.data } };
  } catch { return { status: "unavailable", reason: "quota_observation_failed" }; }
}

/** EVAL is atomic across workers. No in-memory/fail-open fallback. Redis cluster keys share one account hash tag.
 * Each reservation conservatively consumes one daily slot even if a worker crashes before dispatch;
 * we never refund speculative quota, and same-operation replay never grants a second dispatch.
 */
export const RESERVE_FREE_QUOTA_LUA = `
local clock = redis.call('TIME')
local now = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)
local observedAt = tonumber(ARGV[1])
local remoteRemaining = tonumber(ARGV[2])
local dayEnd = tonumber(ARGV[3])
if not observedAt or not remoteRemaining or not dayEnd or now < observedAt or now - observedAt > 30000 or now >= dayEnd or dayEnd - now > 86400000 then return {'denied','stale_observation'} end
if redis.call('EXISTS', KEYS[3]) == 1 then return {'denied','operation_already_reserved'} end
local blocked = tonumber(redis.call('GET', KEYS[4]) or '0')
if blocked > now then return {'denied','provider_backoff'} end
local stored = tonumber(redis.call('GET', KEYS[1]))
local remaining = math.min(remoteRemaining, stored or remoteRemaining)
redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', now - 60000)
local minuteUsed = redis.call('ZCARD', KEYS[2])
if remaining < 6 then return {'denied','daily_headroom'} end
if minuteUsed >= 18 then return {'denied','minute_headroom'} end
redis.call('SET', KEYS[1], remaining - 1, 'PX', dayEnd - now + 60000)
redis.call('ZADD', KEYS[2], now, ARGV[4])
redis.call('PEXPIRE', KEYS[2], 120000)
redis.call('SET', KEYS[3], 'reserved', 'PX', 604800000)
return {'reserved', tostring(remaining - 1), tostring(19 - minuteUsed)}
`;
export const BLOCK_FREE_QUOTA_LUA = `
local clock = redis.call('TIME')
local now = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)
local untilMs = math.max(tonumber(redis.call('GET', KEYS[1]) or '0'), now + tonumber(ARGV[1]))
redis.call('SET', KEYS[1], untilMs, 'PX', untilMs - now)
return untilMs
`;
export interface FreeQuotaRedis { eval: (script: string, keyCount: number, ...args: string[]) => Promise<unknown> }
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const prefix = (accountId: string) => `blockid:free-quota:{${hash(accountId)}}`;
export type FreeQuotaReservation = { status: "reserved"; dailyRemaining: number; minuteRemaining: number; executionAllowed: false } | { status: "denied"; reason: string };

export async function reserveOpenRouterFreeRequest(redis: FreeQuotaRedis, observation: FreeQuotaObservation, operationId: string, policy: { allAccountCallersUseLedger: boolean; now: number }): Promise<FreeQuotaReservation> {
  const parsed = counterSchema.safeParse(observation);
  const observedAt = Date.parse(observation.checkedAt);
  if (!policy.allAccountCallersUseLedger || !observation.accountId || !operationId || operationId.length > 200 || !parsed.success || parsed.data.used + parsed.data.remaining !== parsed.data.limit || !Number.isFinite(policy.now) || !Number.isFinite(observedAt) || observedAt > policy.now || policy.now - observedAt > 30000 || observation.utcDay !== new Date(policy.now).toISOString().slice(0, 10)) return { status: "denied", reason: "trusted_fresh_account_ledger_required" };
  const account = prefix(observation.accountId); const operation = hash(operationId);
  const dayEnd = Date.parse(`${observation.utcDay}T00:00:00.000Z`) + 86400000;
  try {
    const result = await redis.eval(RESERVE_FREE_QUOTA_LUA, 4, `${account}:day:${observation.utcDay}`, `${account}:minute`, `${account}:operation:${operation}`, `${account}:blocked`, String(observedAt), String(observation.remaining), String(dayEnd), operation);
    if (Array.isArray(result) && result[0] === "reserved" && Number.isFinite(Number(result[1])) && Number.isFinite(Number(result[2]))) return { status: "reserved", dailyRemaining: Number(result[1]), minuteRemaining: Number(result[2]), executionAllowed: false };
    return { status: "denied", reason: Array.isArray(result) && typeof result[1] === "string" ? result[1] : "quota_store_invalid_response" };
  } catch { return { status: "denied", reason: "quota_store_unavailable" }; }
}

/** Persist failures at provider-account scope; unknown/missing usage never means a refunded quota slot. */
export async function blockOpenRouterFreeAccount(redis: FreeQuotaRedis, accountId: string, status: 402 | 429 | 503, retryAfterMs?: number): Promise<boolean> {
  if (!accountId || ![402, 429, 503].includes(status)) return false;
  const baseline = status === 402 ? 86400000 : status === 429 ? 60000 : 120000;
  const delay = Math.min(86400000, Math.max(baseline, Number.isFinite(retryAfterMs) ? retryAfterMs! : 0));
  try { await redis.eval(BLOCK_FREE_QUOTA_LUA, 1, `${prefix(accountId)}:blocked`, String(delay)); return true; } catch { return false; }
}
