"use client";

// Self-serve cancel / resume on /workspace/billing — G18-D (2026-09-19).
//
// Founder direction: "cho phép cancel subscription trên giao diện". Before
// this the page only offered the Stripe portal (which was broken: the
// account had no portal configuration) and a "Downgrade" confirm that
// redirected to the same portal. Every plan family (founder, evaluator,
// accelerator) now cancels here:
//
//   trialing          "Ends your trial now — your card is not charged."
//   active/past_due   "You keep access until <period end>. No refund for the
//                      current period (/legal/terms#refunds)."
//   cancel_scheduled  banner "Cancels on <date> · Resume" → /api/stripe/reactivate
//   reseller-managed  the page renders the "managed by your reseller" note
//                      instead of this section (no cancel here).
//
// The confirm dialog embeds the existing exit survey (reason required, note
// optional); the decline → POST /api/stripe/cancel, which is idempotent.

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, CalendarClock, Loader2, RotateCcw, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { ExitSurvey, type ExitSurveyResult } from "@/components/churn/exit-survey";
import { formatBillingDate, type BillingSubscriptionView } from "@/lib/billing/subscription-state";

export interface CancelSubscriptionSectionProps {
  subscription: BillingSubscriptionView;
  planLabel: string | null;
}

type CancelResponse = {
  ok: boolean;
  state?: "canceled" | "cancel_scheduled";
  activeUntil?: string;
  alreadyScheduled?: boolean;
  reason?: string;
  message?: string;
};

/** What cancelling does for a phase — exported for the colocated test. */
export function cancelOutcomeCopy(view: BillingSubscriptionView, planLabel: string | null): { headline: string; body: string } {
  const plan = planLabel ?? "your plan";
  switch (view.phase) {
    case "trialing":
      return {
        headline: `Cancel your ${plan} trial`,
        body: `Your trial ends today and your card is not charged. The first charge would have been on ${formatBillingDate(view.trialEnd)} — cancel any time before then and nothing is billed.`,
      };
    case "active":
    case "past_due":
      return {
        headline: `Cancel ${plan}`,
        body: `You keep everything until ${formatBillingDate(view.currentPeriodEnd)}, then your account drops to Free. There is no refund for the current period.`,
      };
    case "cancel_scheduled":
      return {
        headline: `${plan} cancels on ${formatBillingDate(view.accessEndsOnCancel)}`,
        body: "You will not be charged again. Resume any time before that date to keep your plan without interruption.",
      };
    default:
      return { headline: "No subscription to cancel", body: "You are on the Free plan — there is nothing to cancel." };
  }
}

