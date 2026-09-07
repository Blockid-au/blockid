"use client";

// Global App Router error boundary.
//
// Renders a calm, on-brand recovery card whenever a React tree beneath the
// root layout throws during render or data-fetch. The Next.js runtime
// injects `error` (with an optional server-side `digest` correlator) and a
// `reset()` closure that re-mounts the segment on retry.
//
// We also fire a `error_boundary_hit` GA4 event so ops can see the shape of
// production failures without waiting for a bug report. The message is
// truncated to 200 chars because GA4 param values are capped at 100 bytes
// per field for the ones we care about — we lean on `digest` for the
// correlator into server logs.

import { useEffect } from "react";
import Link from "next/link";
import { trackEvent } from "@/lib/analytics";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Structured console log for the browser + Sentry-style tail collectors.
    console.error("[blockid:error]", {
      message: error.message,
      digest: error.digest,
      stack: error.stack,
    });
    trackEvent("error_boundary_hit", {
      message: (error.message ?? "").slice(0, 200),
      digest: error.digest,
    });
  }, [error]);

  return (
    <div className="min-h-svh bg-surface-100 flex items-center justify-center px-6 py-12">
      <div className="max-w-md w-full">
        <div className="rounded-2xl border border-surface-300 bg-white p-8 shadow-sm text-center">
          <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-amber-100 flex items-center justify-center">
            <span className="text-2xl" aria-hidden="true">
              ⚡
            </span>
          </div>
          <h1 className="text-2xl font-bold text-ink-800 mb-2">
            Something went wrong
          </h1>
          <p className="text-ink-600 text-sm mb-6">
            The incident was logged and our team is on it. Your data is safe —
            try again or head back to the homepage.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              type="button"
              onClick={() => reset()}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-brand-600 px-6 text-sm font-semibold text-white hover:bg-brand-700 transition-colors cursor-pointer"
            >
              Try again
            </button>
            <Link
              href="/"
              className="inline-flex h-11 items-center justify-center rounded-xl border border-surface-300 bg-white px-6 text-sm font-semibold text-ink-700 hover:bg-surface-100 transition-colors"
            >
              Return home
            </Link>
          </div>

          {error.digest ? (
            <p className="mt-6 text-[11px] text-ink-500">
              Reference: <code className="font-mono">{error.digest}</code>
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
