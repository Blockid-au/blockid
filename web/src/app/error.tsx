"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error("[blockid:error]", error.message);
  }, [error]);

  return (
    <div className="min-h-svh bg-surface-100 flex items-center justify-center px-6">
      <div className="text-center max-w-md">
        <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-amber-100 flex items-center justify-center">
          <span className="text-2xl">⚡</span>
        </div>
        <h1 className="text-2xl font-bold text-ink-800 mb-2">Something went wrong</h1>
        <p className="text-ink-600 text-sm mb-6">
          We hit a temporary issue. Your data is safe — try again or go back to the homepage.
        </p>
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
            className="inline-flex h-11 items-center justify-center rounded-xl border border-surface-300 bg-white px-6 text-sm font-semibold text-ink-700 hover:bg-surface-100 transition-colors"
          >
            Go to Homepage
          </Link>
        </div>
      </div>
    </div>
  );
}
