/**
 * /for/[segment] — per-audience landing pages.
 *
 * Server component. One dynamic route handling four segment slugs
 * (founder / investor / advisor / accelerator). Invalid slugs 404.
 *
 * Everything on this page is server-rendered from the SEGMENT_CONTENT
 * map — no data fetching, no client-side state — so the route is
 * safely static and cheap to CDN.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Check } from "lucide-react";
import { NavV2 } from "@/components/landing/nav-v2";
import { NotFinancialAdvice } from "@/components/legal/not-financial-advice";
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
    <div
      data-theme="lux"
      className="min-h-svh bg-brand-navy-deep text-brand-ink"
    >
      <NavV2 />

      {/* Hero band */}
      <section className="bg-brand-navy">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-cyan">
            BlockID for {content.label}
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-brand-ink sm:text-5xl">
            {content.hero.headline}
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-brand-ink-muted">
            {content.hero.subhead}
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href={`/onboarding?segment=${content.slug}`}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-brand-cyan px-5 text-sm font-semibold text-brand-navy transition duration-200 hover:bg-brand-blue-bright focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-brand-navy"
            >
              Start free trial
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link
              href={`/pricing?segment=${content.slug}`}
              className="inline-flex h-11 items-center justify-center rounded-lg border border-brand-ink/20 px-5 text-sm font-semibold text-brand-ink transition-colors duration-200 hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
            >
              See pricing
            </Link>
          </div>
        </div>
      </section>

      {/* What's included */}
      <section className="border-t border-white/5">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight text-brand-ink sm:text-3xl">
            What&apos;s included
          </h2>
          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {content.features.map((f) => (
              <li
                key={f}
                className="flex items-start gap-3 rounded-xl border border-white/10 bg-brand-navy/60 p-4"
              >
                <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-cyan/10 text-brand-cyan">
                  <Check className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="text-sm text-brand-ink">{f}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-white/5 bg-brand-navy/40">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight text-brand-ink sm:text-3xl">
            How it works
          </h2>
          <ol className="mt-8 grid gap-4 sm:grid-cols-3">
            {content.steps.map((step, i) => (
              <li
                key={step}
                className="rounded-xl border border-white/10 bg-brand-navy p-5"
              >
                <div className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand-cyan text-sm font-semibold text-brand-navy">
                  {i + 1}
                </div>
                <p className="mt-3 text-sm text-brand-ink">{step}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Pricing anchor */}
      <section className="border-t border-white/5">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight text-brand-ink sm:text-3xl">
            Right-sized for {content.label.toLowerCase()}
          </h2>
          <div className="mt-8 max-w-2xl rounded-2xl border border-brand-cyan/30 bg-brand-navy/60 p-6 shadow-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-cyan">
              Recommended plan
            </p>
            <p className="mt-2 text-2xl font-semibold text-brand-ink">
              {content.planAnchor.label}
            </p>
            <p className="mt-1 text-sm text-brand-ink-muted">
              {content.planAnchor.price} · 7-day free trial · cancel anytime
              before Day 8.
            </p>
            <Link
              href={`/pricing?segment=${content.slug}#${content.planAnchor.id}`}
              className="mt-6 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-cyan px-4 text-sm font-semibold text-brand-navy transition duration-200 hover:bg-brand-blue-bright focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-brand-navy"
            >
              See full pricing matrix
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t border-white/5 bg-brand-navy/40">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight text-brand-ink sm:text-3xl">
            Frequently asked
          </h2>
          <dl className="mt-8 space-y-4">
            {content.faq.map((f) => (
              <div
                key={f.q}
                className="rounded-xl border border-white/10 bg-brand-navy p-5"
              >
                <dt className="text-base font-semibold text-brand-ink">
                  {f.q}
                </dt>
                <dd className="mt-2 text-sm text-brand-ink-muted">{f.a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* CTA strip */}
      <section className="border-t border-white/5 bg-brand-navy">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-4 py-12 sm:flex-row sm:items-center sm:px-6">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-brand-ink">
              Ready to try it?
            </h2>
            <p className="mt-1 text-sm text-brand-ink-muted">
              Seven days free. No charge until Day 8. Cancel anytime.
            </p>
          </div>
          <Link
            href={`/onboarding?segment=${content.slug}`}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-brand-cyan px-5 text-sm font-semibold text-brand-navy transition duration-200 hover:bg-brand-blue-bright focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-brand-navy"
          >
            Start free trial
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </section>

      {/* Compact footer with legal disclaimer */}
      <footer className="border-t border-white/5 bg-brand-navy-deep">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-xs text-brand-ink-muted">
              &copy; {new Date().getFullYear()} Auschain Pty Ltd (ACN 659 615
              111). BlockID.au.
            </p>
            <nav aria-label="Footer">
              <ul className="flex flex-wrap items-center gap-4 text-xs text-brand-ink-muted">
                <li>
                  <Link href="/pricing" className="hover:text-brand-ink">
                    Pricing
                  </Link>
                </li>
                <li>
                  <Link href="/roadmap" className="hover:text-brand-ink">
                    Roadmap
                  </Link>
                </li>
                <li>
                  <Link href="/changelog" className="hover:text-brand-ink">
                    Changelog
                  </Link>
                </li>
                <li>
                  <Link href="/privacy" className="hover:text-brand-ink">
                    Privacy
                  </Link>
                </li>
              </ul>
            </nav>
          </div>
          <div className="mt-6">
            <NotFinancialAdvice kind="not_financial_advice" compact />
          </div>
        </div>
      </footer>
    </div>
  );
}
