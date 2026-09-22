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
import { FLOATING_SLOT, FloatingSlot } from "@/components/ui/floating-stack";

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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mounted flag flipped after hydration so the server render stays deterministic
    setMounted(true);
    if (!hasResponded()) setVisible(true);
  }, []);

  if (!mounted || !shouldShowOnRoute(pathname)) return null;

  const accept = () => {
    grantConsent();
    setVisible(false);
  };
  const reject = () => {
    denyConsent();
    setVisible(false);
  };

  // Always render the small "Cookie prefs" pill on public routes so users
  // can revoke or re-open the banner at any time (OAIC APP 6 — revocable
  // consent). The full banner only shows while `visible` is true. The pill
  // lives in the shared bottom-right FloatingStack (G29-C) so it never
  // overlaps the feedback FAB or a page's primary CTA at 375 px.
  if (!visible) {
    return (
      <FloatingSlot order={FLOATING_SLOT.cookiePrefs} testId="cookie-prefs-slot">
        <button
          type="button"
          onClick={() => setVisible(true)}
          aria-label="Open cookie preferences"
          data-testid="cookie-prefs-pill"
          className="inline-flex min-h-11 items-center rounded-full border border-line bg-surface/90 px-3 text-xs font-medium text-primary shadow-md backdrop-blur hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
        >
          Cookie prefs
        </button>
      </FloatingSlot>
    );
  }

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
              <Link href="/privacy" className="underline underline-offset-2 hover:text-action">
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
              className="inline-flex min-h-11 items-center rounded-lg border border-line bg-surface px-3 text-xs font-medium text-primary hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
            >
              {showPrefs ? "Hide details" : "Customize"}
            </button>
            <button
              type="button"
              onClick={reject}
              className="inline-flex min-h-11 items-center rounded-lg border border-line bg-surface px-3 text-xs font-medium text-primary hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
            >
              Reject
            </button>
            <button
              type="button"
              onClick={accept}
              className="inline-flex min-h-11 items-center rounded-lg bg-action px-4 text-xs font-semibold text-on-action shadow-sm transition hover:bg-action-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy focus-visible:ring-offset-2"
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
