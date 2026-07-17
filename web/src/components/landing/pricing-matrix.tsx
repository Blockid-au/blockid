"use client";

/**
 * PricingMatrix — Homepage v2 pricing block, consumes the active segment
 * from <SegmentTabs> (via context) and renders the matching 3–5 SKU cards
 * from `plans-v2.ts` (placeholder catalogue; swapped for plans-db import
 * once the W1 backend track lands).
 *
 * Includes a monthly ↔ annual toggle (annual saves ~17% vs 12× monthly).
 * "Most Popular" ribbon is driven by `plan.most_popular` from the catalogue.
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSegment } from "@/components/landing/segment-tabs";
import { useExposeExperiment } from "@/lib/conversion/expose";
import {
  annualSavingPct,
  formatAud,
  plansForSegment,
  type Plan,
  type Segment,
} from "@/lib/plans-v2";

const SEGMENT_INTRO: Record<Segment, { headline: string; sub: string; note?: string }> = {
  founder: {
    headline: "Pricing for founders",
    sub: "Start free. Upgrade the day you decide to raise. Cancel any time.",
  },
  investor: {
    headline: "Pricing for investors",
    sub: "From solo angels to fund-grade DD workflows.",
  },
  advisor: {
    headline: "Pricing for advisors",
    sub: "Same plans as investors — the Advisor tier ships the warm-intro engine and equity calculator you actually use.",
    note: "Advisor-specific features live in the Advisor plan: warm intro engine, advisor equity/vesting calculator, and portfolio tracking of the founders you back with time (not just capital).",
  },
  accelerator: {
    headline: "Pricing for accelerators",
    sub: "Per-cohort pricing with seats included. White-label available on Scale.",
  },
};

export interface PricingMatrixProps {
  /** Optional override; by default the active <SegmentTabs> segment wins. */
  segment?: Segment;
}

type Interval = "monthly" | "annual";

