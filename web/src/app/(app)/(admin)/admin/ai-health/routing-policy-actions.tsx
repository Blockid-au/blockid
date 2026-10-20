"use client";

// G35 A2 — Approve / Dismiss / Rollback buttons for the paid report ladder
// proposal (POST /api/admin/ai-health/routing-policy, admin-only, audited).

import { useState } from "react";
import { useRouter } from "next/navigation";

type Action = "approve" | "dismiss" | "rollback";

export function RoutingPolicyActions({ proposalId, canRollback }: { proposalId: string | null; canRollback: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<Action | null>(null);
  const [confirming, setConfirming] = useState<Action | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function run(action: Action) {
    setBusy(action);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/ai-health/routing-policy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, proposal_id: proposalId ?? undefined }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setMessage({ ok: false, text: data.error ?? `Failed (${res.status})` });
      } else {
        setMessage({ ok: true, text: action === "approve" ? "Approved — the dispatcher uses the new ladder within 60 s." : action === "rollback" ? "Rolled back to the previous ladder." : "Proposal dismissed." });
        router.refresh();
      }
    } finally {
      setBusy(null);
      setConfirming(null);
    }
  }

  const btn = "rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50";
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {proposalId && (
          <>
            {confirming === "approve" ? (
              <button type="button" className={`${btn} bg-action text-on-action`} disabled={busy !== null} onClick={() => run("approve")}>
                {busy === "approve" ? "Approving…" : "Confirm approve"}
              </button>
            ) : (
              <button type="button" className={`${btn} bg-action text-on-action`} disabled={busy !== null} onClick={() => setConfirming("approve")}>
                Approve proposal
              </button>
            )}
            <button type="button" className={`${btn} border border-surface-300 bg-white text-ink-800`} disabled={busy !== null} onClick={() => run("dismiss")}>
              {busy === "dismiss" ? "Dismissing…" : "Dismiss"}
            </button>
          </>
        )}
        {canRollback &&
          (confirming === "rollback" ? (
            <button type="button" className={`${btn} border border-red-300 bg-red-50 text-red-800`} disabled={busy !== null} onClick={() => run("rollback")}>
              {busy === "rollback" ? "Rolling back…" : "Confirm rollback"}
            </button>
          ) : (
            <button type="button" className={`${btn} border border-surface-300 bg-white text-ink-800`} disabled={busy !== null} onClick={() => setConfirming("rollback")}>
              Rollback paid ladder
            </button>
          ))}
        {confirming && busy === null && (
          <button type="button" className={`${btn} text-ink-600`} onClick={() => setConfirming(null)}>
            Cancel
          </button>
        )}
      </div>
      {message && <p role="status" className={`text-xs ${message.ok ? "text-emerald-700" : "text-red-700"}`}>{message.text}</p>}
    </div>
  );
}
