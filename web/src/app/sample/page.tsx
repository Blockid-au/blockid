// /sample — canonical short URL for "show me what a report looks like".
//
// Wave 25B/25C surfaced a /sample URL in marketing copy and the founding
// band CTA but no page.tsx ever landed for it. Rather than redirect to a
// single destination (each of /tbr/demo, /guide/reports and the
// /showcase/atlassian walkthrough answers a different intent), this page
// is a lightweight hub linking to all three so the short URL always
// resolves cleanly.

import type { Metadata } from "next";
import Link from "next/link";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { MarketingHero } from "@/components/marketing/marketing-hero";
import { MarketingSection } from "@/components/marketing/marketing-section";
import { NotFinancialAdvice } from "@/components/legal/not-financial-advice";

const TITLE = "Sample BlockID reports — SVI grade, TBR preview and showcase";
const DESCRIPTION =
  "One page, three sample surfaces: the interactive Atlassian showcase, the anonymous Trusted Business Report preview, and the sector-by-sector report gallery.";
const CANONICAL = "https://blockid.au/sample";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
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
  alternates: { canonical: CANONICAL },
  robots: { index: true, follow: true },
};

const SAMPLES: ReadonlyArray<{
  href: string;
  title: string;
  body: string;
  cta: string;
}> = [
  {
    href: "/showcase/atlassian?step=1",
    title: "Interactive showcase (Atlassian)",
    body:
      "Walk through a fully-populated demo report step by step — every SVI dimension, evidence link and investor criterion, exactly as an investor sees it.",
    cta: "Open showcase",
  },
  {
    href: "/tbr/demo",
    title: "Trusted Business Report preview",
    body:
      "Anonymous, no-login preview of the TBR structure: 8 SVI dimensions with per-dimension signal detail, valuation band and next-action roadmap. All numbers are illustrative.",
    cta: "Open TBR demo",
  },
  {
    href: "/sample",
    title: "Sample report gallery",
    body:
      "Compare BlockID report variants across sectors, stages and evidence depth — pick the closest to your startup before you run one.",
    cta: "Open gallery",
  },
];

export default function SampleHubPage() {
  return (
    <MarketingShell>
      <MarketingHero
        eyebrow="Preview"
        title="See what BlockID reports look like"
        subtitle="Three sample surfaces cover the two most common questions: what does a Trusted Business Report contain, and how does it read for an investor? Pick whichever matches how you like to explore."
        primaryCta={{ href: "/tbr/demo", label: "Open TBR demo" }}
        secondaryCta={{ href: "/showcase/atlassian?step=1", label: "Open showcase" }}
      />

      <MarketingSection kicker="Three ways to explore">
        <div className="grid gap-4 sm:grid-cols-3">
          {SAMPLES.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="group block rounded-2xl border border-line-subtle bg-white p-5 transition-colors hover:border-brand-500/50"
            >
              <h3 className="text-lg font-semibold text-secondary">{s.title}</h3>
              <p className="mt-2 text-sm text-tertiary">{s.body}</p>
              <span className="mt-4 inline-flex text-sm font-medium text-brand-600 group-hover:underline">
                {s.cta} →
              </span>
            </Link>
          ))}
        </div>
      </MarketingSection>

      <MarketingSection kicker="Ready to run your own?" title="Score your startup in under 10 minutes">
        <p className="max-w-2xl text-sm text-secondary">
          The BlockID Startup Value Index runs 8 dimensions in parallel from the
          evidence you paste in. Free preview, no login, and your data stays yours.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/score"
            className="inline-flex h-11 items-center justify-center rounded-full bg-action px-6 text-sm font-semibold text-on-action transition-colors hover:bg-action-hover"
          >
            Score my startup
          </Link>
          <Link
            href="/tools/idea-clarify"
            className="inline-flex h-11 items-center justify-center rounded-full border border-line px-6 text-sm font-semibold text-primary transition-colors hover:bg-surface-sunken"
          >
            Clarify my idea first
          </Link>
        </div>
      </MarketingSection>

      <MarketingSection>
        <NotFinancialAdvice kind="not_financial_advice" />
      </MarketingSection>
    </MarketingShell>
  );
}
