/**
 * /one-click-report — A$3 One-Click Guest Analysis marketing landing.
 *
 * Phase 3 of the Guest Analysis feature. Server component that renders the
 * long-form pitch (hero / how-it-works / what you get / sample / quote / FAQ /
 * final CTA) and mounts the interactive <OneClickForm /> client island twice
 * (hero + final section).
 *
 * The `?canceled=true` query param is set by our Stripe checkout cancel URL
 * (`/api/guest-analysis/create-order`). When present, a status banner is
 * rendered above the hero so returning visitors know their session bounced.
 */
import type { Metadata } from "next";
import React, { Suspense } from "react";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { PageTracker } from "@/components/analytics/page-tracker";
import { ObfuscatedEmail } from "@/components/marketing/obfuscated-email";
import { OneClickForm } from "./one-click-form";

const TITLE = "One-Click Investor Analysis — A$3 | BlockID.au";
const DESCRIPTION =
  "See how professional investors look at your startup. Upload your pitch or paste your website URL. Full SVI valuation report emailed in minutes. No signup.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "one click startup report",
    "instant investor analysis australia",
    "startup valuation australia",
    "pitch deck analysis",
    "svi valuation report",
    "startup index report",
  ],
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    url: "https://blockid.au/one-click-report",
    siteName: "BlockID",
    locale: "en_AU",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  alternates: {
    canonical: "https://blockid.au/one-click-report",
  },
};

