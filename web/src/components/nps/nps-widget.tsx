"use client";

import * as React from "react";
import { X } from "lucide-react";

const NPS_LAST_SHOWN_KEY = "nps_last_shown";
const NPS_DISMISSED_KEY = "nps_dismissed_at";
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const SHOW_DELAY_MS = 30_000;

function getButtonColor(score: number): string {
  if (score <= 6) return "bg-red-600 hover:bg-red-700 text-white";
  if (score <= 8) return "bg-yellow-500 hover:bg-yellow-600 text-white";
  return "bg-green-600 hover:bg-green-700 text-white";
}

export function NpsWidget() {
  const [visible, setVisible] = React.useState(false);
  const [selected, setSelected] = React.useState<number | null>(null);
  const [comment, setComment] = React.useState("");
  const [status, setStatus] = React.useState<"idle" | "submitting" | "done">("idle");

  React.useEffect(() => {
    try {
      const lastShown = localStorage.getItem(NPS_LAST_SHOWN_KEY);
      const dismissedAt = localStorage.getItem(NPS_DISMISSED_KEY);
      const now = Date.now();
      const refTime = lastShown ?? dismissedAt;
      if (refTime && now - parseInt(refTime) < THIRTY_DAYS_MS) return;
    } catch {
      // localStorage unavailable — skip
      return;
    }

    const timer = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(NPS_DISMISSED_KEY, Date.now().toString());
    } catch { /* ignore */ }
    setVisible(false);
  }

  async function handleSubmit() {
    if (selected === null || status === "submitting") return;
    setStatus("submitting");
    try {
      await fetch("/api/nps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ score: selected, comment, context: window.location.pathname }),
      });
    } catch { /* never block user */ }
    try {
      localStorage.setItem(NPS_LAST_SHOWN_KEY, Date.now().toString());
    } catch { /* ignore */ }
    setStatus("done");
    setTimeout(() => setVisible(false), 2500);
  }

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 rounded-2xl bg-white shadow-2xl border border-gray-200 p-5 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-gray-900 leading-snug">
          How likely are you to recommend BlockID? (0–10)
        </p>
        <button
          onClick={dismiss}
          className="shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {status === "done" ? (
        <div className="flex flex-col items-center gap-2 py-2">
          <p className="text-sm font-medium text-green-700">Thanks for your feedback!</p>
          {selected !== null && selected >= 9 && (
            <a
              href="/dashboard/referral"
              className="text-xs text-brand-600 hover:text-brand-700 underline underline-offset-2"
            >
              Share BlockID with a colleague →
            </a>
          )}
        </div>
      ) : (
        <>
          {/* Score buttons */}
          <div className="flex flex-wrap gap-1 justify-center">
            {Array.from({ length: 11 }, (_, i) => (
              <button
                key={i}
                onClick={() => setSelected(i)}
                className={[
                  "w-9 h-9 rounded-lg text-sm font-bold transition-all",
                  getButtonColor(i),
                  selected === i ? "ring-2 ring-white ring-offset-1 ring-offset-gray-800 scale-110" : "opacity-80",
                ].join(" ")}
              >
                {i}
              </button>
            ))}
          </div>

          <div className="flex justify-between text-[10px] text-gray-400 px-1">
            <span>Not at all likely</span>
            <span>Extremely likely</span>
          </div>

          {/* Comment box — shown after selecting */}
          {selected !== null && (
            <div className="flex flex-col gap-2">
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="What's the main reason? (optional)"
                rows={2}
                className="w-full rounded-lg border border-gray-200 text-sm px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <button
                onClick={handleSubmit}
                disabled={status === "submitting"}
                className="w-full rounded-lg bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-medium py-2 transition-colors"
              >
                {status === "submitting" ? "Submitting…" : "Submit"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
