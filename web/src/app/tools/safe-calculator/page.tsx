import type { Metadata } from "next";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { PageTracker } from "@/components/analytics/page-tracker";
import { SAFECalculator } from "./safe-calculator";

const TITLE =
  "SAFE Note Calculator — Free AU SAFE Conversion & Dilution Modelling | BlockID.au";
const DESCRIPTION =
  "Model SAFE conversion at the next priced round — cap, discount, interest, shares issued and effective dilution. Tuned for Australian SAFE templates and MFN clauses.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "safe note calculator australia",
    "australian safe note",
    "safe conversion calculator",
    "valuation cap discount safe",
    "y combinator safe australia",
    "safe vs convertible note australia",
  ],
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    url: "https://blockid.au/tools/safe-calculator",
    siteName: "BlockID",
    locale: "en_AU",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  alternates: {
    canonical: "https://blockid.au/tools/safe-calculator",
  },
};

export default function SAFECalculatorPage() {
  return (
    <>
      <PageTracker page="tools/safe-calculator" tool="safe-calculator" />
      <Navbar />
      <main id="main" className="flex-1 pt-32 md:pt-40 pb-24">
        <div className="mx-auto max-w-6xl px-6">
          <header className="max-w-3xl">
            <p className="text-xs uppercase tracking-[0.2em] text-gold-600 font-medium">
              Free tool · No login · AU-tuned
            </p>
            <h1 className="mt-3 text-4xl md:text-5xl font-semibold tracking-tight text-ink-800">
              SAFE Note Calculator (Australia)
            </h1>
            <p className="mt-4 text-base md:text-lg leading-relaxed text-ink-400">
              Enter your SAFE terms and the assumed next priced round — see the
              effective conversion price, shares issued, ownership percentage
              and how the SAFE investor compares against a direct priced-round
              investor. Tuned for Australian SAFE templates.
            </p>
          </header>
          <div className="mt-10">
            <SAFECalculator />
          </div>
          <section className="mt-16 grid md:grid-cols-3 gap-6">
            {[
              {
                title: "How does a SAFE convert?",
                body: "A SAFE converts at the lower of (a) the valuation cap divided by current shares and (b) the priced-round price discounted by the SAFE discount rate. Whichever produces fewer dollars-per-share wins for the investor.",
              },
              {
                title: "Why does this calculator assume pre-money cap?",
                body: "Most Australian SAFE templates still use a pre-money cap. The 2018 Y Combinator post-money SAFE pushes more dilution onto founders — if your term sheet says 'post-money cap', model dilution separately.",
              },
              {
                title: "What about MFN?",
                body: "The Most Favoured Nation clause means a later SAFE on better terms can be back-applied. Be deliberate about issuing multiple SAFE tranches — assume the best terms will propagate.",
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
