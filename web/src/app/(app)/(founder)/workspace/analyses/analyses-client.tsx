"use client";

// AnalysesClient — "Your analyses": every /analyze run this founder has kept.
//
// GET /api/analyses always answers 200. An empty array means "you have not run
// one yet", NOT "please sign in", so the empty state is a first-run invitation
// and never a wall. Turning an empty list into a sign-in prompt would tell a
// founder who is already signed in that they are not.

import * as React from "react";
import Link from "next/link";
import { ArrowRight, LineChart, Loader2 } from "lucide-react";

import {
  claimedMessage,
  describeInput,
  formatRunDate,
  formatSviTotal,
  formatValuationMid,
  inputKindLabel,
  savedAnalysisPath,
  stageText,
  type AnalysisListRow,
} from "@/lib/analyses/summary";

export interface AnalysesClientProps {
  /** Real claim count from a signup/login that just ran, via `?claimed=`. */
  claimed?: number;
}

type Load =
  | { status: "loading" }
  | { status: "ready"; rows: AnalysisListRow[] }
  | { status: "error" };

/**
 * Map the list response onto a view state.
 *
 * A 200 with an empty array is `ready` with no rows — the empty state, not an
 * error. Only a transport-level failure is an error, and even then the founder
 * keeps a working "run one" call to action.
 */
export function resolveListState(res: { ok: boolean; body?: unknown }): Load {
  if (!res.ok) return { status: "error" };
  const body = res.body as { ok?: boolean; analyses?: unknown } | null | undefined;
  if (!body || body.ok !== true || !Array.isArray(body.analyses)) {
    return { status: "error" };
  }
  return { status: "ready", rows: body.analyses as AnalysisListRow[] };
}

export function AnalysesClient({ claimed = 0 }: AnalysesClientProps) {
  const [state, setState] = React.useState<Load>({ status: "loading" });

  React.useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const res = await fetch("/api/analyses", { credentials: "same-origin" });
        const body = res.ok ? await res.json().catch(() => null) : null;
        if (!live) return;
        setState(resolveListState({ ok: res.ok, body }));
      } catch {
        if (live) setState({ status: "error" });
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  const claimedLine = claimedMessage(claimed);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <header>
        <h1 className="text-xl font-semibold text-primary sm:text-2xl">
          Your analyses
        </h1>
        <p className="mt-1 text-sm text-secondary">
          Every run you have kept, newest first. Open one to see the full score,
          valuation and next actions exactly as they were.
        </p>
      </header>

      {claimedLine && (
        <p
          role="status"
          className="mt-4 rounded-xl border border-line-subtle bg-surface-sunken px-4 py-3 text-sm text-secondary"
          data-testid="analyses-claimed"
        >
          {claimedLine}
        </p>
      )}

      {state.status === "loading" && (
        <div
          className="mt-6 flex items-center gap-2 text-sm text-secondary"
          role="status"
          aria-live="polite"
        >
          <Loader2
            aria-hidden
            strokeWidth={1.75}
            className="h-4 w-4 animate-spin motion-reduce:animate-none"
          />
          Loading your analyses…
        </div>
      )}

      {state.status === "error" && (
        <div className="mt-6 rounded-2xl border border-line-subtle bg-surface-raised p-5">
          <p className="text-sm text-secondary">
            We could not load your list just now. Reload the page, or start a
            new analysis — nothing already saved has been lost.
          </p>
          <Link
            href="/analyze"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-action px-4 py-2 text-sm font-semibold text-on-action transition-opacity hover:opacity-90"
          >
            Run an analysis
          </Link>
        </div>
      )}

      {state.status === "ready" && state.rows.length === 0 && (
        <div
          className="mt-6 rounded-2xl border border-line-subtle bg-surface-sunken p-6 text-center"
          data-testid="analyses-empty"
        >
          <LineChart
            aria-hidden
            strokeWidth={1.5}
            className="mx-auto h-6 w-6 text-muted"
          />
          <h2 className="mt-3 text-base font-semibold text-primary">
            No analyses yet
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-secondary">
            Drop a pitch deck, paste your website, or type what you are
            building. It takes under a minute, it is free, and every run you do
            from here lands on this page.
          </p>
          <Link
            href="/analyze"
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-action px-4 py-2 text-sm font-semibold text-on-action transition-opacity hover:opacity-90"
          >
            Run your first analysis
            <ArrowRight aria-hidden strokeWidth={2} className="h-4 w-4" />
          </Link>
        </div>
      )}

      {state.status === "ready" && state.rows.length > 0 && (
        <>
          <ul className="mt-6 space-y-3" data-testid="analyses-list">
            {state.rows.map((row) => (
              <li key={row.id}>
                <Link
                  href={savedAnalysisPath(row.id)}
                  className="block rounded-2xl border border-line-subtle bg-surface-raised p-4 transition-colors hover:bg-surface-hover"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-tertiary">
                        {inputKindLabel(row.input_kind)} · {formatRunDate(row.created_at)}
                      </p>
                      <p className="mt-0.5 truncate text-sm font-semibold text-primary">
                        {describeInput(row)}
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
                        {stageText(row)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-5">
                      <div className="text-left sm:text-right">
                        <p className="text-[11px] uppercase tracking-[0.16em] text-tertiary">
                          SVI
                        </p>
                        <p className="text-base font-semibold tabular-nums text-primary">
                          {formatSviTotal(row.svi_total)}
                        </p>
                      </div>
                      <div className="text-left sm:text-right">
                        <p className="text-[11px] uppercase tracking-[0.16em] text-tertiary">
                          Valuation
                        </p>
                        <p className="text-base font-semibold tabular-nums text-primary">
                          {formatValuationMid(row.valuation_mid_aud)}
                        </p>
                      </div>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-5">
            <Link
              href="/analyze"
              className="inline-flex items-center gap-2 rounded-lg border border-line-subtle px-4 py-2 text-sm font-semibold text-primary transition-colors hover:border-line-strong"
            >
              Run another analysis
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

export default AnalysesClient;
