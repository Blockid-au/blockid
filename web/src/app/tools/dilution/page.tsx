import type { Metadata } from "next";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { PageTracker } from "@/components/analytics/page-tracker";
import { DilutionCalculator } from "./dilution-calculator";

const TITLE = "Dilution Calculator — Free Founder Dilution Modelling for AU Startups";
const DESCRIPTION =
  "Model pre-money valuation, raise size and ESOP top-up to see founder dilution before signing the term sheet. Free for Australian startup founders.";

const FAQ_ITEMS: ReadonlyArray<{ title: string; body: string }> = [
  {
    title: "How is dilution calculated?",
    body: "New shares for the investor are sized at the pre-money share price (pre-money ÷ current shares). The ESOP top-up is sized so the pool equals your target percentage of the fully-diluted post-money cap table.",
  },
  {
    title: "Why is the AU pre-money different?",
    body: "AU seed-to-Series A pre-money in 2026 typically lands at $4M–$12M depending on sector heat, ARR and ESIC eligibility. Compare against your sector with the BlockID Benchmarks.",
  },
  {
    title: "Want it baked into your raise?",
    body: "Generate an Investor-Ready Score with your live cap table — investors see the dilution scenario, sector comps and ESIC eligibility on one page.",
  },
];

const FAQ_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ_ITEMS.map((f) => ({
    "@type": "Question",
    name: f.title,
    acceptedAnswer: { "@type": "Answer", text: f.body },
  })),
};

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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_SCHEMA) }}
      />
      <PageTracker page="tools/dilution" tool="dilution" />
      <Navbar />
      <main id="main" className="flex-1 pt-32 md:pt-40 pb-24">
        <div className="mx-auto max-w-6xl px-6">
          <header className="max-w-3xl">
            <p className="text-xs uppercase tracking-[0.2em] text-gold-600 font-medium">
              Free tool · No login · AU-tuned
            </p>
            <h1 className="mt-3 text-4xl md:text-5xl font-semibold tracking-tight text-ink-800">
              See your founder ownership after your next round
            </h1>
            <p className="mt-4 text-base md:text-lg leading-relaxed text-ink-400">
              It&apos;s the number founders regret not modelling. Enter your
              terms and see what you own after seed, Series A, ESOP top-ups —
              pre-money valuation, raise size, current shares and ESOP top-up
              feed founder dilution, post-money and the new share price
              instantly.
            </p>
          </header>
          <div className="mt-10">
            <DilutionCalculator />
          </div>
          <section className="mt-16 grid md:grid-cols-3 gap-6">
            {FAQ_ITEMS.map((b) => (
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
