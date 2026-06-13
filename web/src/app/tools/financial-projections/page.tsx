import type { Metadata } from "next";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { PageTracker } from "@/components/analytics/page-tracker";
import { FinancialProjectionsCalculator } from "./financial-projections-calculator";

const TITLE =
  "Financial Projection Norms Calculator — AU Startup Benchmarks | BlockID.au";
const DESCRIPTION =
  "Compare your startup's burn rate, runway, growth, CAC and LTV against Australian pre-seed, seed and Series A benchmarks. Instant percentile scoring — no login required.";
const CANONICAL = "https://blockid.au/tools/financial-projections";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "australian startup benchmarks 2026",
    "startup burn rate australia",
    "startup runway calculator",
    "saas growth rate benchmarks",
    "cac ltv ratio australia",
    "pre-seed seed series a metrics",
    "financial projection norms",
    "startup unit economics australia",
  ],
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    url: CANONICAL,
    siteName: "BlockID.au",
    locale: "en_AU",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  alternates: { canonical: CANONICAL },
};

export default function FinancialProjectionsPage() {
  return (
    <>
      <PageTracker page="tools/financial-projections" tool="financial-projections" />
      <Navbar />
      <main id="main" className="flex-1 pt-32 md:pt-40 pb-24">
        <div className="mx-auto max-w-6xl px-6">
          <header className="max-w-3xl">
            <p className="text-xs uppercase tracking-[0.2em] text-gold-600 font-medium">
              Free tool · No login · AU-tuned
            </p>
            <h1 className="mt-3 text-4xl md:text-5xl font-semibold tracking-tight text-ink-800">
              Financial Projection Norms (Australia)
            </h1>
            <p className="mt-4 text-base md:text-lg leading-relaxed text-ink-400">
              Enter your stage, sector and current metrics. We compare against
              anonymised Australian startup benchmarks (pre-seed, seed,
              Series&nbsp;A, Series&nbsp;B+) and show your percentile position
              for burn rate, runway, growth, CAC, LTV and more.
            </p>
          </header>
          <div className="mt-10">
            <FinancialProjectionsCalculator />
          </div>
          <section className="mt-16 grid md:grid-cols-3 gap-6">
            {[
              {
                title: "Where does the data come from?",
                body: "Anonymised aggregates from Australian startup ecosystem reports, public disclosures and SVI submissions across pre-seed to Series B+. Percentile bands (p25 / p50 / p75) — not single-point averages.",
              },
              {
                title: "Why benchmark at all?",
                body: "Investors don't grade you in isolation. They compare your numbers to other AU founders in the same stage and sector. Knowing your position in the curve is the difference between a confident raise and a 'we need to think about it'.",
              },
              {
                title: "What's a healthy CAC/LTV?",
                body: "AU SaaS at seed should target LTV/CAC ≥ 3x within 12 months and CAC payback < 18 months. Below that and you're buying revenue. This calculator shows you exactly where you sit.",
              },
            ].map((b) => (
              <article
                key={b.title}
                className="rounded-2xl border border-surface-200 bg-white p-6"
              >
                <h2 className="text-base font-semibold text-ink-800">
                  {b.title}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-ink-400">
                  {b.body}
                </p>
              </article>
            ))}
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
