"use client";

/**
 * OnboardingWelcomeModal — shown once when the user lands on /dashboard
 * with ?onboarding=complete in the URL.
 *
 * Dismissed state is persisted in localStorage under the key
 * `blockid_onboarding_welcome_dismissed` so the modal only appears once
 * per browser regardless of how many times the URL is visited.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { X, Sparkles } from "lucide-react";

const STORAGE_KEY = "blockid_onboarding_welcome_dismissed";

export function OnboardingWelcomeModal() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const dismissed = localStorage.getItem(STORAGE_KEY);
      if (!dismissed) {
        setVisible(true);
      }
    } catch {
      // localStorage unavailable (e.g. private browsing with strict settings)
    }
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, "true");
    } catch {
      // ignore
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={dismiss}
        aria-hidden="true"
      />

      {/* Modal panel */}
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-emerald-100 bg-white p-8 shadow-2xl">
        <button
          onClick={dismiss}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-ink-400 transition hover:bg-surface-100 hover:text-ink-700"
          aria-label="Dismiss welcome modal"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50">
            <Sparkles className="h-7 w-7 text-emerald-600" />
          </div>

          <h2
            id="onboarding-modal-title"
            className="text-xl font-bold text-ink-900"
          >
            Welcome to BlockID!
          </h2>
          <p className="mt-2 text-sm text-ink-600">
            Your account is set up and ready. The best place to start is
            Chapter&nbsp;1 of the Startup Journey — it takes about 15 minutes
            and gives your startup a direction from day&nbsp;zero.
          </p>

          <Link
            href="/workspace/guide/01-vision"
            onClick={dismiss}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700"
          >
            Start with Chapter 1 →
          </Link>

          <button
            onClick={dismiss}
            className="mt-3 text-xs text-ink-500 underline-offset-2 hover:underline"
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}
