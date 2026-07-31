/**
 * /business-id — the explainer page for the Business ID concept.
 *
 * Master Upgrade Plan §7.1 sitemap + user-locked decision D3:
 * `/business-id` explains WHAT a Business ID is (as distinct from
 * `/id/[slug]` which is a public verified profile). This page is a
 * server-rendered evergreen article — no live data, no client state.
 *
 * Anatomy per plan brief:
 *   a. What a Business ID is (identity + evidence + capabilities + reusable)
 *   b. 5 verification levels L1..L5 (stepped visual)
 *   c. 12-area analysis pillars grouped in 4 clusters
 *      (Leadership & People / Strategy & Commercial /
 *       Ops & Performance / Tech & Digital)
 *   d. How sharing works (consent-based, expiry, revocation)
 *   e. Badge widget preview
 *   f. CTA "Create Your Business ID"
 *
 * All strings resolve through `t()` against `en.json` (`businessId.*`
 * keys). VI mirror is a stub for Phase 1 per D4.
 *
 * Server component. Nothing on this page is legal or financial advice.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, Shield, Users, Layers } from "lucide-react";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { getMessages, t } from "@/lib/i18n/t";

const SITE_URL = "https://blockid.au";
const CANONICAL = `${SITE_URL}/business-id`;
const SIGNUP_HREF = "/signup?intent=business_id";

export async function generateMetadata(): Promise<Metadata> {
  const m = await getMessages("en");
  const title = t(m, "businessId.meta.title");
  const description = t(m, "businessId.meta.description");
  return {
    title,
    description,
    alternates: { canonical: CANONICAL },
    openGraph: {
      title,
      description,
      url: CANONICAL,
      siteName: "BlockID.au",
      type: "website",
    },
    twitter: { card: "summary_large_image", title, description },
    robots: { index: true, follow: true },
  };
}

interface VerificationLevel {
  level: string;
  title: string;
  body: string;
}

interface AnalysisPillar {
  cluster: string;
  areas: string[];
}

export default async function BusinessIdPage() {
  const m = await getMessages("en");

  const verificationLevels: VerificationLevel[] = [
    { level: "L1", title: t(m, "businessId.level1.title"), body: t(m, "businessId.level1.body") },
    { level: "L2", title: t(m, "businessId.level2.title"), body: t(m, "businessId.level2.body") },
    { level: "L3", title: t(m, "businessId.level3.title"), body: t(m, "businessId.level3.body") },
    { level: "L4", title: t(m, "businessId.level4.title"), body: t(m, "businessId.level4.body") },
    { level: "L5", title: t(m, "businessId.level5.title"), body: t(m, "businessId.level5.body") },
  ];

  const pillars: AnalysisPillar[] = [
    {
      cluster: t(m, "businessId.pillar1.title"),
      areas: [
        t(m, "businessId.pillar1.a1"),
        t(m, "businessId.pillar1.a2"),
        t(m, "businessId.pillar1.a3"),
      ],
    },
    {
      cluster: t(m, "businessId.pillar2.title"),
      areas: [
        t(m, "businessId.pillar2.a1"),
        t(m, "businessId.pillar2.a2"),
        t(m, "businessId.pillar2.a3"),
      ],
    },
    {
      cluster: t(m, "businessId.pillar3.title"),
      areas: [
        t(m, "businessId.pillar3.a1"),
        t(m, "businessId.pillar3.a2"),
        t(m, "businessId.pillar3.a3"),
      ],
    },
    {
      cluster: t(m, "businessId.pillar4.title"),
      areas: [
        t(m, "businessId.pillar4.a1"),
        t(m, "businessId.pillar4.a2"),
        t(m, "businessId.pillar4.a3"),
      ],
    },
  ];

  return (
    <MarketingShell>
      {/* Hero */}
      <section
        aria-labelledby="business-id-heading"
        className="mx-auto flex max-w-4xl flex-col items-start gap-6 px-6 pt-16 pb-12 sm:pt-24 sm:pb-16"
      >
        <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-[var(--fintech-accent)]">
          {t(m, "businessId.eyebrow")}
        </p>
        <h1
          id="business-id-heading"
          className="font-display text-balance text-3xl font-semibold tracking-tight text-[var(--fintech-ink)] sm:text-4xl md:text-5xl"
        >
          {t(m, "businessId.headline")}
        </h1>
        <p className="max-w-2xl text-lg leading-relaxed text-[var(--fintech-ink-muted)]">
          {t(m, "businessId.subhead")}
        </p>
        <Link
          href={SIGNUP_HREF}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[var(--fintech-accent)] px-6 text-sm font-semibold text-[var(--fintech-bg-primary)] shadow-[0_8px_24px_-8px_rgba(34,211,238,0.6)] transition-all duration-200 hover:bg-[var(--fintech-accent-hover)] hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fintech-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--fintech-bg-primary)]"
        >
          {t(m, "hero.v3.cta.primary.signedOut")}
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </Link>
      </section>

      {/* (a) What a Business ID is */}
      <section
        aria-labelledby="business-id-what"
        className="mx-auto max-w-5xl px-6 py-12"
      >
        <h2
          id="business-id-what"
          className="font-display text-2xl font-semibold tracking-tight text-[var(--fintech-ink)] sm:text-3xl"
        >
          {t(m, "businessId.what.title")}
        </h2>
        <p className="mt-4 max-w-3xl text-base leading-relaxed text-[var(--fintech-ink-muted)]">
          {t(m, "businessId.what.intro")}
        </p>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { key: "identity", icon: Shield },
            { key: "evidence", icon: Layers },
            { key: "capabilities", icon: Check },
            { key: "reusable", icon: Users },
          ].map(({ key, icon: Icon }) => (
            <li
              key={key}
              className="rounded-2xl border border-[var(--fintech-border)] bg-[var(--fintech-bg-elevated)] p-6"
            >
              <div className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--fintech-accent)]/15 text-[var(--fintech-accent)]">
                <Icon aria-hidden="true" className="h-4 w-4" />
              </div>
              <h3 className="mt-3 font-display text-base font-semibold text-[var(--fintech-ink)]">
                {t(m, `businessId.what.${key}.title`)}
              </h3>
              <p className="mt-2 text-sm text-[var(--fintech-ink-muted)]">
                {t(m, `businessId.what.${key}.body`)}
              </p>
            </li>
          ))}
        </ul>
      </section>

      {/* (b) 5 verification levels — stepped visual */}
      <section
        aria-labelledby="business-id-levels"
        className="mx-auto max-w-5xl px-6 py-12"
      >
        <h2
          id="business-id-levels"
          className="font-display text-2xl font-semibold tracking-tight text-[var(--fintech-ink)] sm:text-3xl"
        >
          {t(m, "businessId.levels.title")}
        </h2>
        <p className="mt-4 max-w-3xl text-base leading-relaxed text-[var(--fintech-ink-muted)]">
          {t(m, "businessId.levels.intro")}
        </p>
        <ol className="mt-8 space-y-3">
          {verificationLevels.map((lvl, i) => (
            <li
              key={lvl.level}
              className="grid grid-cols-[auto_1fr] items-start gap-4 rounded-2xl border border-[var(--fintech-border)] bg-[var(--fintech-surface)] p-5"
            >
              <div
                aria-hidden="true"
                className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--fintech-accent)]/15 font-mono text-sm font-semibold text-[var(--fintech-accent)]"
              >
                {lvl.level}
              </div>
              <div>
                <p className="font-display text-base font-semibold text-[var(--fintech-ink)]">
                  <span className="sr-only">Verification level {i + 1}: </span>
                  {lvl.title}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-[var(--fintech-ink-muted)]">
                  {lvl.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* (c) 12-area analysis pillars */}
      <section
        aria-labelledby="business-id-pillars"
        className="mx-auto max-w-5xl px-6 py-12"
      >
        <h2
          id="business-id-pillars"
          className="font-display text-2xl font-semibold tracking-tight text-[var(--fintech-ink)] sm:text-3xl"
        >
          {t(m, "businessId.pillars.title")}
        </h2>
        <p className="mt-4 max-w-3xl text-base leading-relaxed text-[var(--fintech-ink-muted)]">
          {t(m, "businessId.pillars.intro")}
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {pillars.map((pillar) => (
            <div
              key={pillar.cluster}
              className="rounded-2xl border border-[var(--fintech-border)] bg-[var(--fintech-bg-elevated)] p-6"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--fintech-accent)]">
                {pillar.cluster}
              </p>
              <ul className="mt-4 space-y-2">
                {pillar.areas.map((area) => (
                  <li
                    key={area}
                    className="flex items-start gap-2 text-sm text-[var(--fintech-ink)]"
                  >
                    <Check
                      aria-hidden="true"
                      className="mt-0.5 h-4 w-4 shrink-0 text-[var(--fintech-accent)]"
                    />
                    <span>{area}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* (d) How sharing works */}
      <section
        aria-labelledby="business-id-sharing"
        className="mx-auto max-w-5xl px-6 py-12"
      >
        <h2
          id="business-id-sharing"
          className="font-display text-2xl font-semibold tracking-tight text-[var(--fintech-ink)] sm:text-3xl"
        >
          {t(m, "businessId.sharing.title")}
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-[var(--fintech-border)] bg-[var(--fintech-surface)] p-6">
            <h3 className="font-display text-base font-semibold text-[var(--fintech-ink)]">
              {t(m, "businessId.sharing.consent.title")}
            </h3>
            <p className="mt-2 text-sm text-[var(--fintech-ink-muted)]">
              {t(m, "businessId.sharing.consent.body")}
            </p>
          </div>
          <div className="rounded-2xl border border-[var(--fintech-border)] bg-[var(--fintech-surface)] p-6">
            <h3 className="font-display text-base font-semibold text-[var(--fintech-ink)]">
              {t(m, "businessId.sharing.expiry.title")}
            </h3>
            <p className="mt-2 text-sm text-[var(--fintech-ink-muted)]">
              {t(m, "businessId.sharing.expiry.body")}
            </p>
          </div>
          <div className="rounded-2xl border border-[var(--fintech-border)] bg-[var(--fintech-surface)] p-6">
            <h3 className="font-display text-base font-semibold text-[var(--fintech-ink)]">
              {t(m, "businessId.sharing.revocation.title")}
            </h3>
            <p className="mt-2 text-sm text-[var(--fintech-ink-muted)]">
              {t(m, "businessId.sharing.revocation.body")}
            </p>
          </div>
        </div>
      </section>

      {/* (e) Badge widget preview */}
      <section
        aria-labelledby="business-id-badge"
        className="mx-auto max-w-5xl px-6 py-12"
      >
        <h2
          id="business-id-badge"
          className="font-display text-2xl font-semibold tracking-tight text-[var(--fintech-ink)] sm:text-3xl"
        >
          {t(m, "businessId.badge.title")}
        </h2>
        <p className="mt-4 max-w-3xl text-base leading-relaxed text-[var(--fintech-ink-muted)]">
          {t(m, "businessId.badge.intro")}
        </p>
        <div className="mt-8 flex justify-center">
          {/* Inline SVG badge preview — no external assets, WCAG-labelled */}
          <figure className="max-w-md">
            <svg
              role="img"
              aria-labelledby="badge-preview-title"
              viewBox="0 0 320 120"
              className="h-auto w-full"
            >
              <title id="badge-preview-title">
                Sample BlockID Trust badge — Verified L3, updated Jul 2026
              </title>
              <rect
                x="4"
                y="4"
                width="312"
                height="112"
                rx="14"
                fill="var(--fintech-bg-elevated)"
                stroke="var(--fintech-accent)"
                strokeWidth="1.5"
              />
              <g transform="translate(24 24)">
                <circle cx="22" cy="22" r="20" fill="var(--fintech-accent)" fillOpacity="0.15" />
                <path
                  d="M22 8 L34 14 L34 24 A14 14 0 0 1 22 36 A14 14 0 0 1 10 24 L10 14 Z"
                  fill="var(--fintech-accent)"
                  fillOpacity="0.9"
                />
                <path
                  d="M17 22 L21 26 L28 18"
                  stroke="var(--fintech-bg-primary)"
                  strokeWidth="2.5"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
              <g transform="translate(84 30)" fill="var(--fintech-ink)">
                <text x="0" y="14" fontFamily="var(--font-display, sans-serif)" fontSize="14" fontWeight="600">
                  Verified Business ID
                </text>
                <text x="0" y="34" fontFamily="var(--font-mono, monospace)" fontSize="11" fill="var(--fintech-ink-muted)">
                  Level 3 · Updated Jul 2026
                </text>
                <text x="0" y="52" fontFamily="var(--font-mono, monospace)" fontSize="10" fill="var(--fintech-accent)">
                  blockid.au/id/blockid-demo
                </text>
              </g>
            </svg>
            <figcaption className="mt-3 text-center text-xs text-[var(--fintech-ink-muted)]">
              {t(m, "businessId.badge.caption")}
            </figcaption>
          </figure>
        </div>
      </section>

      {/* (f) Final CTA */}
      <section
        aria-labelledby="business-id-cta"
        className="mx-auto max-w-4xl px-6 pb-16"
      >
        <div className="rounded-3xl border border-[var(--fintech-border-strong)] bg-[var(--fintech-bg-elevated)] p-8 text-center shadow-2xl sm:p-12">
          <h2
            id="business-id-cta"
            className="font-display text-2xl font-semibold tracking-tight text-[var(--fintech-ink)] sm:text-3xl"
          >
            {t(m, "businessId.cta.title")}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm text-[var(--fintech-ink-muted)]">
            {t(m, "hero.v3.outcome")}
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              href={SIGNUP_HREF}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[var(--fintech-accent)] px-6 text-sm font-semibold text-[var(--fintech-bg-primary)] transition-colors duration-200 hover:bg-[var(--fintech-accent-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fintech-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--fintech-bg-primary)]"
            >
              {t(m, "hero.v3.cta.primary.signedOut")}
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
            <Link
              href="/reports/samples"
              className="inline-flex h-12 items-center justify-center rounded-xl border border-[var(--fintech-border-strong)] px-6 text-sm font-medium text-[var(--fintech-ink)] transition-colors duration-200 hover:bg-[var(--fintech-surface)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fintech-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--fintech-bg-primary)]"
            >
              {t(m, "hero.v3.cta.secondary")}
            </Link>
          </div>
          <p className="mt-6 text-xs text-[var(--fintech-ink-muted)]">
            {t(m, "businessId.disclaimer")}
          </p>
        </div>
      </section>
    </MarketingShell>
  );
}
