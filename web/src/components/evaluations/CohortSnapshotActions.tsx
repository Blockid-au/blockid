"use client";

// CohortSnapshotActions — "Last snapshot: <date> · n" + Snapshot / Re-score
// buttons on the BlockID Cohort header (G21 P2-A). Posts to
// /api/evaluations/batch/[id]/snapshot; the page re-renders on success.
// P2-B renders the per-row Δ column from GET …/snapshots.

import * as React from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, RefreshCw } from "lucide-react";
import { formatDelta } from "@/lib/evaluations/cohort-delta";

export interface CohortSnapshotActionsProps {
  batchId: string;
  /** ISO of the newest snapshot (null = none yet). */
  lastTakenAt: string | null;
  /** Rows in that snapshot. */
  lastN: number | null;
  /** Snapshots on record. */
  count: number;
}

export function formatSnapshotDate(iso: string | null): string {
  if (!iso) return "none yet";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "none yet";
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

export function CohortSnapshotActions({ batchId, lastTakenAt, lastN, count }: CohortSnapshotActionsProps) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<"manual" | "rescore" | null>(null);
  const [note, setNote] = React.useState<string | null>(null);

  async function run(reason: "manual" | "rescore") {
    setBusy(reason);
    setNote(null);
    try {
      const res = await fetch(`/api/evaluations/batch/${encodeURIComponent(batchId)}/snapshot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; error?: string; requeued?: number[]; delta?: { n: number; medianSvi: number | null } };
      if (!res.ok || !json.ok) {
        setNote(json.message ?? (json.error === "not_migrated" ? "Snapshots are not enabled on this server yet." : "Could not take the snapshot."));
        return;
      }
      const parts: string[] = ["Snapshot saved"];
      if (reason === "rescore") parts.push(`${json.requeued?.length ?? 0} startup${(json.requeued?.length ?? 0) === 1 ? "" : "s"} re-queued for off-peak scoring`);
      if (json.delta && json.delta.n > 0) parts.push(`median SVI move ${formatDelta(json.delta.medianSvi)} across ${json.delta.n}`);
      setNote(parts.join(" · ") + ".");
      router.refresh();
    } catch {
      setNote("Network error. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted" data-testid="cohort-snapshot-actions">
      <span data-testid="cohort-last-snapshot">
        Last snapshot: {formatSnapshotDate(lastTakenAt)}
        {lastTakenAt && lastN != null ? ` · n ${lastN}` : ""}
        {count > 1 ? ` · ${count} on record` : ""}
      </span>
      <button
        type="button"
        onClick={() => void run("manual")}
        disabled={busy != null}
        className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-surface-300 bg-surface px-2.5 py-1 font-medium text-ink-700 hover:bg-surface-hover disabled:opacity-50"
        data-testid="cohort-snapshot-now"
      >
        {busy === "manual" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Camera className="h-3.5 w-3.5" aria-hidden="true" />}
        Snapshot now
      </button>
      <button
        type="button"
        onClick={() => void run("rescore")}
        disabled={busy != null}
        title="Re-queue startups whose last score is older than 30 days, then snapshot"
        className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-surface-300 bg-surface px-2.5 py-1 font-medium text-ink-700 hover:bg-surface-hover disabled:opacity-50"
        data-testid="cohort-rescore"
      >
        {busy === "rescore" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}
        Re-score cohort
      </button>
      {note ? (
        <span role="status" aria-live="polite" className="basis-full text-ink-600">
          {note}
        </span>
      ) : null}
    </div>
  );
}
