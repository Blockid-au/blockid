"use client";

/**
 * PricingMatrix — Homepage v2 pricing block. Renders the public SKU cards
 * for one segment from `plans-v2.ts`: the Founder ladder (Free / Starter
 * A$29 / Growth A$69) or, since G12 (2026-09-10, T0268), the Evaluator
 * ladder (Scout A$79 / Firm A$149 / Program A$349) when `segment` is
 * "investor". <PricingSegmentSwitch /> on /pricing owns the tab state and
 * passes the segment down as a prop; the legacy <SegmentTabs> context is
 * still honoured for any older embed.
 *
 * Includes a monthly ↔ annual toggle (annual saves ~17% vs 12× monthly).
 * "Most Popular" ribbon is driven by `plan.most_popular` from the catalogue.
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSegment } from "@/components/landing/segment-tabs";
import { useExposeExperiment } from "@/lib/conversion/expose";
import { usePricingExperiment } from "@/lib/hooks/use-pricing-experiment";
import {
  annualSavingPct,
  formatAud,
  publicPlansForSegment,
  type Plan,
  type Segment,
} from "@/lib/plans-v2";
import { TRIAL_COPY, evaluatorTrialIncludedLine } from "@/lib/plans/trial-copy";
import { CREDIT_PACKS } from "@/lib/credit-packs";
import { TRUST_REPORT_5AUD } from "@/lib/pricing/v3-skus";

// pricing-anchor-2026-07 (T0121/T0123). Anchor-tier + pricing_anchor_order
// A/B experiments were retired 2026-09-07 (Workstream B8) to keep the
// Universal 3-rung ladder promise simple. The wiring stays behind a
// feature-flag guard so ops can re-enable it later without a redesign;
// set NEXT_PUBLIC_PRICING_ANCHOR_ENABLED=1 to re-arm both experiments.
const PRICING_ANCHOR_ENABLED =
  process.env.NEXT_PUBLIC_PRICING_ANCHOR_ENABLED === "1";
const PRICING_ANCHOR_EXPERIMENT = "pricing-anchor-2026-07";
const ANCHOR_PLAN_ID = "founder_plus_anchor";

interface PricingAnchorPayload {
  showAnchor?: boolean;
  anchorName?: string;
  anchorMonthlyAud?: number;
  anchorAnnualAud?: number;
  anchorFeatures?: string[];
}

const SEGMENT_INTRO: Record<Segment, { headline: string; sub: string; roleFit: string; note?: string }> = {
  founder: {
    headline: "Pricing for founders",
    sub: "Start free. Upgrade the day you decide to raise. Cancel any time.",
    roleFit: "How this fits your role: build your startup profile, model your cap-table, and get investor-ready — from Day 0 to a signed term sheet.",
  },
  investor: {
    headline: "Pricing for evaluators",
    sub: "Scout A$79 · Firm A$149 · Program A$349. 7-day free trial · card required · cancel anytime.",
    roleFit: "How this fits your role: add the startups you are evaluating, score every one of them on the same rubric, and watch their progress week to week — as an angel, an advisory firm, a VC team or a program.",
  },
  advisor: {
    headline: "Pricing for advisors",
    sub: "Same Evaluator ladder — Firm is the rung built for firms with clients.",
    roleFit: "How this fits your role: guide founders, run every client on one rubric, and hand them white-label reports with your name on the cover.",
    note: "Firm adds the client roster, white-label PDF reports, founder-approved full mentor access and per-client R&DTI / ESIC / s708 checks.",
  },
  accelerator: {
    headline: "Pricing for accelerators",
    sub: "Per-cohort pricing with seats included. White-label available on Scale.",
    roleFit: "How this fits your role: run a cohort with batched SVI reports, mentor-pool marketplace, Demo Day kit, and LP reporting.",
  },
};

/**
 * Founder plans keep the /onboarding trial flow (Stripe env vars wired for
 * the Founder Stripe products). Since G12 (2026-09-10, T0268) the investor
 * / advisor catalogue is the self-serve Evaluator ladder and routes to
 * `/signup?segment=evaluator&plan=<id>` (7-day Stripe trial, card required —
 * the route itself ships under T0269). Only the accelerator cohort SKUs are
 * still contact-sales, and none of them is public anyway.
 */
const CONTACT_SALES_SEGMENTS: readonly Segment[] = ["accelerator"];

