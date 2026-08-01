'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function MarketingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[blockid:marketing:error]', error.message);
  }, [error]);

  return (
    <div className="min-h-[70vh] bg-surface-100 dark:bg-ink-900 flex items-center justify-center px-6">
      <div className="text-center max-w-md">
        <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-amber-100 dark:bg-amber-500/15 flex items-center justify-center">
          <span className="text-2xl" aria-hidden>⚡</span>
        </div>
        <h1 className="text-2xl font-display font-semibold text-ink-900 dark:text-white mb-2">
          This page hit a hiccup
        </h1>
        <p className="text-ink-600 dark:text-ink-400 text-sm mb-6">
          Something went wrong on our side — not yours. Try again, or explore the rest of BlockID.
        </p>
        {process.env.NODE_ENV === 'development' && (
          <p className="mb-4 text-xs font-mono text-ink-500 dark:text-ink-500 break-all">
            {error.message}
          </p>
        )}
        {error.digest && (
          <p className="mb-4 text-[11px] font-mono text-ink-400 dark:text-ink-500">
            Error ID: {error.digest}
          </p>
        )}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-brand-600 px-6 text-sm font-semibold text-white hover:bg-brand-700 transition-colors cursor-pointer"
          >
            Try Again
          </button>
          <Link
            href="/"
            className="inline-flex h-11 items-center justify-center rounded-xl border border-surface-300 dark:border-ink-700 bg-white dark:bg-ink-800 px-6 text-sm font-semibold text-ink-700 dark:text-ink-200 hover:bg-surface-100 dark:hover:bg-ink-700 transition-colors"
          >
            Go to Homepage
          </Link>
        </div>
      </div>
    </div>
  );
}
