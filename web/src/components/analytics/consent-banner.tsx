"use client";

// GA4 consent-mode v2 banner. Renders only after mount (so SSR/CSR match),
// only if consent has not been recorded, and never inside authenticated
// workspace surfaces where a modal is more appropriate.
//
// Wired from app/layout.tsx. The gtag() consent-default call happens in
// the layout head BEFORE gtag.js loads; this component only fires the
// consent-update after the user makes a choice.

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { denyConsent, grantConsent, hasResponded } from "@/lib/analytics/consent";

const HIDDEN_PREFIXES = ["/dashboard", "/workspace", "/admin", "/portal"];

function shouldShowOnRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  for (const prefix of HIDDEN_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return false;
  }
  return true;
}

export function ConsentBanner() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [showPrefs, setShowPrefs] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (!hasResponded()) setVisible(true);
  }, []);

  if (!mounted || !visible || !shouldShowOnRoute(pathname)) return null;

  const accept = () => {
    grantConsent();
    setVisible(false);
  };
  const reject = () => {
    denyConsent();
    setVisible(false);
  };

  return (
    <div
      role="dialog"
      aria-label="Analytics consent"
      aria-live="polite"
      className="fixed inset-x-0 bottom-0 z-[80] px-4 pb-4 sm:px-6 sm:pb-6"
    >
      <div className="mx-auto max-w-4xl rounded-2xl border border-brand-900/10 bg-white/95 p-4 shadow-2xl backdrop-blur dark:border-white/10 dark:bg-brand-900/90 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
          <div className="flex-1 text-sm leading-6 text-brand-900/90 dark:text-ink-100">
            <p className="font-semibold">We use analytics to improve BlockID.</p>
            <p className="mt-1 text-brand-900/75 dark:text-ink-200">
              AU users can opt in below — nothing is tracked until you agree.{" "}
              <Link href="/privacy" className="underline underline-offset-2 hover:text-brand-gold">
                Learn more
              </Link>
              .
            </p>
            {showPrefs && (
              <ul className="mt-3 space-y-1 text-xs text-brand-900/70 dark:text-ink-300">
                <li>Analytics storage — page views, feature usage, conversion funnels</li>
                <li>Ad storage — off by default; only used for paid-campaign attribution</li>
                <li>You can change this at any time from your account settings</li>
              </ul>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
            <button
              type="button"
              onClick={() => setShowPrefs((v) => !v)}
              className="rounded-lg border border-brand-900/15 px-3 py-2 text-xs font-medium text-brand-900/80 hover:bg-brand-900/5 dark:border-white/10 dark:text-ink-200 dark:hover:bg-white/5"
            >
              {showPrefs ? "Hide details" : "Customize"}
            </button>
            <button
              type="button"
              onClick={reject}
              className="rounded-lg border border-brand-900/15 px-3 py-2 text-xs font-medium text-brand-900/80 hover:bg-brand-900/5 dark:border-white/10 dark:text-ink-200 dark:hover:bg-white/5"
            >
              Reject
            </button>
            <button
              type="button"
              onClick={accept}
              className="rounded-lg bg-brand-gold px-4 py-2 text-xs font-semibold text-brand-900 shadow-sm transition hover:bg-brand-gold/90"
            >
              Accept
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ConsentBanner;