/** Segments whose public cards are sold on the Evaluator tab. */
const EVALUATOR_SEGMENTS: readonly Segment[] = ["investor", "advisor"];

/**
 * CTA target for an Evaluator rung — built by T0269, link-only here.
 * Release QA-2 F10: carries `trial=1` like the founder CTA
 * (`/onboarding?trial=1&plan=…`) so the signup step, GA4 and the QA
 * contract agree that this click starts the 7-day card-required trial.
 */
export function evaluatorSignupHref(planId: string): string {
  return `/signup?segment=evaluator&plan=${encodeURIComponent(planId)}&trial=1`;
}

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
  const isEvaluator = EVALUATOR_SEGMENTS.includes(segment);
  // Round 5.11: consume `publicPlansForSegment()` so the retired `founder_free`
  // tier is stripped from every public pricing render. `plansForSegment()` is
  // still exported for entitlement/back-office code that needs the full list.
  const basePlans = useMemo(() => publicPlansForSegment(segment), [segment]);

  // A/B experiment: pricing_anchor_order. Only consulted when the anchor
  // flag is enabled — otherwise `basePlans` order wins so the ladder reads
  // in the canonical Free → Growth → Pro order that the copy promises.
  const { variant: anchorVariant } = useExposeExperiment("pricing_anchor_order");
  const orderedPlans = useMemo(() => {
    if (!PRICING_ANCHOR_ENABLED) return basePlans;
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

  // pricing-anchor-2026-07: on the founder segment, optionally prepend a
  // synthetic Founder+ tier above the existing Founder plan. Retired by
  // default 2026-09-07 (Workstream B8); guarded by
  // NEXT_PUBLIC_PRICING_ANCHOR_ENABLED so ops can re-enable the anchor
  // experiment without another redesign pass.
  const {
    payload: anchorPayload,
    recordConversion: recordAnchorConversion,
  } = usePricingExperiment<PricingAnchorPayload>(PRICING_ANCHOR_EXPERIMENT);
  const plans = useMemo(() => {
    if (!PRICING_ANCHOR_ENABLED) return orderedPlans;
    if (segment !== "founder") return orderedPlans;
    if (!anchorPayload?.showAnchor) return orderedPlans;
    const monthly = typeof anchorPayload.anchorMonthlyAud === "number" ? anchorPayload.anchorMonthlyAud : 79;
    const annual = typeof anchorPayload.anchorAnnualAud === "number" ? anchorPayload.anchorAnnualAud : monthly * 10;
    const features = Array.isArray(anchorPayload.anchorFeatures) && anchorPayload.anchorFeatures.length > 0
      ? anchorPayload.anchorFeatures
      : [
          "Everything in Founder",
          "Priority support (12h SLA)",
          "Warm investor intros (up to 3/mo)",
        ];
    const anchor: Plan = {
      id: ANCHOR_PLAN_ID,
      segment: "founder",
      name: typeof anchorPayload.anchorName === "string" ? anchorPayload.anchorName : "Founder+",
      monthly_aud: monthly,
      annual_aud: annual,
      trial_days: 14,
      cta_kind: "trial",
      tagline: "Anchor tier",
      features,
    };
    // Slot the anchor above the paid Founder tier(s) — i.e. after `founder_free`
    // if present, otherwise at the very front.
    const idx = orderedPlans.findIndex((p) => p.id !== "founder_free");
    if (idx <= 0) return [anchor, ...orderedPlans];
    return [...orderedPlans.slice(0, idx), anchor, ...orderedPlans.slice(idx)];
  }, [orderedPlans, segment, anchorPayload]);

  return (
    <section
      id="pricing-anchor"
      className="mx-auto max-w-7xl scroll-mt-16 px-4 py-16 sm:py-20"
      aria-labelledby="pricing-matrix-heading"
    >
      <div className="mb-10 flex flex-col items-center text-center">
        <h2
          id="pricing-matrix-heading"
          className="text-3xl font-semibold text-primary sm:text-4xl"
        >
          {intro.headline}
        </h2>
        <p className="mt-3 max-w-2xl text-base text-secondary">
          {intro.sub}
        </p>

        <IntervalToggle value={interval} onChange={setInterval} />
      </div>

      <p className="mx-auto mb-6 max-w-3xl text-center text-sm text-secondary">
        {intro.roleFit}
      </p>

      {intro.note && (
        <p className="mx-auto mb-8 max-w-3xl rounded-lg border border-action/20 bg-action/5 px-4 py-3 text-center text-sm text-secondary">
          {intro.note}
        </p>
      )}

      <div
        className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[repeat(auto-fit,minmax(260px,1fr))]"
        data-testid={isEvaluator ? "evaluator-ladder" : "founder-ladder"}
      >
        {plans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            interval={interval}
            forceContactSales={CONTACT_SALES_SEGMENTS.includes(plan.segment)}
            onSelect={recordAnchorConversion}
          />
        ))}
      </div>

      {isEvaluator && <PayAsYouGoNote />}

      <p className="mt-10 text-center text-xs text-tertiary">
        AUD pricing, GST-inclusive. Every charge produces an ATO tax invoice.
        {" "}{TRIAL_COPY.fine_print}
      </p>
      <p className="mx-auto mt-4 max-w-2xl border-t border-line-subtle pt-4 text-center text-xs text-tertiary">
        Not financial advice. Plan information is general in nature and does
        not account for your objectives or financial situation — seek
        independent advice before subscribing.
      </p>
    </section>
  );
}

