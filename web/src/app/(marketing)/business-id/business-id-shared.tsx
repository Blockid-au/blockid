/**
 * Shared body for /business-id — the Business ID explainer.
 *
 * Extracted so both the EN page at /business-id and the VI mirror at
 * /vi/business-id can render the same anatomy against different locale
 * catalogs. Master Upgrade Plan §7.1 sitemap + §7.7 bilingual rules.
 *
 * G17 P2-A: rendered on the unicorn template — PageHero → Section × 5 →
 * CtaBand — with stable section ids (`what · levels · pillars · sharing ·
 * badge`). The "Create Your Business ID" CTA lands on /signup (the old
 * `/founding-50` target is a 301 to /pricing since the promo retired).
 *
 * Server component. Pure presentation, no data fetch.
 */

import Link from "next/link";
import { ArrowRight, Check, Clock, KeyRound, Layers, Shield, Undo2, Users } from "lucide-react";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { CtaBand, FeatureGrid, FOCUS_RING, PageHero, Section } from "@/components/marketing/template";
import { t, type Messages } from "@/lib/i18n/t";

const SIGNUP_HREF = "/signup";

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
        <PageHero
          eyebrow={t(m, "businessId.eyebrow")}
          title={t(m, "businessId.headline")}
          sub={t(m, "businessId.subhead")}
          ctas={[
            { href: SIGNUP_HREF, label: t(m, "hero.v3.cta.primary.signedOut"), ctaId: "business_id_hero_signup" },
            { href: demoProfileHref, label: t(m, "businessId.badge.viewDemo") },
          ]}
          align="start"
        />

        {/* (a) What a Business ID is */}
        <Section id="what" title={t(m, "businessId.what.title")} lede={t(m, "businessId.what.intro")} tone="sunken">
          <FeatureGrid
            columns={4}
            ariaLabel={t(m, "businessId.what.title")}
            items={[
              { key: "identity", icon: Shield },
              { key: "evidence", icon: Layers },
              { key: "capabilities", icon: Check },
              { key: "reusable", icon: Users },
            ].map(({ key, icon }) => ({
              icon,
              title: t(m, `businessId.what.${key}.title`),
              body: t(m, `businessId.what.${key}.body`),
            }))}
          />
        </Section>

        {/* (b) 5 verification levels — stepped visual */}
        <Section id="levels" title={t(m, "businessId.levels.title")} lede={t(m, "businessId.levels.intro")}>
          <ol className="space-y-3">
            {verificationLevels.map((lvl, i) => (
              <li
                key={lvl.level}
                className="grid grid-cols-[auto_1fr] items-start gap-4 rounded-xl border border-line-subtle bg-surface p-5 shadow-1"
              >
                <div
                  aria-hidden="true"
                  className="flex h-11 w-11 items-center justify-center rounded-lg bg-accent-soft font-mono text-sm font-semibold text-accent"
                >
                  {lvl.level}
                </div>
                <div>
                  <h3 className="font-display text-lg font-semibold tracking-tight text-primary">
                    <span className="sr-only">Verification level {i + 1}: </span>
                    {lvl.title}
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed text-secondary">
                    {lvl.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </Section>

        {/* (c) 13-area analysis pillars */}
        <Section id="pillars" title={t(m, "businessId.pillars.title")} lede={t(m, "businessId.pillars.intro")} tone="sunken">
          <div className="grid gap-4 sm:grid-cols-2 sm:gap-6">
            {pillars.map((pillar) => (
              <div
                key={pillar.cluster}
                className="rounded-xl border border-line-subtle bg-surface p-6 shadow-1"
              >
                <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
                  {pillar.cluster}
                </h3>
                <ul className="mt-4 space-y-2">
                  {pillar.areas.map((area) => (
                    <li
                      key={area}
                      className="flex items-start gap-2 text-sm text-primary"
                    >
                      <Check
                        aria-hidden="true"
                        className="mt-0.5 h-4 w-4 shrink-0 text-action"
                      />
                      <span>{area}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Section>

        {/* (d) How sharing works */}
        <Section id="sharing" title={t(m, "businessId.sharing.title")}>
          <FeatureGrid
            columns={3}
            ariaLabel={t(m, "businessId.sharing.title")}
            items={[
              { key: "consent", icon: KeyRound },
              { key: "expiry", icon: Clock },
              { key: "revocation", icon: Undo2 },
            ].map(({ key, icon }) => ({
              icon,
              title: t(m, `businessId.sharing.${key}.title`),
              body: t(m, `businessId.sharing.${key}.body`),
            }))}
          />
        </Section>

        {/* (e) Badge widget preview */}
        <Section id="badge" title={t(m, "businessId.badge.title")} lede={t(m, "businessId.badge.intro")} tone="sunken" align="center">
          <div className="flex justify-center">
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
              <figcaption className="mt-3 text-center text-xs text-secondary">
                {t(m, "businessId.badge.caption")}
              </figcaption>
              <div className="mt-4 text-center">
                <Link
                  href={demoProfileHref}
                  className={`inline-flex min-h-11 items-center gap-1.5 rounded-md text-sm font-medium text-action underline-offset-4 hover:underline ${FOCUS_RING}`}
                >
                  {t(m, "businessId.badge.viewDemo")}
                  <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </Link>
              </div>
            </figure>
          </div>
        </Section>

        {/* (f) Final CTA */}
        <CtaBand
          title={t(m, "businessId.cta.title")}
          sub={t(m, "hero.v3.outcome")}
          primary={{ href: SIGNUP_HREF, label: t(m, "hero.v3.cta.primary.signedOut"), ctaId: "business_id_final_signup" }}
          secondary={{ href: "/reports/samples", label: t(m, "hero.v3.cta.secondary") }}
          footnote={t(m, "businessId.disclaimer")}
          tone="base"
        />
      </div>
    </MarketingShell>
  );
}
