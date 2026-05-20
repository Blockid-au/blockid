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

const CATEGORY_LABELS: Record<string, { label: string; description: string }> =
  {
    weekly_reports: {
      label: "Weekly Reports",
      description: "Your weekly SVI progress summary",
    },
    product_updates: {
      label: "Product Updates",
      description: "New features and platform improvements",
    },
    promotions: {
      label: "Promotions",
      description: "Special offers and discounts",
    },
    svi_alerts: {
      label: "SVI Alerts",
      description: "Score changes and evidence reminders",
    },
    payment_receipts: {
      label: "Payment Receipts",
      description: "Transaction confirmations (required, cannot unsubscribe)",
    },
  };

export function UnsubscribeClient({
  token,
  maskedEmail,
  initialPrefs,
  category,
  done,
}: {
  token: string;
  maskedEmail: string;
  initialPrefs: Prefs;
  category: string | null;
  done: boolean;
}) {
  const [prefs, setPrefs] = useState<Prefs>(initialPrefs);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showDone] = useState(done);

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
    <div className="min-h-svh bg-[#0B1220] flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-6">
          <p className="text-[11px] tracking-[0.2em] uppercase text-[#3B7DD8] font-medium mb-2">
            BlockID
          </p>
          <h1 className="text-2xl font-semibold text-[#F8FAFC] mb-2">
            Email Preferences
          </h1>
          <p className="text-[#94A3B8] text-sm">
            Managing preferences for{" "}
            <span className="text-[#F8FAFC] font-medium">{maskedEmail}</span>
          </p>
        </div>

        {/* Success banner */}
        {showDone && (
          <div className="bg-[#0F172A] border border-[#1F2A44] rounded-xl p-4 mb-4 text-center">
            <p className="text-[#4ADE80] text-sm font-medium">
              {category
                ? `You have been unsubscribed from ${CATEGORY_LABELS[category]?.label ?? category}.`
                : "You have been unsubscribed from all emails."}
            </p>
          </div>
        )}

        {/* Saved banner */}
        {saved && (
          <div className="bg-[#0F172A] border border-[#1F2A44] rounded-xl p-3 mb-4 text-center">
            <p className="text-[#4ADE80] text-sm">Preferences saved.</p>
          </div>
        )}

        {/* Global unsubscribe banner */}
        {prefs.unsubscribed_all && (
          <div className="bg-[#0F172A] border border-[#F87171]/30 rounded-xl p-4 mb-4 text-center">
            <p className="text-[#F87171] text-sm font-medium mb-2">
              You are unsubscribed from all emails.
            </p>
            <p className="text-[#94A3B8] text-xs mb-3">
              You will only receive transactional emails (payment receipts).
            </p>
            <button
              type="button"
              onClick={resubscribeAll}
              disabled={saving}
              className="inline-block bg-[#3B7DD8] text-[#0B1220] font-semibold text-sm px-5 py-2 rounded-lg hover:bg-[#3B7DD8]/90 transition-colors disabled:opacity-50"
            >
              {saving ? "Saving..." : "Resubscribe to all"}
            </button>
          </div>
        )}

        {/* Category toggles */}
        <div className="bg-[#0F172A] border border-[#1F2A44] rounded-2xl overflow-hidden">
          {Object.entries(CATEGORY_LABELS).map(
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
                    i > 0 ? "border-t border-[#1F2A44]" : ""
                  }`}
                >
                  <div className="flex-1 min-w-0 mr-4">
                    <p className="text-sm font-medium text-[#F8FAFC]">
                      {label}
                    </p>
                    <p className="text-xs text-[#64748B] mt-0.5">
                      {description}
                    </p>
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
                    } ${checked ? "bg-[#3B7DD8]" : "bg-[#1F2A44]"}`}
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

        {/* Actions */}
        {!prefs.unsubscribed_all && (
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={unsubscribeAll}
              disabled={saving}
              className="text-xs text-[#64748B] hover:text-[#F87171] transition-colors underline disabled:opacity-50"
            >
              Unsubscribe from all emails
            </button>
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-[10px] text-[#475569] mt-8">
          BlockID.au -- Valuation. Ownership. Execution. Growth.
        </p>
      </div>
    </div>
  );
}
