"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Loader2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ArchivedRow {
  id: string;
  name: string;
  slug: string;
  industry: string | null;
  archivedAt: string | null;
}

interface Props {
  rows: ArchivedRow[];
}

// ---------------------------------------------------------------------------
// Retention constants — mirrors the retention cron (iter-18 T1).
// ---------------------------------------------------------------------------

const RETENTION_DAYS = 90;
const WARNING_THRESHOLD_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Days remaining until the 90-day retention purge fires. Never negative. */
function daysUntilPurge(archivedAt: string | null, now: number): number {
  if (!archivedAt) return RETENTION_DAYS;
  const elapsed = Math.floor((now - new Date(archivedAt).getTime()) / DAY_MS);
  return Math.max(0, RETENTION_DAYS - elapsed);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ArchivedProjectsClient({ rows: initialRows }: Props) {
  const router = useRouter();
  const [rows, setRows] = React.useState<ArchivedRow[]>(initialRows);
  const [restoringId, setRestoringId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // Snapshot `Date.now()` at mount so hydration matches SSR-empty state
  // and all rows compute their countdown against the same clock.
  const [nowMs, setNowMs] = React.useState<number>(() => Date.now());
  React.useEffect(() => {
    setNowMs(Date.now());
  }, []);

  async function handleRestore(projectId: string) {
    const target = rows.find((r) => r.id === projectId);
    if (!target) return;

    setError(null);
    setRestoringId(projectId);

    // Optimistic remove.
    const previous = rows;
    setRows((prev) => prev.filter((r) => r.id !== projectId));

    try {
      const res = await fetch(`/api/projects/${projectId}/archive`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!json.ok) {
        setRows(previous);
        setError(json.error ?? "Failed to restore project");
        return;
      }
      // Success — send founder back to the active projects list. router.refresh
      // ensures the destination page reflects the newly-restored row.
      router.refresh();
      router.push("/workspace/projects");
    } catch {
      setRows(previous);
      setError("Network error. Please try again.");
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/workspace/projects"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-500 hover:text-ink-700 transition-colors mb-3"
        >
          <ArrowLeft strokeWidth={1.75} className="h-3.5 w-3.5" />
          Back to My Startups
        </Link>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-surface-100 flex items-center justify-center shrink-0">
            <Archive strokeWidth={1.5} className="h-5 w-5 text-ink-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-ink-900">
              Archived Startups
            </h1>
            <p className="text-sm text-ink-500 mt-0.5">
              Archived data is retained for {RETENTION_DAYS} days before it is
              permanently purged. Restore a startup to bring it back to your
              active list.
            </p>
          </div>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 flex items-start gap-3">
          <p className="flex-1 text-sm font-medium text-red-700">{error}</p>
          <button
            type="button"
            onClick={() => setError(null)}
            aria-label="Dismiss error"
            className="text-red-600 hover:text-red-800"
          >
            <X strokeWidth={1.75} className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Empty state */}
      {rows.length === 0 ? (
        <div className="text-center py-16 bg-surface-50 rounded-2xl border border-surface-200">
          <Archive
            strokeWidth={1.5}
            className="h-12 w-12 mx-auto text-ink-300 mb-4"
          />
          <h2 className="text-lg font-semibold text-ink-700 mb-2">
            No archived projects
          </h2>
          <p className="text-sm text-ink-500 max-w-sm mx-auto">
            No archived projects. When you archive a project, it will appear
            here.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-surface-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-surface-50 text-left">
              <tr className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">
                <th scope="col" className="px-4 py-3">
                  Name
                </th>
                <th scope="col" className="px-4 py-3">
                  Archived on
                </th>
                <th scope="col" className="px-4 py-3">
                  Days until purge
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-200">
              {rows.map((row) => {
                const days = daysUntilPurge(row.archivedAt, nowMs);
                const warning = days < WARNING_THRESHOLD_DAYS;
                const restoring = restoringId === row.id;

                return (
                  <tr key={row.id} className="hover:bg-surface-50/60">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-ink-800">
                        {row.name}
                      </div>
                      {row.industry && (
                        <div className="text-xs text-ink-500">
                          {row.industry}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-ink-600">
                      {formatDate(row.archivedAt)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold",
                          warning
                            ? "bg-red-100 text-red-700 ring-1 ring-red-200"
                            : "bg-surface-100 text-ink-600",
                        )}
                      >
                        {days}d left
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleRestore(row.id)}
                        disabled={restoring}
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100 transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60 focus-visible:ring-offset-2"
                      >
                        {restoring ? (
                          <Loader2
                            strokeWidth={1.75}
                            className="h-3.5 w-3.5 animate-spin"
                          />
                        ) : (
                          <ArchiveRestore
                            strokeWidth={1.75}
                            className="h-3.5 w-3.5"
                          />
                        )}
                        Restore
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
