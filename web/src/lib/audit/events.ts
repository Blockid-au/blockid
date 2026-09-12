// S20-A — reader + viewer scoping for the hash-chained `audit_events` log
// behind /workspace/audit-log and /api/audit-log/export.
//
// Scoping (pure, unit-tested in events.test.ts):
//   * project owner / admin  → the PROJECT's log (every actor), CSV export owner-only
//   * editor / viewer        → their OWN actions only (actor filter forced to self)
//   * no resolvable project  → their OWN actions only
//
// Reads use the service-role client (RLS on audit_events is service-only
// for reads) and always apply the scope-derived filters — a caller can
// never widen the query past what `resolveAuditViewerScope` returns.

import { getSupabaseAdmin } from "@/lib/supabase";
import { AUDIT_ROUTE_CATALOGUE } from "./catalogue.generated";

export interface AuditEventRow {
  id: number;
  ts: string;
  user_id: string | null;
  actor: string | null;
  action: string | null;
  resource_type: string | null;
  resource_id: string | null;
  detail: Record<string, unknown> | null;
}

export type AuditViewMode = "project" | "own";

export interface AuditViewerScope {
  mode: AuditViewMode;
  /** Project whose log is shown (project mode) or used as an optional narrowing filter (own mode). */
  projectId: string | null;
  role: string | null;
  /** Actor filter forced by the scope (own mode) — the UI may not override it. */
  forcedActorUserId: string | null;
  canExport: boolean;
}

export interface AuditFilterInput {
  project?: string | null;
  actor?: string | null;
  action?: string | null;
}

export interface AuditQuery {
  projectId: string | null;
  actorUserId: string | null;
  actionPrefix: string | null;
  limit: number;
  offset: number;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTION_RE = /^[a-z0-9][a-z0-9._-]{0,80}$/;

function cleanUuid(v: string | null | undefined): string | null {
  return v && UUID_RE.test(v) ? v.toLowerCase() : null;
}

function cleanAction(v: string | null | undefined): string | null {
  const s = (v ?? "").trim().toLowerCase();
  return s && ACTION_RE.test(s) ? s : null;
}

/**
 * Derive what the caller may see from their project scope. `scope` is the
 * result of `getProjectScope()` (null when no project resolves).
 */
export function resolveAuditViewerScope(
  user: { id: string },
  scope: { projectId: string; role: string; isOwner: boolean } | null,
): AuditViewerScope {
  if (!scope) {
    return { mode: "own", projectId: null, role: null, forcedActorUserId: user.id, canExport: false };
  }
  if (scope.role === "owner" || scope.role === "admin") {
    return {
      mode: "project",
      projectId: scope.projectId,
      role: scope.role,
      forcedActorUserId: null,
      canExport: scope.isOwner,
    };
  }
  return {
    mode: "own",
    projectId: scope.projectId,
    role: scope.role,
    forcedActorUserId: user.id,
    canExport: false,
  };
}

/**
 * Combine the viewer scope with the (untrusted) URL filters into the
 * query actually run. Scope always wins: an own-mode viewer asking for
 * another actor still only gets their own rows; a project-mode viewer
 * cannot point the project filter at a project they do not administer.
 */
export function buildAuditQuery(
  viewer: AuditViewerScope,
  filters: AuditFilterInput,
  page: { limit: number; offset: number },
): AuditQuery {
  const wantProject = cleanUuid(filters.project);
  const wantActor = cleanUuid(filters.actor);
  const actionPrefix = cleanAction(filters.action);

  let projectId: string | null;
  if (viewer.mode === "project") {
    projectId = viewer.projectId;
  } else {
    // own mode: optional narrowing to the current project only.
    projectId = wantProject && wantProject === viewer.projectId ? wantProject : null;
  }

  const actorUserId = viewer.forcedActorUserId ?? wantActor;

  return {
    projectId,
    actorUserId,
    actionPrefix,
    limit: Math.max(1, Math.min(5000, page.limit)),
    offset: Math.max(0, page.offset),
  };
}

/** Run the query. Returns `[]` on any failure so the page degrades. */
export async function listAuditEvents(q: AuditQuery): Promise<AuditEventRow[]> {
  const admin = getSupabaseAdmin();
  if (!admin) return [];
  try {
    let query = admin
      .from("audit_events")
      .select("id, ts, user_id, actor, action, resource_type, resource_id, detail")
      .order("id", { ascending: false })
      .range(q.offset, q.offset + q.limit - 1);
    if (q.projectId) query = query.eq("detail->>project_id", q.projectId);
    if (q.actorUserId) query = query.eq("user_id", q.actorUserId);
    if (q.actionPrefix) query = query.like("action", `${q.actionPrefix}%`);
    const { data, error } = await query;
    if (error) {
      console.error("[blockid:audit] audit_events select failed", { code: error.code, message: error.message });
      return [];
    }
    return (data ?? []) as AuditEventRow[];
  } catch (err) {
    console.error("[blockid:audit] audit_events select threw", err instanceof Error ? err.message : err);
    return [];
  }
}

/** Top-level action families for the filter dropdown (`projects`, `svi`, …). */
export function auditActionFamilies(): string[] {
  const set = new Set<string>();
  for (const row of AUDIT_ROUTE_CATALOGUE) set.add(row.family.split(".")[0]);
  return [...set].sort();
}

// ---------------------------------------------------------------------------
// CSV (formula-guarded)
// ---------------------------------------------------------------------------

/**
 * RFC-4180 escape + spreadsheet formula guard: a cell starting with
 * `= + - @` or a tab/CR is prefixed with `'` so Excel / Sheets never
 * evaluate it (CSV injection).
 */
export function csvCellGuarded(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = typeof value === "string" ? value : typeof value === "object" ? JSON.stringify(value) : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export const AUDIT_CSV_COLUMNS = [
  "id",
  "ts",
  "actor_user_id",
  "actor_kind",
  "actor_role",
  "project_id",
  "action",
  "entity",
  "entity_id",
  "method",
  "route",
  "status",
  "ua_family",
] as const;

export function auditEventsToCsv(rows: AuditEventRow[]): string {
  const lines = [AUDIT_CSV_COLUMNS.join(",")];
  for (const r of rows) {
    const d = (r.detail ?? {}) as Record<string, unknown>;
    lines.push(
      [
        r.id,
        r.ts,
        r.user_id,
        r.actor,
        d.actor_role ?? "",
        d.project_id ?? "",
        r.action,
        r.resource_type,
        r.resource_id,
        d.method ?? "",
        d.route ?? "",
        d.status ?? "",
        d.ua_family ?? "",
      ]
        .map(csvCellGuarded)
        .join(","),
    );
  }
  return lines.join("\r\n") + "\r\n";
}
