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
//   * a handler that throws is recorded as status 500 and the error is
//     rethrown untouched;
//   * the audit write can never throw into the handler: sink errors are
//     logged and swallowed, and the write is bounded by AUDIT_WRITE_TIMEOUT_MS
//     so a slow database cannot hold the response;
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
        await finalizeAudit({
          meta,
          request,
          routeCtx: rest[0] as Ctx,
          status: 500,
          startedAt,
          threw: true,
        });
        throw err;
      }
      // A handler that falls through without a Response makes Next 500 — record it as such.
      const status =
        response && typeof response === "object" && typeof response.status === "number"
          ? response.status
          : 500;
      await finalizeAudit({ meta, request, routeCtx: rest[0] as Ctx, status, startedAt });
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
