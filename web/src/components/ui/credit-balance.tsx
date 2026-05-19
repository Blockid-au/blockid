"use client";

import * as React from "react";
import Link from "next/link";
import { Coins, ChevronDown, ArrowUpRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Transaction {
  amount: number;
  balance_after: number;
  reason: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

interface CreditsResponse {
  ok: boolean;
  balance: number;
  plan: string;
  transactions: Transaction[];
}

// ---------------------------------------------------------------------------
// Feature label map
// ---------------------------------------------------------------------------

const FEATURE_LABELS: Record<string, string> = {
  svi_analysis: "SVI Analysis",
  svi_report: "SVI Report",
  term_sheet: "Term Sheet AI",
  research: "Competitive Research",
  ai_score: "AI Score",
  evidence_upload: "Evidence Upload",
  investor_score: "Investor Score",
  dilution_calc: "Dilution Calc",
  purchase: "Credit Purchase",
  credit_pack_purchase: "Credit Pack Purchase",
  plan_grant: "Plan Credit Grant",
};

function featureLabel(reason: string): string {
  return FEATURE_LABELS[reason] ?? reason.replace(/_/g, " ");
}

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CreditBalance() {
  const [data, setData] = React.useState<CreditsResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  // Fetch credits on mount.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/credits");
        if (!res.ok) return;
        const json = (await res.json()) as CreditsResponse;
        if (!cancelled && json.ok) {
          setData(json);
        }
      } catch {
        // Silently ignore — widget stays hidden if fetch fails.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Close dropdown on outside click.
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Don't render anything while loading or if no data (unauthenticated).
  if (loading || !data) {
    if (loading) {
      return (
        <div className="h-8 w-20 flex items-center justify-center">
          <Loader2 strokeWidth={1.75} className="h-3.5 w-3.5 animate-spin text-ink-400" />
        </div>
      );
    }
    return null;
  }

  const balance = data.balance;
  const recentTx = data.transactions.slice(0, 3);

  // Color logic.
  const isWarning = balance > 0 && balance < 3;
  const isDanger = balance === 0;

  const pillClasses = cn(
    "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer select-none",
    isDanger
      ? "bg-red-50 text-red-700 border border-red-200 hover:bg-red-100"
      : isWarning
        ? "bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100"
        : "bg-brand-50 text-brand-700 border border-brand-200 hover:bg-brand-100",
  );

  return (
    <div ref={ref} className="relative">
      {/* Pill / Badge */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={pillClasses}
      >
        <Coins
          strokeWidth={1.75}
          className={cn(
            "h-3.5 w-3.5",
            isDanger
              ? "text-red-500"
              : isWarning
                ? "text-amber-500"
                : "text-brand-500",
          )}
        />
        {balance} credit{balance !== 1 ? "s" : ""}
        <ChevronDown
          strokeWidth={1.75}
          className={cn(
            "h-3 w-3 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 rounded-xl border border-surface-200 bg-white shadow-lg z-50 overflow-hidden animate-fade-in">
          {/* Header */}
          <div className="px-4 py-3 border-b border-surface-200 bg-surface-50">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-ink-500 uppercase tracking-wider">
                Credit Balance
              </span>
              <span
                className={cn(
                  "text-lg font-bold",
                  isDanger
                    ? "text-red-600"
                    : isWarning
                      ? "text-amber-600"
                      : "text-ink-800",
                )}
              >
                {balance}
              </span>
            </div>
            {isDanger && (
              <p className="mt-1 text-xs text-red-600">
                No credits remaining. Purchase more to continue.
              </p>
            )}
            {isWarning && (
              <p className="mt-1 text-xs text-amber-600">
                Running low on credits.
              </p>
            )}
          </div>

          {/* Recent transactions */}
          {recentTx.length > 0 && (
            <div className="px-4 py-3 border-b border-surface-200">
              <p className="text-[10px] font-medium text-ink-400 uppercase tracking-wider mb-2">
                Recent Activity
              </p>
              <ul className="space-y-2">
                {recentTx.map((tx, i) => (
                  <li
                    key={`${tx.created_at}-${i}`}
                    className="flex items-center justify-between text-xs"
                  >
                    <span className="text-ink-700 truncate max-w-[150px]">
                      {featureLabel(tx.reason)}
                    </span>
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "font-semibold",
                          tx.amount > 0 ? "text-emerald-600" : "text-ink-600",
                        )}
                      >
                        {tx.amount > 0 ? "+" : ""}
                        {tx.amount}
                      </span>
                      <span className="text-ink-400 text-[10px]">
                        {relativeDate(tx.created_at)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* CTA */}
          <div className="px-4 py-3">
            <Link
              href="/workspace/billing#credits"
              onClick={() => setOpen(false)}
              className="flex items-center justify-center gap-1.5 w-full h-9 rounded-lg bg-brand-600 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
            >
              Buy Credits
              <ArrowUpRight strokeWidth={1.75} className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
