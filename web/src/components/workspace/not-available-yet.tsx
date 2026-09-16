"use client";

// <NotAvailableYet> — the one honest card for a surface we have not built.
//
// S31-B (2026-09-13). Four nav-linked workspace pages (SSO, White-label,
// Applications, Weekly Digest) and a few inline controls each hand-rolled a
// "Coming Soon — Estimated: Q3 2026" card (Q3 2026 ends in seventeen days),
// named the retired "Scale" plan, and put an "Upgrade to Enterprise" button
// under a feature that does not exist. Third-party partner connections
// (QuickBooks, Xero app, SSO, Slides, Discord) are explicitly deferred, so
// the card says so, gives the reason, offers what DOES exist, and lets the
// founder register interest — a `leads` row (source "feature_interest",
// payload.feature) via the existing POST /api/lead, no new table.

import * as React from "react";
import Link from "next/link";
import { Bell, CheckCircle2, Loader2, type LucideIcon } from "lucide-react";

export const FEATURE_INTEREST_SOURCE = "feature_interest";

export interface NotAvailableYetAlternative {
  href: string;
  label: string;
}

export interface NotAvailableYetProps {
  /** Stable slug stored on the lead (e.g. "sso", "white_label"). */
  feature: string;
  title: string;
  /** One or two sentences: what it would do, and why it is not here yet. */
  reason: string;
  /** Signed-in user's email — the interest record is keyed on it. */
  userEmail: string;
  icon?: LucideIcon;
  /** Things that exist today and cover part of the need. */
  alternatives?: NotAvailableYetAlternative[];
  /** Where the "Back" link goes. Defaults to /workspace. */
  backHref?: string;
  backLabel?: string;
  /**
   * S-IA2: heading element for the title. A standalone page keeps the
   * default `h1`; a card composed into a hub tab passes `h2` (+ `headingId`
   * as the section anchor) so the page keeps a single h1.
   */
  headingLevel?: "h1" | "h2";
  headingId?: string;
}

type InterestState = "idle" | "sending" | "sent" | "failed";

export function NotAvailableYet({
  feature,
  title,
  reason,
  userEmail,
  icon: Icon,
  alternatives = [],
  backHref = "/workspace",
  backLabel = "Back to Workspace",
  headingLevel: Heading = "h1",
  headingId,
}: NotAvailableYetProps) {
  const [state, setState] = React.useState<InterestState>("idle");

  async function notifyMe() {
    if (state === "sending" || state === "sent") return;
    setState("sending");
    try {
      const res = await fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: userEmail,
          source: FEATURE_INTEREST_SOURCE,
          payload: {
            feature,
            path: typeof window !== "undefined" ? window.location.pathname : null,
          },
        }),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean } | null;
      setState(res.ok && json?.ok ? "sent" : "failed");
    } catch {
      setState("failed");
    }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto" data-testid="not-available-yet" data-feature={feature}>
      <div className="mb-8 text-center">
        {Icon && (
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-brand-50 mb-4">
            <Icon className="w-7 h-7 text-brand-600" aria-hidden="true" />
          </div>
        )}
        <Heading id={headingId} className="scroll-mt-24 text-2xl font-bold text-ink-900">{title}</Heading>
      </div>

      <div className="rounded-lg border border-ink-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold text-ink-800">Not available yet</p>
        <p className="mt-2 text-sm text-ink-600">{reason}</p>

        {alternatives.length > 0 && (
          <div className="mt-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">What you can use today</p>
            <ul className="mt-2 space-y-1.5">
              {alternatives.map((a) => (
                <li key={a.href}>
                  <Link href={a.href} className="text-sm font-medium text-brand-600 hover:underline underline-offset-4">
                    {a.label} →
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          {state === "sent" ? (
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700" role="status">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              Noted — we&apos;ll email {userEmail} when this ships.
            </span>
          ) : (
            <button
              type="button"
              onClick={notifyMe}
              disabled={state === "sending"}
              className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60 cursor-pointer"
            >
              {state === "sending" ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Bell className="h-4 w-4" aria-hidden="true" />
              )}
              Notify me when it&apos;s ready
            </button>
          )}
          <Link
            href={backHref}
            className="inline-flex items-center rounded-md border border-ink-300 px-4 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50"
          >
            {backLabel}
          </Link>
        </div>
        {state === "failed" && (
          <p className="mt-3 text-xs text-red-600" role="alert">
            Could not record that just now. Email support@blockid.au and we&apos;ll note your interest by hand.
          </p>
        )}
      </div>
    </div>
  );
}
