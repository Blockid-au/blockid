import type { Metadata } from "next";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { ScoreForm } from "./score-form";

const TITLE = "Get your Investor-Ready Score — Free";
const DESCRIPTION =
  "Generate your Investor-Ready Score in 5 minutes. Free for every Australian founder. One number, five sub-scores, one shareable link for investors.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    url: "https://blockid.au/score",
    siteName: "BlockID",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function ScorePage() {
  return (
    <>
      <Navbar />
      <main id="main" className="flex-1 pt-32 md:pt-40 pb-24">
        <div className="mx-auto max-w-5xl px-6">
          <header className="max-w-3xl">
            <p className="text-xs uppercase tracking-[0.2em] text-teal-400 font-medium">
              Free · 5 minutes · No credit card
            </p>
            <h1 className="mt-3 text-4xl md:text-5xl font-semibold tracking-tight text-slate-50">
              Investor-Ready Score
            </h1>
            <p className="mt-4 text-base md:text-lg leading-relaxed text-slate-400">
              Answer 10 questions across three steps. We&apos;ll generate a
              deterministic preview of your score and the five sub-scores
              investors look at.
            </p>
          </header>
          <section className="mt-10 rounded-2xl border border-ink-700 bg-ink-900 p-6 md:p-10">
            <ScoreForm />
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
