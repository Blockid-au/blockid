"use client";

// TaxInvoiceHistoryTile — read-only compliance-panel tile that consumes the
// GET /api/compliance/tax-invoice-check endpoint (P5-tax-invoice-checker-persist)
// and renders the saved snapshot count + latest-band chip. Ships alongside
// the CompliancePanel 6 existing tiles as the 7th slot, following the
// same visual Tile shape (rounded-xl border, hover, pill status).
//
// Deep-links to /workspace/tax-invoice-checker (P5-tax-invoice-checker-ui)
// so a founder who lands on a red chip can jump straight to fixing it.

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  formatComputedAtRelative,
  pickHistoryTileView,
  type HistoryTilePayload,
  type TileColour,
} from "./tax-invoice-history-tile.helpers";

interface GetResponse {
  ok: boolean;
  result: HistoryTilePayload["latest"];
  total?: number;
}

const PILL_CLASS: Record<TileColour, string> = {
  red: "bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-300",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300",
  emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300",
  slate: "bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300",
};

export function TaxInvoiceHistoryTile() {
  const [payload, setPayload] = React.useState<HistoryTilePayload | null>(null);
  const [state, setState] = React.useState<"loading" | "ready" | "error">("loading");

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/compliance/tax-invoice-check", {
          credentials: "same-origin",
          cache: "no-store",
        });
        if (!res.ok) {
          if (!cancelled) setState("error");
          return;
        }
        const body = (await res.json()) as GetResponse;
        if (cancelled) return;
        setPayload({ total: body.total ?? 0, latest: body.result ?? null });
        setState("ready");
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const view = pickHistoryTileView(payload);
  const lastSeen = payload?.latest ? formatComputedAtRelative(payload.latest.computed_at) : null;

  return (
    <Link
      href="/workspace/tax-invoice-checker"
      data-testid="tax-invoice-history-tile"
      data-colour={view.colour}
      data-total={payload?.total ?? 0}
      className="block rounded-xl border border-border bg-card p-4 transition hover:border-primary/50 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">Tax invoices audited</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            GST Act 1999 s 29-70(1) — saved snapshots
          </p>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold shrink-0",
            PILL_CLASS[view.colour],
          )}
        >
          {state === "loading" ? "…" : view.chipLabel}
        </span>
      </div>
      <div className="mt-3 text-xs text-muted-foreground">
        {state === "error"
          ? "Couldn't load recent snapshots — retry from /workspace/tax-invoice-checker."
          : view.body}
        {lastSeen ? (
          <span className="mt-1 block text-[11px] text-muted-foreground/80">
            Last checked {lastSeen}.
          </span>
        ) : null}
      </div>
    </Link>
  );
}

export default TaxInvoiceHistoryTile;
