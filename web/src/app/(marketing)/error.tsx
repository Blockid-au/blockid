'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Zap } from 'lucide-react';
import { CTA_CLASS } from '@/components/marketing/template';
import { isChunkLoadError, reloadOnceForStaleChunk } from '@/lib/ui/chunk-error';

export default function MarketingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const staleChunk = isChunkLoadError(error);
  // G16 review P1-5: only show the "reloading…" card when a reload was
  // actually issued; when the loop guard refuses, fall through to the
  // normal card with Try again — never a dead end.
  const [reloading, setReloading] = useState(false);
  useEffect(() => {
    if (staleChunk && reloadOnceForStaleChunk(error)) { const t = setTimeout(() => setReloading(true), 0); return () => clearTimeout(t); }
    console.error('[blockid:marketing:error]', error.message);
  }, [error, staleChunk]);

  if (reloading) {
    return (
      <div className="min-h-[70vh] bg-surface flex items-center justify-center px-6" data-stale-chunk-reload>
        <p className="text-secondary text-sm">BlockID was just updated — reloading this page…</p>
      </div>
    );
  }

  return (
    <div className="min-h-[70vh] bg-surface flex items-center justify-center px-6" data-testid="error-boundary" role="alert">
      <div className="text-center max-w-md">
        <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-accent-soft text-accent flex items-center justify-center" aria-hidden>
          <Zap className="h-7 w-7" strokeWidth={1.75} />
        </div>
        <h1 className="text-2xl font-display font-semibold text-primary mb-2">
          This page hit a hiccup
        </h1>
        <p className="text-secondary text-sm mb-6">
          Something went wrong on our side — not yours. Try again, or explore the rest of BlockID.
        </p>
        {process.env.NODE_ENV === 'development' && (
          <p className="mb-4 text-xs font-mono text-muted break-all">
            {error.message}
          </p>
        )}
        {error.digest && (
          <p className="mb-4 text-[11px] font-mono text-muted">
            Error ID: {error.digest}
          </p>
        )}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button type="button" onClick={reset} className={`${CTA_CLASS.primary} cursor-pointer`}>
            Try again
          </button>
          <Link href="/" className={CTA_CLASS.secondary}>
            Go to homepage
          </Link>
        </div>
      </div>
    </div>
  );
}
