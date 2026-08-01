'use client';

import { useEffect } from 'react';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[blockid:dashboard:error]', error.message);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center p-8">
      <h1 className="text-2xl font-display font-semibold text-ink-900 dark:text-white mb-2">
        Something went wrong loading your dashboard
      </h1>
      <p className="text-ink-600 dark:text-ink-400 mb-6">
        {process.env.NODE_ENV === 'development'
          ? error.message
          : 'Please try again in a moment.'}
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="px-4 py-2 rounded-full bg-brand-navy text-white hover:bg-brand-navy/90"
        >
          Try again
        </button>
        <a
          href="/"
          className="px-4 py-2 rounded-full border border-ink-300 dark:border-ink-700"
        >
          Back to home
        </a>
      </div>
    </div>
  );
}
