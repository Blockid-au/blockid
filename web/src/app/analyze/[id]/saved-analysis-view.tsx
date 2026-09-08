"use client";

// SavedAnalysisView — renders one saved run at /analyze/[id].
//
// The fetch is client-side and same-origin on purpose. Entitlement lives in an
// httpOnly `blockid_anon` cookie (or the session), and a same-origin `fetch`
// carries both automatically — a server-side call to our own API would have to
// re-forward those headers by hand, which is exactly the kind of plumbing that
// quietly starts leaking or quietly starts 404ing.
//
// 404 handling is deliberate and load-bearing. `GET /api/analyses/[id]`
// answers 404 for a bad id, a real id belonging to somebody else, and a real
// id the caller has no cookie for — indistinguishably. This view must keep
// them indistinguishable: one "not found" panel, never "you don't have
// access", which would confirm the id exists.

import * as React from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { AlertCircle, ArrowLeft, Calendar, FileText } from "lucide-react";

import type { IntakeResult } from "@/lib/intake/analyze-input";
import {
  claimedMessage,
  describeInput,
  formatRunDateTime,
  inputKindLabel,
} from "@/lib/analyses/summary";

const AnalyzeResults = dynamic(
  () =>
    import("@/components/analyze/analyze-results").then((m) => m.AnalyzeResults),
  { ssr: false },
);

export interface SavedAnalysisPayload {
  id: string;
  createdAt: string;
  owned: boolean;
  input: {
    kind: string | null;
    url: string | null;
    filename: string | null;
    chars: number | null;
    truncated: boolean;
  };
  intake: IntakeResult;
}

type LoadState =
  | { status: "loading" }
  | { status: "found"; analysis: SavedAnalysisPayload }
  | { status: "not-found" };

/**
 * Map one API response onto a view state.
 *
 * Extracted and exported so the 404 contract is unit-testable: a bad id, an
 * id belonging to somebody else, an id with no cookie, and a malformed body
 * must all collapse to the identical `not-found` state. Anything that
 * branched differently here would leak the existence of the row.
 */
export function resolveLoadState(res: {
  ok: boolean;
  body?: unknown;
}): LoadState {
  if (!res.ok) return { status: "not-found" };
  const body = res.body as
    | { ok?: boolean; analysis?: SavedAnalysisPayload }
    | null
    | undefined;
  if (!body || body.ok !== true || !body.analysis) {
    return { status: "not-found" };
  }
  return { status: "found", analysis: body.analysis };
}

export interface SavedAnalysisViewProps {
  id: string;
  /** Real count from the claim that just ran, via `?claimed=`. 0 = nothing. */
  claimed?: number;
}

export function SavedAnalysisView({ id, claimed = 0 }: SavedAnalysisViewProps) {
  const [state, setState] = React.useState<LoadState>({ status: "loading" });

  React.useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const res = await fetch(`/api/analyses/${encodeURIComponent(id)}`, {
          credentials: "same-origin",
        });
        if (!live) return;
        const body = res.ok ? await res.json().catch(() => null) : null;
        if (!live) return;
        setState(resolveLoadState({ ok: res.ok, body }));
      } catch {
        // A network failure is not a missing analysis, but the founder can do
        // exactly the same thing about either: reload, or start a new run.
        if (live) setState({ status: "not-found" });
      }
    })();
    return () => {
      live = false;
    };
  }, [id]);

  if (state.status === "loading") {
    return (
      <div
        className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-4 py-16"
        role="status"
        aria-live="polite"
        data-testid="saved-analysis-loading"
      >
        <span
          aria-hidden
          className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-action motion-reduce:animate-none"
        />
        <p className="text-sm text-secondary">Loading your analysis…</p>
      </div>
    );
  }

  if (state.status === "not-found") {
    return (
      <div
        className="mx-auto max-w-xl px-4 py-16"
        data-testid="saved-analysis-not-found"
      >
        <div className="rounded-2xl border border-line-subtle bg-surface-raised p-6 text-center">
          <AlertCircle
            aria-hidden
            strokeWidth={1.75}
            className="mx-auto h-6 w-6 text-muted"
          />
          <h1 className="mt-3 text-lg font-semibold text-primary">
            Analysis not found
          </h1>
          <p className="mt-2 text-sm text-secondary">
            There is nothing saved at this link. Run a new analysis and you will
            get a fresh one you can come back to.
          </p>
          <Link
            href="/analyze"
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-action px-4 py-2 text-sm font-semibold text-on-action transition-opacity hover:opacity-90"
          >
            Start an analysis
          </Link>
        </div>
      </div>
    );
  }

  const { analysis } = state;
  const claimedLine = claimedMessage(claimed);

  return (
    <div className="w-full">
      <div className="mx-auto max-w-6xl px-4 pt-6">
        <Link
          href="/analyze"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-action hover:underline"
        >
          <ArrowLeft aria-hidden strokeWidth={2} className="h-3.5 w-3.5" />
          Analyse something else
        </Link>

        {claimedLine && (
          <p
            role="status"
            className="mt-4 rounded-xl border border-line-subtle bg-surface-sunken px-4 py-3 text-sm text-secondary"
            data-testid="saved-analysis-claimed"
          >
            {claimedLine}
          </p>
        )}

        <div className="mt-4 rounded-2xl border border-line-subtle bg-surface-raised p-4 sm:p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-tertiary">
            {inputKindLabel(analysis.input.kind)}
          </p>
          <h1 className="mt-1 break-words text-xl font-semibold text-primary sm:text-2xl">
            {describeInput({
              input_kind: analysis.input.kind,
              input_url: analysis.input.url,
              input_filename: analysis.input.filename,
            })}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
            <span className="inline-flex items-center gap-1.5">
              <Calendar aria-hidden strokeWidth={1.75} className="h-3.5 w-3.5" />
              Analysed {formatRunDateTime(analysis.createdAt)}
            </span>
            {analysis.input.url && (
              <a
                href={analysis.input.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-action hover:underline"
              >
                Open the site analysed
              </a>
            )}
            {analysis.input.truncated && (
              <span className="inline-flex items-center gap-1.5">
                <FileText
                  aria-hidden
                  strokeWidth={1.75}
                  className="h-3.5 w-3.5"
                />
                Long input — the first 65,000 characters were scored
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6">
        <AnalyzeResults intake={analysis.intake} />
      </div>
    </div>
  );
}

export default SavedAnalysisView;
