import type { Metadata } from "next";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { DilutionCalculator } from "./dilution-calculator";

const TITLE = "Dilution Calculator — Free Founder Dilution Modelling for AU Startups | BlockID.au";
const DESCRIPTION =
  "Model pre-money valuation, raise size and ESOP top-up to see founder dilution before signing the term sheet. Free for Australian startup founders.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "startup dilution calculator australia",
    "founder dilution calculator",
    "esop calculator australia",
    "pre-money post-money calculator",
  ],
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    url: "https://blockid.au/tools/dilution",
    siteName: "BlockID",
    locale: "en_AU",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  alternates: {
    canonical: "https://blockid.au/tools/dilution",
  },
};

export default function DilutionPage() {
  return (
    <>
      <Navbar />
      <main id="main" className="flex-1 pt-32 md:pt-40 pb-24">
        <div className="mx-auto max-w-6xl px-6">
          <header className="max-w-3xl">
            <p className="text-xs uppercase tracking-[0.2em] text-gold-600 font-medium">
              Free tool · No login · AU-tuned
            </p>
            <h1 className="mt-3 text-4xl md:text-5xl font-semibold tracking-tight text-ink-800">
              Founder Dilution Calculator (Australia)
            </h1>
            <p className="mt-4 text-base md:text-lg leading-relaxed text-ink-400">
              Model your next round before you sign. Enter the pre-money
              valuation, raise size, current shares and ESOP top-up — see
              founder dilution, post-money and the new share price instantly.
            </p>
          </header>
          <div className="mt-10">
            <DilutionCalculator />
          </div>
          <section className="mt-16 grid md:grid-cols-3 gap-6">
            {[
              {
                title: "How is dilution calculated?",
                body: "New shares for the investor are sized at the pre-money share price (pre-money ÷ current shares). The ESOP top-up is sized so the pool equals your target percentage of the fully-diluted post-money cap table.",
              },
              {
                title: "Why is the AU pre-money different?",
                body: "AU seed-to-Series A pre-money in 2025 typically lands at $4M–$12M depending on sector heat, ARR and ESIC eligibility. Compare against your sector with the BlockID Comparable Companies Wall.",
              },
              {
                title: "Want it baked into your raise?",
                body: "Generate an Investor-Ready Score with your live cap table — investors see the dilution scenario, sector comps and ESIC eligibility on one page.",
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
