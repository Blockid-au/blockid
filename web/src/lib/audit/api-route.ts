// S20-A — `apiRoute()`: the single choke point that audits every mutating
// API route.
//
//   export const POST = apiRoute({ route: "api/projects/[id]/route.ts", method: "POST" }, POST_handler);
//
// The wrapper runs the handler inside an AsyncLocalStorage audit context
// (./context.ts). The auth and project-scope helpers annotate that context
// as the handler calls them, then `finalizeAudit()` writes ONE hash-chained
// `audit_events` row per invocation:
//
//   { user_id (actor), actor kind, action, resource_type, resource_id,
//     detail: { method, route, family, status, project_id, actor_role,
//               ip_hash, ua_family, params (ids only), note, duration_ms } }
//
// Semantics:
//   * every response is recorded — 2xx, 4xx AND 5xx (with its status);
//   * a handler that throws is recorded as status 500 + `threw` and the
//     error is rethrown untouched. A thrown Next control-flow error
//     (`redirect()` → NEXT_REDIRECT, `notFound()` / `forbidden()` /
//     `unauthorized()` → NEXT_HTTP_ERROR_FALLBACK;<code>) is recorded with
//     the status Next will actually send (307/308, 404/403/401) and no
//     `threw` flag — Next turns it into that response, not a 500;
//   * the audit write never blocks the response: `finalizeAudit()` is
//     fire-and-forget (it never rejects) so an SSE / streaming handler's
//     first byte is not held behind the insert, and a thrown error is not
//     delayed by it. The write is still bounded by AUDIT_WRITE_TIMEOUT_MS;
//   * a streaming response (`text/event-stream`, ndjson, chunked) is
//     recorded with the status of the HEAD of the stream plus
//     `streamed: true` — the row cannot know how the stream ended;
//   * the audit write can never throw into the handler: sink errors are
//     logged and swallowed;
//   * the request body is never read; query strings are never stored.
//
// Test seam: `setAuditSink(fn)` replaces the writer. Under vitest the
// default sink is a no-op unless a test installs one — the 300+ colocated
// route suites must not gain a hidden `audit_events` insert on every call.
//
// Keep this file free of `server-only` and of static imports that reach
// Supabase — the real writer is loaded lazily in ./sink.ts.

import {
  auditNote,
  getAuditContext,
  newAuditContext,
  runWithAuditContext,
  type AuditActorKind,
  type AuditContext,
} from "./context";
import {
  clientIp,
  defaultAction,
  defaultEntity,
  hashIp,
  isMutationMethod,
  pickIdParams,
  primaryEntityId,
  redactDetail,
  routeFamily,
  routePattern,
  uaFamily,
  type MutationMethod,
  type UaFamily,
} from "./redact";
import { auditEntryFor } from "./manifest";

export { auditNote };

export interface ApiRouteMeta {
  /** Route file path relative to `web/src/app`, e.g. `api/projects/[id]/route.ts`. */
  route: string;
  method: MutationMethod;
  /** Override the catalogue action name (`<family>.<verb>` by default). */
  action?: string;
  /** Override the resource type (last route segment, singularised, by default). */
  entity?: string;
  /** Extra redaction applied to the detail object before it is stored. */
  redact?: (detail: Record<string, unknown>) => Record<string, unknown>;
}

export interface AuditRecord {
  user_id: string | null;
  actor: AuditActorKind;
  action: string;
  resource_type: string;
  resource_id: string | null;
  detail: {
    v: 1;
    method: MutationMethod;
    route: string;
    family: string;
    status: number;
    project_id: string | null;
    actor_role: string | null;
    ip_hash: string | null;
    ua_family: UaFamily;
    params: Record<string, string> | null;
    note: unknown;
    duration_ms: number;
    threw?: true;
    /** Status is that of the stream head; the row cannot know how the stream ended. */
    streamed?: true;
  };
}

export type AuditSink = (record: AuditRecord) => Promise<void> | void;

const AUDIT_WRITE_TIMEOUT_MS = 1500;

let sink: AuditSink | null = null;
let sinkExplicit = false;

/** Replace the writer (tests). Pass `null` to restore the default. */
export function setAuditSink(fn: AuditSink | null): void {
  sink = fn;
  sinkExplicit = fn !== null;
}

function isTestEnv(): boolean {
  return Boolean(process.env.VITEST) || process.env.NODE_ENV === "test";
}

