// G21 P3-B — the read-only institutional API (`/api/v1/institutional/**`):
// auth, per-key hourly budget, audit row per read, ETag / private cache and
// the one error envelope. Every route is:
//
//   const auth = await authenticateInstitutional(request);
//   if (!auth.ok) return auth.response;
//   … load (404 never confirms a foreign id) …
//   return institutionalOk(request, auth.principal, body, { resource, resourceId });
//
// Auth = the evaluator API key ladder (lib/api-v1/auth.ts: 401 bad key ·
// 429 per-minute budget · 402 the owner's plan lacks `api.access` · 403 the
// key lacks `evaluations:read`) PLUS a per-key hourly ceiling
// (INSTITUTIONAL_HOURLY_LIMIT = 600, lib/rate-limit legacy sync window) so a
// polling integration is bounded per hour, not only per minute.
//
// Every 2xx / 304 writes ONE `institutional.read` audit row (actor `api`,
// resource type + id, the key's sha256 handle — never the key) and emits the
// `institutional_api_read` FI analytics event (resource + key id, no PII).
//
// Responses never carry founder PII: company name + ids + scores only. The
// projections in ./institutional-data.ts are the whitelist.

import "server-only";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { appendAudit } from "@/lib/audit";
import { emitFiEvent } from "@/lib/analytics/fi-events";
import { checkRateLimit as windowRateLimit } from "@/lib/rate-limit";
import { authenticateV1, type V1AuthDeps, type V1AuthFailure, type V1Principal } from "./auth";

export const INSTITUTIONAL_HOURLY_LIMIT = 600;
export const INSTITUTIONAL_WINDOW_MS = 60 * 60 * 1000;
export const INSTITUTIONAL_CACHE_CONTROL = "private, max-age=60";
export const INSTITUTIONAL_SCOPE = "evaluations:read" as const;
export const INSTITUTIONAL_AUDIT_ACTION = "institutional.read";

const BASE_HEADERS = { "X-Robots-Tag": "noindex", Vary: "Authorization" } as const;

export type InstitutionalErrorCode =
  | "unauthorized"
  | "plan_required"
  | "insufficient_scope"
  | "rate_limited"
  | "invalid_query"
  | "not_found"
  | "unavailable";

export interface InstitutionalPrincipal extends V1Principal {
  hourly: { limit: number; remaining: number; resetAt: number };
}

export type InstitutionalAuth = { ok: true; principal: InstitutionalPrincipal } | { ok: false; response: NextResponse };

export interface InstitutionalAuthDeps extends V1AuthDeps {
  /** The hourly window (default: lib/rate-limit legacy sync API). */
  hourly?: (key: string, max: number, windowMs: number) => { allowed: boolean; remaining: number; resetIn: number };
}

/** The one error envelope: `{ ok: false, error, message }` (+ `retry_after_seconds` on 429, `issues` on 400). */
export function institutionalError(status: number, error: InstitutionalErrorCode, message: string, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}): NextResponse {
  return NextResponse.json({ ok: false, error, message, ...extra }, { status, headers: { ...BASE_HEADERS, "Cache-Control": "private, no-store", ...headers } });
}

function fromV1Failure(f: V1AuthFailure): NextResponse {
  if (f.status === 429) return institutionalError(429, "rate_limited", f.message, { retry_after_seconds: f.retryAfterSec }, { "Retry-After": String(f.retryAfterSec) });
  if (f.status === 403) return institutionalError(403, "insufficient_scope", f.message, { required_scope: f.required });
  if (f.status === 402) return institutionalError(402, "plan_required", f.message);
  return institutionalError(401, "unauthorized", f.message);
}

/** Hourly-budget headers on every institutional response. */
export function hourlyHeaders(p: Pick<InstitutionalPrincipal, "hourly">): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(p.hourly.limit),
    "X-RateLimit-Remaining": String(Math.max(0, p.hourly.remaining)),
    "X-RateLimit-Reset": String(Math.floor(p.hourly.resetAt / 1000)),
    "X-RateLimit-Window": "hour",
  };
}

/**
 * Key auth (evaluator ladder) + the per-key hourly ceiling. The failure
 * branch already carries the response so a route is one `if`.
 */
export async function authenticateInstitutional(request: Request, deps: InstitutionalAuthDeps = {}): Promise<InstitutionalAuth> {
  const auth = await authenticateV1(request, INSTITUTIONAL_SCOPE, deps);
  if (!auth.ok) return { ok: false, response: fromV1Failure(auth) };
  const now = (deps.now ?? Date.now)();
  const hourly = (deps.hourly ?? windowRateLimit)(`rl:institutional:${auth.principal.keyId}`, INSTITUTIONAL_HOURLY_LIMIT, INSTITUTIONAL_WINDOW_MS);
  const resetAt = now + Math.max(0, hourly.resetIn);
  const principal: InstitutionalPrincipal = { ...auth.principal, hourly: { limit: INSTITUTIONAL_HOURLY_LIMIT, remaining: hourly.remaining, resetAt } };
  if (!hourly.allowed) {
    const retry = Math.max(1, Math.ceil(hourly.resetIn / 1000));
    return {
      ok: false,
      response: institutionalError(
        429,
        "rate_limited",
        `Hourly budget spent (${INSTITUTIONAL_HOURLY_LIMIT} reads per key per hour). Retry in ${retry}s.`,
        { retry_after_seconds: retry },
        { "Retry-After": String(retry), ...hourlyHeaders(principal) },
      ),
    };
  }
  return { ok: true, principal };
}

