/**
 * Shared body + metadata helpers for the /id/[slug] public profile page.
 *
 * Master Upgrade Plan §11.1 + §14bis D3 (public-by-default indexable) +
 * §7.7 bilingual rules — extracted so /vi/id/[slug] can render the same
 * anatomy in Vietnamese with `inLanguage: "vi-VN"` on the JSON-LD.
 *
 * Server-only. All strings resolve through `t()` against the locale
 * catalog. Nothing here renders private evidence, financial figures or
 * owner contact data.
 */

import type { Metadata } from "next";
import Script from "next/script";
import Link from "next/link";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { t, type Messages } from "@/lib/i18n/t";
import type { Locale } from "@/lib/i18n/locales";
import type { PublicBusinessProfile } from "@/lib/business-id/public-profile";
import {
  profileChromeKeys,
  isSampleProfile,
  SAMPLE_DATA_JSONLD_NOTICE,
  SAMPLE_DATA_CREDENTIAL_SUFFIX,
} from "@/lib/business-id/profile-disclosure";

const SITE_URL = "https://blockid.au";

const LEVEL_KEYS: Record<number, string> = {
  0: "businessIdPublic.level.0",
  1: "businessIdPublic.level.1",
  2: "businessIdPublic.level.2",
  3: "businessIdPublic.level.3",
  4: "businessIdPublic.level.4",
  5: "businessIdPublic.level.5",
};

function levelLabel(m: Messages, level: number): string {
  return t(m, LEVEL_KEYS[level] ?? "businessIdPublic.level.0");
}

function formatTimestamp(m: Messages, iso: string | null, locale: Locale): string {
  if (!iso) return t(m, "businessIdPublic.date.notYet");
  try {
    const d = new Date(iso);
    const localeTag = locale === "vi" ? "vi-VN" : "en-AU";
    return d.toLocaleDateString(localeTag, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return t(m, "businessIdPublic.date.unknown");
  }
}

function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => {
    const v = vars[k];
    return v === undefined || v === null ? `{${k}}` : String(v);
  });
}

// ─── Metadata builder ───────────────────────────────────────────────

export interface BuildMetadataOpts {
  profile: PublicBusinessProfile | null;
  m: Messages;
  locale: Locale;
}

export function buildProfileMetadata({
  profile,
  m,
  locale,
}: BuildMetadataOpts): Metadata {
  if (!profile) {
    return {
      title: t(m, "businessIdPublic.meta.notFound.title"),
      robots: { index: false, follow: false },
    };
  }

  // Sample-data profiles get their own title suffix + description so the
  // disclosure survives the places the page body never reaches: the
  // browser tab, the SERP snippet, and the OG/Twitter card someone pastes
  // into Slack. A "Verified Business Identity" title on a fictional
  // company is exactly the misread this branch prevents.
  const chrome = profileChromeKeys(profile.profileKind);
  const suffix = t(m, chrome.metaTitleSuffixKey);
  const title = `${profile.legalName} — ${suffix}`;
  const description = interpolate(t(m, chrome.metaDescriptionKey), {
    name: profile.legalName,
    level: profile.verificationLevel,
    score: profile.trustScore,
  });

  const canonical =
    locale === "vi"
      ? `${SITE_URL}/vi/id/${profile.slug}`
      : profile.publicUrl;
  const enUrl = profile.publicUrl;
  const viUrl = `${SITE_URL}/vi/id/${profile.slug}`;

  return {
    title,
    description,
    alternates: {
      canonical,
      languages: {
        en: enUrl,
        vi: viUrl,
        "x-default": enUrl,
      },
    },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: "BlockID.au",
      type: "profile",
      locale: locale === "vi" ? "vi_VN" : "en_AU",
    },
    twitter: { card: "summary_large_image", title, description },
    robots: { index: true, follow: true },
  };
}

// ─── Capability radar ───────────────────────────────────────────────

