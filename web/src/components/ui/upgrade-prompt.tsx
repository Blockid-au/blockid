"use client";

import * as React from "react";
import { Sparkles, X, Zap } from "lucide-react";

const DISMISS_KEY = "blockid_upgrade_prompt_dismissed_v1";

export function UpgradePrompt() {
  const [visible, setVisible] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (typeof window !== "undefined" && sessionStorage.getItem(DISMISS_KEY)) return;

    (async () => {
      try {
        const res = await fetch("/api/credits");
        if (!res.ok) return;
        const data = await res.json();
        if (data.ok && data.plan === "free" && data.balance === 1) {
          setVisible(true);
        }
      } catch {
        // silently ignore
      }
    })();
  }, []);

  const dismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
  };

  const handleUpgrade = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: "founding50" }),
      });
      if (res.status === 401) {
        window.location.href = "/auth/login?plan=founding50";
        return;
      }
      const data = await res.json();
      if (data.ok && data.url) {
        window.location.href = data.url;
      }
    } catch {
      // silently ignore — user can still dismiss
    } finally {
      setLoading(false);
    }
  };

  if (!visible) return null;

  return (
    <div className="relative flex items-center gap-3 bg-gradient-to-r from-brand-600 to-violet-600 px-4 py-2.5 text-white">
      <Zap strokeWidth={1.75} className="h-4 w-4 shrink-0 text-brand-200" />
      <p className="flex-1 text-xs leading-snug">
        <span className="font-semibold">1 free credit left.</span>{" "}
        Upgrade to{" "}
        <span className="font-semibold">Founding 50</span> — A$49 one-time for
        100 credits, Evidence Vault &amp; cap table tools.{" "}
        <span className="opacity-75 text-[10px]">Only 50 spots.</span>
      </p>
      <button
        type="button"
        onClick={handleUpgrade}
        disabled={loading}
        className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-white/20 hover:bg-white/30 border border-white/30 px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-60"
      >
        {loading ? (
          <span className="h-3 w-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
        ) : (
          <>
            <Sparkles strokeWidth={1.75} className="h-3 w-3" />
            Upgrade A$49
          </>
        )}
      </button>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="shrink-0 flex h-6 w-6 items-center justify-center rounded-full text-white/60 hover:text-white hover:bg-white/20 transition-colors cursor-pointer"
      >
        <X strokeWidth={1.75} className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