async function defaultSink(record: AuditRecord): Promise<void> {
  if (process.env.AUDIT_DISABLED === "1") return;
  if (isTestEnv() && !sinkExplicit) return;
  const mod = await import("./sink");
  await mod.writeAuditEvent(record);
}

async function withTimeout(p: Promise<void>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const t = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, ms);
    // Never keep the process alive for an audit write.
    (timer as { unref?: () => void }).unref?.();
  });
  try {
    await Promise.race([p, t]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

type Ctx = { params?: unknown } | undefined;

async function resolveParams(ctx: Ctx): Promise<Record<string, string> | null> {
  try {
    const raw = ctx && typeof ctx === "object" ? ctx.params : undefined;
    const p = raw && typeof (raw as Promise<unknown>).then === "function" ? await raw : raw;
    return pickIdParams(p);
  } catch {
    return null;
  }
}

/** Build the row for one invocation. Exported for the tests; pure. */
export function buildAuditRecord(args: {
  meta: ApiRouteMeta;
  ctx: AuditContext;
  headers: Headers;
  status: number;
  params: Record<string, string> | null;
  durationMs: number;
  threw?: boolean;
  streamed?: boolean;
}): AuditRecord {
  const { meta, ctx, headers, status, params } = args;
  const manifest = auditEntryFor(meta.route, meta.method);
  const action = meta.action ?? manifest?.action ?? defaultAction(meta.route, meta.method);
  const entity = meta.entity ?? manifest?.subject_type ?? defaultEntity(meta.route);

  let detail: Record<string, unknown> = {
    v: 1,
    method: meta.method,
    route: routePattern(meta.route),
    family: routeFamily(meta.route),
    status,
    project_id: ctx.projectId,
    actor_role: ctx.actorRole,
    ip_hash: hashIp(clientIp(headers)),
    ua_family: uaFamily(headers.get("user-agent")),
    params,
    note: ctx.note ? redactDetail(ctx.note) : null,
    duration_ms: Math.max(0, Math.round(args.durationMs)),
    ...(args.threw ? { threw: true as const } : {}),
    ...(args.streamed ? { streamed: true as const } : {}),
  };
  if (meta.redact) {
    try {
      detail = { ...detail, ...meta.redact(detail) };
    } catch {
      // A broken redactor must not lose the row.
    }
  }

  return {
    user_id: ctx.actorUserId,
    actor: ctx.actorKind,
    action,
    resource_type: entity,
    resource_id: ctx.entityId ?? primaryEntityId(params),
    detail: detail as AuditRecord["detail"],
  };
}

/**
 * Write the row for the current invocation. Never throws; never rejects.
 * Exported so a hand-written route that cannot use the wrapper can still
 * record through the same path.
 */
export async function finalizeAudit(args: {
  meta: ApiRouteMeta;
  request: Request;
  routeCtx?: Ctx;
  status: number;
  startedAt: number;
  threw?: boolean;
  streamed?: boolean;
}): Promise<void> {
  try {
    const ctx = getAuditContext() ?? newAuditContext();
    const params = await resolveParams(args.routeCtx);
    const record = buildAuditRecord({
      meta: args.meta,
      ctx,
      headers: args.request.headers,
      status: args.status,
      params,
      durationMs: Date.now() - args.startedAt,
      threw: args.threw,
      streamed: args.streamed,
    });
    const write = sink ?? defaultSink;
    await withTimeout(Promise.resolve().then(() => write(record)), AUDIT_WRITE_TIMEOUT_MS);
  } catch (err) {
    console.error("[blockid:audit] finalize failed", {
      route: args.meta.route,
      method: args.meta.method,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

// In-flight fire-and-forget writes. `flushAudits()` lets a test (or a
// shutdown hook) wait for them without the request path ever doing so.
const inflight = new Set<Promise<void>>();

function enqueueAudit(p: Promise<void>): void {
  inflight.add(p);
  void p.then(
    () => inflight.delete(p),
    () => inflight.delete(p),
  );
}

/** Wait for every audit write started so far (tests / graceful shutdown). */
export async function flushAudits(): Promise<void> {
  while (inflight.size) await Promise.allSettled([...inflight]);
}

const STREAMING_CONTENT_TYPE_RE =
  /^(?:text\/event-stream|application\/(?:x-ndjson|stream\+json|jsonl)|multipart\/x-mixed-replace)\b/i;

/**
 * True when the response is an open-ended stream whose status is known
 * only for the head (SSE, ndjson, explicit chunked). Note: under undici
 * EVERY `Response` with a body exposes it as a `ReadableStream` — a
 * `NextResponse.json()` included — so `body instanceof ReadableStream`
 * cannot tell a stream from a buffered body; the headers can.
 */
export function isStreamingResponse(response: unknown): boolean {
  if (!response || typeof response !== "object") return false;
  const headers = (response as { headers?: unknown }).headers;
  if (!headers || typeof (headers as Headers).get !== "function") return false;
  const h = headers as Headers;
  const ct = h.get("content-type") ?? "";
  if (STREAMING_CONTENT_TYPE_RE.test(ct.trim())) return true;
  const te = h.get("transfer-encoding") ?? "";
  return /\bchunked\b/i.test(te);
}

/**
 * Status Next will send for a thrown control-flow error, or `null` for an
 * ordinary error. Digest formats (next/dist/client/components):
 *   `NEXT_REDIRECT;<push|replace>;<url>;<307|308>;`
 *   `NEXT_HTTP_ERROR_FALLBACK;<404|403|401>`
 *   `NEXT_NOT_FOUND` (pre-15 notFound())
 */
export function statusFromNextDigest(err: unknown): number | null {
  if (!err || typeof err !== "object") return null;
  const digest = (err as { digest?: unknown }).digest;
  if (typeof digest !== "string") return null;
  if (digest.startsWith("NEXT_REDIRECT")) {
    const parts = digest.split(";");
    const code = Number(parts.at(-2));
    return code === 307 || code === 308 || code === 301 || code === 302 || code === 303 ? code : 307;
  }
  if (digest.startsWith("NEXT_NOT_FOUND")) return 404;
  if (digest.startsWith("NEXT_HTTP_ERROR_FALLBACK")) {
    const code = Number(digest.split(";")[1]);
    return code === 404 || code === 403 || code === 401 ? code : 404;
  }
  return null;
}

/**
 * Wrap a Next.js route handler so every invocation is audited. The
 * handler's parameter and return types are preserved so Next's route
 * export type-check and the colocated tests are unaffected.
 */
export function apiRoute<
  Req extends Request,
  A extends unknown[],
  R extends Response | undefined,
>(
  meta: ApiRouteMeta,
  handler: (request: Req, ...rest: A) => R | Promise<R>,
): (request: Req, ...rest: A) => Promise<R> {
  if (!isMutationMethod(meta.method)) {
    throw new Error(`apiRoute: ${meta.method} is not a mutation method`);
  }
  const wrapped = async (request: Req, ...rest: A): Promise<R> => {
    const startedAt = Date.now();
    return runWithAuditContext(async () => {
      let response: R;
      try {
        response = await handler(request, ...rest);
      } catch (err) {
        // redirect()/notFound() are control flow, not failures: record the
        // status Next will send and omit `threw`. Fire-and-forget so the
        // rethrow (and Next's 500/307/404) is not held behind the insert.
        const controlStatus = statusFromNextDigest(err);
        enqueueAudit(
          finalizeAudit({
            meta,
            request,
            routeCtx: rest[0] as Ctx,
            status: controlStatus ?? 500,
            startedAt,
            threw: controlStatus === null ? true : undefined,
          }),
        );
        throw err;
      }
      // A handler that falls through without a Response makes Next 500 — record it as such.
      const status =
        response && typeof response === "object" && typeof response.status === "number"
          ? response.status
          : 500;
      const streamed = isStreamingResponse(response);
      // Fire-and-forget: finalizeAudit never rejects, and the first byte of
      // an SSE response must not wait for the audit insert.
      enqueueAudit(finalizeAudit({ meta, request, routeCtx: rest[0] as Ctx, status, startedAt, streamed }));
      return response;
    });
  };
  // Marker so the static coverage guard / codemod can recognise a wrapped export at runtime too.
  Object.defineProperty(wrapped, "__audited", { value: meta, enumerable: false });
  // Preserve the handler's arity — colocated tests pin `POST.length` to prove
  // a route does not depend on the Request.
  Object.defineProperty(wrapped, "length", { value: handler.length, configurable: true });
  return wrapped;
}

/** True when `fn` was produced by `apiRoute()`. */
export function isAuditedHandler(fn: unknown): fn is ((...a: unknown[]) => unknown) & { __audited: ApiRouteMeta } {
  return typeof fn === "function" && "__audited" in fn;
}
