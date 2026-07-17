/**
 * /for/[segment] — per-audience landing pages.
 *
 * Server component. One dynamic route handling four segment slugs
 * (founder / investor / advisor / accelerator). Invalid slugs 404.
 *
 * Everything on this page is server-rendered from the SEGMENT_CONTENT
 * map — no data fetching, no client-side state.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Check } from "lucide-react";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { MarketingHero } from "@/components/marketing/marketing-hero";
import { MarketingSection } from "@/components/marketing/marketing-section";
import { MarketingCtaStrip } from "@/components/marketing/marketing-cta-strip";
import {
  SEGMENT_CONTENT,
  SEGMENT_SLUGS,
  isSegmentSlug,
  type SegmentSlug,
} from "./segment-content";

const SITE_URL = "https://blockid.au";

export function generateStaticParams(): { segment: SegmentSlug }[] {
  return SEGMENT_SLUGS.map((segment) => ({ segment }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ segment: string }>;
}): Promise<Metadata> {
  const { segment } = await params;
  if (!isSegmentSlug(segment)) return {};
  const content = SEGMENT_CONTENT[segment];
  const title = `${content.label} — BlockID.au`;
  const description = content.hero.subhead;
  const canonical = `${SITE_URL}/for/${content.slug}`;
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: "BlockID.au",
      type: "website",
    },
    twitter: { card: "summary_large_image", title, description },
    robots: { index: true, follow: true },
  };
}

export default async function ForSegmentPage({
  params,
}: {
  params: Promise<{ segment: string }>;
}) {
  const { segment } = await params;
  if (!isSegmentSlug(segment)) notFound();
  const content = SEGMENT_CONTENT[segment];

  return (
    <MarketingShell>
      <MarketingHero
        eyebrow={`BlockID for ${content.label}`}
        title={content.hero.headline}
        subtitle={content.hero.subhead}
        primaryCta={{
          href: `/onboarding?segment=${content.slug}`,
          label: "Start free trial",
        }}
        secondaryCta={{
          href: `/pricing?segment=${content.slug}`,
          label: "See pricing",
        }}
      />

      <MarketingSection tone="elevated" title="What's included" kicker="Scope">
        <ul className="grid gap-3 sm:grid-cols-2">
          {content.features.map((f) => (
            <li
              key={f}
              className="flex items-start gap-3 rounded-xl border border-[var(--fintech-border)] bg-[var(--fintech-surface)] p-4"
            >
              <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--fintech-bg-primary)] text-[var(--fintech-accent)]">
                <Check className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="text-sm text-[var(--fintech-ink)]">{f}</span>
            </li>
          ))}
        </ul>
      </MarketingSection>

      <MarketingSection title="How it works" kicker="Flow">
        <ol className="grid gap-4 sm:grid-cols-3">
          {content.steps.map((step, i) => (
            <li
              key={step}
              className="rounded-xl border border-[var(--fintech-border)] bg-[var(--fintech-bg-elevated)] p-5"
            >
              <div className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--fintech-accent)] font-display text-sm font-semibold text-[var(--fintech-bg-primary)]">
                {i + 1}
              </div>
              <p className="mt-3 text-sm text-[var(--fintech-ink)]">{step}</p>
            </li>
          ))}
        </ol>
      </MarketingSection>

      <MarketingSection
        tone="elevated"
        title={`Right-sized for ${content.label.toLowerCase()}`}
        kicker="Plan"
      >
        <div className="max-w-2xl rounded-2xl border border-[var(--fintech-border-strong)] bg-[var(--fintech-surface)] p-6 shadow-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--fintech-accent)]">
            Recommended plan
          </p>
          <p className="mt-2 font-display text-2xl font-semibold text-[var(--fintech-ink)]">
            {content.planAnchor.label}
          </p>
          <p className="mt-1 text-sm text-[var(--fintech-ink-muted)]">
            {content.planAnchor.price} · 7-day free trial · cancel anytime
            before Day 8.
          </p>
          <Link
            href={`/pricing?segment=${content.slug}#${content.planAnchor.id}`}
            className="mt-6 inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[var(--fintech-accent)] px-4 text-sm font-semibold text-[var(--fintech-bg-primary)] transition-colors duration-200 ease-out hover:bg-[var(--fintech-accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fintech-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--fintech-bg-primary)]"
          >
            See full pricing matrix
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </MarketingSection>

      <MarketingSection title="Frequently asked" kicker="FAQ">
        <dl className="space-y-4">
          {content.faq.map((f) => (
            <div
              key={f.q}
              className="rounded-xl border border-[var(--fintech-border)] bg-[var(--fintech-bg-elevated)] p-5"
            >
              <dt className="text-base font-semibold text-[var(--fintech-ink)]">
                {f.q}
              </dt>
              <dd className="mt-2 text-sm text-[var(--fintech-ink-muted)]">{f.a}</dd>
            </div>
          ))}
        </dl>
      </MarketingSection>

      <MarketingCtaStrip
        headline="Seven days free. No charge until Day 8."
        primary={{
          href: `/onboarding?segment=${content.slug}`,
          label: "Start free trial",
        }}
        secondary={{
          href: `/pricing?segment=${content.slug}`,
          label: "See pricing",
        }}
      />
    </MarketingShell>
  );
}
