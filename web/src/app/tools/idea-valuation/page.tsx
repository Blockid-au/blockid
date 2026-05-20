import type { Metadata } from "next";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { IdeaValuationTool } from "./idea-valuation-tool";

const TITLE = "Idea Valuation — Free Startup Valuation Calculator for AU Founders | BlockID.au";
const DESCRIPTION =
  "Estimate your Australian startup's pre-money valuation at the idea stage. Berkus + Scorecard methods, AUD-native, completely free. Built for AU founders.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "idea stage valuation calculator",
    "pre-incorporation valuation australia",
    "berkus method calculator",
    "scorecard method valuation",
    "startup pre-money calculator australia",
  ],
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    url: "https://blockid.au/tools/idea-valuation",
    siteName: "BlockID",
    locale: "en_AU",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  alternates: {
    canonical: "https://blockid.au/tools/idea-valuation",
  },
};

export default function IdeaValuationPage() {
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
              Idea-Stage Valuation Estimator
            </h1>
            <p className="mt-4 text-base md:text-lg leading-relaxed text-ink-600">
              Get a defensible idea-stage valuation in 60 seconds — before you
              incorporate or split equity. Hybrid Berkus + Scorecard method,
              tuned for the Australian seed market.
            </p>
          </header>
          <div className="mt-10">
            <IdeaValuationTool />
          </div>
          <section className="mt-16 grid md:grid-cols-3 gap-6">
            {[
              {
                title: "How is the number calculated?",
                body: "Five Berkus pillars — sound idea, prototype, team, strategic relationships, product rollout — each capped at AUD $500k. We then apply a 0.5x – 1.5x Scorecard multiplier from market size, moat and competition density.",
              },
              {
                title: "Why so wide a band?",
                body: "Idea-stage valuations aren't calculated, they're negotiated. The ±35% band is honest: until you have paying customers and a first lead investor, your number is a story, not a spreadsheet.",
              },
              {
                title: "Want it baked into your raise?",
                body: "Generate an Investor-Ready Score and pair this estimate with sector comps, ESIC eligibility and a live cap table on one shareable link.",
              },
            ].map((b) => (
              <article
                key={b.title}
                className="rounded-2xl border border-surface-200 bg-white p-6 shadow-sm"
              >
                <h2 className="text-base font-semibold text-ink-800">
                  {b.title}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-ink-600">
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
