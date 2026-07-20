import type { Metadata } from "next";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { IdeaClarifyTool } from "./idea-clarify-tool";

const TITLE = "First-Principles Idea Clarifier — Free Founder Tool";
const DESCRIPTION =
  "Answer 5–7 Socratic questions about your startup idea and get routed to the right next step — SVI analysis, cap table, ESIC eligibility, or fundraise prep. Free, no login required.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "startup idea clarifier",
    "first principles startup",
    "socratic startup questions",
    "startup validation australia",
    "founder decision tool",
  ],
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    url: "https://blockid.au/tools/idea-clarify",
    siteName: "BlockID",
    locale: "en_AU",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  alternates: {
    canonical: "https://blockid.au/tools/idea-clarify",
  },
};

export default function IdeaClarifyPage() {
  return (
    <>
      <Navbar />
      <main id="main" className="flex-1 pt-32 md:pt-40 pb-24">
        <div className="mx-auto max-w-3xl px-6">
          <header className="max-w-3xl">
            <p className="text-xs uppercase tracking-[0.2em] text-gold-600 font-medium">
              Free tool · No login · 5 minutes
            </p>
            <h1 className="mt-3 text-4xl md:text-5xl font-semibold tracking-tight text-ink-800">
              Clarify your idea from first principles
            </h1>
            <p className="mt-4 text-base md:text-lg leading-relaxed text-ink-600">
              Describe your startup idea in plain English. We&apos;ll ask the
              5–7 questions a good investor would ask, then route you to the
              right BlockID tool for your next step.
            </p>
          </header>
          <section className="mt-10 rounded-2xl border border-surface-200 bg-white p-6 md:p-10 shadow-sm">
            <IdeaClarifyTool />
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
