/**
 * Shared body for /business-id — the Business ID explainer.
 *
 * Extracted so both the EN page at /business-id and the VI mirror at
 * /vi/business-id can render the same anatomy against different locale
 * catalogs. Master Upgrade Plan §7.1 sitemap + §7.7 bilingual rules.
 *
 * Server component. Pure presentation, no data fetch.
 */

import Link from "next/link";
import { ArrowRight, Check, Shield, Users, Layers } from "lucide-react";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { t, type Messages } from "@/lib/i18n/t";

const SIGNUP_HREF = "/signup?intent=business_id";

/**
 * The public sample Business ID this page previews.
 *
 * Backed by a real row — `public_slug='blockid-demo'` seeded by
 * supabase/migrations/0297_seed_demo_business_profile.sql, owned by the
 * operator account and pinned at verification level 3. It is clearly
 * labelled sample data ("BlockID Demo Co (Sample Profile)", fictional
 * attesters, no ABN) so nothing here can be mistaken for a real
 * verified business.
 *
 * src/lib/business-id/public-profile-demo.test.ts guards the row's
 * published state so this preview cannot silently go back to 404ing.
 */
const DEMO_SLUG = "blockid-demo";
const DEMO_BADGE_SRC = `/embed/badge?slug=${DEMO_SLUG}`;

interface VerificationLevel {
  level: string;
  title: string;
  body: string;
}

interface AnalysisPillar {
  cluster: string;
  areas: string[];
}

export interface BusinessIdBodyProps {
  m: Messages;
  lang?: "en" | "vi";
}

export function BusinessIdBody({ m, lang = "en" }: BusinessIdBodyProps) {
  // Keep the reader inside their locale — the VI mirror of the profile
  // lives at /vi/id/[slug] (§7.7 bilingual rule).
  const demoProfileHref =
    lang === "vi" ? `/vi/id/${DEMO_SLUG}` : `/id/${DEMO_SLUG}`;

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
      <div lang={lang}>
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

        {/* (c) 13-area analysis pillars */}
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
            <figure className="max-w-md">
              {/*
                Live badge, not a mock-up. This is the very same
                /embed/badge SVG a third-party site would hotlink,
                rendered for the seeded demo profile (migration 0297).
                Previously this was a hand-drawn SVG with "Level 3 ·
                Updated Jul 2026" baked into the markup, which meant the
                preview could drift from what the endpoint actually
                returns. Pointing at the endpoint keeps them in lockstep.

                The route always answers 200 image/svg+xml (unknown slugs
                get an "Unverified" placeholder), so this can never show
                a broken-image icon. Plain <img> rather than next/image:
                the payload is a dynamic SVG route, so there is nothing
                for the image optimiser to do.
              */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`${DEMO_BADGE_SRC}&size=lg`}
                alt={t(m, "businessId.badge.caption")}
                width={300}
                height={88}
                loading="lazy"
                className="mx-auto h-auto w-full max-w-[300px]"
              />
              <figcaption className="mt-3 text-center text-xs text-[var(--fintech-ink-muted)]">
                {t(m, "businessId.badge.caption")}
              </figcaption>
              <div className="mt-4 text-center">
                <Link
                  href={demoProfileHref}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--fintech-accent)] underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fintech-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--fintech-bg-primary)]"
                >
                  {t(m, "businessId.badge.viewDemo")}
                  <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </Link>
              </div>
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
      </div>
    </MarketingShell>
  );
}
