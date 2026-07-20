import type { Metadata } from "next";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { IdeaLabTool } from "./idea-lab-tool";

const TITLE = "AI Idea Lab — Sector-Aware Startup Angles for AU Founders";
const DESCRIPTION =
  "Pick a sector, describe a broad problem area, and generate 10 concrete startup angles, 5 non-obvious opportunities and 3 real Australian competitors. Free to try.";
const CANONICAL = "https://blockid.au/tools/idea-lab";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "startup idea generator",
    "startup ideas australia",
    "sector startup angles",
    "AI idea lab",
    "founder brainstorm tool",
    "australian startup opportunities",
    "startup competitor research",
  ],
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    url: CANONICAL,
    siteName: "BlockID",
    locale: "en_AU",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  alternates: {
    canonical: CANONICAL,
  },
};

export default function IdeaLabPage() {
  return (
    <>
      <Navbar />
      <main id="main" className="flex-1 pt-32 md:pt-40 pb-24">
        <div className="mx-auto max-w-5xl px-6">
          <header className="max-w-3xl">
            <p className="text-xs uppercase tracking-[0.2em] text-gold-600 font-medium">
              R&amp;D · Founder tool · Sector-aware
            </p>
            <h1 className="mt-3 text-4xl md:text-5xl font-semibold tracking-tight text-ink-800">
              AI Idea Lab
            </h1>
            <p className="mt-4 text-base md:text-lg leading-relaxed text-ink-600">
              Pick a sector and describe a broad problem area. Get 10 concrete
              startup angles, 5 non-obvious opportunities and 3 real Australian
              competitors — then send any idea straight into the Startup Value
              Index to score it.
            </p>
          </header>

          <section className="mt-10 rounded-2xl border border-surface-200 bg-white p-6 md:p-10 shadow-sm">
            <IdeaLabTool />
          </section>

          <p className="mt-6 text-[11px] leading-relaxed text-ink-500">
            Ideas provided for exploration only. Not investment advice.
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}
