import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentProjectIsSandbox, getProjectScope } from "@/lib/projects";
import { listMembers } from "@/lib/project-members/scope";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { getUserAuditLog, type AuditLogRow } from "@/lib/audit/log";
import {
  auditActionFamilies,
  buildAuditQuery,
  listAuditEvents,
  resolveAuditViewerScope,
  type AuditEventRow,
  type AuditViewerScope,
} from "@/lib/audit/events";

export const metadata: Metadata = {
  title: "Audit Log",
  description:
    "Append-only, hash-chained trail of every change made through the BlockID API on your project (SOC2-lite evidence).",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

interface AuditLogPageProps {
  searchParams: Promise<{
    page?: string;
    source?: string;
    project?: string;
    actor?: string;
    action?: string;
  }>;
}

function parsePage(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? "1", 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, 1000);
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

function subjectSummary(row: AuditLogRow): string {
  if (row.subject_id) return `${row.subject_type}:${row.subject_id.slice(0, 8)}`;
  return row.subject_type;
}

function short(id: string | null | undefined): string {
  return id ? id.slice(0, 8) : "—";
}

function statusTone(status: unknown): string {
  const n = typeof status === "number" ? status : Number(status);
  if (!Number.isFinite(n)) return "text-ink-600";
  if (n >= 500) return "text-red-700";
  if (n >= 400) return "text-amber-700";
  return "text-emerald-700";
}

/** Build the query string for pagination / export preserving the filters. */
function qs(params: Record<string, string | number | null | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined || v === "" || v === 1) continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

function Pager({
  page,
  hasPrev,
  hasNext,
  base,
  filters,
  rowsShown,
}: {
  page: number;
  hasPrev: boolean;
  hasNext: boolean;
  base: string;
  filters: Record<string, string | null | undefined>;
  rowsShown: number;
}) {
  const btn = "px-3 py-1.5 rounded border border-surface-200 text-ink-700 hover:bg-surface-50";
  const off = "px-3 py-1.5 rounded border border-surface-100 text-muted cursor-not-allowed";
  return (
    <div className="mt-4 flex items-center justify-between text-sm">
      <div className="text-ink-600">
        Page {page}
        {rowsShown > 0 ? ` — showing ${rowsShown} rows` : ""}
      </div>
      <div className="flex gap-2">
        {hasPrev ? (
          <Link href={`${base}${qs({ ...filters, page: page - 1 })}`} className={btn}>
            Previous
          </Link>
        ) : (
          <span className={off}>Previous</span>
        )}
        {hasNext ? (
          <Link href={`${base}${qs({ ...filters, page: page + 1 })}`} className={btn}>
            Next
          </Link>
        ) : (
          <span className={off}>Next</span>
        )}
      </div>
    </div>
  );
}

export default async function AuditLogPage({ searchParams }: AuditLogPageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/audit-log");

  const sp = await searchParams;
  const page = parsePage(sp.page);
  const offset = (page - 1) * PAGE_SIZE;
  const source = sp.source === "legacy" ? "legacy" : "chain";

  const [scope, isSandbox] = await Promise.all([
    getProjectScope().catch(() => null),
    getCurrentProjectIsSandbox(),
  ]);
  const viewer: AuditViewerScope = resolveAuditViewerScope(user, scope);

  const filters = {
    source: source === "legacy" ? "legacy" : null,
    project: sp.project ?? null,
    actor: sp.actor ?? null,
    action: sp.action ?? null,
  };

  // ── Legacy per-user detail rows (app_user_audit_log) ─────────────────────
  if (source === "legacy") {
    const rows = await getUserAuditLog(user.id, { limit: PAGE_SIZE, offset });
    return (
      <WorkspaceLayout user={user} isSandbox={isSandbox}>
        <div className="p-6 max-w-5xl mx-auto">
          <div className="mb-6">
            <h1 className="text-xl font-bold text-ink-800">Audit Log — legacy detail rows</h1>
            <p className="text-sm text-ink-700 mt-1">
              Field-level rows written by the original 14 audited routes (your own actions only).{" "}
              <Link href="/workspace/audit-log" className="underline">
                Back to the hash-chained log
              </Link>
              .
            </p>
          </div>
          <div className="bg-white border border-surface-200 shadow-sm rounded-2xl overflow-hidden">
            {rows.length === 0 ? (
              <div className="p-8 text-center text-sm text-ink-600">No audit rows yet on page {page}.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-surface-50 text-ink-700">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium">When</th>
                      <th className="text-left px-4 py-3 font-medium">Action</th>
                      <th className="text-left px-4 py-3 font-medium">Subject</th>
                      <th className="text-left px-4 py-3 font-medium">Route</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-100">
                    {rows.map((row) => (
                      <tr key={row.id} className="hover:bg-surface-50">
                        <td className="px-4 py-3 text-ink-700 font-mono text-xs whitespace-nowrap">
                          {formatWhen(row.created_at)}
                        </td>
                        <td className="px-4 py-3 text-ink-800 font-medium">{row.action}</td>
                        <td className="px-4 py-3 text-ink-700 font-mono text-xs">{subjectSummary(row)}</td>
                        <td className="px-4 py-3 text-ink-700 font-mono text-xs">{row.route}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <Pager
            page={page}
            hasPrev={page > 1}
            hasNext={rows.length === PAGE_SIZE}
            base="/workspace/audit-log"
            filters={{ source: "legacy" }}
            rowsShown={rows.length}
          />
        </div>
      </WorkspaceLayout>
    );
  }

  // ── Hash-chained project log (audit_events) ──────────────────────────────
  const query = buildAuditQuery(viewer, filters, { limit: PAGE_SIZE, offset });
  const [rows, members] = await Promise.all([
    listAuditEvents(query),
    viewer.mode === "project" && viewer.projectId
      ? listMembers(viewer.projectId).catch(() => [])
      : Promise.resolve([]),
  ]);
  const families = auditActionFamilies();
  const actorOptions: { id: string; label: string }[] = [
    { id: user.id, label: "You" },
    ...members
      .filter((m) => m.userId && m.userId !== user.id && m.status === "accepted")
      .map((m) => ({ id: m.userId as string, label: `${m.userEmail} (${m.role})` })),
  ];

  const exportHref = `/api/audit-log/export${qs({ project: filters.project, actor: filters.actor, action: filters.action })}`;

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="p-6 max-w-6xl mx-auto">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-ink-800">Audit Log</h1>
            <p className="text-sm text-ink-700 mt-1">
              {viewer.mode === "project"
                ? "Every change made through the API on this project, by every member. Rows are hash-chained and cannot be edited or removed."
                : "Every change you made through the API. Rows are hash-chained and cannot be edited or removed."}
              {viewer.role ? (
                <span className="ml-1 text-ink-600">
                  Your role: <span className="font-medium">{viewer.role}</span>.
                </span>
              ) : null}
            </p>
            <p className="text-xs text-ink-600 mt-1">
              Bodies are never stored; IPs are salted hashes.{" "}
              <Link href="/workspace/audit-log?source=legacy" className="underline">
                Legacy detail rows
              </Link>
            </p>
          </div>
          {viewer.canExport ? (
            <a
              href={exportHref}
              className="px-3 py-1.5 rounded border border-surface-200 text-ink-700 hover:bg-surface-50 text-sm"
              data-testid="audit-export"
            >
              Export CSV
            </a>
          ) : null}
        </div>

        <form method="get" className="mb-4 flex flex-wrap items-end gap-3 text-sm" data-testid="audit-filters">
          {viewer.mode === "project" && viewer.projectId ? (
            <input type="hidden" name="project" value={viewer.projectId} />
          ) : null}
          <label className="flex flex-col gap-1">
            <span className="text-xs text-ink-600">Action family</span>
            <select name="action" defaultValue={filters.action ?? ""} className="border border-surface-200 rounded px-2 py-1.5 bg-white">
              <option value="">All</option>
              {families.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
          {viewer.mode === "project" ? (
            <label className="flex flex-col gap-1">
              <span className="text-xs text-ink-600">Actor</span>
              <select name="actor" defaultValue={filters.actor ?? ""} className="border border-surface-200 rounded px-2 py-1.5 bg-white">
                <option value="">Everyone</option>
                {actorOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <span className="text-xs text-ink-600 self-center" data-testid="audit-own-only">
              Showing your own actions only
            </span>
          )}
          <button type="submit" className="px-3 py-1.5 rounded bg-ink-800 text-white">
            Filter
          </button>
          {filters.action || filters.actor ? (
            <Link href="/workspace/audit-log" className="underline text-ink-600">
              Clear
            </Link>
          ) : null}
        </form>

        <div className="bg-white border border-surface-200 shadow-sm rounded-2xl overflow-hidden">
          {rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-ink-600">No audit rows match on page {page}.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm" data-testid="audit-table">
                <thead className="bg-surface-50 text-ink-700">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">When</th>
                    <th className="text-left px-4 py-3 font-medium">Actor</th>
                    <th className="text-left px-4 py-3 font-medium">Action</th>
                    <th className="text-left px-4 py-3 font-medium">Entity</th>
                    <th className="text-left px-4 py-3 font-medium">Route</th>
                    <th className="text-left px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100">
                  {rows.map((row: AuditEventRow) => {
                    const d = (row.detail ?? {}) as Record<string, unknown>;
                    return (
                      <tr key={row.id} className="hover:bg-surface-50">
                        <td className="px-4 py-3 text-ink-700 font-mono text-xs whitespace-nowrap">{formatWhen(row.ts)}</td>
                        <td className="px-4 py-3 text-ink-700 font-mono text-xs whitespace-nowrap">
                          {row.user_id === user.id ? "you" : short(row.user_id)}
                          {d.actor_role ? <span className="ml-1 text-ink-600">({String(d.actor_role)})</span> : null}
                        </td>
                        <td className="px-4 py-3 text-ink-800 font-medium">{row.action}</td>
                        <td className="px-4 py-3 text-ink-700 font-mono text-xs">
                          {row.resource_type}
                          {row.resource_id ? `:${short(row.resource_id)}` : ""}
                        </td>
                        <td className="px-4 py-3 text-ink-700 font-mono text-xs whitespace-nowrap">
                          {String(d.method ?? "")} {String(d.route ?? "")}
                        </td>
                        <td className={`px-4 py-3 font-mono text-xs ${statusTone(d.status)}`}>{String(d.status ?? "")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <Pager
          page={page}
          hasPrev={page > 1}
          hasNext={rows.length === PAGE_SIZE}
          base="/workspace/audit-log"
          filters={{ project: filters.project, actor: filters.actor, action: filters.action }}
          rowsShown={rows.length}
        />
      </div>
    </WorkspaceLayout>
  );
}
