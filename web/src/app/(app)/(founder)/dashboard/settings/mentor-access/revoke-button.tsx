"use client";

// RevokeButton — per-row destructive action on the founder's mentor-access
// settings page. Two-step confirmation so a mis-click doesn't nuke access
// mid-report-cycle.

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldX, Undo2 } from "lucide-react";
import type { MentorAccessTier } from "@/lib/mentor/access-tiers";

export interface RevokeButtonProps {
  grantId: string;
  resellerId: string;
  founderId: string;
  projectId: string | null;
  tier: MentorAccessTier;
  mentorName: string;
}

export function RevokeButton(props: RevokeButtonProps) {
  const router = useRouter();
  const [state, setState] = React.useState<"idle" | "confirm" | "sending">(
    "idle",
  );
  const [error, setError] = React.useState<string | null>(null);

  const doRevoke = React.useCallback(async () => {
    setState("sending");
    setError(null);
    try {
      const res = await fetch(
        `/api/mentor/grants/${encodeURIComponent(props.grantId)}/revoke`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ reason: "founder_settings_revoke" }),
        },
      );
      if (!res.ok) throw new Error(`revoke failed (${res.status})`);

      // Fire founder-side GA4 event — the server route mirrors this into
      // reseller_audit_log so the two sides stay reconcilable.
      try {
        const mod = await import("@/lib/mentor/conversion-events");
        void mod.emitMentorTierRevoked(
          {
            resellerId: props.resellerId,
            founderId: props.founderId,
            projectId: props.projectId,
            tier: props.tier,
            reason: "founder_settings_revoke",
          },
          props.founderId,
        );
      } catch {
        /* telemetry */
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Revoke failed");
      setState("confirm");
    }
  }, [props, router]);

  if (state === "confirm") {
    return (
      <div className="flex flex-col items-stretch gap-2 sm:items-end">
        <p className="text-xs text-ink-600 dark:text-ink-300">
          Revoke {props.mentorName}&rsquo;s access?
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setState("idle")}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-surface-200 bg-white px-3 text-xs font-medium text-ink-700 hover:bg-surface-50 dark:border-white/10 dark:bg-transparent dark:text-ink-200"
          >
            <Undo2 aria-hidden="true" className="h-3.5 w-3.5" />
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void doRevoke()}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-red-600 px-3 text-xs font-semibold text-white shadow-sm hover:bg-red-700"
          >
            <ShieldX aria-hidden="true" className="h-3.5 w-3.5" />
            Yes, revoke
          </button>
        </div>
        {error ? (
          <p role="alert" className="text-xs text-red-600">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setState("confirm")}
      disabled={state === "sending"}
      className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-white px-3 text-xs font-medium text-red-700 transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-60 dark:border-red-800/40 dark:bg-transparent dark:text-red-400 dark:hover:bg-red-900/20"
    >
      {state === "sending" ? (
        <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <ShieldX aria-hidden="true" className="h-3.5 w-3.5" />
      )}
      Revoke
    </button>
  );
}

export default RevokeButton;