export function PricingMatrix({ segment: overrideSegment }: PricingMatrixProps = {}) {
  const ctx = useSegmentSafe();
  const segment: Segment = overrideSegment ?? ctx?.segment ?? "founder";
  const [interval, setInterval] = useState<Interval>("monthly");

  const intro = SEGMENT_INTRO[segment];
  const basePlans = useMemo(() => plansForSegment(segment), [segment]);

  // A/B experiment: pricing_anchor_order.
  //   anchor_growth → surface the *_growth SKU first (current default).
  //   anchor_scale  → surface the *_scale SKU first.
  // Falls back to the base order while the variant is loading or null.
  const { variant: anchorVariant } = useExposeExperiment("pricing_anchor_order");
  const plans = useMemo(() => {
    if (!anchorVariant) return basePlans;
    const anchorId =
      anchorVariant === "anchor_scale"
        ? (p: Plan) => p.id.endsWith("_scale")
        : anchorVariant === "anchor_growth"
          ? (p: Plan) => p.id.endsWith("_growth")
          : null;
    if (!anchorId) return basePlans;
    const anchored = basePlans.filter(anchorId);
    if (anchored.length === 0) return basePlans;
    const rest = basePlans.filter((p) => !anchorId(p));
    return [...anchored, ...rest];
  }, [basePlans, anchorVariant]);

  return (
    <section
      id="pricing-anchor"
      className="mx-auto max-w-7xl scroll-mt-16 px-4 py-16 sm:py-20"
      aria-labelledby="pricing-matrix-heading"
    >
      <div className="mb-10 flex flex-col items-center text-center">
        <span className="mb-3 inline-flex items-center rounded-full border border-brand-cyan/40 bg-brand-cyan/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand-cyan">
          Beta pricing
        </span>
        <h2
          id="pricing-matrix-heading"
          className="lux-heading text-3xl font-semibold sm:text-4xl"
        >
          {intro.headline}
        </h2>
        <p className="mt-3 max-w-2xl text-base text-brand-ink-muted">
          {intro.sub}
        </p>

        <IntervalToggle value={interval} onChange={setInterval} />
      </div>

      {intro.note && (
        <p className="mx-auto mb-8 max-w-3xl rounded-lg border border-brand-cyan/20 bg-brand-navy-elev-1/60 px-4 py-3 text-center text-sm text-brand-ink-muted">
          {intro.note}
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[repeat(auto-fit,minmax(260px,1fr))]">
        {plans.map((plan) => (
          <PlanCard key={plan.id} plan={plan} interval={interval} />
        ))}
      </div>

      <p className="mt-10 text-center text-xs text-brand-ink-muted">
        Prices in Australian dollars, GST-exclusive. GST added at checkout for
        Australian customers once Auschain PTY LTD (ABN 79 659 615 111) crosses
        the A$75,000 turnover threshold. Trial ends automatically — we email
        3 days before any charge. Cancel any time from Billing.
      </p>
      <p className="mx-auto mt-4 max-w-2xl border-t border-white/5 pt-4 text-center text-xs text-brand-ink-muted">
        Not financial advice. Plan information is general in nature and does
        not account for your objectives or financial situation — seek
        independent advice before subscribing.
      </p>
    </section>
  );
}

// ─── Interval toggle ─────────────────────────────────────────────────────

function IntervalToggle({
  value,
  onChange,
}: {
  value: Interval;
  onChange: (v: Interval) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Billing interval"
      className="mt-6 inline-flex items-center rounded-full border border-brand-gold/20 bg-brand-navy-elev-1/60 p-1"
    >
      <ToggleButton
        active={value === "monthly"}
        onClick={() => onChange("monthly")}
        label="Monthly"
      />
      <ToggleButton
        active={value === "annual"}
        onClick={() => onChange("annual")}
        label="Annual"
        badge="Save ~17%"
      />
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  badge?: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={[
        "flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-200 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-brand-navy",
        active
          ? "bg-brand-gold text-brand-navy shadow-[0_0_18px_-6px_rgba(201,169,97,0.6)]"
          : "text-brand-ink-muted hover:text-brand-ink",
      ].join(" ")}
    >
      {label}
      {badge && (
        <span
          className={[
            "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
            active
              ? "bg-brand-navy/20 text-brand-navy"
              : "bg-brand-cyan/10 text-brand-cyan",
          ].join(" ")}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

// ─── Plan card ───────────────────────────────────────────────────────────

function PlanCard({ plan, interval }: { plan: Plan; interval: Interval }) {
  const price = interval === "annual" ? plan.annual_aud : plan.monthly_aud;
  const priceLabel = formatAud(price);
  const isCustom = price === null;
  const saving = annualSavingPct(plan);
  const isContact = plan.cta_kind === "contact" || isCustom;

  const ctaHref = isContact
    ? `/contact?plan=${plan.id}`
    : `/onboarding?trial=1&plan=${plan.id}`;
  const ctaLabel = isContact ? "Contact sales" : plan.monthly_aud === 0 ? "Start free" : "Start trial";

  return (
    <article
      className={[
        "lux-card relative flex min-h-96 flex-col p-8 transition-all duration-200 ease-out",
        plan.most_popular
          ? "lux-glow-gold border-brand-gold/40 -translate-y-1"
          : "hover:-translate-y-1 hover:border-brand-cyan/25",
      ].join(" ")}
      aria-label={`${plan.name} plan`}
    >
      {plan.most_popular && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand-gold px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-brand-navy shadow-lg">
          Most popular
        </span>
      )}

      <header className="mb-6">
        <h3 className="text-xl font-semibold text-brand-gold">{plan.name}</h3>
        {plan.tagline && (
          <p className="mt-1 text-xs uppercase tracking-wide text-brand-ink-muted/80">
            {plan.tagline}
          </p>
        )}
      </header>

      <div className="mb-4">
        <div className="flex items-baseline gap-1">
          <span className="text-5xl font-semibold text-brand-ink tabular-nums">
            {priceLabel}
          </span>
          {!isCustom && price !== 0 && (
            <span className="text-sm text-brand-ink-muted">
              /{interval === "annual" ? "yr" : "mo"}
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-brand-ink-muted">
          {isCustom
            ? "Volume pricing on request"
            : price === 0
              ? "Forever free · no card required"
              : `AUD · ex-GST · billed ${interval === "annual" ? "annually" : "monthly"}`}
        </p>
        {interval === "annual" && saving !== null && saving > 0 && (
          <p className="mt-1 text-xs font-medium text-brand-cyan">
            Save {saving}% vs monthly
          </p>
        )}
      </div>

      {plan.trial_days > 0 && (
        <span className="mb-5 inline-flex w-fit items-center rounded-full border border-brand-gold/30 bg-brand-gold/10 px-2.5 py-0.5 text-[11px] font-medium text-brand-gold">
          {plan.trial_days}-day free trial
        </span>
      )}

      <ul className="mb-8 flex-1 space-y-2.5 text-sm text-brand-ink/90">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <CheckIcon />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <Link
        href={ctaHref}
        className={[
          "mt-auto inline-flex w-full items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold transition-all duration-200 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-brand-navy",
          isContact
            ? "border border-brand-cyan text-brand-cyan hover:bg-brand-cyan hover:text-brand-navy"
            : "bg-brand-gold text-brand-navy hover:brightness-110",
        ].join(" ")}
        aria-label={`${ctaLabel} — ${plan.name}`}
      >
        {ctaLabel}
      </Link>
    </article>
  );
}

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="mt-0.5 h-4 w-4 flex-none text-brand-cyan"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 10.5l4 4 8-9" />
    </svg>
  );
}

// ─── Segment context (soft) ──────────────────────────────────────────────

/**
 * Read the SegmentTabs context if present, otherwise return null so the
 * matrix can be rendered standalone with a `segment` prop for tests /
 * embed use-cases. `useSegment()` throws when the provider is absent, so
 * we wrap it — the hook itself is always called once per render, which
 * keeps rules-of-hooks happy.
 */
function useSegmentSafe(): { segment: Segment; setSegment: (s: Segment) => void } | null {
  try {
    return useSegment();
  } catch {
    return null;
  }
}

export default PricingMatrix;