// ─── Pay-as-you-go note (Evaluator tab) ──────────────────────────────────

/**
 * Evaluators do not need a subscription to read a report: every Trust
 * BizReport is A$3 per startup (G12 §3b "Pay-as-you-go"). Prices are read
 * off the SKU and the credit-pack ladder so this line can never drift from
 * what checkout books.
 */
function PayAsYouGoNote() {
  const reportPrice = `A$${(TRUST_REPORT_5AUD.unit_amount_incl_gst_cents ?? 300) / 100}`;
  const smallest = CREDIT_PACKS[0];
  const largest = CREDIT_PACKS[CREDIT_PACKS.length - 1];
  return (
    <p
      data-testid="evaluator-payg"
      className="mx-auto mt-8 max-w-3xl rounded-lg border border-action/20 bg-action/5 px-4 py-3 text-center text-sm text-secondary"
    >
      No subscription? Every full Trust BizReport is{" "}
      <strong className="text-primary">{reportPrice} per startup</strong>,
      pay-as-you-go — the same report founders buy. Credit packs run from{" "}
      {smallest ? `A$${smallest.price} (${smallest.credits} credits)` : "A$5"} to{" "}
      {largest ? `A$${largest.price} (${largest.credits} credits)` : "A$60"}.
    </p>
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
      className="mt-6 inline-flex items-center rounded-full border border-line-subtle bg-surface-sunken p-1"
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
        "flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-200 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
        active
          ? "bg-action text-on-action shadow-sm"
          : "text-secondary hover:text-primary",
      ].join(" ")}
    >
      {label}
      {badge && (
        <span
          className={[
            "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
            active
              ? "bg-surface text-action"
              : "bg-action/10 text-action",
          ].join(" ")}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

// ─── Plan card ───────────────────────────────────────────────────────────

/**
 * Deep-link fragment ids for persona → pricing card jumps. Founder rungs
 * keep the `#tier-free` / `#tier-starter` / `#tier-growth` ids the
 * /solutions pages link to; the Evaluator rungs get `#tier-scout` /
 * `#tier-firm` / `#tier-program` (pair with `?segment=evaluator`).
 */
const TIER_ANCHORS: Record<string, string> = {
  founder_free: "tier-free",
  founder_starter: "tier-starter",
  founder_growth: "tier-growth",
  founder_scale: "tier-pro",
  investor_angel: "tier-scout",
  investor_advisor: "tier-firm",
  investor_vc_small: "tier-program",
};

function PlanCard({
  plan,
  interval,
  forceContactSales = false,
  onSelect,
}: {
  plan: Plan;
  interval: Interval;
  /** When true, override CTA to contact-sales regardless of `plan.cta_kind`. */
  forceContactSales?: boolean;
  onSelect?: (valueAud?: number) => void;
}) {
  const price = interval === "annual" ? plan.annual_aud : plan.monthly_aud;
  const priceLabel = formatAud(price);
  const isCustom = price === null;
  const saving = annualSavingPct(plan);
  const isContact = forceContactSales || plan.cta_kind === "contact" || isCustom;

  const isEvaluatorPlan = EVALUATOR_SEGMENTS.includes(plan.segment);
  const ctaHref = isContact
    ? `/contact?plan=${plan.id}`
    : isEvaluatorPlan
      ? evaluatorSignupHref(plan.id)
      : `/onboarding?trial=1&plan=${plan.id}`;
  const ctaLabel = isContact
    ? "Contact sales"
    : isEvaluatorPlan
      ? "Start 7-day free trial"
      : "Start trial";
  const handleCtaClick = () => {
    if (!onSelect) return;
    // Report the monthly AUD price as the conversion value. `null` (contact
    // sales) → undefined so the event still lands but valueAud is null in DB.
    const value = typeof plan.monthly_aud === "number" ? plan.monthly_aud : undefined;
    onSelect(value);
  };

  // Deep-link fragment id for persona → pricing card jumps. Maps the
  // public-ladder SKUs to `#tier-free` / `#tier-starter` / `#tier-growth`;
  // other SKUs fall back to their plan id so hidden cards still get a
  // deterministic anchor.
  const anchorId = TIER_ANCHORS[plan.id] ?? `tier-${plan.id}`;

  // `#tier-pro` is deep-linked from the persona/solutions pages, but the Pro
  // (founder_scale, A$299) card was retired from the public ladder on
  // 2026-09-08 and no longer renders. Park the orphaned fragment on Growth —
  // the top public rung — so those links scroll somewhere instead of nowhere.
  const legacyAnchorId = plan.id === "founder_growth" ? "tier-pro" : null;

  return (
    <article
      id={anchorId}
      className={[
        "relative flex min-h-96 flex-col rounded-2xl border bg-surface-raised p-8 transition-all duration-200 ease-out scroll-mt-24",
        plan.most_popular
          ? "border-action shadow-md ring-1 ring-action -translate-y-1"
          : "border-line-subtle shadow-sm hover:-translate-y-1 hover:border-line",
      ].join(" ")}
      aria-label={`${plan.name} plan`}
    >
      {legacyAnchorId && (
        <span id={legacyAnchorId} aria-hidden="true" className="sr-only" />
      )}
      {plan.most_popular && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-action px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-on-action shadow-md">
          Most popular
        </span>
      )}

      <header className="mb-6">
        <h3 className="flex flex-wrap items-center gap-2 text-xl font-semibold text-primary">
          {plan.name}
          {plan.badge && (
            <span
              data-testid="plan-badge"
              className="inline-flex items-center rounded-full border border-action/30 bg-action/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-action"
            >
              {plan.badge}
            </span>
          )}
        </h3>
        {plan.tagline && (
          <p className="mt-1 text-xs uppercase tracking-wide text-tertiary">
            {plan.tagline}
          </p>
        )}
      </header>

      <div className="mb-4">
        <div className="flex items-baseline gap-1">
          <span className="text-5xl font-semibold text-primary tabular-nums">
            {priceLabel}
          </span>
          {!isCustom && (
            <span className="text-sm text-secondary">
              /{interval === "annual" ? "yr" : "mo"}
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-tertiary">
          {isCustom
            ? "Volume pricing on request"
            : `Billed ${interval === "annual" ? "annually" : "monthly"}`}
        </p>
        {interval === "annual" && saving !== null && saving > 0 && (
          <p className="mt-1 text-xs font-medium text-action">
            Save {saving}% vs monthly
          </p>
        )}
      </div>

      {plan.trial_days > 0 && (
        <span className="mb-5 inline-flex w-fit items-center rounded-full border border-action/30 bg-action/10 px-2.5 py-0.5 text-[11px] font-medium text-action">
          {plan.trial_days}-day free trial
          {isEvaluatorPlan && !isContact ? " · card required · cancel anytime" : ""}
        </span>
      )}
      {isEvaluatorPlan && !isContact && plan.trial_days > 0 && (
        /* Release QA-2 F10 / S7-C: the trial includes ONE full report; the
           monthly quota in the feature list starts on day 8. */
        <p className="-mt-3 mb-5 text-xs text-secondary" data-testid="evaluator-trial-included">
          {evaluatorTrialIncludedLine(plan.id, plan.name)}
        </p>
      )}

      <ul className="mb-8 flex-1 space-y-2.5 text-sm text-secondary">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <CheckIcon />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <Link
        href={ctaHref}
        onClick={handleCtaClick}
        className={[
          "mt-auto inline-flex w-full items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold transition-all duration-200 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
          isContact
            ? "border border-action text-action hover:bg-action hover:text-on-action"
            : "bg-action text-on-action hover:bg-action-hover",
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
      className="mt-0.5 h-4 w-4 flex-none text-action"
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
