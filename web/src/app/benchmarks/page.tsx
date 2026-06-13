import type { Metadata } from "next";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { BenchmarksWall } from "./benchmarks-wall";

const TITLE = "AU Startup Benchmarks — Pre-Seed to Series A Metrics | BlockID";
const DESCRIPTION =
  "Free Australian startup benchmark data: MRR, ARR, churn, burn rate, CAC, LTV and SVI scores by stage. Compare your startup against 2,700+ AU peers.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "australian startup benchmarks",
    "startup metrics australia",
    "seed stage MRR benchmarks",
    "series a metrics australia",
    "startup burn rate benchmark australia",
    "SVI score benchmarks",
    "AU startup valuation benchmarks",
    "startup KPI benchmarks australia",
  ],
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    url: "https://blockid.au/benchmarks",
    siteName: "BlockID",
    locale: "en_AU",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  alternates: {
    canonical: "https://blockid.au/benchmarks",
  },
};

const FAQ_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What is a good MRR for a seed-stage Australian startup?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The median Australian seed-stage startup runs $10,000 MRR. The top quartile exceeds $50,000 MRR. Pre-seed startups often have $0–$3,000 MRR as they're still finding product-market fit.",
      },
    },
    {
      "@type": "Question",
      name: "What burn rate is typical for a pre-seed startup in Australia?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The median AU pre-seed burn rate is $15,000/month. Top-performing pre-seed startups keep burn under $5,000/month. At seed stage the median rises to $50,000/month as teams scale up.",
      },
    },
    {
      "@type": "Question",
      name: "What SVI score should I aim for?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The median SVI score for a launched (seed-equivalent) startup is 125. Scores above 155 place you in the top quartile. If you're fundraising, investors typically expect 130+ with strong traction and founder scores.",
      },
    },
    {
      "@type": "Question",
      name: "What is a healthy churn rate for an Australian SaaS startup?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The median monthly churn at seed stage is 7%. Top-quartile startups achieve under 3%. Pre-seed averages 10% as teams iterate on product. At Series A the bar tightens to 5% median / 2% top quartile.",
      },
    },
    {
      "@type": "Question",
      name: "How is the benchmark data sourced?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Data is compiled from Startup Genome's AU cohorts, AVCAL deal data, Cut Through Venture's AU report, ABS business entry/exit statistics, and publicly available accelerator cohort data from Startmate, Antler, and YC AU cohorts.",
      },
    },
  ],
};

export default function BenchmarksPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_SCHEMA) }}
      />
      <Navbar />
      <main id="main" className="flex-1 pt-32 md:pt-40 pb-24">
        <div className="mx-auto max-w-4xl px-6">
          <header className="max-w-3xl mb-12">
            <p className="text-xs uppercase tracking-[0.2em] text-gold-600 font-medium">
              Free data · AU ecosystem · Updated 2026
            </p>
            <h1 className="mt-3 text-4xl md:text-5xl font-semibold tracking-tight text-ink-800">
              Australian Startup Benchmarks
            </h1>
            <p className="mt-4 text-base md:text-lg leading-relaxed text-ink-500">
              Percentile benchmarks for MRR, ARR, churn, burn rate, CAC, LTV and SVI scores
              across Australian startups at Pre-Seed, Seed, Series A and Series B+.
              Select your stage to see where the bar is.
            </p>
          </header>

          <BenchmarksWall />

          {/* FAQ section for SEO */}
          <section className="mt-16 space-y-6">
            <h2 className="text-2xl font-semibold text-ink-800">Benchmark FAQ</h2>
            <div className="space-y-4">
              {[
                {
                  q: "What is a good MRR for a seed-stage Australian startup?",
                  a: "The median Australian seed-stage startup runs $10,000 MRR. The top quartile exceeds $50,000 MRR. Pre-seed startups often have $0–$3,000 MRR as they're still finding product-market fit.",
                },
                {
                  q: "What burn rate is typical for a pre-seed startup in Australia?",
                  a: "The median AU pre-seed burn rate is $15,000/month. Top-performing pre-seed startups keep burn under $5,000/month. At seed stage the median rises to $50,000/month as teams scale up.",
                },
                {
                  q: "What SVI score should I aim for?",
                  a: "The median SVI score for a launched (seed-equivalent) startup is 125. Scores above 155 place you in the top quartile. If you're fundraising, investors typically expect 130+ with strong traction and founder scores.",
                },
                {
                  q: "What is a healthy churn rate for an Australian SaaS startup?",
                  a: "The median monthly churn at seed stage is 7%. Top-quartile startups achieve under 3%. Pre-seed averages 10% as teams iterate on product. At Series A the bar tightens to 5% median / 2% top quartile.",
                },
                {
                  q: "How is the benchmark data sourced?",
                  a: "Data is compiled from Startup Genome's AU cohorts, AVCAL deal data, Cut Through Venture's AU report, ABS business entry/exit statistics, and publicly available accelerator cohort data from Startmate, Antler, and YC AU cohorts.",
                },
              ].map((faq) => (
                <article
                  key={faq.q}
                  className="rounded-2xl border border-surface-200 bg-white p-6"
                >
                  <h3 className="text-base font-semibold text-ink-800">{faq.q}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-500">{faq.a}</p>
                </article>
              ))}
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
