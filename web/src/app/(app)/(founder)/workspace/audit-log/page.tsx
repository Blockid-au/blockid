import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentProjectIsSandbox } from "@/lib/projects";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { getUserAuditLog, type AuditLogRow } from "@/lib/audit/log";

export const metadata: Metadata = {
  title: "Audit Log",
  description:
    "Append-only trail of critical actions performed on your BlockID account (SOC2-lite evidence).",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

interface AuditLogPageProps {
  searchParams: Promise<{ page?: string }>;
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

export default async function AuditLogPage({ searchParams }: AuditLogPageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/audit-log");

  const { page: pageParam } = await searchParams;
  const page = parsePage(pageParam);
  const offset = (page - 1) * PAGE_SIZE;

  const [rows, isSandbox] = await Promise.all([
    getUserAuditLog(user.id, { limit: PAGE_SIZE, offset }),
    getCurrentProjectIsSandbox(),
  ]);

  const hasPrev = page > 1;
  const hasNext = rows.length === PAGE_SIZE;

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="p-6 max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-ink-800">Audit Log</h1>
          <p className="text-sm text-ink-700 mt-1">
            Append-only trail of critical actions on your account. Rows are
            recorded after a successful mutation and cannot be edited or
            removed (SOC2-lite evidence).
          </p>
        </div>

        <div className="bg-white border border-surface-200 shadow-sm rounded-2xl overflow-hidden">
          {rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-ink-600">
              No audit rows yet on page {page}.
            </div>
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
                      <td className="px-4 py-3 text-ink-800 font-medium">
                        {row.action}
                      </td>
                      <td className="px-4 py-3 text-ink-700 font-mono text-xs">
                        {subjectSummary(row)}
                      </td>
                      <td className="px-4 py-3 text-ink-700 font-mono text-xs">
                        {row.route}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between text-sm">
          <div className="text-ink-600">
            Page {page}
            {rows.length > 0 ? ` — showing ${rows.length} rows` : ""}
          </div>
          <div className="flex gap-2">
            {hasPrev ? (
              <Link
                href={page - 1 === 1 ? "/workspace/audit-log" : `/workspace/audit-log?page=${page - 1}`}
                className="px-3 py-1.5 rounded border border-surface-200 text-ink-700 hover:bg-surface-50"
              >
                Previous
              </Link>
            ) : (
              <span className="px-3 py-1.5 rounded border border-surface-100 text-ink-400 cursor-not-allowed">
                Previous
              </span>
            )}
            {hasNext ? (
              <Link
                href={`/workspace/audit-log?page=${page + 1}`}
                className="px-3 py-1.5 rounded border border-surface-200 text-ink-700 hover:bg-surface-50"
              >
                Next
              </Link>
            ) : (
              <span className="px-3 py-1.5 rounded border border-surface-100 text-ink-400 cursor-not-allowed">
                Next
              </span>
            )}
          </div>
        </div>
      </div>
    </WorkspaceLayout>
  );
}