function CapabilityRadar({
  scores,
  legalName,
  m,
}: {
  scores: Record<string, number>;
  legalName: string;
  m: Messages;
}) {
  const AREAS = [
    "leadership",
    "people",
    "culture",
    "strategy",
    "commercial",
    "brand",
    "ops",
    "performance",
    "risk",
    "tech",
    "digital",
    "data",
  ];
  const cx = 160;
  const cy = 160;
  const rMax = 130;
  const angleStep = (2 * Math.PI) / AREAS.length;

  const points = AREAS.map((area, i) => {
    const raw = scores[area];
    const score = typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
    const r = (Math.max(0, Math.min(100, score)) / 100) * rMax;
    const angle = i * angleStep - Math.PI / 2;
    return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r, area };
  });

  const polyPoints = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const rings = [0.25, 0.5, 0.75, 1].map((f) => f * rMax);

  const radarAria = interpolate(t(m, "businessIdPublic.radar.aria"), {
    name: legalName,
  });
  const radarTitle = interpolate(t(m, "businessIdPublic.radar.title"), {
    name: legalName,
  });

  return (
    <svg
      viewBox="0 0 320 320"
      className="mx-auto h-64 w-64 md:h-80 md:w-80"
      role="img"
      aria-label={radarAria}
    >
      <title>{radarTitle}</title>
      {rings.map((r, i) => (
        <circle
          key={i}
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.15}
          strokeWidth={1}
        />
      ))}
      {points.map((_, i) => (
        <line
          key={i}
          x1={cx}
          y1={cy}
          x2={cx + Math.cos(i * angleStep - Math.PI / 2) * rMax}
          y2={cy + Math.sin(i * angleStep - Math.PI / 2) * rMax}
          stroke="currentColor"
          strokeOpacity={0.1}
          strokeWidth={1}
        />
      ))}
      <polygon
        points={polyPoints}
        fill="currentColor"
        fillOpacity={0.25}
        stroke="currentColor"
        strokeWidth={2}
      />
    </svg>
  );
}

// ─── Page body ──────────────────────────────────────────────────────

export interface PublicProfileBodyProps {
  profile: PublicBusinessProfile;
  m: Messages;
  locale: Locale;
}

export function PublicProfileBody({
  profile,
  m,
  locale,
}: PublicProfileBodyProps) {
  return (
    <MarketingShell>
      <PageBody profile={profile} m={m} locale={locale} />
    </MarketingShell>
  );
}

