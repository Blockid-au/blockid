"use client";

// Small client sub-component for the /startup-package landing page.
// Isolated so the RSC page stays server-rendered.

import * as React from "react";
import { Loader2, Lock } from "lucide-react";
import { trackEvent } from "@/lib/analytics";

interface CheckoutButtonProps {
  planId: string;
  label: string;
}

export function CheckoutButton({ planId, label }: CheckoutButtonProps) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleClick() {
    setBusy(true);
    setError(null);
    try {
      trackEvent("checkout_started", { plan: planId });
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });
      if (res.status === 401) {
        window.location.href = `/login?next=${encodeURIComponent("/startup-package")}`;
        return;
      }
      const data = (await res.json()) as {
        ok?: boolean;
        url?: string;
        error?: string;
      };
      if (data?.url) {
        window.location.href = data.url;
        return;
      }
      setError(data?.error ?? "Could not start checkout — please try again.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="inline-flex flex-col items-center">
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/60 px-5 py-3 text-sm font-semibold text-slate-100 hover:border-cyan-500 hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? (
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
        ) : (
          <Lock aria-hidden="true" className="h-4 w-4" />
        )}
        {label}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-xs text-rose-300">
          {error}
        </p>
      )}
    </div>
  );
}
