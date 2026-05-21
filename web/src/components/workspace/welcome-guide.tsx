"use client";

import * as React from "react";
import Link from "next/link";
import { BarChart3, CheckCircle2, UploadCloud, X } from "lucide-react";

const STORAGE_KEY = "blockid_welcome_dismissed";

export function WelcomeGuide() {
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const dismissed = localStorage.getItem(STORAGE_KEY);
    if (dismissed === "permanent") return;
    // Show the guide
    setVisible(true);
  }, []);

  if (!visible) return null;

  const dismiss = () => setVisible(false);

  const dismissPermanently = () => {
    localStorage.setItem(STORAGE_KEY, "permanent");
    setVisible(false);
  };

  return (
    <div className="rounded-2xl border border-brand-200 bg-gradient-to-br from-brand-50 via-white to-emerald-50/40 px-6 py-6 shadow-sm mb-8 animate-fade-in">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h2 className="text-lg font-bold text-ink-800">
            Welcome to BlockID!
          </h2>
          <p className="text-sm text-ink-500 mt-0.5">
            Here&apos;s how to get started:
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="h-7 w-7 flex items-center justify-center rounded-lg text-ink-400 hover:text-ink-700 hover:bg-surface-100 transition-colors cursor-pointer shrink-0"
          aria-label="Dismiss"
        >
          <X strokeWidth={1.75} className="h-4 w-4" />
        </button>
      </div>

      <ol className="space-y-4">
        <li>
          <Link
            href="/"
            className="flex items-start gap-3 group rounded-xl px-3 py-2.5 -mx-3 hover:bg-brand-50/60 transition-colors"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-brand-600 shrink-0 mt-0.5">
              <CheckCircle2 strokeWidth={1.75} className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-ink-800 group-hover:text-brand-700 transition-colors">
                1. Get Your SVI Score
              </p>
              <p className="text-xs text-ink-500 mt-0.5">
                Know your startup&apos;s value in 60 seconds
              </p>
            </div>
          </Link>
        </li>
        <li>
          <Link
            href="/workspace/evidence"
            className="flex items-start gap-3 group rounded-xl px-3 py-2.5 -mx-3 hover:bg-brand-50/60 transition-colors"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 shrink-0 mt-0.5">
              <UploadCloud strokeWidth={1.75} className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-ink-800 group-hover:text-brand-700 transition-colors">
                2. Upload Evidence
              </p>
              <p className="text-xs text-ink-500 mt-0.5">
                Boost your score with real data
              </p>
            </div>
          </Link>
        </li>
        <li>
          <Link
            href="/dashboard/svi"
            className="flex items-start gap-3 group rounded-xl px-3 py-2.5 -mx-3 hover:bg-brand-50/60 transition-colors"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-blue-600 shrink-0 mt-0.5">
              <BarChart3 strokeWidth={1.75} className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-ink-800 group-hover:text-brand-700 transition-colors">
                3. View Dashboard
              </p>
              <p className="text-xs text-ink-500 mt-0.5">
                Track your progress over time
              </p>
            </div>
          </Link>
        </li>
      </ol>

      <div className="flex items-center gap-3 mt-5 pt-4 border-t border-surface-200">
        <button
          type="button"
          onClick={dismiss}
          className="h-8 px-4 rounded-lg text-xs font-medium text-ink-600 hover:text-ink-800 hover:bg-surface-100 transition-colors cursor-pointer"
        >
          Dismiss
        </button>
        <button
          type="button"
          onClick={dismissPermanently}
          className="h-8 px-4 rounded-lg text-xs font-medium text-ink-500 hover:text-ink-700 hover:bg-surface-100 transition-colors cursor-pointer"
        >
          Don&apos;t show again
        </button>
      </div>
    </div>
  );
}