interface PageProps {
  // Next.js 15+: searchParams is a Promise in server components.
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function OneClickReportPage({ searchParams }: PageProps) {
  const sp = (await searchParams) ?? {};
  const canceledRaw = sp.canceled;
  const canceled =
    (Array.isArray(canceledRaw) ? canceledRaw[0] : canceledRaw) === "true";

  return (
    <>
      <PageTracker page="one_click_report" tool="one_click_report" />
      <Navbar />
      <main id="main" className="flex-1 pt-28 md:pt-36 pb-24 bg-surface-50">
        {/* Cancel banner — visitor returned from Stripe without completing checkout. */}
        {canceled ? (
          <div
            role="status"
            aria-live="polite"
            className="mx-auto mb-8 max-w-4xl px-6"
          >
            <div className="rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4 text-sm text-amber-900">
              <span className="font-semibold">Checkout canceled.</span> No
              charge was made. When you&apos;re ready, fill the form below and
              try again — takes ~30 seconds.
            </div>
          </div>
        ) : null}

        {/* HERO */}
        <section className="mx-auto max-w-6xl px-6">
          <div className="grid lg:grid-cols-5 gap-10 lg:gap-14 items-start">
            <div className="lg:col-span-3">
              <p className="text-xs uppercase tracking-[0.2em] text-brand-600 font-semibold">
                New · For Australian founders
              </p>
              <h1 className="mt-3 text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tight text-ink-900 leading-[1.05]">
                See how investors look at your startup — in one click.
              </h1>
              <p className="mt-5 text-base md:text-lg leading-relaxed text-ink-600 max-w-2xl">
                Upload your pitch deck or paste your website. Get a full SVI
                valuation, 8-dimension scorecard, and comparable valuation
                range in your inbox. No signup.{" "}
                <span className="font-semibold text-ink-800">
                  A$3 GST-incl.
                </span>
              </p>
              <ul className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-ink-600">
                <li className="inline-flex items-center gap-2">
                  <span aria-hidden>🔒</span>
                  <span>GST tax invoice</span>
                </li>
                <li className="inline-flex items-center gap-2">
                  <span aria-hidden>📧</span>
                  <span>Emailed in ~2 min</span>
                </li>
                <li className="inline-flex items-center gap-2">
                  <span aria-hidden>🚫</span>
                  <span>No signup required</span>
                </li>
              </ul>
            </div>

            <div className="lg:col-span-2">
              <div className="rounded-3xl border border-surface-200 bg-white p-6 md:p-7 shadow-lg">
                <Suspense fallback={null}>
                  <OneClickForm variant="hero" />
                </Suspense>
              </div>
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section
          aria-labelledby="how-it-works-heading"
          className="mx-auto mt-24 max-w-6xl px-6"
        >
          <h2
            id="how-it-works-heading"
            className="text-2xl md:text-3xl font-semibold tracking-tight text-ink-900"
          >
            How it works
          </h2>
          <ol className="mt-8 grid gap-6 md:grid-cols-3">
            {[
              {
                n: 1,
                title: "Choose pitch or URL",
                body: "Upload a PDF or DOCX pitch deck (up to 10 MB), or paste your website URL. Both feed the same analysis pipeline.",
              },
              {
                n: 2,
                title: "Pay A$3",
                body: "Secure checkout via Stripe. GST-inclusive with an ATO tax invoice emailed automatically.",
              },
              {
                n: 3,
                title: "Report emailed",
                body: "Your full SVI investor brief arrives in ~2 minutes. Score, dimensions, valuation range, action list.",
              },
            ].map((step) => (
              <li
                key={step.n}
                className="rounded-2xl border border-surface-200 bg-white p-6"
              >
                <span
                  aria-hidden
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-brand-700 font-semibold tabular-nums"
                >
                  {step.n}
                </span>
                <h3 className="mt-4 text-lg font-semibold text-ink-900">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-600">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </section>

        {/* WHAT YOU GET */}
        <section
          aria-labelledby="what-you-get-heading"
          className="mx-auto mt-24 max-w-6xl px-6"
        >
          <div className="grid lg:grid-cols-2 gap-10 items-start">
            <div>
              <h2
                id="what-you-get-heading"
                className="text-2xl md:text-3xl font-semibold tracking-tight text-ink-900"
              >
                What you get
              </h2>
              <p className="mt-3 text-sm md:text-base text-ink-600 max-w-lg leading-relaxed">
                A structured investor brief that mirrors the same SVI framework
                we run for paid subscribers — delivered as a shareable PDF plus
                the email summary.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  "SVI investor-ready score with confidence band",
                  "8-dimension scorecard (FTV, MPC, PTD, TRE, CGH, IRI, LCO, SVM)",
                  "Valuation range (low / mid / high) with method rationale",
                  "Prioritised action list — the fastest score-lifting moves",
                  "Comparable Australian exits pattern (anonymised)",
                ].map((item) => (
                  <li
                    key={item}
                    className="flex gap-3 text-sm md:text-base text-ink-700"
                  >
                    <span
                      aria-hidden
                      className="mt-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white text-xs font-bold"
                    >
                      ✓
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Sample report placeholder card */}
            <div
              aria-hidden
              className="relative rounded-3xl border border-surface-200 bg-gradient-to-br from-brand-50 via-white to-surface-100 p-6 md:p-8 shadow-sm min-h-[360px]"
            >
              <div className="flex items-center justify-between text-xs uppercase tracking-[0.16em] text-ink-500">
                <span>Sample report preview</span>
                <span>PDF · 12 pages</span>
              </div>
              <div className="mt-5 rounded-2xl border border-surface-200 bg-white p-5 shadow-sm">
                <p className="text-[10px] uppercase tracking-[0.2em] text-brand-600 font-semibold">
                  SVI Score
                </p>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-5xl font-bold text-brand-700 tabular-nums">
                    72
                  </span>
                  <span className="text-sm text-ink-500">/ 100</span>
                </div>
                <div className="mt-4 grid grid-cols-4 gap-1.5">
                  {[62, 78, 71, 84, 55, 69, 74, 80].map((v, i) => (
                    <div
                      key={i}
                      className="h-2 rounded-full bg-surface-200 overflow-hidden"
                    >
                      <div
                        className="h-full bg-brand-500 rounded-full"
                        style={{ width: `${v}%` }}
                      />
                    </div>
                  ))}
                </div>
                <div className="mt-5 rounded-xl border border-brand-200 bg-brand-50/50 px-4 py-3">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-ink-500 font-semibold">
                    Valuation range
                  </p>
                  <p className="mt-1 text-sm font-semibold text-ink-800 tabular-nums">
                    A$3.2M · A$5.8M · A$9.1M
                  </p>
                </div>
              </div>
              <p className="mt-4 text-[11px] text-ink-500 italic">
                Illustrative preview. Every generated report is unique to your
                inputs.
              </p>
            </div>
          </div>
        </section>

        {/* FOUNDER QUOTE */}
        <section
          aria-labelledby="quote-heading"
          className="mx-auto mt-24 max-w-4xl px-6"
        >
          <h2 id="quote-heading" className="sr-only">
            Founder quote
          </h2>
          <figure className="rounded-3xl border border-surface-200 bg-white p-8 md:p-10 text-center shadow-sm">
            <blockquote className="text-lg md:text-xl leading-relaxed text-ink-800">
              &ldquo;Three dollars for a brutally honest read on how our deck
              actually lands with investors — before we send it to anyone
              serious. That&apos;s the cheapest de-risk we&apos;ve ever
              bought.&rdquo;
            </blockquote>
            <figcaption className="mt-5 text-sm text-ink-500">
              — Australian founder feedback
            </figcaption>
          </figure>
        </section>

        {/* FAQ */}
        <section
          aria-labelledby="faq-heading"
          className="mx-auto mt-24 max-w-4xl px-6"
        >
          <h2
            id="faq-heading"
            className="text-2xl md:text-3xl font-semibold tracking-tight text-ink-900"
          >
            Frequently asked
          </h2>
          <dl className="mt-8 space-y-6">
            {(
              [
                {
                  q: "What if I need my money back?",
                  a: (
                    <>
                      If your report doesn&apos;t arrive or the analysis clearly
                      failed, email{" "}
                      <ObfuscatedEmail
                        user="support"
                        domain="blockid.au"
                        href
                        className="text-brand-600 underline underline-offset-2"
                      />{" "}
                      and we&apos;ll refund the A$3 in full — no questions.
                      It&apos;s a low-stakes trial for both of us.
                    </>
                  ),
                },
                {
                  q: "How is my data used?",
                  a: "Your inputs power your report and are stored in Australia. We never sell your data, never train third-party models on it, and never expose it to other users. You can request full deletion any time.",
                },
                {
                  q: "Do you keep my pitch deck?",
                  a: "Only for as long as we need to generate your report — typically under an hour. After analysis, the raw upload is deleted. The generated PDF report is retained so we can re-send it if you lose the email.",
                },
                {
                  q: "Can I upgrade to a subscription?",
                  a: "Yes. After your one-click report, create a free BlockID account to save it, track your SVI over time, and unlock deeper analysis (comparables, evidence vault, per-investor share links). No upgrade pressure — the A$3 report is complete on its own.",
                },
              ] as Array<{ q: string; a: React.ReactNode }>
            ).map((item) => (
              <div
                key={item.q}
                className="rounded-2xl border border-surface-200 bg-white p-5 md:p-6"
              >
                <dt className="text-base font-semibold text-ink-900">
                  {item.q}
                </dt>
                <dd className="mt-2 text-sm md:text-base leading-relaxed text-ink-600">
                  {item.a}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        {/* FINAL CTA */}
        <section
          aria-labelledby="final-cta-heading"
          className="mx-auto mt-24 max-w-3xl px-6"
        >
          <div className="rounded-3xl border border-brand-200 bg-gradient-to-br from-brand-50 to-white p-8 md:p-10 shadow-sm">
            <h2
              id="final-cta-heading"
              className="text-2xl md:text-3xl font-semibold tracking-tight text-ink-900 text-center"
            >
              Ready to see your report?
            </h2>
            <p className="mt-3 text-center text-sm md:text-base text-ink-600">
              A$3 GST-inclusive. Emailed in ~2 minutes. No signup.
            </p>
            <div className="mt-8">
              <Suspense fallback={null}>
                <OneClickForm variant="final" />
              </Suspense>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
