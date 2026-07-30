/**
 * HeroV3 — locked v3 messaging per Master Upgrade Plan §7.2 and §14bis D1.
 *
 * Category:      Verified Business Identity & Value Network
 * Brand promise: One Business. One Trusted Identity.
 * Headline:      Give your business a trusted digital identity.
 * Tagline:       Verified identity. Visible value. Trusted business.
 * Action line:   Identify. Verify. Value. Connect.
 * Product line:  BlockID.au turns business identity, evidence and
 *                capabilities into one trusted and reusable Business ID.
 * Emotional:     A business should not have to rebuild trust from zero
 *                every time.
 * Core outcome:  Be discovered. Be understood. Be trusted.
 * Primary CTA:   Create Your Business ID
 * Secondary CTA: See a sample Trust Report (A$5.50)  ← D1 GST-inclusive
 *
 * Signed-in context (persistent SSO §8.9): parent server component reads
 * the Supabase session and passes `signedInHref` — when present the primary
 * CTA becomes "Continue to your Business ID" and links there instead. The
 * hero component itself stays a client boundary only because it renders
 * animated glow classes; no Supabase code runs inside it.
 */

import Link from "next/link";

interface HeroV3Props {
  signedInHref?: string;
  sampleReportHref?: string;
  verifiedCount?: number;
}

const DEFAULT_SIGNUP_HREF = "/signup?intent=business_id";
const DEFAULT_SAMPLE_HREF = "/reports/samples";

export function HeroV3({
  signedInHref,
  sampleReportHref = DEFAULT_SAMPLE_HREF,
  verifiedCount,
}: HeroV3Props) {
  const isSignedIn = Boolean(signedInHref);
  const primaryCtaHref = signedInHref ?? DEFAULT_SIGNUP_HREF;
  const primaryCtaCopy = isSignedIn
    ? "Continue to your Business ID"
    : "Create Your Business ID";

  return (
    <section
      aria-labelledby="hero-v3-heading"
      className="fintech-hero-glow relative flex min-h-[90vh] w-full items-start justify-center px-4 pb-16 pt-12 md:min-h-[75vh] md:pt-24"
    >
      <div className="fintech-enter mx-auto flex w-full max-w-3xl flex-col items-center gap-8 text-center">
        {/* Category eyebrow */}
        <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-[var(--fintech-ink-muted)]">
          Verified Business Identity &amp; Value Network
        </p>

        {/* Headline */}
        <h1
          id="hero-v3-heading"
          className="font-display max-w-2xl text-balance text-3xl font-semibold tracking-tight text-[var(--fintech-ink)] sm:text-4xl md:text-5xl"
        >
          Give your business a{" "}
          <span className="bg-gradient-to-r from-[var(--fintech-accent)] to-[var(--fintech-accent-hot)] bg-clip-text text-transparent">
            trusted digital identity
          </span>
          .
        </h1>

        {/* Tagline */}
        <p className="max-w-xl text-balance text-base leading-relaxed text-[var(--fintech-ink-muted)] sm:text-lg">
          Verified identity. Visible value. Trusted business.
        </p>

        {/* Primary + secondary CTA */}
        <div className="mt-2 flex flex-col items-center gap-3 sm:flex-row sm:gap-4">
          <Link
            href={primaryCtaHref}
            className="inline-flex h-12 items-center justify-center rounded-xl bg-[var(--fintech-accent)] px-8 text-sm font-semibold text-[var(--fintech-bg-primary)] shadow-[0_8px_24px_-8px_rgba(34,211,238,0.6)] transition-all duration-200 hover:bg-[var(--fintech-accent-hover)] hover:shadow-[0_12px_32px_-8px_rgba(34,211,238,0.7)] hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fintech-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--fintech-bg-primary)] active:translate-y-0"
          >
            {primaryCtaCopy}
          </Link>
          <Link
            href={sampleReportHref}
            className="inline-flex h-12 items-center justify-center rounded-xl border border-white/15 bg-white/[0.03] px-6 text-sm font-medium text-[var(--fintech-ink)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--fintech-accent)]/60 hover:bg-white/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fintech-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--fintech-bg-primary)]"
          >
            See a sample Trust Report (A$5.50)
          </Link>
        </div>

        {/* Action line — Identify. Verify. Value. Connect. */}
        <p
          aria-label="Identify. Verify. Value. Connect."
          className="font-mono text-[11px] uppercase tracking-[0.28em] text-[var(--fintech-ink-muted)]/85"
        >
          Identify. Verify. Value. Connect.
        </p>

        {/* Trust bar */}
        {typeof verifiedCount === "number" && verifiedCount > 0 ? (
          <p className="text-xs text-[var(--fintech-ink-muted)]">
            <span className="tabular-nums font-semibold text-[var(--fintech-ink)]">
              {verifiedCount.toLocaleString("en-AU")}
            </span>
            {" "}verified Australian businesses
          </p>
        ) : null}
      </div>
    </section>
  );
}

/**
 * EmotionalBand — full-bleed band directly below HeroV3. Renders the
 * emotional message from §7.2 block 2. Kept as a sibling section (not
 * nested) so it stays semantically distinct and does not compete with the
 * hero H1 for landmark focus.
 */
export function EmotionalBand() {
  return (
    <section
      aria-labelledby="emotional-band-heading"
      className="border-t border-brand-navy/10 py-16"
    >
      <div className="mx-auto max-w-3xl px-6 text-center">
        <h2 id="emotional-band-heading" className="sr-only">
          Why BlockID.au exists
        </h2>
        <p className="font-display text-balance text-xl italic leading-relaxed text-[var(--fintech-ink)] sm:text-2xl">
          &ldquo;A business should not have to rebuild trust from zero every
          time.&rdquo;
        </p>
        <p className="mt-4 text-sm text-[var(--fintech-ink-muted)]">
          Be discovered. Be understood. Be trusted.
        </p>
      </div>
    </section>
  );
}

export default HeroV3;
