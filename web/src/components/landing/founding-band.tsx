/**
 * FoundingBand — down-page relocation of the Founding-100 A$5 lifetime
 * deal and Sample Trust Report CTAs. These used to live inside the hero;
 * moving them below the value proposition (per Aug-2026 founder brief)
 * keeps the hero focused on user benefit and lets the offer land after
 * the user has already seen what BlockID does for them.
 */

import Link from "next/link";

export function FoundingBand() {
  return (
    <section
      aria-labelledby="founding-band-heading"
      className="border-t border-white/10 py-16"
    >
      <div className="mx-auto max-w-5xl px-6">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Founding-100 offer — softened, benefit-led framing */}
          <div className="rounded-2xl border border-[var(--fintech-accent)]/30 bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-8">
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-[var(--fintech-accent)]">
              Founding 100 · Lifetime access
            </p>
            <h2
              id="founding-band-heading"
              className="mt-3 font-display text-2xl font-semibold text-[var(--fintech-ink)]"
            >
              Unlock the full investor-grade report.
            </h2>
            <p className="mt-3 text-sm text-[var(--fintech-ink-muted)]">
              PDF investor-share pack, weekly SVI tracking, evidence uploads
              (cap table, pitch deck, financials) and one-click connectors for
              GitHub, Stripe and Xero. Founding-100 members lock lifetime
              access for a single A$5 payment.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                href="/founding-50"
                className="inline-flex h-11 items-center justify-center rounded-xl bg-[var(--fintech-accent)] px-6 text-sm font-semibold text-[var(--fintech-bg-primary)] hover:bg-[var(--fintech-accent-hover)]"
              >
                Claim my Founding spot — A$5
              </Link>
              <span className="text-[11px] text-[var(--fintech-ink-muted)]">
                One-time. No subscription. Cancel-proof.
              </span>
            </div>
          </div>

          {/* Sample report — evidence, not pressure */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8">
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-[var(--fintech-ink-muted)]">
              See it before you buy
            </p>
            <h3 className="mt-3 font-display text-2xl font-semibold text-[var(--fintech-ink)]">
              Read a real Trust Report.
            </h3>
            <p className="mt-3 text-sm text-[var(--fintech-ink-muted)]">
              An anonymised end-to-end report from a Series-A AU startup:
              8 SVI dimensions, valuation math, evidence chain, investor Q&amp;A
              simulator, and the exact upgrade path we recommended.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                href="/reports/samples"
                className="inline-flex h-11 items-center justify-center rounded-xl border border-white/15 bg-white/[0.03] px-6 text-sm font-medium text-[var(--fintech-ink)] hover:border-[var(--fintech-accent)]/60 hover:bg-white/[0.06]"
              >
                See a sample Trust Report
              </Link>
              <span className="text-[11px] text-[var(--fintech-ink-muted)]">
                Free · No signup
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default FoundingBand;
