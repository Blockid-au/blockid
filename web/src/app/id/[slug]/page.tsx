/**
 * /id/[slug] — Public Verified Business Profile page.
 *
 * Master Upgrade Plan §11.1 (Business ID as first-class object,
 * `Organization`+`EducationalOccupationalCredential` JSON-LD, public
 * URL under /id/{slug}) + §14bis user-locked decision D3
 * (public-by-default indexable; owner opt-out via
 * `share_settings.public_index=false` flips this page to noindex).
 *
 * Server component — no client state. Data comes from
 * `readPublicProfile(slug)` which enforces the PII whitelist. Nothing
 * on this page renders any private evidence, financial figures, or
 * owner contact data.
 *
 * WCAG 2.2 AA: header/main/footer landmarks (via MarketingShell +
 * `<section aria-labelledby>`), skip-link inherited, visible focus
 * from the shell theme, alt-text on the SVG, chip contrast ≥ 4.5:1.
 *
 * VI mirror deferred (Phase 1 D4). All strings EN inline for now.
 */

import type { Metadata } from "next";
import Script from "next/script";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import {
  readPublicProfile,
  type PublicBusinessProfile,
} from "@/lib/business-id/public-profile";

// Force dynamic — every profile view hits the DB. Nightly re-verify
// jobs invalidate freshness; ISR would add stale-badge risk.
export const dynamic = "force-dynamic";
export const revalidate = 0;

interface RouteParams {
  params: Promise<{ slug: string }>;
}

// ─── Metadata + robots gating per §14bis D3 ─────────────────────────

export async function generateMetadata({
  params,
}: RouteParams): Promise<Metadata> {
  const { slug } = await params;
  const profile = await readPublicProfile(slug);

  if (!profile) {
    // 404 metadata — don't let a broken URL surface a "verified" claim
    return {
      title: "Business profile not found — BlockID.au",
      robots: { index: false, follow: false },
    };
  }

  const title = `${profile.legalName} — Verified Business Identity`;
  const description = `${profile.legalName} holds a Level ${profile.verificationLevel} BlockID Verified Business Identity (trust score ${profile.trustScore}). Review capability scores, attestations, and verification proof.`;

  // Note: readPublicProfile already filters `public_index=true` so a
  // profile here is always indexable in the current row. The explicit
  // index:true keeps intent readable; noindex would only trip on a
  // future variant that lets `public_index=false` rows render (they do
  // not today).
  return {
    title,
    description,
    alternates: { canonical: profile.publicUrl },
    openGraph: {
      title,
      description,
      url: profile.publicUrl,
      siteName: "BlockID.au",
      type: "profile",
    },
    twitter: { card: "summary_large_image", title, description },
    robots: { index: true, follow: true },
  };
}

// ─── Helpers ────────────────────────────────────────────────────────

const LEVEL_LABELS: Record<number, string> = {
  0: "Unverified",
  1: "Self-declared",
  2: "Evidence-checked",
  3: "Trust tier",
  4: "Attested",
  5: "Continuously monitored",
};

function formatTimestamp(iso: string | null): string {
  if (!iso) return "not yet verified";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-AU", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return "unknown";
  }
}

// ─── Capability radar (SVG) — 12-area preview ───────────────────────

/**
 * Pure SVG radar. No client JS. Missing scores render as 0 spokes so
 * a partial capability_scores map still draws cleanly.
 */
