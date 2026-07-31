"use client";

// Client-side Approve/Decline form for /dashboard/mentor-invite.
//
// Split out so the parent page can stay a Server Component while the
// consent-checkbox + POST wiring live in a small "use client" island.
// See docs/plans/mentor-consent-model.md — the "I understand this lasts
// 12 months" checkbox is unchecked by default (au-compliance gate).

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, ShieldCheck, X } from "lucide-react";
import {
  CONSENT_LIFETIME_DAYS,
  type MentorAccessTier,
  tierLabel,
} from "@/lib/mentor/access-tiers";

export interface MentorInviteFormProps {
  grantRequestId: string;
  mode: "new" | "upgrade" | "renew" | "cohort";
  resellerId: string;
  requestedTier: MentorAccessTier;
  currentTier: MentorAccessTier | null;
  projectId: string | null;
}

const CONSENT_MONTHS = CONSENT_LIFETIME_DAYS / 30;

export function MentorInviteForm(props: MentorInviteFormProps) {
  const router = useRouter();
  const [consent, setConsent] = React.useState(false);
  const [busy, setBusy] = React.useState<"approve" | "decline" | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const needsConsent = props.requestedTier !== "attributed_only";
  const canApprove = !needsConsent || consent;

  const submit = React.useCallback(
    async (action: "approve" | "decline") => {
      if (busy) return;
      if (action === "approve" && !canApprove) return;
      setBusy(action);
      setError(null);
      try {
        const endpoint =
          action === "approve"
            ? "/api/mentor/grants"
            : "/api/mentor/grants/decline";
        const body = {
          grantRequestId: props.grantRequestId,
          mode: props.mode,
          resellerId: props.resellerId,
          requestedTier: props.requestedTier,
          currentTier: props.currentTier,
          projectId: props.projectId,
          consentEvidence: {
            checkboxAt: new Date().toISOString(),
            userAgent:
              typeof navigator !== "undefined" ? navigator.userAgent : null,
          },
        };
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          throw new Error(`Request failed (${res.status})`);
        }
        // Fire the founder-side GA4 event for immediate funnel visibility.
        try {
          const mod = await import("@/lib/mentor/conversion-events");
          if (action === "approve") {
            void mod.emitMentorInviteAccepted(
              {
                resellerId: props.resellerId,
                founderId: "",
                projectId: props.projectId,
                tier: props.requestedTier,
              },
              "",
            );
            if (props.currentTier) {
              void mod.emitMentorTierUpgraded(
                {
                  resellerId: props.resellerId,
                  founderId: "",
                  projectId: props.projectId,
                  fromTier: props.currentTier,
                  toTier: props.requestedTier,
                },
                "",
              );
            }
          } else {
            void mod.emitMentorInviteDeclined(
              {
                resellerId: props.resellerId,
                founderId: "",
                projectId: props.projectId,
                requestedTier: props.requestedTier,
              },
              "",
            );
          }
        } catch {
          /* telemetry */
        }
        router.push("/dashboard/settings/mentor-access");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
        setBusy(null);
      }
    },
    [busy, canApprove, props, router],
  );

  return (
    <section
      className="mt-6 rounded-3xl border border-surface-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-surface-100"
      aria-label="Approve or decline mentor access"
    >
      {needsConsent ? (
        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-surface-200 bg-surface-50/60 p-4 text-sm text-ink-700 dark:border-white/10 dark:bg-surface-100/60 dark:text-ink-200">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-surface-300 text-brand-600 focus:ring-brand-500"
          />
          <span>
            I understand this grants{" "}
            <strong>{tierLabel(props.requestedTier)}</strong> access for{" "}
            <strong>{CONSENT_MONTHS} months</strong>. I can revoke it any time
            from Settings › Mentor access.
          </span>
        </label>
      ) : null}

      <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={() => void submit("decline")}
          disabled={busy !== null}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-surface-200 bg-white px-4 text-sm font-medium text-ink-700 transition-colors hover:bg-surface-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-60 dark:border-white/10 dark:bg-transparent dark:text-ink-200 dark:hover:bg-white/5"
        >
          {busy === "decline" ? (
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          ) : (
            <X aria-hidden="true" className="h-4 w-4" />
          )}
          Decline
        </button>
        <button
          type="button"
          onClick={() => void submit("approve")}
          disabled={busy !== null || !canApprove}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy === "approve" ? (
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          ) : (
            <Check aria-hidden="true" className="h-4 w-4" />
          )}
          Approve for {CONSENT_MONTHS} months
        </button>
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-xs text-red-600">
          {error}
        </p>
      ) : (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-500">
          <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5" />
          Approval is logged for compliance and shown in your Settings page.
        </p>
      )}
    </section>
  );
}

export default MentorInviteForm;
