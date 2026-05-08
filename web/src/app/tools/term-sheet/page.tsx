import type { Metadata } from "next";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { TermSheetTool } from "./term-sheet-tool";
import { ClipboardPaste, Sparkles, FileSearch } from "lucide-react";

const TITLE =
  "Term Sheet AI (Australia) — Plain-English Analysis & Redline | BlockID";
const DESCRIPTION =
  "Paste any term sheet — get a founder-friendly redline, AU market comparison, and dilution simulation in 30 seconds. Free, no login. Built for Australian founders by BlockID.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "term sheet ai",
    "term sheet review australia",
    "founder friendly redline",
    "safe term sheet analysis",
    "series a term sheet australia",
    "esic term sheet",
  ],
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    url: "https://blockid.au/tools/term-sheet",
    siteName: "BlockID",
    locale: "en_AU",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  alternates: {
    canonical: "https://blockid.au/tools/term-sheet",
  },
};

const HOW_IT_WORKS = [
  {
    icon: ClipboardPaste,
    title: "Paste your term sheet",
    body: "Copy any SAFE, convertible note, or priced-round term sheet into the box. We accept plain text up to 30,000 characters. We don't store the document beyond the analysis call.",
  },
  {
    icon: Sparkles,
    title: "AI analyses against AU market norms",
    body: "Claude Sonnet 4.6 reads your term sheet against an Australian-specific reference of typical SAFE caps, Series A norms, ESIC eligibility rules and the most common investor-friendly red flags.",
  },
  {
    icon: FileSearch,
    title: "Get redline, comparison, dilution",
    body: "You get a plain-English summary, a severity-ranked redline (info / warning / critical), an AU market comparison table, and an optional dilution simulation if you also paste your cap table.",
  },
];

export default function TermSheetPage() {
  return (
    <>
      <Navbar />
      <main id="main" className="flex-1 pt-32 md:pt-40 pb-24">
        <div className="mx-auto max-w-7xl px-6">
          <header className="max-w-3xl">
            <p className="text-xs uppercase tracking-[0.2em] text-teal-400 font-medium">
              Free tool · No login · Saves AUD $3k–$10k in legal fees
            </p>
            <h1 className="mt-3 text-4xl md:text-5xl font-semibold tracking-tight text-slate-50">
              Term Sheet AI (Australia)
            </h1>
            <p className="mt-4 text-base md:text-lg leading-relaxed text-slate-400">
              Paste a term sheet. Get a founder-friendly plain-English summary,
              severity-ranked redline, AU market comparison, and live dilution
              simulation — in 30 seconds, by an AI trained on Australian
              private-capital norms.
            </p>
          </header>
          <div className="mt-10">
            <TermSheetTool />
          </div>

          <p className="mt-8 max-w-3xl text-xs leading-relaxed text-slate-500">
            This is not legal advice. Use a licensed AU lawyer for binding
            agreements. BlockID stores your pasted term sheet temporarily for
            analysis only — see{" "}
            <a href="#" className="underline hover:text-slate-300 cursor-pointer">
              Privacy
            </a>
            .
          </p>

          <section
            aria-labelledby="how-it-works"
            className="mt-16 grid md:grid-cols-3 gap-6"
          >
            <h2 id="how-it-works" className="sr-only">
              How this works
            </h2>
            {HOW_IT_WORKS.map((b) => {
              const Icon = b.icon;
              return (
                <article
                  key={b.title}
                  className="rounded-2xl border border-ink-700 bg-ink-900 p-6"
                >
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-ink-700 bg-ink-800 text-teal-300">
                    <Icon strokeWidth={1.75} className="h-5 w-5" aria-hidden />
                  </span>
                  <h3 className="mt-4 text-base font-semibold text-slate-50">
                    {b.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">
                    {b.body}
                  </p>
                </article>
              );
            })}
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
