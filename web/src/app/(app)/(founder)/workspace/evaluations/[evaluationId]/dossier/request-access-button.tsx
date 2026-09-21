"use client";

// Block 3 CTA — "Invite founder to share reports" / "Request data-room
// access" (G13-W5-D3, S-D3; BA spec §A.3 block 3). POSTs
// /api/evaluations/[id]/actions { action: "request_access" }:
//   mode "invite"   → the existing claim flow: shows the claim link to copy
//                     (the founder invite email already carried it);
//   mode "notified" → the claimed founder got an `access_requested`
//                     notification (throttled 24 h per tier).

import { useState } from "react";
import { userErrorMessage } from "@/lib/ui/user-error";
import type { MentorAccessTier } from "@/lib/mentor/access-tiers";

type Phase = { kind: "idle" } | { kind: "busy" } | { kind: "invite"; claimUrl: string | null } | { kind: "notified"; notified: boolean } | { kind: "error"; message: string };

export function RequestAccessButton({ evaluationId, nextTier, founderClaimed }: { evaluationId: string; nextTier: MentorAccessTier; founderClaimed: boolean }) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const label = nextTier === "reports_shared" ? (founderClaimed ? "Ask the founder to share reports" : "Invite the founder") : "Request data-room access";

  const run = async () => {
    setPhase({ kind: "busy" });
    try {
      const res = await fetch(`/api/evaluations/${encodeURIComponent(evaluationId)}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request_access" }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; mode?: string; claim_url?: string | null; notified?: boolean; message?: string; error?: string };
      if (!res.ok || !body.ok) throw Object.assign(new Error(body.message ?? body.error ?? "Request failed"), { status: res.status, body });
      if (body.mode === "invite") setPhase({ kind: "invite", claimUrl: body.claim_url ?? null });
      else setPhase({ kind: "notified", notified: body.notified !== false });
    } catch (err) {
      setPhase({ kind: "error", message: userErrorMessage(err, "Could not send the request — try again.") });
    }
  };

  if (phase.kind === "invite") {
    return (
      <p className="mt-2 text-xs text-ink-700" data-testid="request-access-invite">
        {phase.claimUrl ? (
          <>
            Send the founder this claim link (also in their invite email):{" "}
            <code className="break-all rounded bg-surface px-1 py-0.5 text-[11px]">{phase.claimUrl}</code>
          </>
        ) : (
          <>Add the founder&apos;s email on the evaluation row to send an invite — reports are shared once they claim it.</>
        )}
      </p>
    );
  }
  if (phase.kind === "notified") {
    return (
      <p className="mt-2 text-xs text-emerald-800" data-testid="request-access-sent">
        {phase.notified ? "The founder has been notified — they decide on Investor access." : "Already asked in the last 24 hours — the founder has the request."}
      </p>
    );
  }
  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={run}
        disabled={phase.kind === "busy"}
        className="inline-flex min-h-9 items-center rounded-lg bg-action px-3 py-1.5 text-xs font-semibold text-on-action hover:bg-action-hover disabled:opacity-60"
        data-testid="request-access-button"
      >
        {phase.kind === "busy" ? "Sending…" : label}
      </button>
      {phase.kind === "error" ? (
        <p className="mt-1 text-xs text-red-700" role="alert">
          {phase.message}
        </p>
      ) : null}
    </div>
  );
}
