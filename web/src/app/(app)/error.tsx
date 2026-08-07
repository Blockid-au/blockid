"use client";

// Route-segment error boundary for the (app) group — dashboard, workspace,
// reseller, admin. Every authenticated surface routes through this segment;
// without a group-level boundary, a thrown error inside any (app) page would
// bubble all the way to /error.tsx and lose the workspace chrome context.
//
// Kept intentionally minimal (no shell import) so this file cannot itself
// throw during hydration and mask the underlying error. `reset()` is what
// Next 16 wires to the retry button — it re-runs the failed server render.

import { useEffect } from "react";
import Link from "next/link";

export default function AppSegmentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[blockid:app:error]", error.message);
  }, [error]);

  return (
    <div className="min-h-[70vh] bg-surface-100 dark:bg-ink-900 flex items-center justify-center px-6">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-red-100 dark:bg-red-500/15 flex items-center justify-center">
          <span className="text-2xl" aria-hidden>
            !
          </span>
        </div>
        <h1 className="mb-2 text-2xl font-semibold text-ink-900 dark:text-white">
          Something broke in your workspace
        </h1>
        <p className="mb-6 text-sm text-ink-600 dark:text-ink-400">
          The page failed to render. Retry — if it persists, head back to your
          dashboard.
        </p>
        {process.env.NODE_ENV === "development" && (
          <p className="mb-4 break-all font-mono text-xs text-ink-500">
            {error.message}
          </p>
        )}
        {error.digest && (
          <p className="mb-4 font-mono text-[11px] text-ink-400">
            Error ID: {error.digest}
          </p>
        )}
        <div className="flex flex-col justify-center gap-3 sm:flex-row">
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-11 cursor-pointer items-center justify-center rounded-xl bg-brand-600 px-6 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
          >
            Try Again
          </button>
          <Link
            href="/dashboard"
            className="inline-flex h-11 items-center justify-center rounded-xl border border-surface-300 bg-white px-6 text-sm font-semibold text-ink-700 transition-colors hover:bg-surface-100 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-200 dark:hover:bg-ink-700"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
