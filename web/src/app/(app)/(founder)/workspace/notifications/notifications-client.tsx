"use client";

import { useState } from "react";

interface Prefs {
  weekly_reports: boolean;
  product_updates: boolean;
  promotions: boolean;
  svi_alerts: boolean;
  payment_receipts: boolean;
  unsubscribed_all: boolean;
}

const CATEGORY_META: Record<string, { label: string; description: string }> = {
  weekly_reports: {
    label: "Weekly Reports",
    description: "Your weekly SVI progress summary and score changes",
  },
  product_updates: {
    label: "Product Updates",
    description: "New features, improvements, and platform news",
  },
  promotions: {
    label: "Promotions",
    description: "Special offers, discounts, and limited-time deals",
  },
  svi_alerts: {
    label: "SVI Alerts",
    description: "Score changes, evidence reminders, and milestone notifications",
  },
  payment_receipts: {
    label: "Payment Receipts",
    description: "Transaction confirmations and invoices (required, cannot be disabled)",
  },
};

export function NotificationsClient({
  token,
  initialPrefs,
}: {
  token: string;
  initialPrefs: Prefs;
}) {
  const [prefs, setPrefs] = useState<Prefs>(initialPrefs);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function savePrefs(updates: Partial<Prefs>) {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, preferences: updates }),
      });
      if (res.ok) {
        setPrefs((p) => ({ ...p, ...updates }));
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } finally {
      setSaving(false);
    }
  }

  function toggleCategory(key: string) {
    if (key === "payment_receipts") return;
    const newVal = !prefs[key as keyof Prefs];
    savePrefs({ [key]: newVal });
  }

  function resubscribeAll() {
    savePrefs({
      weekly_reports: true,
      product_updates: true,
      promotions: true,
      svi_alerts: true,
      unsubscribed_all: false,
    });
  }

  function unsubscribeAll() {
    savePrefs({ unsubscribed_all: true });
  }

  return (
    <div>
      {/* Saved banner */}
      {saved && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-3 mb-4 text-center">
          <p className="text-green-700 text-sm font-medium">
            Preferences saved.
          </p>
        </div>
      )}

      {/* Global unsubscribe banner */}
      {prefs.unsubscribed_all && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 mb-4">
          <p className="text-red-700 text-sm font-medium mb-1">
            You are unsubscribed from all emails.
          </p>
          <p className="text-red-600 text-xs mb-3">
            You will only receive transactional emails (payment receipts).
          </p>
          <button
            type="button"
            onClick={resubscribeAll}
            disabled={saving}
            className="inline-block bg-brand-600 text-white font-semibold text-sm px-5 py-2 rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-50"
          >
            {saving ? "Saving..." : "Resubscribe to all"}
          </button>
        </div>
      )}

      {/* Category toggles */}
      <div className="bg-white rounded-2xl border border-surface-200 overflow-hidden shadow-sm">
        {Object.entries(CATEGORY_META).map(
          ([key, { label, description }], i) => {
            const isPayment = key === "payment_receipts";
            const checked = isPayment
              ? true
              : prefs[key as keyof Prefs] === true;
            const disabled =
              saving || isPayment || prefs.unsubscribed_all;

            return (
              <div
                key={key}
                className={`flex items-center justify-between px-5 py-4 ${
                  i > 0 ? "border-t border-surface-200" : ""
                }`}
              >
                <div className="flex-1 min-w-0 mr-4">
                  <p className="text-sm font-medium text-ink-800">{label}</p>
                  <p className="text-xs text-ink-500 mt-0.5">{description}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={checked}
                  disabled={disabled}
                  onClick={() => toggleCategory(key)}
                  className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors duration-200 focus:outline-none ${
                    disabled
                      ? "cursor-not-allowed opacity-50"
                      : "cursor-pointer"
                  } ${checked ? "bg-brand-600" : "bg-surface-300"}`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 ${
                      checked ? "translate-x-5" : "translate-x-0.5"
                    } mt-0.5`}
                  />
                </button>
              </div>
            );
          },
        )}
      </div>

      {/* Unsubscribe all */}
      {!prefs.unsubscribed_all && (
        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={unsubscribeAll}
            disabled={saving}
            className="text-xs text-ink-500 hover:text-red-600 transition-colors underline disabled:opacity-50"
          >
            Unsubscribe from all emails
          </button>
        </div>
      )}
    </div>
  );
}
