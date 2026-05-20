import type { Metadata } from "next";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { PageTracker } from "@/components/analytics/page-tracker";
import { EquitySplitTool } from "./equity-split-tool";

const TITLE = "Equity Split — Free Cofounder Equity Calculator for AU Startups";
const DESCRIPTION =
  "Fairly split startup equity between cofounders before you incorporate. Role, time, cash, sweat and IP weighted. Free and AU-native for Australian founders.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "founder equity split calculator",
    "cofounder equity split australia",
    "fast equity calculator",
    "slicing pie australia",
    "pre-incorporation equity",
    "founder agreement australia",
    "startup equity split",
  ],
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    url: "https://blockid.au/tools/equity-split",
    siteName: "BlockID",
    locale: "en_AU",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  alternates: {
    canonical: "https://blockid.au/tools/equity-split",
  },
};

export default function EquitySplitPage() {
  return (
    <>
      <PageTracker page="tools/equity-split" tool="equity-split" />
      <Navbar />
      <main id="main" className="flex-1 pt-32 md:pt-40 pb-24">
        <div className="mx-auto max-w-7xl px-6">
          <header className="max-w-3xl">
            <p className="text-xs uppercase tracking-[0.2em] text-gold-600 font-medium">
              Free tool · No login · AU-tuned
            </p>
            <h1 className="mt-3 text-4xl md:text-5xl font-semibold tracking-tight text-ink-800">
              Founder Equity Split Calculator
            </h1>
            <p className="mt-4 text-base md:text-lg leading-relaxed text-ink-600">
              Split equity fairly, before incorporation, before resentment.
              Weighted by role, time, cash, sweat, IP and risk — FAST /
              Slicing-Pie inspired, simplified for AU pre-seed teams.
            </p>
          </header>
          <div className="mt-10">
            <EquitySplitTool />
          </div>
          <section className="mt-16 grid md:grid-cols-3 gap-6">
            {[
              {
                title: "Why not just split equally?",
                body: "Equal splits feel kind on day one. They become resentment by month six when one founder is full-time and the other is moonlighting. The weighted-points model translates real contribution into a defensible split — and gives you a paper trail.",
              },
              {
                title: "How are points calculated?",
                body: "Role + time commitment + idea origination + cash invested + sweat months + IP brought + risk taken. Each input has a cap so no single factor dominates. Your % = your points ÷ total points × (100 − reserves).",
              },
              {
                title: "What happens when I incorporate?",
                body: "Take the recommended split, the vesting schedule and the founder-agreement seeds to your lawyer. When you sign up to BlockID, this becomes your Cap Table v0 — investors can see it on your verified profile from day one.",
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
