"use client";

import { useState } from "react";
import Link from "next/link";

interface Prefs {
  weekly_reports: boolean;
  product_updates: boolean;
  promotions: boolean;
  svi_alerts: boolean;
  payment_receipts: boolean;
  unsubscribed_all: boolean;
}

const CATEGORY_LABELS: Record<string, { label: string; description: string; icon: string }> = {
  weekly_reports: {
    label: "Weekly Reports",
    description: "Your weekly SVI progress summary and advisor insights",
    icon: "\u{1F4CA}",
  },
  product_updates: {
    label: "Product Updates",
    description: "New features and platform improvements",
    icon: "\u{1F680}",
  },
  promotions: {
    label: "Promotions",
    description: "Special offers and founder discounts",
    icon: "\u{1F381}",
  },
  svi_alerts: {
    label: "SVI Alerts",
    description: "Score changes, evidence reminders, and milestone notifications",
    icon: "\u{1F514}",
  },
  payment_receipts: {
    label: "Payment Receipts",
    description: "Transaction confirmations (required by law)",
    icon: "\u{1F9FE}",
  },
};

const UNSUB_REASONS = [
  { id: "too_many", label: "Too many emails" },
  { id: "not_relevant", label: "Content isn't relevant to me" },
  { id: "didnt_signup", label: "I didn't sign up for this" },
  { id: "using_competitor", label: "Using a different tool" },
  { id: "project_ended", label: "My startup project has ended" },
  { id: "other", label: "Other reason" },
];

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

  // Feedback state
  const [feedbackReason, setFeedbackReason] = useState("");
  const [feedbackDetail, setFeedbackDetail] = useState("");
  const [feedbackSent, setFeedbackSent] = useState(false);

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
    setFeedbackSent(false);
  }

  async function unsubscribeAll() {
    await savePrefs({ unsubscribed_all: true });
  }

  // Reduce to monthly digest only (keep weekly_reports, disable the rest)
  function reduceToDigest() {
    savePrefs({
      weekly_reports: true,
      product_updates: false,
      promotions: false,
      svi_alerts: false,
      unsubscribed_all: false,
    });
  }

  async function submitFeedback() {
    if (!feedbackReason) return;
    try {
      await fetch("/api/unsubscribe/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, reason: feedbackReason, detail: feedbackDetail.trim() || undefined }),
      });
      setFeedbackSent(true);
    } catch {
      // Best-effort
    }
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

        {/* ── Thank-you / Done banner ── */}
        {showDone && !prefs.unsubscribed_all && (
          <div className="bg-[#0F172A] border border-[#1F2A44] rounded-xl p-5 mb-4 text-center">
            <div className="text-2xl mb-2">{category ? "\u{2705}" : "\u{1F44B}"}</div>
            <p className="text-[#4ADE80] text-sm font-medium mb-1">
              {category
                ? `You've been unsubscribed from ${CATEGORY_LABELS[category]?.label ?? category}.`
                : "Your preferences have been updated."}
            </p>
            <p className="text-[#94A3B8] text-xs">
              You can adjust individual categories below at any time.
            </p>
          </div>
        )}

        {/* ── Global unsubscribe: Thank-you farewell ── */}
        {prefs.unsubscribed_all && (
          <div className="bg-[#0F172A] border border-[#1F2A44] rounded-2xl overflow-hidden mb-4">
            {/* Farewell hero */}
            <div className="px-6 py-8 text-center border-b border-[#1F2A44]">
              <div className="text-4xl mb-3">{"\u{1F44B}"}</div>
              <h2 className="text-lg font-semibold text-[#F8FAFC] mb-2">
                We&rsquo;re sorry to see you go
              </h2>
              <p className="text-[#94A3B8] text-sm leading-relaxed mb-4">
                You&rsquo;ve been unsubscribed from all emails. You&rsquo;ll only receive
                essential transactional emails (payment receipts) going forward.
              </p>
              <p className="text-[#64748B] text-xs">
                Your account and data remain intact. You can sign in and use BlockID anytime.
              </p>
            </div>

            {/* What you'll miss */}
            <div className="px-6 py-5 border-b border-[#1F2A44]">
              <p className="text-[11px] uppercase tracking-[0.15em] text-[#64748B] font-medium mb-3">
                What you&rsquo;ll miss
              </p>
              <ul className="space-y-2">
                {[
                  "Weekly SVI progress reports with advisor insights",
                  "Evidence reminders that boost your startup's valuation",
                  "New features and founder-exclusive offers",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-xs text-[#94A3B8]">
                    <span className="text-[#FBBF24] shrink-0 mt-px">{"\u{2022}"}</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Alternative: Reduce to digest */}
            <div className="px-6 py-5 border-b border-[#1F2A44] text-center">
              <p className="text-xs text-[#94A3B8] mb-3">
                Too many emails? Try just the weekly digest instead.
              </p>
              <button
                type="button"
                onClick={reduceToDigest}
                disabled={saving}
                className="inline-block bg-[#1F2A44] text-[#F8FAFC] font-medium text-sm px-5 py-2.5 rounded-lg hover:bg-[#2a3a5c] transition-colors disabled:opacity-50 cursor-pointer border border-[#3B7DD8]/30"
              >
                {saving ? "Saving..." : "Switch to weekly digest only"}
              </button>
            </div>

            {/* Resubscribe */}
            <div className="px-6 py-5 text-center">
              <button
                type="button"
                onClick={resubscribeAll}
                disabled={saving}
                className="inline-block bg-[#3B7DD8] text-white font-semibold text-sm px-6 py-2.5 rounded-lg hover:bg-[#3B7DD8]/90 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {saving ? "Saving..." : "Resubscribe to all emails"}
              </button>
            </div>
          </div>
        )}

        {/* ── Feedback collection (shown after global unsubscribe) ── */}
        {prefs.unsubscribed_all && !feedbackSent && (
          <div className="bg-[#0F172A] border border-[#1F2A44] rounded-2xl p-5 mb-4">
            <p className="text-sm font-medium text-[#F8FAFC] mb-1">Help us improve</p>
            <p className="text-xs text-[#94A3B8] mb-4">
              Your feedback helps us send better, more relevant emails. Optional but appreciated.
            </p>

            <div className="space-y-2 mb-4">
              {UNSUB_REASONS.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setFeedbackReason(r.id)}
                  className={`w-full flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-xs transition-all cursor-pointer ${
                    feedbackReason === r.id
                      ? "border-[#3B7DD8] bg-[#3B7DD8]/10 text-[#F8FAFC]"
                      : "border-[#1F2A44] text-[#94A3B8] hover:border-[#3B7DD8]/50"
                  }`}
                >
                  <div
                    className={`h-3.5 w-3.5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                      feedbackReason === r.id ? "border-[#3B7DD8]" : "border-[#475569]"
                    }`}
                  >
                    {feedbackReason === r.id && (
                      <div className="h-1.5 w-1.5 rounded-full bg-[#3B7DD8]" />
                    )}
                  </div>
                  {r.label}
                </button>
              ))}
            </div>

            {feedbackReason === "other" && (
              <textarea
                value={feedbackDetail}
                onChange={(e) => setFeedbackDetail(e.target.value)}
                placeholder="Tell us more (optional)..."
                rows={3}
                maxLength={500}
                className="w-full rounded-lg border border-[#1F2A44] bg-[#0B1220] px-3 py-2 text-xs text-[#F8FAFC] placeholder:text-[#475569] focus:outline-none focus:border-[#3B7DD8] resize-none mb-4"
              />
            )}

            <button
              type="button"
              onClick={submitFeedback}
              disabled={!feedbackReason}
              className="w-full rounded-lg bg-[#1F2A44] text-[#F8FAFC] font-medium text-xs px-4 py-2.5 hover:bg-[#2a3a5c] transition-colors disabled:opacity-50 cursor-pointer"
            >
              Submit feedback
            </button>
          </div>
        )}

        {feedbackSent && (
          <div className="bg-[#0F172A] border border-[#1F2A44] rounded-xl p-4 mb-4 text-center">
            <p className="text-[#4ADE80] text-sm font-medium">Thank you for your feedback!</p>
            <p className="text-[#94A3B8] text-xs mt-1">We appreciate your time and will use this to improve.</p>
          </div>
        )}

        {/* Saved toast */}
        {saved && !showDone && (
          <div className="bg-[#0F172A] border border-[#1F2A44] rounded-xl p-3 mb-4 text-center">
            <p className="text-[#4ADE80] text-sm">Preferences saved.</p>
          </div>
        )}

        {/* ── Category toggles (shown when NOT globally unsubscribed) ── */}
        {!prefs.unsubscribed_all && (
          <>
            <div className="bg-[#0F172A] border border-[#1F2A44] rounded-2xl overflow-hidden">
              {Object.entries(CATEGORY_LABELS).map(
                ([key, { label, description, icon }], i) => {
                  const isPayment = key === "payment_receipts";
                  const checked = isPayment
                    ? true
                    : prefs[key as keyof Prefs] === true;
                  const disabled = saving || isPayment;

                  return (
                    <div
                      key={key}
                      className={`flex items-center justify-between px-5 py-4 ${
                        i > 0 ? "border-t border-[#1F2A44]" : ""
                      }`}
                    >
                      <div className="flex items-start gap-3 flex-1 min-w-0 mr-4">
                        <span className="text-lg shrink-0">{icon}</span>
                        <div>
                          <p className="text-sm font-medium text-[#F8FAFC]">
                            {label}
                          </p>
                          <p className="text-xs text-[#64748B] mt-0.5">
                            {description}
                          </p>
                        </div>
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

            {/* Unsubscribe all */}
            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={unsubscribeAll}
                disabled={saving}
                className="text-xs text-[#64748B] hover:text-[#F87171] transition-colors underline disabled:opacity-50 cursor-pointer"
              >
                Unsubscribe from all emails
              </button>
            </div>
          </>
        )}

        {/* Footer */}
        <div className="text-center mt-8 space-y-2">
          <Link href="/" className="text-xs text-[#3B7DD8] hover:text-[#60A5FA] transition-colors">
            Return to BlockID.au
          </Link>
          <p className="text-[10px] text-[#475569]">
            BlockID.au &mdash; Auschain PTY LTD | ACN 659 615 111
          </p>
        </div>
      </div>
    </div>
  );
}
