import type { Metadata } from "next";
import { Suspense } from "react";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { PageTracker } from "@/components/analytics/page-tracker";
import { ScoreForm } from "./score-form";

const TITLE = "Get your Investor-Ready Score — Free";
const DESCRIPTION =
  "Generate your Investor-Ready Score in 5 minutes. Free for every Australian founder. One number, five sub-scores, one shareable link for investors.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "startup investor ready score",
    "startup valuation australia free",
    "SVI score startup",
    "investor readiness score australia",
    "startup valuation tool australia",
    "free startup score australia",
    "startup value index",
  ],
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    url: "https://blockid.au/score",
    siteName: "BlockID",
    locale: "en_AU",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  alternates: {
    canonical: "https://blockid.au/score",
  },
};

export default function ScorePage() {
  return (
    <>
      <PageTracker page="score" tool="score" />
      <Navbar />
      <main id="main" className="flex-1 pt-32 md:pt-40 pb-24">
        <div className="mx-auto max-w-5xl px-6">
          <header className="max-w-3xl">
            <div className="flex items-center gap-3 flex-wrap">
              <p className="text-xs uppercase tracking-[0.2em] text-gold-600 font-medium">
                Free · 5 minutes · No credit card
              </p>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-0.5 text-[11px] font-semibold text-emerald-700">
                <svg className="h-3 w-3 fill-emerald-500" viewBox="0 0 8 8" aria-hidden="true"><circle cx="4" cy="4" r="4" /></svg>
                Trusted by 500+ AU founders
              </span>
            </div>
            <h1 className="mt-3 text-4xl md:text-5xl font-semibold tracking-tight text-ink-800">
              Investor-Ready Score
            </h1>
            <p className="mt-4 text-base md:text-lg leading-relaxed text-ink-600">
              Answer 10 questions across three steps. We&apos;ll generate a
              deterministic preview of your score and the five sub-scores
              investors look at.
            </p>
            {/* Trust signal row */}
            <div className="mt-5 flex items-center gap-4 flex-wrap text-xs text-ink-500">
              <span className="flex items-center gap-1.5">
                <svg className="h-3.5 w-3.5 text-gold-500" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                8-dimension AI analysis
              </span>
              <span className="flex items-center gap-1.5">
                <svg className="h-3.5 w-3.5 text-brand-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                AU data residency
              </span>
              <span className="flex items-center gap-1.5">
                <svg className="h-3.5 w-3.5 text-brand-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                Instant shareable investor link
              </span>
            </div>
          </header>
          <section className="mt-10 rounded-2xl border border-surface-200 bg-white p-6 md:p-10 shadow-sm">
            <Suspense fallback={null}>
              <ScoreForm />
            </Suspense>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