// ─── Query validation ────────────────────────────────────────────────────────

export const stageParam = z.coerce.number().int().min(0).max(12);
export const sectorParam = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .regex(/^[A-Za-z0-9 /&._-]+$/, "letters, digits, space, / & . _ - only");
export const uuidParam = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "uuid");
export const limitParam = z.coerce.number().int().min(1).max(100);

export type QueryResult<T> = { ok: true; value: T } | { ok: false; response: NextResponse };

/** Parse `searchParams` with a Zod object schema; 400 `invalid_query` with `issues[]` on failure. */
export function parseQuery<S extends z.ZodTypeAny>(searchParams: URLSearchParams, schema: S): QueryResult<z.infer<S>> {
  const raw: Record<string, string> = {};
  for (const [k, v] of searchParams.entries()) if (!(k in raw)) raw[k] = v;
  const parsed = schema.safeParse(raw);
  if (parsed.success) return { ok: true, value: parsed.data };
  const issues = parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
  return { ok: false, response: institutionalError(400, "invalid_query", "One or more query parameters are invalid.", { issues }) };
}

/** Path id → 404 (never 400: a malformed id must look exactly like an unknown one). */
export function parseId(raw: string | undefined): string | null {
  const r = uuidParam.safeParse(raw ?? "");
  return r.success ? r.data.toLowerCase() : null;
}

// ─── Audit + analytics ───────────────────────────────────────────────────────

export interface ReadAudit {
  /** "cohort" · "cohort_items" · "cohort_snapshots" · "company" · "benchmarks" · "methodology". */
  resource: string;
  resourceId?: string | null;
  /** Small, PII-free facts (counts, stage, sector). */
  detail?: Record<string, unknown>;
}

/** One `institutional.read` audit row + the FI event. Never throws — a read must not fail because the ledger did. */
export async function auditInstitutionalRead(principal: Pick<InstitutionalPrincipal, "userId" | "keyId" | "plan" | "email">, request: Request, read: ReadAudit, status: number): Promise<void> {
  let route = "";
  try {
    route = new URL(request.url).pathname;
  } catch {
    route = "";
  }
  try {
    await appendAudit({
      user_id: principal.userId,
      actor: "api",
      action: INSTITUTIONAL_AUDIT_ACTION,
      resource_type: read.resource,
      resource_id: read.resourceId ?? null,
      detail: { key_id: principal.keyId, route, status, ...(read.detail ?? {}) },
    });
  } catch (err) {
    console.error("[blockid:institutional] audit append failed", err instanceof Error ? err.message : err);
  }
  try {
    emitFiEvent("institutional_api_read", {
      organisation: principal.userId,
      plan: principal.plan,
      channel: "api",
      userId: principal.userId,
      email: principal.email,
      resource: read.resource,
      resource_id: read.resourceId ?? undefined,
      key_id: principal.keyId,
      status,
    });
  } catch {
    /* analytics never blocks */
  }
}

// ─── Responses ───────────────────────────────────────────────────────────────

/** Weak ETag over the canonical JSON body. */
export function etagFor(body: unknown): string {
  return `W/"${createHash("sha256").update(JSON.stringify(body)).digest("hex").slice(0, 32)}"`;
}

/** True when `If-None-Match` names this ETag (weak / strong / list). */
export function etagMatches(header: string | null, etag: string): boolean {
  if (!header) return false;
  const bare = etag.replace(/^W\//, "");
  return header
    .split(",")
    .map((s) => s.trim().replace(/^W\//, ""))
    .some((s) => s === bare || s === "*");
}

/**
 * 200 with the body (or 304 when the caller's ETag still matches), audited.
 * `Cache-Control: private, max-age=60` — a key-scoped read is never shared.
 */
export async function institutionalOk(request: Request, principal: InstitutionalPrincipal, body: Record<string, unknown>, read: ReadAudit): Promise<NextResponse> {
  const payload = { ok: true, ...body };
  const etag = etagFor(payload);
  const headers = { ...BASE_HEADERS, "Cache-Control": INSTITUTIONAL_CACHE_CONTROL, ETag: etag, ...hourlyHeaders(principal) };
  if (etagMatches(request.headers.get("if-none-match"), etag)) {
    await auditInstitutionalRead(principal, request, read, 304);
    return new NextResponse(null, { status: 304, headers });
  }
  await auditInstitutionalRead(principal, request, read, 200);
  return NextResponse.json(payload, { status: 200, headers });
}

/** 404 — the same body for "does not exist" and "not yours" (the id space stays non-enumerable). */
export function notFound(what = "resource"): NextResponse {
  return institutionalError(404, "not_found", `No ${what} with that id is readable by this key.`);
}
