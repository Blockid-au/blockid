"use client";

// FreeSummaryPanel — the ask, and it comes AFTER the answer.
//
// WHY IT SITS HERE AND NOT IN FRONT OF THE OMNIBOX
//
// The obvious version of a free tier collects an email before running
// anything: "enter your address and we'll send you your score". It converts
// worse, and it costs more than it collects. A visitor who has not seen a
// number yet is being asked to pay (in an address, and in the small dread of
// a mailing list) for something they have no reason to believe works. The
// finished run is also the product's distribution channel — founders forward
// it — and there is nothing to forward if nobody got one.
//
// So the order is fixed: the analysis runs, the score and the valuation range
// appear on screen, and only then does this card offer to put the written
// version in their inbox. By that point the ask is a continuation of
// something they already started, not a toll on the way in.
//
// WHAT IT PROMISES, AND WHY IT CAN
//
// Five pages. The list rendered here IS the list the PDF is built from
// (`FREE_SUMMARY_PAGES`), and the renderer's colocated suite reads the page
// count back out of the produced file. The card cannot advertise a page the
// document does not contain.
//
// WHAT IT NEVER DOES
//
// It never blocks the results behind itself, never re-asks after a send, and
// never implies the on-screen analysis expires. The A$3 upgrade is one
// subordinate line, because a visitor who just got something free is the worst
// possible audience for a hard sell and the best possible one for an honest
// description.

import * as React from "react";
import Link from "next/link";
import { AlertCircle, Check, Loader2, Mail } from "lucide-react";

import {
  FREE_SUMMARY_PAGES,
  freeSummaryCopy,
  normaliseSummaryEmail,
  type FreeSummaryOutcome,
} from "@/lib/analyses/free-summary";

export interface FreeSummaryPanelProps {
  /** Row id from POST /api/intake. `null` means the run was never saved. */
  analysisId: string | null;
  /** Told when a send succeeds, so the page can carry the address forward. */
  onSent?: (email: string) => void;
  className?: string;
}

type Phase =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "done"; outcome: FreeSummaryOutcome; maskedEmail: string | null };

interface SummaryResponse {
  ok?: unknown;
  outcome?: unknown;
  maskedEmail?: unknown;
}

/**
 * Read the endpoint's discriminated body without trusting it.
 *
 * The route always answers with an `outcome`, but a proxy error page or a
 * truncated response would not. Anything unrecognised collapses to
 * `send_failed`, which is the only honest thing to tell someone whose email
 * we cannot confirm went out.
 */
export function parseSummaryResponse(body: unknown): {
  outcome: FreeSummaryOutcome;
  maskedEmail: string | null;
} {
  const known: FreeSummaryOutcome[] = [
    "sent",
    "already_sent",
    "unsubscribed",
    "invalid_email",
    "not_found",
    "rate_limited",
    "send_failed",
  ];
  const b = (body ?? {}) as SummaryResponse;
  const outcome = known.includes(b.outcome as FreeSummaryOutcome)
    ? (b.outcome as FreeSummaryOutcome)
    : "send_failed";
  const masked =
    typeof b.maskedEmail === "string" && b.maskedEmail.length > 0
      ? b.maskedEmail
      : null;
  return { outcome, maskedEmail: masked };
}

