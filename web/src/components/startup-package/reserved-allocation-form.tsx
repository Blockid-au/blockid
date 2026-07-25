"use client";

// Startup Package — reserved-allocation form (legal_equity phase).
//
// Founder picks:
//   - pct_reserved: slider 10..100 (default 20). Represents the % of the
//     future token supply reserved for on-chain issuance later.
//   - ticker_hint: 3-4 uppercase-letters input, validated client-side
//     against RESERVED_PACKAGE_TICKERS (mirrors the AI guard in
//     `lib/ai-equity.ts:aiSuggestTicker`).
//
// POSTs to `/api/startup-package/reservation`. Success: inline confirmation.
// The "Issue on-chain" button is intentionally DISABLED with a tooltip
// pointing at Ship 2 — Ship 1 stores the reservation in the dataroom only.
//
// SUBGOAL 8 (spawn-agent-v-d-ng-cosmic-aho plan).

import * as React from "react";
import { useRouter } from "next/navigation";
import { Info, Loader2, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Props {
  projectId: string;
  initialPct: number;
  initialTicker: string;
}

// Mirrors RESERVED_PACKAGE_TICKERS in lib/startup-package/reservation-server.ts
const CLIENT_RESERVED_TICKERS: readonly string[] = [
  "BID",
  "ETH",
  "BTC",
  "USDT",
  "USDC",
  "USD",
  "AUD",
];

export function ReservedAllocationForm({
  projectId,
  initialPct,
  initialTicker,
}: Props) {
  const router = useRouter();
  const [pct, setPct] = React.useState<number>(
    Math.max(10, Math.min(100, Math.round(initialPct || 20))),
  );
  const [ticker, setTicker] = React.useState<string>(
    (initialTicker ?? "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4),
  );
  const [pending, setPending] = React.useState<boolean>(false);
  const [message, setMessage] = React.useState<
    { kind: "ok" | "error"; text: string } | null
  >(null);

  const tickerValid = /^[A-Z]{3,4}$/.test(ticker) && !CLIENT_RESERVED_TICKERS.includes(ticker);
  const tickerError = ticker.length > 0 && !tickerValid
    ? CLIENT_RESERVED_TICKERS.includes(ticker)
      ? `"${ticker}" is reserved — pick another.`
      : "Must be 3-4 uppercase letters."
    : null;

  const canSubmit = tickerValid && pct >= 10 && pct <= 100 && !pending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setPending(true);
    setMessage(null);
    try {
      const res = await fetch("/api/startup-package/reservation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          pct_reserved: pct,
          ticker_hint: ticker,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        reservation?: { pct_reserved: number; ticker_hint: string };
      };
      if (!res.ok || !json.ok) {
        setMessage({
          kind: "error",
          text: json.error ?? `Request failed (${res.status})`,
        });
        return;
      }
      setMessage({
        kind: "ok",
        text: `Reserved ${json.reservation?.pct_reserved ?? pct}% under ticker ${json.reservation?.ticker_hint ?? ticker}.`,
      });
      router.refresh();
    } catch (err) {
      setMessage({
        kind: "error",
        text: err instanceof Error ? err.message : "Network error",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label
          htmlFor="pct_reserved"
          className="mb-2 flex items-center justify-between text-sm font-semibold text-ink-700"
        >
          <span>% reserved for founders</span>
          <span className="font-mono text-brand-700">{pct}%</span>
        </label>
        <input
          id="pct_reserved"
          type="range"
          min={10}
          max={100}
          step={1}
          value={pct}
          onChange={(e) => setPct(Number(e.target.value))}
          className="h-2 w-full cursor-pointer appearance-none rounded-full bg-surface-200 accent-brand-600"
        />
        <p className="mt-1 flex items-center gap-1 text-xs text-ink-500">
          <Info aria-hidden="true" className="h-3 w-3" />
          Minimum 10% (default 20%). Everything else is available for the ESOP + rounds.
        </p>
      </div>

      <div>
        <label
          htmlFor="ticker_hint"
          className="mb-1 block text-sm font-semibold text-ink-700"
        >
          Ticker hint (3–4 letters)
        </label>
        <Input
          id="ticker_hint"
          value={ticker}
          onChange={(e) =>
            setTicker(
              e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4),
            )
          }
          maxLength={4}
          placeholder="e.g. TEAM"
          aria-invalid={tickerError ? true : undefined}
          aria-describedby={tickerError ? "ticker_hint_err" : undefined}
        />
        {tickerError && (
          <p id="ticker_hint_err" className="mt-1 text-xs text-red-600">
            {tickerError}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" size="sm" disabled={!canSubmit}>
          {pending ? (
            <>
              <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
              Saving…
            </>
          ) : (
            "Save reservation"
          )}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled
          title="On-chain issuance coming in Ship 2 — reserved allocation stored in your dataroom for now."
          aria-disabled="true"
          className="cursor-not-allowed"
        >
          <ShieldAlert aria-hidden="true" className="h-3.5 w-3.5" />
          Issue on-chain (Ship 2)
        </Button>
      </div>

      {message && (
        <div
          role="status"
          className={cn(
            "rounded-lg px-3 py-2 text-xs",
            message.kind === "ok"
              ? "bg-emerald-50 text-emerald-700"
              : "bg-red-50 text-red-700",
          )}
        >
          {message.text}
        </div>
      )}
    </form>
  );
}
