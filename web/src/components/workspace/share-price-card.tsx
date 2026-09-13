"use client";

/**
 * Share price card (S26-B) — the SVI + connected-revenue price per share
 * from GET /api/share-price, shown on the cap-table page and the equity
 * setup wizard. Prints low / mid / high, the source label ("SVI + ARR
 * multiple (from Stripe, 3 Sep)" / "SVI score only") and the method note
 * with the documented weights, so a founder can see exactly what moved the
 * number. Never fabricates: no valuation → the reason and a next step.
 *
 * `initial` lets a test (or a server page) seed the state without a fetch.
 */

import * as React from "react";
import { Coins } from "lucide-react";
import { formatSharePrice, type SharePriceRangeLike } from "@/lib/share-price-format";

export interface SharePriceCardData {
  ok: boolean;
  reason: "no_shares" | "no_valuation" | null;
  method: "svi" | "svi+arr_multiple";
  weights: { svi: number; arr: number };
  fullyDilutedShares: number;
  valuation: SharePriceRangeLike;
  pricePerShare: SharePriceRangeLike;
  sourceLabel: string;
  methodNote: string;
  arrAud: number | null;
}

function fmtAud(v: number): string {
  if (!Number.isFinite(v)) return "A$0";
  if (v >= 1_000_000) return `A$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `A$${(v / 1_000).toFixed(0)}K`;
  return `A$${Math.round(v).toLocaleString("en-AU")}`;
}

export function SharePriceCard({ initial, compact = false }: { initial?: SharePriceCardData | null; compact?: boolean }) {
  const [data, setData] = React.useState<SharePriceCardData | null>(initial ?? null);
  const [loading, setLoading] = React.useState(!initial);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (initial) return;
    let alive = true;
    fetch("/api/share-price")
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        if (d?.ok && d.sharePrice) setData(d.sharePrice as SharePriceCardData);
        else setError(d?.error === "project_required" ? "Select a project to price a share." : d?.error ?? "Could not price a share");
      })
      .catch(() => alive && setError("Network error"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [initial]);

  if (loading) return <div className="animate-pulse h-20 rounded-2xl bg-surface-100" data-testid="share-price-loading" />;
  if (error || !data) {
    return (
      <div className="rounded-2xl border border-surface-200 bg-surface-50 p-4 text-xs text-ink-500" data-testid="share-price-error">
        {error ?? "Share price unavailable"}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-brand-100 bg-brand-50/40 p-4" data-testid="share-price-card" data-method={data.method}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-brand-700 flex items-center gap-1.5">
            <Coins strokeWidth={1.75} className="h-3.5 w-3.5" /> Price per share
          </p>
          {data.ok ? (
            <>
              <p className="mt-1 text-2xl font-bold font-mono text-ink-900" data-testid="share-price-mid">
                {formatSharePrice(data.pricePerShare.midAud)}
              </p>
              <p className="text-xs text-ink-600 font-mono">
                {formatSharePrice(data.pricePerShare.lowAud)} low · {formatSharePrice(data.pricePerShare.highAud)} high
              </p>
            </>
          ) : (
            <p className="mt-1 text-sm text-ink-700" data-testid="share-price-reason">
              {data.methodNote}
            </p>
          )}
        </div>
        <div className="text-right text-xs text-ink-600">
          <p className="font-medium text-ink-800" data-testid="share-price-source">{data.sourceLabel}</p>
          {data.ok ? (
            <>
              <p>Valuation {fmtAud(data.valuation.lowAud)} – {fmtAud(data.valuation.highAud)} (mid {fmtAud(data.valuation.midAud)})</p>
              <p>{data.fullyDilutedShares.toLocaleString("en-AU")} fully diluted shares</p>
            </>
          ) : null}
        </div>
      </div>
      {data.ok && !compact ? (
        <p className="mt-3 text-[11px] leading-relaxed text-ink-600" data-testid="share-price-method">
          {data.methodNote} General information only — not a valuation for tax, accounting or securities purposes.
        </p>
      ) : null}
    </div>
  );
}