export function FreeSummaryPanel({
  analysisId,
  onSent,
  className,
}: FreeSummaryPanelProps) {
  const [email, setEmail] = React.useState("");
  const [phase, setPhase] = React.useState<Phase>({ kind: "idle" });
  const inputId = React.useId();

  // No row means no permalink and nothing for the endpoint to key a send
  // against. Offering to email a summary we cannot produce would be worse
  // than staying quiet — same rule SavedAnalysisPanel follows.
  if (!analysisId) return null;

  const sending = phase.kind === "sending";
  const settled = phase.kind === "done" ? phase : null;
  const copy = settled
    ? freeSummaryCopy(settled.outcome, settled.maskedEmail)
    : null;
  // A finished send is final. Only the recoverable outcomes put the form back.
  const showForm = !settled || copy?.retryable === true;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    const clean = normaliseSummaryEmail(email);
    if (!clean) {
      setPhase({ kind: "done", outcome: "invalid_email", maskedEmail: null });
      return;
    }
    setPhase({ kind: "sending" });
    try {
      const res = await fetch(`/api/analyses/${analysisId}/free-summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: clean }),
      });
      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        body = null;
      }
      const parsed = parseSummaryResponse(body);
      setPhase({ kind: "done", ...parsed });
      if (parsed.outcome === "sent" || parsed.outcome === "already_sent") {
        onSent?.(clean);
      }
    } catch {
      setPhase({ kind: "done", outcome: "send_failed", maskedEmail: null });
    }
  }

  const sent =
    settled?.outcome === "sent" || settled?.outcome === "already_sent";

  return (
    <section
      className={[
        "rounded-2xl border border-line-subtle bg-surface-raised p-4 sm:p-5",
        className ?? "",
      ]
        .join(" ")
        .trim()}
      aria-labelledby="free-summary-heading"
      data-testid="analyze-free-summary"
    >
      <div className="flex items-start gap-3">
        {sent ? (
          <Check
            aria-hidden
            strokeWidth={2}
            className="mt-0.5 h-5 w-5 shrink-0 text-bull"
          />
        ) : (
          <Mail
            aria-hidden
            strokeWidth={1.75}
            className="mt-0.5 h-5 w-5 shrink-0 text-action"
          />
        )}
        <div className="min-w-0">
          <h2
            id="free-summary-heading"
            className="text-sm font-semibold text-primary"
          >
            {copy ? copy.heading : "Where should we send the full summary?"}
          </h2>
          <p className="mt-1 text-sm text-secondary">
            {copy
              ? copy.body
              : `Free, and yours to forward: a ${FREE_SUMMARY_PAGES.length}-page written version of everything above. One email, no account.`}
          </p>
        </div>
      </div>

      {!sent && (
        <ol
          className="mt-4 grid gap-x-6 gap-y-1.5 sm:grid-cols-2"
          data-testid="analyze-free-summary-pages"
        >
          {FREE_SUMMARY_PAGES.map((page, i) => (
            <li key={page.id} className="flex items-baseline gap-2 text-sm">
              <span
                aria-hidden
                className="w-4 shrink-0 text-right font-mono text-xs tabular-nums text-muted"
              >
                {i + 1}
              </span>
              <span className="min-w-0">
                <span className="font-medium text-primary">{page.title}</span>
                <span className="text-tertiary"> — {page.blurb}</span>
              </span>
            </li>
          ))}
        </ol>
      )}

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end"
          noValidate
        >
          <div className="min-w-0 flex-1">
            <label
              htmlFor={inputId}
              className="mb-1 block text-xs font-medium text-secondary"
            >
              Your email address
            </label>
            <input
              id={inputId}
              type="email"
              name="email"
              autoComplete="email"
              inputMode="email"
              placeholder="you@company.com.au"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={sending}
              aria-describedby={
                settled && !settled.maskedEmail
                  ? "free-summary-status"
                  : undefined
              }
              className="w-full min-w-0 rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-primary placeholder:text-faint focus:border-action focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-surface-raised disabled:opacity-50"
              data-testid="analyze-free-summary-input"
            />
          </div>
          <button
            type="submit"
            disabled={sending}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-action px-4 py-2.5 text-sm font-semibold text-on-action transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-surface-raised disabled:opacity-60"
            data-testid="analyze-free-summary-submit"
          >
            {sending && (
              <Loader2
                aria-hidden
                strokeWidth={2}
                className="h-4 w-4 animate-spin"
              />
            )}
            {sending ? "Sending…" : "Email me the summary"}
          </button>
        </form>
      )}

      {settled && !sent && (
        <p
          id="free-summary-status"
          role="alert"
          className="mt-3 flex items-start gap-2 text-sm text-secondary"
          data-testid="analyze-free-summary-error"
        >
          <AlertCircle
            aria-hidden
            strokeWidth={1.75}
            className="mt-0.5 h-4 w-4 shrink-0 text-warn"
          />
          <span>{copy?.body}</span>
        </p>
      )}

      <p className="mt-3 text-xs leading-relaxed text-muted">
        We use it to send this summary and nothing else. Every email we send
        carries a one-click unsubscribe.{" "}
        <Link
          href="/one-click-report"
          className="font-medium text-action underline-offset-2 hover:underline"
          data-testid="analyze-free-summary-upgrade"
        >
          The full written report, 10+ pages, is A$3
        </Link>
        .
      </p>
    </section>
  );
}

export default FreeSummaryPanel;
