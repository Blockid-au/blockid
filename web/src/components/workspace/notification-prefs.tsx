"use client";

import * as React from "react";
import { Bell, Loader2, Check } from "lucide-react";

export function NotificationPrefs() {
  const [enabled, setEnabled] = React.useState<boolean>(true);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/account/notify-prefs");
        const data = await res.json();
        if (!cancelled && data.ok) setEnabled(Boolean(data.notifyScoreViewed));
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggle() {
    const next = !enabled;
    setEnabled(next);
    setSaving(true);
    setSaved(false);
    try {
      await fetch("/api/account/notify-prefs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notifyScoreViewed: next }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch {
      setEnabled(!next); // revert on error
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-6 bg-white border border-surface-200 shadow-sm rounded-2xl p-6">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-lg bg-brand-50 border border-brand-100 flex items-center justify-center shrink-0">
          <Bell strokeWidth={1.75} className="h-4 w-4 text-brand-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold text-ink-800">
            Investor view notifications
          </h2>
          <p className="text-sm text-ink-600 mt-1">
            Email me when someone opens one of my Investor-Ready Score share
            links. Limited to one notification per unique viewer per link per
            24 hours.
          </p>
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={toggle}
              disabled={loading || saving}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer disabled:opacity-50 ${
                enabled ? "bg-brand-600" : "bg-surface-300"
              }`}
              aria-pressed={enabled}
              aria-label="Toggle investor view notifications"
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform shadow ${
                  enabled ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </button>
            <span className="text-sm font-medium text-ink-700">
              {loading
                ? "Loading…"
                : enabled
                  ? "Notifications on"
                  : "Notifications off"}
            </span>
            {saving && (
              <Loader2
                strokeWidth={1.75}
                className="h-4 w-4 text-ink-400 animate-spin"
              />
            )}
            {saved && (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                <Check strokeWidth={2} className="h-3.5 w-3.5" /> Saved
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
