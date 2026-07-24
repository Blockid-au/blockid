"use client";

// AccessRequestBanner — rendered inside the reseller drawer when the
// mentor's current tier is below what a tab requires.
//
// Reuses the visual grammar of components/sales/paywall-nudge.tsx (Lock
// icon on a brand-tinted rounded chip + primary CTA button) so mentors see
// consistent language across "you need to upgrade your plan" and "you need
// to ask the founder for higher access" flows — the latter kept in-page
// rather than inside the modal because the founder (not the mentor) is the
// one who has to act.

import * as React from "react";
import { Lock, UserPlus, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type MentorAccessTier,
  tierDisclosure,
  tierLabel,
} from "@/lib/mentor/access-tiers";

export interface AccessRequestBannerProps {
  currentTier: MentorAccessTier | null;
  requiredTier: MentorAccessTier;
  founderId: string;
  resellerId: string;
  projectId?: string | null;
  /**
   * Optional override for the reason line. Defaults to a copy string
   * derived from the required tier ("This tab shows SVI evidence — needs
   * tier B").
   */
  reason?: string;
  className?: string;
  /**
   * Test hook. Production callers omit this; the component POSTs to
   * `/api/mentor/grants/request` internally.
   */
  onRequest?: (payload: {
    resellerId: string;
    founderId: string;
    projectId: string | null;
    requestedTier: MentorAccessTier;
  }) => Promise<void>;
}

function defaultReasonFor(t: MentorAccessTier): string {
  switch (t) {
    case "reports_shared":
      return "This tab shows SVI numbers and shared reports — needs Reports Shared access.";
    case "full_mentor":
      return "This tab shows SVI evidence and cap-table shape — needs Full Mentor access.";
    default:
      return "You need higher mentor access to view this tab.";
  }
}

async function postRequest(payload: {
  resellerId: string;
  founderId: string;
  projectId: string | null;
  requestedTier: MentorAccessTier;
}): Promise<void> {
  const res = await fetch("/api/mentor/grants/request", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`request failed (${res.status})`);
  }
}

export function AccessRequestBanner({
  currentTier,
  requiredTier,
  founderId,
  resellerId,
  projectId,
  reason,
  className,
  onRequest,
}: AccessRequestBannerProps) {
  const [state, setState] = React.useState<
    "idle" | "sending" | "sent" | "error"
  >("idle");
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const handleClick = React.useCallback(async () => {
    if (state === "sending" || state === "sent") return;
    setState("sending");
    setErrorMsg(null);
    const payload = {
      resellerId,
      founderId,
      projectId: projectId ?? null,
      requestedTier: requiredTier,
    };
    try {
      // Fire the mentor_invite_sent GA4 event optimistically via the
      // shared conversion-events helper. The server route mirrors this
      // into reseller_audit_log so a failed audit does not double-count.
      const { emitMentorInviteSent } = await import(
        "@/lib/mentor/conversion-events"
      );
      // Best-effort — swallow to keep UX smooth.
      try {
        // actorUserId here is the mentor themselves; we do not know the
        // canonical id client-side, so audit write is server-owned. Pass
        // an empty actor string; the server-side helper will override.
        void emitMentorInviteSent(
          {
            resellerId,
            founderId,
            projectId: projectId ?? null,
            requestedTier: requiredTier,
          },
          "",
        );
      } catch {
        /* telemetry */
      }
      if (onRequest) {
        await onRequest(payload);
      } else {
        await postRequest(payload);
      }
      setState("sent");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Request failed");
      setState("error");
    }
  }, [founderId, onRequest, projectId, requiredTier, resellerId, state]);

  const reasonText = reason ?? defaultReasonFor(requiredTier);

  return (
    <div
      role="region"
      aria-label="Mentor access required"
      className={cn(
        "flex flex-col gap-4 rounded-2xl border border-brand-200 bg-brand-50/60 p-6 dark:border-brand-800/40 dark:bg-brand-900/20",
        "sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-brand-600 shadow-sm dark:bg-surface-100">
          <Lock aria-hidden="true" strokeWidth={1.75} className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand-700 dark:text-brand-200">
            Access required · {tierLabel(requiredTier)}
          </p>
          <h3 className="mt-1 text-sm font-semibold text-ink-800 dark:text-ink-100">
            {reasonText}
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-ink-600 dark:text-ink-300">
            You&rsquo;re currently at{" "}
            <strong className="font-semibold">
              {currentTier ? tierLabel(currentTier) : "no access"}
            </strong>
            . {tierDisclosure(requiredTier)}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
        <button
          type="button"
          onClick={handleClick}
          disabled={state === "sending" || state === "sent"}
          className={cn(
            "inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold shadow-sm transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2",
            state === "sent"
              ? "bg-emerald-600 text-white"
              : "bg-brand-600 text-white hover:bg-brand-700",
            (state === "sending" || state === "sent") && "cursor-not-allowed",
          )}
        >
          {state === "sending" ? (
            <>
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              Sending&hellip;
            </>
          ) : state === "sent" ? (
            <>
              <Check aria-hidden="true" className="h-4 w-4" />
              Request sent
            </>
          ) : (
            <>
              <UserPlus aria-hidden="true" className="h-4 w-4" />
              Request access from founder
            </>
          )}
        </button>
        {state === "sent" ? (
          <p className="text-xs text-ink-600 dark:text-ink-300">
            Founder will get a prompt to approve or decline.
          </p>
        ) : null}
        {state === "error" ? (
          <p className="text-xs text-red-600 dark:text-red-400">
            {errorMsg ?? "Couldn't send the request. Try again."}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export default AccessRequestBanner;