function PageBody({
  profile,
  m,
  locale,
}: {
  profile: PublicBusinessProfile;
  m: Messages;
  locale: Locale;
}) {
  const label = levelLabel(m, profile.verificationLevel);
  const verifiedOn = formatTimestamp(m, profile.lastVerifiedAt, locale);
  const chrome = profileChromeKeys(profile.profileKind);
  const sample = isSampleProfile(profile.profileKind);

  const ldOrg = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: profile.legalName,
    url:
      locale === "vi"
        ? `${SITE_URL}/vi/id/${profile.slug}`
        : profile.publicUrl,
    inLanguage: locale === "vi" ? "vi-VN" : "en-AU",
    // Structured-data consumers (search engines, aggregators, AI
    // crawlers) never see the visual banner, so the sample-data
    // disclosure has to travel in the JSON-LD too.
    ...(sample
      ? { disambiguatingDescription: SAMPLE_DATA_JSONLD_NOTICE }
      : {}),
    // An ABN identifier is only meaningful for a real entity. A fictional
    // company has none, and emitting `"pending"` would imply one is on
    // its way.
    ...(sample
      ? {}
      : {
          identifier: {
            "@type": "PropertyValue",
            propertyID: "ABN",
            value: "pending",
          },
        }),
    address: {
      "@type": "PostalAddress",
      addressCountry: profile.jurisdiction,
    },
    hasCredential: {
      "@type": "EducationalOccupationalCredential",
      name:
        `BlockID Verified Business Identity Level ${profile.verificationLevel}` +
        (sample ? SAMPLE_DATA_CREDENTIAL_SUFFIX : ""),
      credentialCategory: label,
      recognizedBy: {
        "@type": "Organization",
        name: "Auschain PTY LTD",
        identifier: "ABN 79 659 615 111",
      },
      dateCreated: profile.lastVerifiedAt ?? undefined,
    },
  };

  const trustScoreLabel = interpolate(t(m, chrome.scoreLabelKey), {
    score: profile.trustScore,
  });
  const trustScoreAria = interpolate(t(m, chrome.scoreAriaKey), {
    score: profile.trustScore,
  });
  const lastVerifiedLabel = interpolate(
    t(m, "businessIdPublic.lastVerified.label"),
    { date: verifiedOn },
  );
  const verificationAria = interpolate(
    t(m, "businessIdPublic.verificationAria"),
    { level: profile.verificationLevel, label },
  );
  const shareBody = interpolate(t(m, "businessIdPublic.share.body"), {
    name: profile.legalName,
  });

  return (
    <div lang={locale}>
      <Script
        id="ld-org"
        type="application/ld+json"
        strategy="beforeInteractive"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ldOrg) }}
      />

      {/* ─── Sample-data disclosure ───────────────────────────────── */}
      {/* Above the fold, before the name, before any score. A visitor
          landing cold must learn this is sample data before they read
          anything that looks like a verification claim. */}
      {chrome.disclosure && (
        <section
          role="note"
          aria-labelledby="sample-data-heading"
          data-profile-kind={profile.profileKind}
          className="mx-auto mt-6 max-w-5xl rounded-2xl border-2 border-amber-500/70 bg-amber-500/10 px-6 py-5"
        >
          <p className="text-xs font-bold uppercase tracking-widest text-amber-500">
            {t(m, chrome.disclosure.chipKey)}
          </p>
          <h2
            id="sample-data-heading"
            className="mt-1 text-lg font-semibold md:text-xl"
          >
            {t(m, chrome.disclosure.titleKey)}
          </h2>
          <p className="mt-2 max-w-3xl text-sm opacity-90">
            {t(m, chrome.disclosure.bodyKey)}
          </p>
        </section>
      )}

      {/* ─── Hero ─────────────────────────────────────────────────── */}
      <section
        aria-labelledby="profile-hero-heading"
        className="mx-auto max-w-5xl px-6 pt-12 pb-8 md:pt-20 md:pb-12"
      >
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-[var(--fintech-ink-muted,#8aa)] opacity-80">
              {t(m, chrome.eyebrowKey)}
            </p>
            <h1
              id="profile-hero-heading"
              className="mt-2 text-3xl font-semibold leading-tight md:text-5xl"
            >
              {profile.legalName}
            </h1>
            <div className="mt-4 flex flex-wrap gap-2">
              {chrome.disclosure && (
                <span className="inline-flex items-center rounded-full bg-amber-500 px-3 py-1 text-sm font-bold uppercase tracking-wide text-black">
                  {t(m, chrome.disclosure.chipKey)}
                </span>
              )}
              <span
                className="inline-flex items-center gap-2 rounded-full border border-current px-3 py-1 text-sm font-semibold"
                aria-label={verificationAria}
              >
                <span aria-hidden="true">L{profile.verificationLevel}</span>
                <span>{label}</span>
              </span>
              <span
                className="inline-flex items-center rounded-full bg-[color-mix(in_srgb,currentColor_10%,transparent)] px-3 py-1 text-sm"
                aria-label={trustScoreAria}
              >
                {trustScoreLabel}
              </span>
              <span className="inline-flex items-center rounded-full bg-[color-mix(in_srgb,currentColor_5%,transparent)] px-3 py-1 text-sm opacity-80">
                {lastVerifiedLabel}
              </span>
            </div>
            {profile.badges.length > 0 && (
              <ul
                aria-label={t(m, "businessIdPublic.badges.aria")}
                className="mt-4 flex flex-wrap gap-2"
              >
                {profile.badges.map((b) => (
                  <li
                    key={b}
                    className="rounded-md border border-current/40 px-2 py-1 text-xs uppercase tracking-wide opacity-90"
                  >
                    {b.replace(/-/g, " ")}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="text-[var(--fintech-accent,#4fd1c5)]">
            <CapabilityRadar
              scores={profile.capabilityScores}
              legalName={profile.legalName}
              m={m}
            />
          </div>
        </div>
      </section>

      {/* ─── Capability breakdown ─────────────────────────────────── */}
      <section
        aria-labelledby="capability-heading"
        className="mx-auto max-w-5xl px-6 py-8"
      >
        <h2
          id="capability-heading"
          className="text-2xl font-semibold md:text-3xl"
        >
          {t(m, chrome.capabilityHeadingKey)}
        </h2>
        <p className="mt-2 max-w-2xl text-sm opacity-80">
          {t(m, chrome.capabilityIntroKey)}
        </p>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(profile.capabilityScores).map(([area, score]) => {
            const scoreAria = interpolate(
              t(m, "businessIdPublic.capability.scoreAria"),
              { area, score },
            );
            return (
              <li
                key={area}
                className="rounded-lg border border-current/20 p-4"
              >
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-medium capitalize">{area}</span>
                  <span className="text-lg font-semibold" aria-label={scoreAria}>
                    {score}
                  </span>
                </div>
                <div
                  className="mt-2 h-1.5 w-full rounded-full bg-current/10"
                  aria-hidden="true"
                >
                  <div
                    className="h-1.5 rounded-full bg-current"
                    style={{ width: `${Math.max(0, Math.min(100, score))}%` }}
                  />
                </div>
              </li>
            );
          })}
          {Object.keys(profile.capabilityScores).length === 0 && (
            <li className="col-span-full rounded-lg border border-current/20 p-4 text-sm opacity-70">
              {t(m, "businessIdPublic.capability.empty")}
            </li>
          )}
        </ul>
      </section>

      {/* ─── Attestations ─────────────────────────────────────────── */}
      <section
        aria-labelledby="attestations-heading"
        className="mx-auto max-w-5xl px-6 py-8"
      >
        <h2
          id="attestations-heading"
          className="text-2xl font-semibold md:text-3xl"
        >
          {t(m, chrome.attestationsHeadingKey)}
        </h2>
        {sample && (
          <p className="mt-2 max-w-2xl text-sm opacity-90">
            {t(m, "businessIdPublic.demo.attestations.intro")}
          </p>
        )}
        {profile.attestations.length === 0 ? (
          <p className="mt-2 text-sm opacity-80">
            {t(m, "businessIdPublic.attestations.empty")}
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {profile.attestations.map((a, i) => {
              const issued = interpolate(
                t(m, "businessIdPublic.attestations.issued"),
                { date: formatTimestamp(m, a.issuedAt, locale) },
              );
              return (
                <li
                  key={`${a.attester}-${i}`}
                  className="rounded-lg border border-current/20 p-4"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">{a.attester}</span>
                    <span className="text-xs uppercase tracking-wide opacity-70">
                      {a.type}
                    </span>
                  </div>
                  <p className="mt-1 text-xs opacity-70">{issued}</p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ─── Share-package CTA ────────────────────────────────────── */}
      <section
        aria-labelledby="share-heading"
        className="mx-auto max-w-5xl px-6 py-8"
      >
        <div className="rounded-2xl border border-current/20 p-6 md:p-8">
          {/* A fictional company cannot issue a signed share package, and
              inviting a visitor to "request access" from one would imply
              a counterparty exists. Sample profiles get an explainer CTA
              instead. */}
          <h2
            id="share-heading"
            className="text-xl font-semibold md:text-2xl"
          >
            {t(m, sample ? "businessIdPublic.demo.share.heading" : "businessIdPublic.share.heading")}
          </h2>
          <p className="mt-2 max-w-2xl text-sm opacity-85">
            {sample ? t(m, "businessIdPublic.demo.share.body") : shareBody}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            {sample ? (
              <Link
                href={locale === "vi" ? "/vi/business-id" : "/business-id"}
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--fintech-accent,#4fd1c5)] px-4 py-2 text-sm font-semibold text-[var(--fintech-bg-primary,#0a1622)] focus:outline-none focus:ring-2 focus:ring-[var(--fintech-accent,#4fd1c5)] focus:ring-offset-2 focus:ring-offset-[var(--fintech-bg-primary,#0a1622)]"
              >
                {t(m, "businessIdPublic.demo.share.cta")}
              </Link>
            ) : (
              <>
                <Link
                  href={`/share/request?business=${encodeURIComponent(profile.slug)}`}
                  className="inline-flex items-center gap-2 rounded-lg bg-[var(--fintech-accent,#4fd1c5)] px-4 py-2 text-sm font-semibold text-[var(--fintech-bg-primary,#0a1622)] focus:outline-none focus:ring-2 focus:ring-[var(--fintech-accent,#4fd1c5)] focus:ring-offset-2 focus:ring-offset-[var(--fintech-bg-primary,#0a1622)]"
                >
                  {t(m, "businessIdPublic.share.cta")}
                </Link>
                <Link
                  href={locale === "vi" ? "/vi/business-id" : "/business-id"}
                  className="inline-flex items-center gap-2 rounded-lg border border-current/40 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-current"
                >
                  {t(m, "businessIdPublic.share.explainer")}
                </Link>
              </>
            )}
          </div>
        </div>
      </section>

      {/* ─── Verification proof footer ────────────────────────────── */}
      <section
        aria-labelledby="proof-heading"
        className="mx-auto max-w-5xl px-6 pb-16 pt-4"
      >
        <h2 id="proof-heading" className="sr-only">
          {t(m, "businessIdPublic.proof.srHeading")}
        </h2>
        <p className="text-xs opacity-70">
          {t(m, "businessIdPublic.proof.prefix")}{" "}
          <code className="rounded bg-current/10 px-1 py-0.5">
            blockid://id/{profile.slug}#L{profile.verificationLevel}
          </code>
          {t(m, "businessIdPublic.proof.suffix")}{" "}
          <Link
            href={locale === "vi" ? "/vi/business-id" : "/business-id"}
            className="underline"
          >
            {locale === "vi" ? "/vi/business-id" : "/business-id"}
          </Link>
          {t(m, "businessIdPublic.proof.issuer")}
        </p>
        {sample && (
          <p className="mt-3 text-xs font-medium opacity-90">
            {t(m, "businessIdPublic.demo.footer")}
          </p>
        )}
      </section>
    </div>
  );
}
