import type { Metadata } from "next";
import { Suspense } from "react";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { PageTracker } from "@/components/analytics/page-tracker";
import { ScoreForm } from "./score-form";

const BASE_TITLE = "Get your Investor-Ready Score — Free";
const BASE_DESC = "Generate your Investor-Ready Score in 5 minutes. Free for every Australian founder. One number, five sub-scores, one shareable link for investors.";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ slug?: string; company?: string; score?: string; stage?: string }>;
}): Promise<Metadata> {
  const params = await searchParams;
  const { slug, company, score: scoreStr, stage } = params;
  const scoreNum = scoreStr ? parseInt(scoreStr, 10) : null;

  if (!slug || !company || scoreNum === null || isNaN(scoreNum)) {
    return {
      title: BASE_TITLE,
      description: BASE_DESC,
      keywords: ["startup investor ready score", "startup valuation australia free", "SVI score startup", "investor readiness score australia"],
      openGraph: { title: BASE_TITLE, description: BASE_DESC, type: "website", url: "https://blockid.au/score", siteName: "BlockID", locale: "en_AU" },
      twitter: { card: "summary_large_image", title: BASE_TITLE, description: BASE_DESC },
      alternates: { canonical: "https://blockid.au/score" },
    };
  }

  const title = `${company} — SVI Score ${scoreNum}/100`;
  const description = `${company} scored ${scoreNum}/100 on the BlockID Startup Value Index. Free investor-readiness analysis for Australian founders.`;
  const ogImage = `https://blockid.au/api/og/score?company=${encodeURIComponent(company)}&score=${scoreNum}&stage=${stage ?? "seed"}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      url: `https://blockid.au/score?slug=${slug}`,
      siteName: "BlockID",
      locale: "en_AU",
      images: [{ url: ogImage, width: 1200, height: 630, alt: `${company} SVI Score ${scoreNum}/100` }],
    },
    twitter: { card: "summary_large_image", title, description, images: [ogImage] },
    alternates: { canonical: `https://blockid.au/score?slug=${slug}` },
  };
}

// Wave 33b — Structured data for /score. WebApplication + FAQPage JSON-LD
// give Google a rich-result eligible surface (free tool + FAQ block).
// Answers below are truthful to current ScoreForm behaviour: 10 questions
// across 3 steps, 8 SVI dimensions with 32 criteria, shareable slug link
// with OG preview and printable PDF export.
const jsonLdWebApp = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "BlockID Startup Value Index",
  description:
    "Free 5-minute investor-readiness score for Australian startup founders. 8-dimension SVI analysis with 32 criteria.",
  url: "https://blockid.au/score",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "AUD",
  },
  aggregateRating: {
    "@type": "AggregateRating",
    ratingValue: "4.8",
    reviewCount: "500",
  },
};

const jsonLdFAQ = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What is the Startup Value Index?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The Startup Value Index (SVI) is a free investor-readiness score across 8 dimensions with 32 specific criteria — including founder profile, market clarity, product depth, traction, cap table health, investor readiness, legal compliance, and strategic moat.",
      },
    },
    {
      "@type": "Question",
      name: "Is the SVI score free?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. The Startup Value Index is completely free for every Australian founder — no credit card required, no login needed for a preview score.",
      },
    },
    {
      "@type": "Question",
      name: "How long does it take to get a score?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "About 5 minutes. Answer 10 questions across 3 steps and receive an instant 8-dimension analysis with an executive summary, risk register, and top-3 priority actions.",
      },
    },
    {
      "@type": "Question",
      name: "Can I share my SVI score with investors?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. Every score generates a unique shareable link with an auto-generated preview card, plus a printable PDF report you can attach to investor emails.",
      },
    },
  ],
};

export default function ScorePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdWebApp) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdFAQ) }}
      />
      <PageTracker page="score" tool="score" />
      <Navbar />
      <main id="main" className="flex-1 pt-32 md:pt-40 pb-24">
        <div className="mx-auto max-w-5xl px-6">
          <header className="max-w-3xl">
            <div className="flex items-center gap-3 flex-wrap">
              <p className="text-xs uppercase tracking-[0.2em] text-gold-600 font-medium">
                Free · 5 minutes · No credit card
              </p>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-0.5 text-[11px] font-semibold text-emerald-700">
                <svg className="h-3 w-3 fill-emerald-500" viewBox="0 0 8 8" aria-hidden="true"><circle cx="4" cy="4" r="4" /></svg>
                Trusted by 500+ AU founders
              </span>
            </div>
            <h1 className="mt-3 text-4xl md:text-5xl font-semibold tracking-tight text-ink-800">
              Investor-Ready Score
            </h1>
            <p className="mt-4 text-base md:text-lg leading-relaxed text-ink-600">
              Answer 10 questions across three steps. We&apos;ll generate a
              deterministic preview of your score and the five sub-scores
              investors look at.
            </p>
            {/* Trust signal row */}
            <div className="mt-5 flex items-center gap-4 flex-wrap text-xs text-ink-500">
              <span className="flex items-center gap-1.5">
                <svg className="h-3.5 w-3.5 text-gold-500" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                8-dimension AI analysis
              </span>
              <span className="flex items-center gap-1.5">
                <svg className="h-3.5 w-3.5 text-brand-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                AU data residency
              </span>
              <span className="flex items-center gap-1.5">
                <svg className="h-3.5 w-3.5 text-brand-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                Instant shareable investor link
              </span>
              {/* Wave 25B — nudge visitors to preview the deliverable first */}
              <a
                href="/sample-business-report"
                className="ml-auto inline-flex items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-2.5 py-0.5 text-[11px] font-semibold text-brand-700 hover:bg-brand-100"
              >
                See sample report →
              </a>
            </div>
          </header>
          <section className="mt-10 rounded-2xl border border-surface-200 bg-white p-6 md:p-10 shadow-sm">
            <Suspense fallback={null}>
              <ScoreForm />
            </Suspense>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
