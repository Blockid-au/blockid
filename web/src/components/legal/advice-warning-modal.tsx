"use client";

// AdviceWarningModal — full-screen scroll-to-accept legal warning.
//
// Shown once per browser session on any equity-offer route so users cannot
// interact with the intake without seeing the full disclaimer. Uses a
// plain-HTML fixed overlay (no radix-ui dependency) so it works even in
// minimal build envs.
//
// The Accept button is disabled until the reader has scrolled the entire
// disclaimer body — the scroll container fires onScroll and we compare
// scrollTop + clientHeight against scrollHeight (with a small tolerance).
//
// On Accept we POST /api/legal/ack with kind='general_advice_warning' so
// the acknowledgement is durably chained in consent_events + audit_events.

import * as React from "react";
import { getSurface } from "@/lib/legal/surfaces";
import { DISCLAIMER_VERSIONS } from "@/lib/legal/versions";

const SESSION_KEY = "blockid.awm.accepted.v1";
const SCROLL_TOLERANCE_PX = 24;

export interface AdviceWarningModalProps {
  /** Which surface's body_md to display. Defaults to equity_offer_page. */
  surfaceId?: string;
  /** Callback fired after a successful POST to /api/legal/ack. */
  onAccepted?: () => void;
  /** Force-render regardless of sessionStorage (for testing). */
  forceOpen?: boolean;
}

export function AdviceWarningModal({
  surfaceId = "equity_offer_page",
  onAccepted,
  forceOpen = false,
}: AdviceWarningModalProps): React.ReactElement | null {
  const [open, setOpen] = React.useState<boolean>(false);
  const [scrolledBottom, setScrolledBottom] = React.useState<boolean>(false);
  const [submitting, setSubmitting] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);

  const surface = React.useMemo(() => getSurface(surfaceId), [surfaceId]);
  const body = surface?.body_md ?? "";

  React.useEffect(() => {
    if (forceOpen) {
      setOpen(true);
      return;
    }
    try {
      const accepted = sessionStorage.getItem(SESSION_KEY);
      if (!accepted) setOpen(true);
    } catch {
      // If sessionStorage is unavailable, show once per mount.
      setOpen(true);
    }
  }, [forceOpen]);

  const onScroll = React.useCallback<React.UIEventHandler<HTMLDivElement>>(
    (e) => {
      const el = e.currentTarget;
      const remaining = el.scrollHeight - (el.scrollTop + el.clientHeight);
      if (remaining <= SCROLL_TOLERANCE_PX) {
        setScrolledBottom(true);
      }
    },
    [],
  );

  // If the body already fits without needing to scroll, enable Accept.
  React.useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollHeight <= el.clientHeight + SCROLL_TOLERANCE_PX) {
      setScrolledBottom(true);
    }
  }, [open, body]);

  const onAccept = React.useCallback(async () => {
    if (!scrolledBottom || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/legal/ack", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          kind: "general_advice_warning",
          disclaimer_version: DISCLAIMER_VERSIONS.general_advice_warning,
          granted: true,
          detail: {
            surface: surfaceId,
            body_md: body,
          },
        }),
      });
      if (!res.ok && res.status !== 401) {
        // 401 is acceptable for an anonymous visitor — we still close the
        // modal so they can navigate, but do not persist accept flag.
        let reason = `HTTP ${res.status}`;
        try {
          const j = (await res.json()) as { reason?: string };
          if (j?.reason) reason = j.reason;
        } catch {
          /* ignore */
        }
        setError(reason);
        setSubmitting(false);
        return;
      }
      try {
        sessionStorage.setItem(SESSION_KEY, new Date().toISOString());
      } catch {
        /* non-fatal */
      }
      setOpen(false);
      onAccepted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setSubmitting(false);
    }
  }, [scrolledBottom, submitting, surfaceId, body, onAccepted]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="awm-title"
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-slate-950/70 p-0 sm:p-6"
    >
      <div className="w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2
            id="awm-title"
            className="text-lg font-semibold text-slate-900 dark:text-slate-100"
          >
            General Advice Warning
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Please read to the bottom before continuing.
          </p>
        </div>

        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="flex-1 overflow-y-auto px-6 py-4 text-sm leading-relaxed text-slate-700 dark:text-slate-300"
        >
          <p className="whitespace-pre-wrap">{body}</p>
          <div className="mt-4 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3 text-xs text-amber-900 dark:text-amber-100">
            <strong>Not financial advice.</strong> BlockID.au is not an AFSL
            holder. Seek independent legal, tax, and financial advice.
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="mx-6 mb-2 rounded-md border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/20 px-3 py-2 text-xs text-rose-800 dark:text-rose-200"
          >
            {error}
          </div>
        )}

        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row-reverse gap-2 sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={onAccept}
            disabled={!scrolledBottom || submitting}
            className={`inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
              scrolledBottom && !submitting
                ? "bg-brand-600 hover:bg-brand-700 text-white"
                : "bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-500 cursor-not-allowed"
            }`}
          >
            {submitting
              ? "Recording…"
              : scrolledBottom
                ? "I have read and accept"
                : "Scroll to the bottom to enable"}
          </button>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Version: {DISCLAIMER_VERSIONS.general_advice_warning}
          </span>
        </div>
      </div>
    </div>
  );
}

export default AdviceWarningModal;
