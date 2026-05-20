import type { Metadata } from "next";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { FundingPlanTool } from "./funding-plan-tool";

const TITLE = "Funding Plan — Free Startup Capital Planner for AU Founders | BlockID.au";
const DESCRIPTION =
  "Plan how much capital you need, how much each founder puts in, and how much to raise externally. AU pre-seed friendly. Free for Australian startups.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "startup funding plan calculator australia",
    "founder funding plan",
    "pre-seed runway calculator australia",
    "cofounder cash contribution calculator",
    "idea stage capital requirement",
  ],
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    url: "https://blockid.au/tools/funding-plan",
    siteName: "BlockID",
    locale: "en_AU",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  alternates: {
    canonical: "https://blockid.au/tools/funding-plan",
  },
};

export default function FundingPlanPage() {
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
              Founder Funding Plan (Australia)
            </h1>
            <p className="mt-4 text-base md:text-lg leading-relaxed text-ink-400">
              Know exactly how much capital you need — and how much equity
              it&apos;ll cost — before you talk to investors. Map 12–18 months
              of runway, founder cash injections and the external raise on one
              page.
            </p>
          </header>
          <div className="mt-10">
            <FundingPlanTool />
          </div>
          <section className="mt-16 grid md:grid-cols-3 gap-6">
            {[
              {
                title: "What goes in the burn?",
                body: "Cofounder living wages, tools/SaaS, marketing experiments, and a one-off legal/accounting line for incorporation, shareholders agreement and tax setup. We add a buffer (default 20%) on the variable spend.",
              },
              {
                title: "How is the raise sized?",
                body: "Total need minus what founders can pool in cash. We then split the post-money cap table between founders, the ESOP pool you set, and the new investor — at the pre-money you choose.",
              },
              {
                title: "Why the SAFE suggestion?",
                body: "Friends-and-family rounds in AU usually price as SAFEs with a 20% discount and a cap ~1.5× the agreed pre-money. Tweak as your lead investor demands.",
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
