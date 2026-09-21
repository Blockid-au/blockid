"use client";

// Route-segment error boundary for the (app) group — dashboard, workspace,
// reseller, admin. Every authenticated surface routes through this segment;
// without a group-level boundary, a thrown error inside any (app) page would
// bubble all the way to /error.tsx and lose the workspace chrome context.
//
// Kept intentionally minimal (no shell import) so this file cannot itself
// throw during hydration and mask the underlying error. `reset()` is what
// Next 16 wires to the retry button — it re-runs the failed server render.

import { useEffect, useState } from "react";
import Link from "next/link";
import { isChunkLoadError, reloadOnceForStaleChunk } from "@/lib/ui/chunk-error";

export default function AppSegmentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Stale-build chunk after a deploy (G16 review P1-5): one hard reload, never
  // a dead end — when the loop guard refuses, the normal card renders.
  const staleChunk = isChunkLoadError(error);
  const [reloading, setReloading] = useState(false);
  useEffect(() => {
    if (staleChunk && reloadOnceForStaleChunk(error)) { const t = setTimeout(() => setReloading(true), 0); return () => clearTimeout(t); }
  }, [error, staleChunk]);

  useEffect(() => {
    console.error("[blockid:app:error]", error.message);
  }, [error]);

  if (reloading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-6" data-stale-chunk-reload>
        <p className="text-ink-600 text-sm">BlockID was just updated — reloading this page…</p>
      </div>
    );
  }

  return (
    <div className="min-h-[70vh] bg-surface-sunken flex items-center justify-center px-6" data-testid="error-boundary" role="alert">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-bear-soft flex items-center justify-center">
          <span className="text-2xl" aria-hidden>
            !
          </span>
        </div>
        <h1 className="mb-2 font-display text-2xl font-semibold text-primary">
          Something broke in your workspace
        </h1>
        <p className="mb-6 text-sm text-secondary">
          The page failed to render. Retry — if it persists, head back to your
          dashboard.
        </p>
        {process.env.NODE_ENV === "development" && (
          <p className="mb-4 break-all font-mono text-xs text-ink-500">
            {error.message}
          </p>
        )}
        {error.digest && (
          <p className="mb-4 font-mono text-[11px] text-muted">
            Error ID: {error.digest}
          </p>
        )}
        <div className="flex flex-col justify-center gap-3 sm:flex-row">
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-11 cursor-pointer items-center justify-center rounded-lg bg-action px-6 text-sm font-semibold text-on-action transition-colors hover:bg-action-hover"
          >
            Try Again
          </button>
          <Link
            href="/dashboard"
            className="inline-flex h-11 items-center justify-center rounded-lg border border-line bg-surface px-6 text-sm font-semibold text-primary transition-colors hover:bg-surface-hover"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
