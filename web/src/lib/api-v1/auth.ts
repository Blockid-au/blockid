// G14-S38 — API-key auth for the /api/v1/evaluations* routes.
//
// `authenticateAPIKey` (lib/api-auth.ts) collapses "bad key" and "rate
// limited" into one null, which is fine for /analyze (credits are the real
// gate) but the evaluator API documents FOUR distinct refusals:
//
//   401 unauthorized     missing / unknown / revoked / expired `bk_live_` key
//   429 rate_limited     the key's per-minute budget is spent (Retry-After)
//   402 plan_required    the owner's plan no longer carries `api.access`
//                        (goal doc F-7: Fund + Program only — checked at
//                        EVERY call, not just at key creation, so a lapsed
//                        subscription stops the key the same minute)
//   403 insufficient_scope  the key lacks the scope this route needs
//                        (`evaluations:read` / `evaluations:write`,
//                        lib/api-scopes.ts)
//
// Order matters: rate limit before the plan/entitlement read (a spent key
// must not keep costing a DB round-trip per call), scope after the plan
// (a downgraded Fund answers 402, not 403 — the fix is billing, not the
// key). Ownership of the evaluation row itself is decided by the loaders
// (resolveDossierAccess → 404 — the id must never confirm a row exists to
// a key that is not its evaluator).

import "server-only";
import { NextResponse } from "next/server";
import { checkRateLimit, validateApiKey } from "@/lib/api-keys";
import { can } from "@/lib/entitlements";
import { getSupabaseAdmin } from "@/lib/supabase";
import { hasScope, type ApiScope } from "@/lib/api-scopes";

export const V1_HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex",
} as const;

export interface V1Principal {
  userId: string;
  email: string;
  plan: string;
  /** sha256 of the key — the audit / delivery-log handle, never the key. */
  keyId: string;
  scopes: ApiScope[];
  accountType: string | null;
  rateLimit: { limit: number; remaining: number; resetAt: Date };
}

export type V1AuthFailure =
  | { ok: false; status: 401; code: "unauthorized"; message: string }
  | { ok: false; status: 402; code: "plan_required"; message: string }
  | { ok: false; status: 403; code: "insufficient_scope"; message: string; required: ApiScope }
  | { ok: false; status: 429; code: "rate_limited"; message: string; retryAfterSec: number };

export type V1AuthResult = { ok: true; principal: V1Principal } | V1AuthFailure;

export interface V1AuthDeps {
  validate?: typeof validateApiKey;
  rateLimit?: typeof checkRateLimit;
  entitled?: (user: { id: string; plan: string; segment: string }) => Promise<boolean>;
  /** plan + account_type read (defaults to app_users via the admin client). */
  readUser?: (userId: string) => Promise<{ plan: string | null; email: string | null; account_type: string | null } | null>;
  now?: () => number;
}

async function defaultReadUser(userId: string): Promise<{ plan: string | null; email: string | null; account_type: string | null } | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data } = await supabase.from("app_users").select("email, plan, account_type").eq("id", userId).maybeSingle();
  if (!data) return null;
  const row = data as { email?: string | null; plan?: string | null; account_type?: string | null };
  return { plan: row.plan ?? null, email: row.email ?? null, account_type: row.account_type ?? null };
}

/**
 * Authenticate a v1 evaluator call. `scope` is what the route needs.
 * Never throws; every refusal is a typed result the route turns into JSON
 * with `v1Error()`.
 */
export async function authenticateV1(request: Request, scope: ApiScope, deps: V1AuthDeps = {}): Promise<V1AuthResult> {
  const unauthorized: V1AuthFailure = {
    ok: false,
    status: 401,
    code: "unauthorized",
    message: "Invalid or missing API key. Send 'Authorization: Bearer bk_live_…' (create one under Workspace → Settings → Enterprise → API keys).",
  };
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer bk_live_")) return unauthorized;
  const raw = header.slice(7).trim();
  if (raw.length !== 56) return unauthorized;

  const validated = await (deps.validate ?? validateApiKey)(raw);
  if (!validated.valid || !validated.userId || !validated.keyHash) return unauthorized;

  const limit = validated.rateLimitPerMin ?? 60;
  const rl = await (deps.rateLimit ?? checkRateLimit)(validated.keyHash, limit);
  if (!rl.allowed) {
    const retryAfterSec = Math.max(1, Math.ceil((rl.resetAt.getTime() - (deps.now ?? Date.now)()) / 1000));
    return { ok: false, status: 429, code: "rate_limited", message: `Rate limit exceeded (${limit}/min). Retry in ${retryAfterSec}s.`, retryAfterSec };
  }

  const user = await (deps.readUser ?? defaultReadUser)(validated.userId);
  const plan = user?.plan ?? "free";
  const entitled = await (deps.entitled ?? ((u) => can(u, "api.access")))({ id: validated.userId, plan, segment: "investor" });
  if (!entitled) {
    return {
      ok: false,
      status: 402,
      code: "plan_required",
      message: "API access is included with the Fund and Program plans. Upgrade at https://blockid.au/pricing?feature=api.access.",
    };
  }

  const scopes = validated.scopes ?? ["analyze"];
  if (!hasScope(scopes, scope)) {
    return { ok: false, status: 403, code: "insufficient_scope", message: `This key lacks the '${scope}' scope. Create a key with that scope under Settings → API keys.`, required: scope };
  }

  return {
    ok: true,
    principal: {
      userId: validated.userId,
      email: user?.email ?? validated.email ?? "",
      plan,
      keyId: validated.keyHash,
      scopes,
      accountType: user?.account_type ?? null,
      rateLimit: { limit, remaining: rl.remaining, resetAt: rl.resetAt },
    },
  };
}

/** Rate-limit headers every 2xx / 4xx of the evaluator API carries. */
export function rateLimitHeaders(p: Pick<V1Principal, "rateLimit">): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(p.rateLimit.limit),
    "X-RateLimit-Remaining": String(Math.max(0, p.rateLimit.remaining)),
    "X-RateLimit-Reset": String(Math.floor(p.rateLimit.resetAt.getTime() / 1000)),
  };
}

/** JSON error envelope shared by the v1 routes: `{ error: { code, message, … } }`. */
export function v1Error(status: number, code: string, message: string, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}): NextResponse {
  return NextResponse.json({ error: { code, message, ...extra } }, { status, headers: { ...V1_HEADERS, ...headers } });
}

/** A typed auth failure → the documented response (429 carries Retry-After). */
export function v1AuthFailureResponse(f: V1AuthFailure): NextResponse {
  if (f.status === 429) return v1Error(429, f.code, f.message, { retryInSeconds: f.retryAfterSec }, { "Retry-After": String(f.retryAfterSec) });
  if (f.status === 403) return v1Error(403, f.code, f.message, { required_scope: f.required });
  return v1Error(f.status, f.code, f.message);
}

export function v1Ok(body: Record<string, unknown>, p: Pick<V1Principal, "rateLimit">, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: { ...V1_HEADERS, ...rateLimitHeaders(p) } });
}
