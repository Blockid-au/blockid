/**
 * /one-click-report — A$3 One-Click Guest Analysis marketing landing.
 *
 * Phase 3 of the Guest Analysis feature. Server component that renders the
 * pitch (hero / how-it-works / what you get / FAQ / final CTA) and mounts the
 * interactive <OneClickForm /> client island twice (hero + final section).
 *
 * The `?canceled=true` query param is set by our Stripe checkout cancel URL
 * (`/api/guest-analysis/create-order`). When present, a status banner is
 * rendered above the hero so returning visitors know their session bounced.
 *
 * G17 P2-A: on the unicorn template inside MarketingShell — PageHero (the
 * form in the visual slot) → Section (steps, numbered FeatureGrid) →
 * Section (deliverables + sample card) → Section (Faq + FAQPage JSON-LD)
 * → closing Section with the form again. Copy in
 * `one-click-report-content.ts`. The unattributed founder quote that used
 * to sit here is gone (nothing in the repo backs it).
 */
import type { Metadata } from "next";
import React, { Suspense } from "react";
import { Check, CreditCard, Mail, Upload, type LucideIcon } from "lucide-react";
import { pageMetadata } from "@/lib/seo/page-meta";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { Faq, FeatureGrid, PageHero, Section } from "@/components/marketing/template";
import { PageTracker } from "@/components/analytics/page-tracker";
import { ObfuscatedEmail } from "@/components/marketing/obfuscated-email";
import { OneClickForm } from "./one-click-form";
import {
  ONE_CLICK_DELIVERABLES,
  ONE_CLICK_FAQ,
  ONE_CLICK_SAMPLE,
  ONE_CLICK_STEPS,
  ONE_CLICK_TRUST,
  type OneClickIcon,
} from "./one-click-report-content";

export const metadata: Metadata = {
  ...pageMetadata({
    title: "One-Click Investor Analysis — A$3",
    description:
      "See how professional investors look at your startup. Upload your pitch or paste your website URL. Full SVI valuation report emailed in minutes. No signup.",
    path: "/one-click-report",
  }),
  keywords: [
    "one click startup report",
    "instant investor analysis australia",
    "startup valuation australia",
    "pitch deck analysis",
    "svi valuation report",
    "startup index report",
  ],
};

const ICONS: Record<OneClickIcon, LucideIcon> = { upload: Upload, "credit-card": CreditCard, mail: Mail };

