"use client";

// InvestorPackGenerateForm — T-1203 client component.
//
// Handles the one-click investor pack generation flow:
//   1. User clicks "Generate Investor Pack"
//   2. POST to /api/investor-pack/one-click
//   3. Shows progress spinner during generation (~3–5s)
//   4. On success: displays share URL + download link
//   5. On error: surfaces the error message with a retry option

import { useState } from "react";

interface Props {
  /** Download URL from the most-recently-generated pack (null if none yet). */
  initialDownloadUrl: string | null;
  /** Preview href for the inline viewer. */
  previewHref: string;
}

interface GenerateResult {
  ok: boolean;
  shareId?: string;
  downloadUrl?: string;
  error?: string;
  upgradeUrl?: string;
}

export function InvestorPackGenerateForm({ initialDownloadUrl, previewHref }: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GenerateResult | null>(null);

  // After a successful generate, use the new download URL; otherwise fall back
  // to the server-fetched initial one.
  const downloadUrl = result?.downloadUrl ?? initialDownloadUrl;

  async function handleGenerate() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/investor-pack/one-click", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const json = (await res.json()) as GenerateResult;
      setResult(json);
    } catch {
      setResult({ ok: false, error: "Network error — please try again." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Primary CTA */}
      <div className="flex flex-wrap gap-3 items-center">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 hover:bg-brand-700 disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors"
          aria-busy={loading}
        >
          {loading ? (
            <>
              <svg
                className="h-4 w-4 animate-spin"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Generating…
            </>
          ) : (
            "Generate Investor Pack"
          )}
        </button>

        <a
          href={previewHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-sm font-medium text-ink-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 transition-colors"
        >
          Preview
        </a>

        {downloadUrl && !result && (
          <a
            href={downloadUrl}
            className="inline-flex items-center rounded-lg border border-brand-300 dark:border-brand-700 px-4 py-2 text-sm font-medium text-brand-700 dark:text-brand-300 hover:bg-brand-50 dark:hover:bg-brand-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 transition-colors"
            download
          >
            Download last pack
          </a>
        )}
      </div>

      {/* Progress hint */}
      {loading && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Building your investor pack — this usually takes 3–5 seconds.
        </p>
      )}

      {/* Success state */}
      {result?.ok && result.downloadUrl && (
        <div
          role="status"
          className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 p-4"
        >
          <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300 mb-2">
            Investor pack ready!
          </p>
          <p className="text-xs text-emerald-700 dark:text-emerald-400 mb-3">
            Share this link with investors. It expires in 30 days and allows
            direct PDF download — no login required.
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <code className="flex-1 rounded bg-emerald-100 dark:bg-emerald-900/50 px-3 py-1.5 text-xs text-emerald-900 dark:text-emerald-200 break-all min-w-0">
              {typeof window !== "undefined"
                ? `${window.location.origin}${result.downloadUrl}`
                : result.downloadUrl}
            </code>
            <a
              href={result.downloadUrl}
              className="shrink-0 inline-flex items-center rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 transition-colors"
              download
            >
              Download PDF
            </a>
            <button
              type="button"
              className="shrink-0 inline-flex items-center rounded-lg border border-emerald-300 dark:border-emerald-700 px-3 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 transition-colors"
              onClick={() => {
                const url =
                  typeof window !== "undefined"
                    ? `${window.location.origin}${result.downloadUrl}`
                    : result.downloadUrl ?? "";
                void navigator.clipboard.writeText(url);
              }}
              aria-label="Copy share link to clipboard"
            >
              Copy link
            </button>
          </div>
        </div>
      )}

      {/* 402 upgrade prompt */}
      {result && !result.ok && result.upgradeUrl && (
        <div
          role="alert"
          className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-4"
        >
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300 mb-1">
            Growth or Scale plan required
          </p>
          <p className="text-xs text-amber-700 dark:text-amber-400 mb-3">
            The investor pack feature requires a Growth or Scale plan. Upgrade
            to unlock one-click pack generation with share links.
          </p>
          <a
            href={result.upgradeUrl}
            className="inline-flex items-center rounded-lg bg-amber-600 hover:bg-amber-700 px-3 py-1.5 text-xs font-medium text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 transition-colors"
          >
            View plans
          </a>
        </div>
      )}

      {/* Generic error state */}
      {result && !result.ok && !result.upgradeUrl && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 p-4"
        >
          <p className="text-sm font-medium text-red-800 dark:text-red-300 mb-1">
            Generation failed
          </p>
          <p className="text-xs text-red-700 dark:text-red-400 mb-3">
            {result.error ?? "An unexpected error occurred. Please try again."}
          </p>
          <button
            type="button"
            onClick={handleGenerate}
            className="inline-flex items-center rounded-lg border border-red-300 dark:border-red-700 px-3 py-1.5 text-xs font-medium text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 transition-colors"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
