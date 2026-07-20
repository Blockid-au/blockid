import type { Metadata } from "next";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { PageTracker } from "@/components/analytics/page-tracker";
import { ProjectionsTool } from "./projections-tool";

const TITLE =
  "3-Year Financial Projections — AU Startup Tool | BlockID.au";
const DESCRIPTION =
  "Generate investor-grade 36-month financial projections for your Australian startup. Sector-tuned growth, EBITDA-first structure, R&D tax offsets, CSV export. Deterministic — same inputs, same output.";
const CANONICAL = "https://blockid.au/tools/financial-projections";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "3 year financial projections australia",
    "startup financial projection template",
    "founder 3 year forecast",
    "australian startup ebitda projection",
    "rdti tax offset projection",
    "investor grade financial model",
    "36 month monthly projection",
    "startup csv export forecast",
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
              Founder tool · AU-tuned · Deterministic
            </p>
            <h1 className="mt-3 text-4xl md:text-5xl font-semibold tracking-tight text-ink-800">
              3-Year Financial Projections
            </h1>
            <p className="mt-4 text-base md:text-lg leading-relaxed text-ink-400">
              Turn your current MRR, burn and team into a 36-month monthly
              projection — revenue, gross margin, opex, EBITDA, cash outflow
              and headcount. Sector-tuned growth against AU norms, aggressive
              / moderate / conservative scenarios, and an optional R&D tax
              incentive line. CSV export ready for your investor pack.
            </p>
          </header>
          <div className="mt-10">
            <ProjectionsTool />
          </div>
          <section className="mt-16 grid md:grid-cols-3 gap-6">
            {[
              {
                title: "Where do the sector norms come from?",
                body: "AU-tuned benchmarks — Bessemer Cloud Index, SaaS Capital, AVCAL and Cut Through Venture — the same VC_BENCHMARKS used across BlockID's CFO tooling. Growth is company-level (not market CAGR) and decays via an S-curve toward a 2% floor.",
              },
              {
                title: "How do tax incentives affect cash flow?",
                body: "Turn on the R&D Tax Incentive toggle and we apply the 18.5% refundable premium above the corporate tax rate to your sector-typical R&D share of opex (deeptech 40%, healthtech / AI 30%, SaaS / fintech 20%, others 10-15%).",
              },
              {
                title: "Is the output the same every time?",
                body: "Yes — the engine is deterministic. Same inputs always produce the same 36 rows and YoY summary. Safe to include in investor decks and cap-table workbooks. General information only, not financial advice.",
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
