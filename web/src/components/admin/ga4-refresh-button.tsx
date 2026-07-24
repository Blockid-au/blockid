"use client";

// Small client-side refresh button that POSTs /api/admin/ga4-refresh and
// calls router.refresh() so the RSC tiles below re-render with the new
// JSONL line. Renders in the /admin/growth header next to the existing
// "Refresh" link.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function Ga4RefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function trigger() {
    setError(null);
    try {
      const res = await fetch("/api/admin/ga4-refresh", { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        onClick={trigger}
        disabled={pending}
        className="text-xs text-brand-600 hover:text-brand-700 transition-colors font-medium disabled:opacity-50"
      >
        {pending ? "Pulling GA4…" : "Refresh GA4"}
      </button>
      {error && <span className="text-[10px] text-red-500" title={error}>failed</span>}
    </span>
  );
}

export default Ga4RefreshButton;
