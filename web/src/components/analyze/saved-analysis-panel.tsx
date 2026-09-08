"use client";

// SavedAnalysisPanel — the "you can come back to this" footer under a finished
// /analyze run.
//
// Until now the only control after results was "Analyse another", so a founder
// whose run had just been written to the database had no way to learn that and
// no way to find it again. This panel is the whole visible half of that
// backend.
//
// The one rule it must never break: when `/api/intake` came back with
// `analysisId: null` the save failed, the analysis is still perfectly valid,
// and we say nothing about saving. Promising a permalink that 404s is worse
// than promising nothing.

import * as React from "react";
import Link from "next/link";
import { BookmarkCheck, Check, Copy, ExternalLink } from "lucide-react";

import {
  savedAnalysisPath,
  savedAnalysisUrl,
} from "@/lib/analyses/summary";

export interface SavedAnalysisPanelProps {
  /** Row id from POST /api/intake. `null` means the save failed. */
  analysisId: string | null;
  /** Server-resolved session state. Anything but `true` is treated as guest. */
  authenticated?: boolean;
  className?: string;
}

export interface SavedCopy {
  heading: string;
  body: string;
}

/**
 * What we are allowed to claim about where the run is kept.
 *
 * A signed-in run is on the account and reachable from any device. An
 * anonymous run is pinned to one httpOnly cookie in one browser — saying
 * anything stronger than that would be a promise the backend cannot keep, and
 * the founder would find out by losing the run.
 */
export function savedCopyFor(authenticated: boolean | undefined): SavedCopy {
  if (authenticated === true) {
    return {
      heading: "Saved to your account",
      body: "This analysis is on your account. Come back to it from any device with the link below.",
    };
  }
  return {
    heading: "Saved to this browser",
    body: "This analysis is kept against this browser, so the link below only works here. Create a free account and it follows you to any device.",
  };
}

export function SavedAnalysisPanel({
  analysisId,
  authenticated,
  className,
}: SavedAnalysisPanelProps) {
  const [copied, setCopied] = React.useState(false);
  // window is unavailable during SSR; the input renders the relative path on
  // the server pass and upgrades to the absolute URL once mounted, so the
  // markup never disagrees with itself.
  const [origin, setOrigin] = React.useState("");

  React.useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  React.useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  if (!analysisId) return null;

  const path = savedAnalysisPath(analysisId);
  const url = savedAnalysisUrl(analysisId, origin);
  const copy = savedCopyFor(authenticated);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Clipboard blocked (insecure context, permissions). The field is a
      // real input, so a manual select-and-copy still works.
      setCopied(false);
    }
  }

  return (
    <section
      className={[
        "rounded-2xl border border-line-subtle bg-surface-raised p-4 sm:p-5",
        className ?? "",
      ]
        .join(" ")
        .trim()}
      aria-labelledby="saved-analysis-heading"
      data-testid="analyze-saved-panel"
    >
      <div className="flex items-start gap-3">
        <BookmarkCheck
          aria-hidden
          strokeWidth={1.75}
          className="mt-0.5 h-5 w-5 shrink-0 text-bull"
        />
        <div className="min-w-0">
          <h2
            id="saved-analysis-heading"
            className="text-sm font-semibold text-primary"
          >
            {copy.heading}
          </h2>
          <p className="mt-1 text-sm text-secondary">{copy.body}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="sr-only" htmlFor="saved-analysis-url">
          Link to this analysis
        </label>
        <input
          id="saved-analysis-url"
          type="text"
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface-sunken px-3 py-2 font-mono text-xs text-secondary"
          data-testid="analyze-saved-url"
        />
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-action px-3 py-2 text-xs font-semibold text-on-action transition-opacity hover:opacity-90"
            data-testid="analyze-saved-copy"
          >
            {copied ? (
              <Check aria-hidden strokeWidth={2} className="h-3.5 w-3.5" />
            ) : (
              <Copy aria-hidden strokeWidth={2} className="h-3.5 w-3.5" />
            )}
            {copied ? "Copied" : "Copy link"}
          </button>
          <Link
            href={path}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line-subtle px-3 py-2 text-xs font-semibold text-primary transition-colors hover:border-line-strong"
            data-testid="analyze-saved-open"
          >
            <ExternalLink aria-hidden strokeWidth={2} className="h-3.5 w-3.5" />
            Open
          </Link>
        </div>
      </div>

      <div className="mt-3">
        {authenticated === true ? (
          <Link
            href="/workspace/analyses"
            className="text-xs font-semibold text-action hover:underline"
            data-testid="analyze-saved-list-link"
          >
            See all your analyses
          </Link>
        ) : (
          <Link
            href={`/auth/login?mode=register&next=${encodeURIComponent(path)}`}
            className="text-xs font-semibold text-action hover:underline"
            data-testid="analyze-saved-signup-link"
          >
            Create a free account to keep this
          </Link>
        )}
      </div>
    </section>
  );
}

export default SavedAnalysisPanel;
