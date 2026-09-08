"use client";

// SignupGatePanel — what a returning anonymous visitor sees instead of a
// second free run starting.
//
// The first run on this browser was completely unwalled: no email, no card,
// no account. This panel appears only from the second run onward, and it
// appears BEFORE the analysis starts rather than after it — see
// `@/lib/analyses/signup-gate` for why that ordering is the whole point.
//
// COPY RULES, which are not style preferences:
//   * It is an account wall, NOT a paywall. Nothing on this screen may imply
//     the analysis costs money, because it does not.
//   * Every number shown is a real one handed back by the API (`priorRuns`,
//     `windowDays`). We would rather say less than say something invented.
//   * No countdown, no "spots remaining", no pre-ticked marketing consent.
//     A visitor who signs up here should do it because keeping their work is
//     worth an email address, which it genuinely is.
//   * We promise the input is not lost, so `signupReturnPath` +
//     `parkIntakeForSignup` must actually keep that promise before this
//     component is allowed to make it.

import * as React from "react";
import Link from "next/link";
import { KeyRound, ShieldCheck } from "lucide-react";

import type { SmartIntakeSubmission } from "./smart-intake";
import {
  parkIntakeForSignup,
  signupReturnPath,
} from "@/lib/analyze/pending-intake";

export interface SignupGateCopy {
  heading: string;
  body: string;
  /** Only rendered when we actually know what came before. */
  history: string | null;
}

/**
 * Build the prompt's words from the real counts.
 *
 * `priorRuns` under 1 should be impossible — the gate cannot fire on a first
 * run — but if it ever does we simply say nothing about history rather than
 * assert something we cannot support.
 */
export function signupGateCopy(input: {
  priorRuns?: number;
  windowDays?: number;
}): SignupGateCopy {
  const prior = Number.isFinite(input.priorRuns)
    ? Math.max(0, Math.floor(input.priorRuns as number))
    : 0;
  // The window is stated because it is true and because it makes the wall
  // legible: this is a recent-usage count, not a permanent mark on the
  // browser. It is a fact, not a countdown — nothing here is urgent.
  const days = Number.isFinite(input.windowDays)
    ? Math.max(1, Math.floor(input.windowDays as number))
    : null;
  const windowPhrase = days ? ` in the last ${days} days` : "";
  const history =
    prior < 1
      ? null
      : prior === 1
        ? `You have already run one analysis on this browser${windowPhrase}, without an account.`
        : `You have already run ${prior} analyses on this browser${windowPhrase}, without an account.`;
  return {
    heading: "Create a free account to run this one",
    body: "This analysis is free — there is nothing to pay and no card needed. We just need an email address before it runs, because each run does real work on our side. Your account also keeps every analysis, so you can come back to it from any device.",
    history,
  };
}

export interface SignupGatePanelProps {
  /** Real prior-run count from the API. */
  priorRuns?: number;
  /** The rolling window the count was taken over. */
  windowDays?: number;
  /** What the visitor typed, so it survives the trip through signup. */
  submission: SmartIntakeSubmission | null;
  /** Let them change the input instead of signing up. */
  onEdit?: () => void;
  className?: string;
}

export function SignupGatePanel({
  priorRuns,
  windowDays,
  submission,
  onEdit,
  className,
}: SignupGatePanelProps) {
  const copy = signupGateCopy({ priorRuns, windowDays });
  const next = submission ? signupReturnPath(submission) : "/analyze";
  const registerHref = `/auth/login?mode=register&next=${encodeURIComponent(next)}`;
  const signInHref = `/auth/login?next=${encodeURIComponent(next)}`;

  // Write the input down as the panel mounts, not on click: a visitor who
  // reaches for the browser's own back/forward or opens the sign-in link in a
  // new tab must still find their words waiting on the way back.
  React.useEffect(() => {
    if (submission) parkIntakeForSignup(submission);
  }, [submission]);

  return (
    <section
      className={[
        "w-full rounded-2xl border border-line-subtle bg-surface-raised p-5 text-left sm:p-6",
        className ?? "",
      ]
        .join(" ")
        .trim()}
      aria-labelledby="signup-gate-heading"
      data-testid="analyze-signup-gate"
    >
      <div className="flex items-start gap-3">
        <KeyRound
          aria-hidden
          strokeWidth={1.75}
          className="mt-0.5 h-5 w-5 shrink-0 text-action"
        />
        <div className="min-w-0">
          <h2
            id="signup-gate-heading"
            className="text-base font-semibold text-primary"
          >
            {copy.heading}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-secondary">
            {copy.body}
          </p>
          {copy.history && (
            <p className="mt-2 text-sm text-tertiary">{copy.history}</p>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <Link
          href={registerHref}
          className="inline-flex items-center justify-center rounded-lg bg-action px-4 py-2.5 text-sm font-semibold text-on-action transition-opacity hover:opacity-90"
          data-testid="analyze-signup-gate-register"
        >
          Create a free account
        </Link>
        <Link
          href={signInHref}
          className="inline-flex items-center justify-center rounded-lg border border-line-subtle px-4 py-2.5 text-sm font-semibold text-primary transition-colors hover:border-line-strong"
          data-testid="analyze-signup-gate-signin"
        >
          I already have an account
        </Link>
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="text-sm font-medium text-action underline-offset-2 hover:underline sm:ml-1"
            data-testid="analyze-signup-gate-edit"
          >
            Change what I entered
          </button>
        )}
      </div>

      <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-muted">
        <ShieldCheck
          aria-hidden
          strokeWidth={1.75}
          className="mt-px h-3.5 w-3.5 shrink-0"
        />
        <span>
          {submission?.file
            ? "Files can’t travel through a sign-up, so you’ll be asked to drop your deck once more when you come back. Everything else is kept."
            : "What you typed is kept — you won’t be asked for it again. No payment, and we won’t sign you up to anything you didn’t ask for."}
        </span>
      </p>
    </section>
  );
}

export default SignupGatePanel;