function CapabilityRadar({
  scores,
  legalName,
}: {
  scores: Record<string, number>;
  legalName: string;
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

  // Concentric guide rings at 25 / 50 / 75 / 100
  const rings = [0.25, 0.5, 0.75, 1].map((f) => f * rMax);

  return (
    <svg
      viewBox="0 0 320 320"
      className="mx-auto h-64 w-64 md:h-80 md:w-80"
      role="img"
      aria-label={`Capability radar for ${legalName} across 12 verification areas`}
    >
      <title>{`Capability radar for ${legalName}`}</title>
      {/* Guide rings */}
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
      {/* Spokes */}
      {points.map((p, i) => (
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
      {/* Score polygon */}
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

// ─── Page ───────────────────────────────────────────────────────────

export default async function PublicBusinessIdPage({ params }: RouteParams) {
  const { slug } = await params;
  const profile = await readPublicProfile(slug);
  if (!profile) notFound();

  return (
    <MarketingShell>
      <PageBody profile={profile} />
    </MarketingShell>
  );
}

function PageBody({ profile }: { profile: PublicBusinessProfile }) {
  const levelLabel = LEVEL_LABELS[profile.verificationLevel] ?? "Unverified";
  const verifiedOn = formatTimestamp(profile.lastVerifiedAt);

  // JSON-LD structured data. `identifier` mirrors §11.1 (ABN placeholder
  // until first-class businesses table lands). Credential type is the
  // schema.org `EducationalOccupationalCredential` — closest match for
  // a business verification credential per §11.1 spec.
  const ldOrg = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: profile.legalName,
    url: profile.publicUrl,
    identifier: {
      "@type": "PropertyValue",
      propertyID: "ABN",
      value: "pending", // populated when first-class businesses table lands
    },
    address: {
      "@type": "PostalAddress",
      addressCountry: profile.jurisdiction,
    },
    hasCredential: {
      "@type": "EducationalOccupationalCredential",
      name: `BlockID Verified Business Identity Level ${profile.verificationLevel}`,
      credentialCategory: levelLabel,
      recognizedBy: {
        "@type": "Organization",
        name: "Auschain PTY LTD",
        identifier: "ABN 79 659 615 111",
      },
      dateCreated: profile.lastVerifiedAt ?? undefined,
    },
  };

  return (
    <>
      <Script
        id="ld-org"
        type="application/ld+json"
        strategy="beforeInteractive"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ldOrg) }}
      />

      {/* ─── Hero ─────────────────────────────────────────────────── */}
      <section
        aria-labelledby="profile-hero-heading"
        className="mx-auto max-w-5xl px-6 pt-12 pb-8 md:pt-20 md:pb-12"
      >
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-[var(--fintech-ink-muted,#8aa)] opacity-80">
              Verified Business Identity
            </p>
            <h1
              id="profile-hero-heading"
              className="mt-2 text-3xl font-semibold leading-tight md:text-5xl"
            >
              {profile.legalName}
            </h1>
            <div className="mt-4 flex flex-wrap gap-2">
              <span
                className="inline-flex items-center gap-2 rounded-full border border-current px-3 py-1 text-sm font-semibold"
                aria-label={`Verification level ${profile.verificationLevel}: ${levelLabel}`}
              >
                <span aria-hidden="true">L{profile.verificationLevel}</span>
                <span>{levelLabel}</span>
              </span>
              <span
                className="inline-flex items-center rounded-full bg-[color-mix(in_srgb,currentColor_10%,transparent)] px-3 py-1 text-sm"
                aria-label={`Trust score ${profile.trustScore} of 100`}
              >
                Trust score {profile.trustScore}/100
              </span>
              <span className="inline-flex items-center rounded-full bg-[color-mix(in_srgb,currentColor_5%,transparent)] px-3 py-1 text-sm opacity-80">
                Last verified {verifiedOn}
              </span>
            </div>
            {profile.badges.length > 0 && (
              <ul
                aria-label="Verification badges"
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
          Capability scores
        </h2>
        <p className="mt-2 max-w-2xl text-sm opacity-80">
          Twelve verification areas across Leadership &amp; People, Strategy
          &amp; Commercial, Ops &amp; Performance, and Tech &amp; Digital.
          Public scores only — raw evidence is never disclosed.
        </p>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(profile.capabilityScores).map(([area, score]) => (
            <li
              key={area}
              className="rounded-lg border border-current/20 p-4"
            >
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium capitalize">{area}</span>
                <span className="text-lg font-semibold" aria-label={`${area} score ${score} of 100`}>
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
          ))}
          {Object.keys(profile.capabilityScores).length === 0 && (
            <li className="col-span-full rounded-lg border border-current/20 p-4 text-sm opacity-70">
              Capability scores not yet published.
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
          Attestations
        </h2>
        {profile.attestations.length === 0 ? (
          <p className="mt-2 text-sm opacity-80">
            No third-party attestations published yet.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {profile.attestations.map((a, i) => (
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
                <p className="mt-1 text-xs opacity-70">
                  Issued {formatTimestamp(a.issuedAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ─── Share-package CTA ────────────────────────────────────── */}
      <section
        aria-labelledby="share-heading"
        className="mx-auto max-w-5xl px-6 py-8"
      >
        <div className="rounded-2xl border border-current/20 p-6 md:p-8">
          <h2
            id="share-heading"
            className="text-xl font-semibold md:text-2xl"
          >
            Requested access?
          </h2>
          <p className="mt-2 max-w-2xl text-sm opacity-85">
            Investors, partners, or regulators can request a signed share
            package — Trust Report PDF, QR verification proof, JSON-LD, and
            W3C Verifiable Credential JWT — from {profile.legalName}.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href={`/share/request?business=${encodeURIComponent(profile.slug)}`}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--fintech-accent,#4fd1c5)] px-4 py-2 text-sm font-semibold text-[var(--fintech-bg-primary,#0a1622)] focus:outline-none focus:ring-2 focus:ring-[var(--fintech-accent,#4fd1c5)] focus:ring-offset-2 focus:ring-offset-[var(--fintech-bg-primary,#0a1622)]"
            >
              Request share package
            </Link>
            <Link
              href="/business-id"
              className="inline-flex items-center gap-2 rounded-lg border border-current/40 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-current"
            >
              How verification works
            </Link>
          </div>
        </div>
      </section>

      {/* ─── Verification proof footer ────────────────────────────── */}
      <section
        aria-labelledby="proof-heading"
        className="mx-auto max-w-5xl px-6 pb-16 pt-4"
      >
        <h2 id="proof-heading" className="sr-only">
          Verification proof
        </h2>
        <p className="text-xs opacity-70">
          Verification proof reference:{" "}
          <code className="rounded bg-current/10 px-1 py-0.5">
            blockid://id/{profile.slug}#L{profile.verificationLevel}
          </code>
          . Independently verifiable at{" "}
          <Link href="/business-id" className="underline">
            /business-id
          </Link>
          . Credential issuer: Auschain PTY LTD · ABN 79 659 615 111 ·
          Sydney NSW.
        </p>
      </section>
    </>
  );
}
