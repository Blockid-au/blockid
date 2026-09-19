"use client";
// <PricingFeatureNotice> — the one sentence a locked user needed on /pricing.
//
// S31-B (2026-09-13). Every gated workspace page redirects to
// `/pricing?feature=<slug>&from=<path>`; until now the page dropped both
// params on the floor. Renders a band above the hero that says what the
// page needed, which plan carries it, and jumps to that card.
//
// Client component reading useSearchParams (S31-D): /pricing is static /
// ISR-cacheable, so the page itself must not read searchParams. Mount it
// inside <Suspense> (Next requires a boundary around useSearchParams).
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Lock, ArrowDown } from "lucide-react";
import {
  resolveFeatureRequirement,
  requiresPaidTier,
} from "@/lib/entitlements/feature-requirement";

export function PricingFeatureNotice(props: { feature?: string | string[]; from?: string | string[] } = {}) {
  const params = useSearchParams();
  const feature = props.feature ?? params?.get("feature") ?? undefined;
  const from = props.from ?? params?.get("from") ?? undefined;
  const slug = Array.isArray(feature) ? feature[0] : feature;
  const fromPath = Array.isArray(from) ? from[0] : from;
  const req = resolveFeatureRequirement(slug, fromPath);
  if (!req || !requiresPaidTier(req)) return null;

  const where = req.fromLabel ? `To open ${req.fromLabel} you need ${req.label}` : `You need ${req.label}`;
  const carrier = req.contactSales
    ? "— it is on an Enterprise or program plan. Talk to us and we will set it up."
    : req.viaAddon && req.plan
      ? `— it comes with the Equity add-on (${req.priceLine}) on top of the ${req.plan.name} plan.`
      : req.plan
        ? `— it is included from the ${req.plan.name} plan${req.priceLine ? ` (${req.priceLine})` : ""}${req.plan.trial_days > 0 ? ` · ${req.plan.trial_days}-day free trial, cancel any time` : ""}.`
        : ".";

  return (
    <section
      aria-label="Why you are here"
      data-testid="pricing-feature-notice"
      className="mx-auto max-w-5xl px-6 pt-6"
    >
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-ink-800">
        <Lock className="h-4 w-4 shrink-0 text-brand-600" strokeWidth={1.75} aria-hidden="true" />
        <p className="flex-1 min-w-[16rem]">
          <span className="font-semibold">{where}</span> {carrier}
        </p>
        {req.contactSales ? (
          <Link
            href={`/contact?plan=enterprise&feature=${encodeURIComponent(req.feature)}`}
            className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
          >
            Contact sales
          </Link>
        ) : req.anchor ? (
          <a
            href={req.anchor}
            className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
          >
            See the {req.plan?.name} plan
            <ArrowDown className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
          </a>
        ) : null}
      </div>
    </section>
  );
}
