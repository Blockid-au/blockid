"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";

const STORAGE_KEY = "dismissed_trial_strip";
const HIDE_ON_ROUTES = ["/dashboard", "/workspace"];

export function TrialStrip() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [pastPricing, setPastPricing] = useState(false);

  // Mount + read localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (window.localStorage.getItem(STORAGE_KEY) === "1") {
        setVisible(false);
        return;
      }
    } catch {
      // ignore storage errors (private mode, etc.)
    }
    setVisible(true);
  }, []);

  // Hide once user scrolls past #pricing-anchor
  useEffect(() => {
    if (typeof window === "undefined") return;
    const anchor = document.getElementById("pricing-anchor");
    if (!anchor) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          // Anchor has fully passed above the viewport
          if (!entry.isIntersecting && entry.boundingClientRect.top < 0) {
            setPastPricing(true);
          } else if (entry.isIntersecting) {
            setPastPricing(false);
          }
        }
      },
      { threshold: 0, rootMargin: "0px" },
    );

    observer.observe(anchor);
    return () => observer.disconnect();
  }, []);

  const routeHidden = HIDE_ON_ROUTES.some(
    (r) => pathname === r || pathname?.startsWith(`${r}/`),
  );

  if (!visible || pastPricing || routeHidden) return null;

  const dismiss = () => {
    setVisible(false);
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ignore
    }
  };

  return (
    <div
      role="region"
      aria-label="Free trial promotion"
      className="safe-pb fixed inset-x-0 bottom-0 z-40 bg-brand-gold text-brand-navy shadow-[0_-4px_24px_rgba(0,0,0,0.25)]"
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:flex-nowrap md:px-6">
        <p className="min-w-0 flex-1 text-sm leading-snug font-medium md:text-base">
          <span aria-hidden>🚀</span>{" "}
          <span className="font-semibold">Get Fundable in 7 Days</span>
          <span className="hidden sm:inline">
            {" "}
            — start your free trial (no charge until Day 8).
          </span>
        </p>
        <Link
          href="/signup?trial=1"
          className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-brand-navy px-4 py-2 text-sm font-semibold text-brand-gold transition-colors hover:bg-brand-navy/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy focus-visible:ring-offset-2 focus-visible:ring-offset-brand-gold"
        >
          Start Trial <span aria-hidden>→</span>
        </Link>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss trial promotion"
          className="ml-1 flex h-8 w-8 items-center justify-center rounded-full text-brand-navy/70 transition-colors hover:bg-brand-navy/10 hover:text-brand-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy focus-visible:ring-offset-2 focus-visible:ring-offset-brand-gold"
        >
          <span aria-hidden className="text-lg leading-none">×</span>
        </button>
      </div>
    </div>
  );
}

export default TrialStrip;
