"use client";

// FreeReportEmailPanel — the address ask BEFORE a guest's run (G25-C).
//
// Founder decision 2026-09-21: the first two business reports are free, an
// e-mail address is required so the report can be sent, and the system
// records who submitted and who received it. So the ask moves in front of
// the run — but it is still only an address: no account, no password, no
// card, and the copy says exactly what the address is used for (Spam Act
// 2003: the report is what they asked for; one-click unsubscribe on every
// mail; the sender is named) plus the approved data-principle sentence.
//
// The input the visitor typed stays parked in the root; this panel only
// collects the address and hands it back. A remembered address (this
// browser, localStorage) is pre-filled so the second run is one click.

import * as React from "react";
import { AlertCircle, Mail } from "lucide-react";

import { FOCUS_RING } from "@/components/marketing/template/primitives";

import type { FreeReportCopy } from "@/lib/reports/free-report-copy";
import { FREE_REPORT_HONEYPOT_FIELD } from "@/lib/reports/free-grants-rules";
import { MARKETING_CONSENT_LABEL } from "@/lib/email/marketing-consent-copy";

export type FreeReportEmailError = "required" | "invalid" | "disposable" | null;

const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

/** Client-side pre-check — the server is the arbiter; this only saves a round trip. */
export function localEmailError(value: string): Exclude<FreeReportEmailError, "disposable"> {
  const v = value.trim();
  if (!v) return "required";
  if (v.length > 254 || !EMAIL_RE.test(v.toLowerCase())) return "invalid";
  return null;
}

export interface FreeReportEmailPanelProps {
  copy: FreeReportCopy["email"];
  /** Pre-filled address (remembered on this browser). */
  initialEmail?: string | null;
  /** Server-reported problem with the last address, if any. */
  serverError?: FreeReportEmailError;
  busy?: boolean;
  /**
   * `marketingConsent` — the separate G34-BT2 EM05 opt-in (D24-e). It starts
   * UNTICKED: an address typed only for the free report gets the report and
   * nothing commercial.
   */
  onContinue: (email: string, honeypot: string, marketingConsent: boolean) => void;
  onEdit?: () => void;
  className?: string;
}

export function FreeReportEmailPanel({
  copy,
  initialEmail,
  serverError = null,
  busy = false,
  onContinue,
  onEdit,
  className,
}: FreeReportEmailPanelProps) {
  const [email, setEmail] = React.useState(initialEmail ?? "");
  const [honeypot, setHoneypot] = React.useState("");
  const [marketingConsent, setMarketingConsent] = React.useState(false);
  const [localError, setLocalError] = React.useState<FreeReportEmailError>(null);
  const error = localError ?? serverError;
  const inputId = React.useId();
  const errorId = `${inputId}-error`;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const problem = localEmailError(email);
    setLocalError(problem);
    if (problem) return;
    onContinue(email.trim(), honeypot, marketingConsent);
  }

  const errorText =
    error === "required"
      ? copy.errors.required
      : error === "invalid"
        ? copy.errors.invalid
        : error === "disposable"
          ? copy.errors.disposable
          : null;

  return (
    <section
      className={[
        "w-full rounded-2xl border border-line-subtle bg-surface-raised p-5 text-left sm:p-6",
        className ?? "",
      ]
        .join(" ")
        .trim()}
      aria-labelledby="free-report-email-heading"
      data-testid="analyze-free-report-email"
    >
      <div className="flex items-start gap-3">
        <Mail aria-hidden strokeWidth={1.75} className="mt-0.5 h-5 w-5 shrink-0 text-action" />
        <div className="min-w-0">
          <h2 id="free-report-email-heading" className="text-base font-semibold text-primary">
            {copy.heading}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-secondary">{copy.body}</p>
        </div>
      </div>

      <form className="mt-4 flex flex-col gap-3" onSubmit={submit} noValidate>
        <label htmlFor={inputId} className="text-xs font-medium uppercase tracking-wider text-tertiary">
          {copy.label}
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id={inputId}
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (localError) setLocalError(null);
            }}
            placeholder={copy.placeholder}
            aria-invalid={Boolean(errorText)}
            aria-describedby={errorText ? errorId : undefined}
            className={`min-h-11 flex-1 rounded-lg border border-line-subtle bg-surface px-3 py-2 text-sm text-primary placeholder:text-tertiary focus:border-action ${FOCUS_RING}`}
            data-testid="analyze-free-report-email-input"
          />
          <button
            type="submit"
            disabled={busy}
            className={`inline-flex min-h-11 items-center justify-center rounded-lg bg-action px-4 py-2.5 text-sm font-semibold text-on-action transition-opacity hover:opacity-90 disabled:opacity-60 ${FOCUS_RING}`}
            data-testid="analyze-free-report-email-submit"
          >
            {copy.cta}
          </button>
        </div>
        {/* Honeypot — hidden from people, filled by bots. Never labelled as such. */}
        <div aria-hidden className="absolute left-[-10000px] top-auto h-px w-px overflow-hidden">
          <label>
            Company website
            <input
              type="text"
              name={FREE_REPORT_HONEYPOT_FIELD}
              tabIndex={-1}
              autoComplete="off"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
            />
          </label>
        </div>
        {errorText && (
          <p id={errorId} role="alert" className="flex items-start gap-1.5 text-sm text-bear" data-testid="analyze-free-report-email-error">
            <AlertCircle aria-hidden strokeWidth={2} className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{errorText}</span>
          </p>
        )}
        <p className="text-xs leading-relaxed text-tertiary" data-testid="analyze-free-report-consent">
          {copy.consent}
        </p>
        {/* G34-BT2 EM05 (D24-e): optional marketing opt-in, never pre-ticked. */}
        <label className="flex min-h-11 items-start gap-2 text-xs leading-relaxed text-secondary">
          <input
            type="checkbox"
            name="marketing_consent"
            checked={marketingConsent}
            onChange={(e) => setMarketingConsent(e.target.checked)}
            className={`mt-0.5 h-4 w-4 shrink-0 ${FOCUS_RING}`}
            data-testid="analyze-free-report-marketing-consent"
          />
          <span>{MARKETING_CONSENT_LABEL}</span>
        </label>
        <p className="text-xs leading-relaxed text-tertiary" data-testid="analyze-free-report-principle">
          {copy.principle}
        </p>
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className={`inline-flex min-h-11 items-center self-start rounded-md text-sm font-medium text-action underline-offset-2 hover:underline ${FOCUS_RING}`}
            data-testid="analyze-free-report-email-edit"
          >
            {copy.edit}
          </button>
        )}
      </form>
    </section>
  );
}

export default FreeReportEmailPanel;
