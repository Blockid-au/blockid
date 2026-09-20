"use client";

// RescoreButton — "Re-score cohort" on the Program tab (G21 P2-C). POSTs to
// P2-A's `POST /api/evaluations/batch/[id]/snapshot` (takes a cohort
// snapshot and re-scores on demand). Until that route ships the call answers
// 404 and the button explains it instead of failing silently; a 402 / 403
// surfaces the server's message. Loading state disables the button; the
// result is announced through aria-live.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

export interface RescoreButtonProps {
  endpoint: string;
}

export function RescoreButton({ endpoint }: RescoreButtonProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function run() {
    if (busy) return;
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      if (res.status === 404) {
        setNote("Cohort snapshots arrive with the cohort import lane — until then, re-score from the cohort table.");
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; error?: string; queued?: number };
      if (!res.ok || body.ok === false) {
        setNote(body.message ?? body.error ?? `Re-score failed (${res.status}).`);
        return;
      }
      setNote(typeof body.queued === "number" ? `Snapshot taken — ${body.queued} startup${body.queued === 1 ? "" : "s"} queued for re-scoring.` : "Snapshot taken.");
      router.refresh();
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Re-score failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        aria-busy={busy}
        data-testid="rescore-button"
        className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line-subtle bg-surface px-4 text-sm font-semibold text-primary hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden="true" />
        {busy ? "Re-scoring…" : "Re-score cohort"}
      </button>
      <p className="text-xs text-secondary" aria-live="polite" data-testid="rescore-note">
        {note}
      </p>
    </div>
  );
}
