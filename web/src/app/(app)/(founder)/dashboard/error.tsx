'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { isChunkLoadError, reloadOnceForStaleChunk } from '@/lib/ui/chunk-error';

export default function DashboardError({
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
    console.error('[blockid:dashboard:error]', error.message);
  }, [error]);

  if (reloading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-6" data-stale-chunk-reload>
        <p className="text-ink-600 text-sm">BlockID was just updated — reloading this page…</p>
      </div>
    );
  }

  return (
    <div className="min-h-[70vh] bg-surface-100 flex items-center justify-center px-6" data-testid="error-boundary" role="alert">
      <div className="text-center max-w-md">
        <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-amber-100 flex items-center justify-center">
          <AlertTriangle className="h-7 w-7 text-amber-600" aria-hidden />
        </div>
        <h1 className="text-2xl font-display font-semibold text-ink-900 mb-2">
          We couldn&apos;t load your dashboard
        </h1>
        <p className="text-ink-600 text-sm mb-6">
          Your data is safe. This is usually temporary — try again, or head back to your workspace.
        </p>
        {process.env.NODE_ENV === 'development' && (
          <p className="mb-4 text-xs font-mono text-ink-500 break-all">
            {error.message}
          </p>
        )}
        {error.digest && (
          <p className="mb-4 text-[11px] font-mono text-muted">
            Error ID: {error.digest}
          </p>
        )}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-action px-6 text-sm font-semibold text-on-action hover:bg-action-hover transition-colors cursor-pointer"
          >
            Try Again
          </button>
          <Link
            href="/"
            className="inline-flex h-11 items-center justify-center rounded-xl border border-surface-300 bg-white px-6 text-sm font-semibold text-ink-700 hover:bg-surface-100 transition-colors"
          >
            Go to Homepage
          </Link>
        </div>
      </div>
    </div>
  );
}