export function CancelSubscriptionSection({ subscription: initial, planLabel }: CancelSubscriptionSectionProps) {
  const [view, setView] = React.useState<BillingSubscriptionView>(initial);
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState<"cancel" | "resume" | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  if (view.phase === "none" || view.phase === "canceled") return null;

  const copy = cancelOutcomeCopy(view, planLabel);

  async function submitCancel(result: ExitSurveyResult) {
    setBusy("cancel");
    setError(null);
    try {
      const res = await fetch("/api/stripe/cancel", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: result.reason, feedback: result.feedback }),
      });
      const json = (await res.json().catch(() => ({ ok: false }))) as CancelResponse;
      if (!res.ok || !json.ok) {
        setError(json.message ?? json.reason ?? "Could not cancel — please try again or e-mail support@blockid.au.");
        return;
      }
      setOpen(false);
      if (json.state === "canceled") {
        setView((v) => ({ ...v, phase: "canceled", status: "canceled", canCancel: false, canResume: false, nextChargeOn: null }));
        setNotice("Your trial has been cancelled. Your card will not be charged — you are back on Free.");
      } else {
        setView((v) => ({
          ...v,
          phase: "cancel_scheduled",
          cancelAtPeriodEnd: true,
          accessEndsOnCancel: json.activeUntil ?? v.currentPeriodEnd,
          currentPeriodEnd: json.activeUntil ?? v.currentPeriodEnd,
          nextChargeOn: null,
          canCancel: false,
          canResume: true,
        }));
        setNotice(json.alreadyScheduled ? "This subscription was already scheduled to cancel." : null);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function resume() {
    setBusy("resume");
    setError(null);
    try {
      const res = await fetch("/api/stripe/reactivate", { method: "POST", credentials: "include" });
      const json = (await res.json().catch(() => ({ ok: false }))) as CancelResponse;
      if (!res.ok || !json.ok) {
        setError(json.message ?? json.reason ?? "Could not resume — please try again.");
        return;
      }
      setView((v) => ({
        ...v,
        phase: v.status === "trialing" ? "trialing" : "active",
        cancelAtPeriodEnd: false,
        nextChargeOn: v.status === "trialing" ? v.trialEnd : v.currentPeriodEnd,
        canCancel: true,
        canResume: false,
      }));
      setNotice("Resumed — your plan continues as before.");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  const scheduled = view.phase === "cancel_scheduled";

  return (
    <section
      id="cancel"
      aria-labelledby="cancel-subscription-heading"
      data-testid="cancel-subscription-section"
      data-phase={view.phase}
      className={cn(
        "rounded-2xl border bg-white shadow-sm overflow-hidden",
        scheduled ? "border-amber-300" : "border-surface-200",
      )}
    >
      <div className="px-6 py-5 border-b border-surface-200 flex items-center gap-3">
        <div className={cn("h-9 w-9 rounded-xl flex items-center justify-center", scheduled ? "bg-amber-50" : "bg-surface-100")}>
          {scheduled ? (
            <CalendarClock strokeWidth={1.75} className="h-4.5 w-4.5 text-amber-600" />
          ) : (
            <XCircle strokeWidth={1.75} className="h-4.5 w-4.5 text-ink-500" />
          )}
        </div>
        <div>
          <h2 id="cancel-subscription-heading" className="text-base font-semibold text-ink-800">
            {scheduled ? "Cancellation scheduled" : "Cancel subscription"}
          </h2>
          <p className="text-xs text-ink-600">
            {planLabel ?? "Your plan"}
            {view.phase === "trialing" && view.trialEnd
              ? ` · trial ends ${formatBillingDate(view.trialEnd)} (${view.trialDaysLeft} day${view.trialDaysLeft === 1 ? "" : "s"} left)`
              : null}
            {(view.phase === "active" || view.phase === "past_due") && view.currentPeriodEnd
              ? ` · renews ${formatBillingDate(view.currentPeriodEnd)}`
              : null}
            {scheduled ? ` · access until ${formatBillingDate(view.accessEndsOnCancel)}` : null}
          </p>
        </div>
      </div>

      <div className="px-6 py-5 space-y-4">
        {notice && (
          <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {notice}
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <div>
          <p className="text-sm font-medium text-ink-800">{copy.headline}</p>
          <p className="mt-1 text-sm text-ink-600">
            {copy.body}{" "}
            {(view.phase === "active" || view.phase === "past_due") && (
              <Link href="/legal/terms#refunds" className="underline underline-offset-2 hover:text-ink-800">
                Refund terms
              </Link>
            )}
          </p>
          {view.phase === "trialing" && (
            <p className="mt-2 text-xs text-ink-500">
              {view.paymentMethodSaved ? "Card on file. " : ""}
              First charge on {formatBillingDate(view.trialEnd)} — cancel any time before then and there is no charge.
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {scheduled ? (
            <button
              type="button"
              onClick={resume}
              disabled={busy === "resume"}
              data-testid="resume-subscription"
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-action px-5 text-sm font-semibold text-white hover:bg-action-hover transition-colors",
                busy === "resume" && "opacity-60 cursor-wait",
              )}
            >
              {busy === "resume" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw strokeWidth={1.75} className="h-4 w-4" />}
              Resume subscription
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setNotice(null);
                setOpen(true);
              }}
              data-testid="cancel-subscription"
              className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-red-200 bg-white px-5 text-sm font-medium text-red-700 hover:bg-red-50 transition-colors"
            >
              <XCircle strokeWidth={1.75} className="h-4 w-4" />
              {view.phase === "trialing" ? "Cancel trial" : "Cancel subscription"}
            </button>
          )}
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="cancel-dialog-heading">
          <div className="absolute inset-0 bg-strong/50 backdrop-blur-sm" onClick={() => (busy ? null : setOpen(false))} />
          <div className="relative bg-white rounded-2xl border border-surface-200 shadow-xl max-w-md w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start gap-3">
              <AlertTriangle strokeWidth={1.75} className="h-5 w-5 shrink-0 text-amber-500 mt-0.5" />
              <div>
                <h3 id="cancel-dialog-heading" className="text-base font-semibold text-ink-800">{copy.headline}</h3>
                <p className="mt-1 text-sm text-ink-600">{copy.body}</p>
              </div>
            </div>
            <ExitSurvey onSubmit={submitCancel} onCancel={() => setOpen(false)} submitting={busy === "cancel"} />
          </div>
        </div>
      )}
    </section>
  );
}
