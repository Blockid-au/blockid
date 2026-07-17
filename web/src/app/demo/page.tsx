/**
 * /demo — book-a-demo landing surface.
 *
 * The homepage hero variants (hero-v2) surface a "Book Demo" CTA that
 * historically 404'd. This page describes what the walk-through covers and
 * routes visitors to the same `/contact` inbox that the sales team already
 * monitors — plus a self-serve fallback (/pricing) for founders who would
 * rather trial the product themselves.
 *
 * Server component. `robots: index+follow` so the "book demo" query shows a
 * canonical answer in search.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Calendar, CheckCircle2 } from "lucide-react";
import { NavV2 } from "@/components/landing/nav-v2";
import { NotFinancialAdvice } from "@/components/legal/not-financial-advice";

const SITE_URL = "https://blockid.au";

export const metadata: Metadata = {
  title: "Book a demo — BlockID.au",
  description:
    "See a 20-minute walk-through of the BlockID.au investor-readiness stack — SVI, valuation, cap table, ESOP, and data room in one live session.",
  alternates: { canonical: `${SITE_URL}/demo` },
  robots: { index: true, follow: true },
};

const HIGHLIGHTS = [
  "SVI live-score against a startup you nominate before the call.",
  "Valuation snapshot with DCF, Berkus, Scorecard, and comparables side-by-side.",
  "Cap-table + ESOP dilution modelled against a fresh SAFE or priced round.",
  "Investor-pack PDF export walk-through — the same deck we ship to LPs.",
  "AI copilot Q&A anchored to your own uploaded evidence.",
];

export default function DemoPage() {
  return (
    <div data-theme="lux" className="min-h-svh bg-brand-navy-deep text-brand-ink">
      <NavV2 />

      <main className="mx-auto max-w-4xl px-4 pb-24 pt-16 sm:px-6">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-brand-cyan/30 bg-brand-cyan/10 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-cyan">
            <Calendar aria-hidden="true" className="h-3.5 w-3.5" />
            20-minute walk-through
          </span>
          <h1 className="mt-6 text-4xl font-bold tracking-tight text-brand-ink sm:text-5xl">
            Book a live demo
          </h1>
          <p className="mt-4 text-lg text-brand-ink-muted">
            A short, honest walk-through of the BlockID.au stack against a
            startup you nominate. No slide deck, no upsell — the demo is
            driven straight from the product with your data in the room.
          </p>
        </div>

        <section
          aria-labelledby="what-you-see"
          className="mt-14 rounded-2xl border border-brand-cyan/15 bg-brand-navy/60 p-8"
        >
          <h2
            id="what-you-see"
            className="text-2xl font-semibold tracking-tight text-brand-ink"
          >
            What you will see
          </h2>
          <ul className="mt-6 space-y-3">
            {HIGHLIGHTS.map((h) => (
              <li key={h} className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-cyan/10 text-brand-cyan">
                  <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
                </span>
                <span className="text-sm leading-relaxed text-brand-ink-muted">
                  {h}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section
          aria-labelledby="who-its-for"
          className="mt-10 rounded-2xl border border-brand-cyan/15 bg-brand-navy/60 p-8"
        >
          <h2
            id="who-its-for"
            className="text-2xl font-semibold tracking-tight text-brand-ink"
          >
            Who a demo is right for
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-brand-ink-muted">
            Best for founders who are actively raising in the next 90 days,
            operators pricing a corporate compare bake-off (Cake, Carta,
            Foundersuite, Visible, AngelList), and accelerator / advisor
            teams sizing a multi-seat rollout. If you are pre-idea or
            evaluating for a personal project, the free self-serve form at
            /score is a faster starting point and skips the calendar dance.
          </p>
        </section>

        <div className="mt-12 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/contact?topic=demo"
            className="inline-flex items-center gap-2 rounded-2xl bg-brand-cyan px-6 py-3 text-sm font-semibold text-brand-navy transition-colors hover:bg-brand-blue-bright focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-brand-navy"
          >
            Request a demo slot
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
          <Link
            href="/pricing"
            className="inline-flex items-center gap-2 rounded-2xl border border-brand-cyan/40 px-6 py-3 text-sm font-semibold text-brand-ink transition-colors hover:bg-brand-cyan/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-brand-navy"
          >
            See pricing instead
          </Link>
        </div>
      </main>

      <footer className="border-t border-white/5 bg-brand-navy-deep">
        <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-xs text-brand-ink-muted">
              &copy; {new Date().getFullYear()} Auschain Pty Ltd (ACN 659 615
              111). BlockID.au.
            </p>
            <nav aria-label="Footer">
              <ul className="flex flex-wrap items-center gap-4 text-xs text-brand-ink-muted">
                <li>
                  <Link href="/pricing" className="hover:text-brand-ink">
                    Pricing
                  </Link>
                </li>
                <li>
                  <Link href="/roadmap" className="hover:text-brand-ink">
                    Roadmap
                  </Link>
                </li>
                <li>
                  <Link href="/contact" className="hover:text-brand-ink">
                    Contact
                  </Link>
                </li>
                <li>
                  <Link href="/privacy" className="hover:text-brand-ink">
                    Privacy
                  </Link>
                </li>
              </ul>
            </nav>
          </div>
          <div className="mt-6">
            <NotFinancialAdvice kind="not_financial_advice" compact />
          </div>
        </div>
      </footer>
    </div>
  );
}