interface PageProps {
  // Next.js 15+: searchParams is a Promise in server components.
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function OneClickReportPage({ searchParams }: PageProps) {
  const sp = (await searchParams) ?? {};
  const canceledRaw = sp.canceled;
  const canceled =
    (Array.isArray(canceledRaw) ? canceledRaw[0] : canceledRaw) === "true";

  const faqItems = [
    {
      question: ONE_CLICK_FAQ.refundQ,
      answerText: ONE_CLICK_FAQ.refundText,
      answer: (
        <>
          If your report doesn&apos;t arrive or the analysis clearly failed, email{" "}
          <ObfuscatedEmail user="support" domain="blockid.au" href className="text-action underline underline-offset-2" />{" "}
          and we&apos;ll refund the A$3 in full — no questions. It&apos;s a low-stakes trial for both of us.
        </>
      ),
    },
    ...ONE_CLICK_FAQ.rest.map((f) => ({ question: f.q, answer: f.a })),
  ];

  return (
    <MarketingShell>
      <PageTracker page="one_click_report" tool="one_click_report" />

      {/* Cancel banner — visitor returned from Stripe without completing checkout. */}
      {canceled ? (
        <div role="status" aria-live="polite" className="mx-auto mt-8 w-full max-w-6xl px-6">
          <div className="rounded-xl border border-warn bg-surface-sunken px-5 py-4 text-sm text-primary">
            <span className="font-semibold">Checkout canceled.</span> No charge was made. When you&apos;re
            ready, fill the form below and try again — takes ~30 seconds.
          </div>
        </div>
      ) : null}

      <PageHero
        eyebrow="For Australian founders"
        title="See how investors look at your startup — in one click."
        sub="Upload your pitch deck or paste your website. Get a full SVI valuation, 8-dimension scorecard, and comparable valuation range in your inbox. No signup. A$3 inc. GST"
        visual={
          <div className="rounded-xl border border-line-subtle bg-surface p-6 text-left shadow-2 md:p-7">
            <Suspense fallback={null}>
              <OneClickForm variant="hero" />
            </Suspense>
          </div>
        }
        footnote={
          <span className="inline-flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            {ONE_CLICK_TRUST.map((t) => (
              <span key={t} className="inline-flex items-center gap-2">
                <Check aria-hidden="true" className="h-4 w-4 text-action" />
                {t}
              </span>
            ))}
          </span>
        }
      />

      <Section id="how" title="How it works" tone="sunken">
        <FeatureGrid
          numbered
          columns={3}
          ariaLabel="How it works"
          items={ONE_CLICK_STEPS.map((s) => ({ icon: ICONS[s.icon], title: s.title, body: s.body }))}
        />
      </Section>

      <Section
        id="deliverables"
        title="What you get"
        lede="A structured investor brief that mirrors the same SVI framework we run for paid subscribers — delivered as a shareable PDF plus the email summary."
      >
        <div className="grid items-start gap-10 lg:grid-cols-2">
          <ul className="space-y-3">
            {ONE_CLICK_DELIVERABLES.map((item) => (
              <li key={item} className="flex gap-3 text-base text-primary">
                <Check aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-action" />
                <span>{item}</span>
              </li>
            ))}
          </ul>

          {/* Sample report card — illustrative; reserved height so it never reflows. */}
          <div
            aria-hidden
            className="relative min-h-[360px] rounded-xl border border-line-subtle bg-surface-sunken p-6 shadow-1 md:p-8"
          >
            <div className="flex items-center justify-between text-xs uppercase tracking-[0.16em] text-muted">
              <span>Sample report preview</span>
              <span>PDF · 12 pages</span>
            </div>
            <div className="mt-5 rounded-xl border border-line-subtle bg-surface p-5 shadow-1">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">SVI Score</p>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-display text-5xl font-bold text-primary tabular-nums">
                  {ONE_CLICK_SAMPLE.score}
                </span>
                <span className="text-sm text-muted">/ 100</span>
              </div>
              <div className="mt-4 grid grid-cols-4 gap-1.5">
                {ONE_CLICK_SAMPLE.bars.map((w) => (
                  <div key={w} className="h-2 overflow-hidden rounded-full bg-surface-sunken">
                    <div className={`h-full rounded-full bg-action ${w}`} />
                  </div>
                ))}
              </div>
              <div className="mt-5 rounded-lg border border-line-subtle bg-accent-soft px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Valuation range</p>
                <p className="mt-1 text-sm font-semibold text-primary tabular-nums">{ONE_CLICK_SAMPLE.range}</p>
              </div>
            </div>
            <p className="mt-4 text-xs italic text-muted">
              Illustrative preview. Every generated report is unique to your inputs.
            </p>
          </div>
        </div>
      </Section>

      <Section id="faq" title="Frequently asked" tone="sunken">
        <Faq className="max-w-3xl" items={faqItems} jsonLd />
      </Section>

      {/* Final CTA — the form again, on the template's closing rhythm. */}
      <Section
        id="cta"
        title="Ready to see your report?"
        lede="A$3 GST-inclusive, with an ATO tax invoice. Emailed in ~2 minutes. No signup."
        align="center"
        spacing="lg"
      >
        <div className="mx-auto max-w-3xl rounded-xl border border-line-subtle bg-surface p-6 shadow-2 md:p-8">
          <Suspense fallback={null}>
            <OneClickForm variant="final" />
          </Suspense>
        </div>
      </Section>
    </MarketingShell>
  );
}
