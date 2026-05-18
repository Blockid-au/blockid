import type { Metadata } from "next";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { CapTableDiffTool } from "./cap-table-diff";

const TITLE =
  "Cap Table Diff (Australia) — Visualize Founder Dilution Before & After | BlockID";
const DESCRIPTION =
  "See exactly how a new round dilutes founders, ESOP, and existing investors. Free, no login. Built for Australian seed-to-Series-A founders by BlockID.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "cap table diff",
    "cap table calculator australia",
    "founder dilution visualizer",
    "before after cap table",
    "pre-money esop top-up",
    "seed series a cap table",
  ],
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    url: "https://blockid.au/tools/cap-table",
    siteName: "BlockID",
    locale: "en_AU",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  alternates: {
    canonical: "https://blockid.au/tools/cap-table",
  },
};

export default function CapTablePage() {
  return (
    <>
      <Navbar />
      <main id="main" className="flex-1 pt-32 md:pt-40 pb-24">
        <div className="mx-auto max-w-7xl px-6">
          <header className="max-w-3xl">
            <p className="text-xs uppercase tracking-[0.2em] text-gold-400 font-medium">
              Free tool · No login
            </p>
            <h1 className="mt-3 text-4xl md:text-5xl font-semibold tracking-tight text-slate-50">
              Cap Table Diff (Australia)
            </h1>
            <p className="mt-4 text-base md:text-lg leading-relaxed text-slate-400">
              See exactly who dilutes when you raise. Drag in your cap table,
              model a round, share the result.
            </p>
          </header>
          <div className="mt-10">
            <CapTableDiffTool />
          </div>
          <section className="mt-16 grid md:grid-cols-3 gap-6">
            {[
              {
                title: "How does the ESOP top-up work?",
                body: "We model the standard AU pre-money treatment: the option pool grows BEFORE new investor shares are issued, so existing holders absorb the top-up dilution. New share price prices off the post-top-up cap.",
              },
              {
                title: "Why a diff view, not a table?",
                body: "Founders care about the delta — who lost, who gained, by how much. The before/after stacked bars and Δ% column make a 4-hour spreadsheet exercise legible in 30 seconds.",
              },
              {
                title: "Want this in your raise?",
                body: "Generate an Investor-Ready Score with this scenario baked in — investors see your live cap table, the modelled round, and AU sector comps on one shareable link.",
              },
            ].map((b) => (
              <article
                key={b.title}
                className="rounded-2xl border border-ink-700 bg-ink-900 p-6"
              >
                <h2 className="text-base font-semibold text-slate-50">
                  {b.title}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">
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
