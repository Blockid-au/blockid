// TierLadder — the three rungs, legible at a glance.
//
// FORM (dataviz). Three prices is not a chart. `choosing-a-form`: a handful of
// headline numbers is a KPI row of stat tiles, and that is what this is — one
// hero figure per card, the ask under it, then what you get. There is
// deliberately no bar, no meter and no "value" graphic: the only quantitative
// comparison worth making here is 5 pages against 10+, and that is a sentence,
// not a plot. Drawing an invented "value" axis is exactly the sort of visual
// yesterday's rebuild dropped a convergence chart to avoid.
//
// COLOUR. The page has one data hue (`action`) and neutral grey for context,
// which is the emphasis form. The ladder follows it: two neutral cards and one
// in the accent, because emphasis is the honest encoding for "this is the rung
// we point people at next". No categorical palette, nothing to fail a CVD
// check, and no status colour used for a non-status thing.
//
// PROVENANCE. Every figure comes from `tiers.ts`, which reads each price from
// the module that owns it. Nothing here is typed by hand.
//
// NO DARK PATTERNS. The emphasised card is labelled by its position in the
// ladder ("the next step"), never by a popularity claim we cannot support, and
// there is no countdown, discount or scarcity anywhere — see the colocated
// suite in `tiers.test.ts`.

import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";

import { HOMEPAGE_TIERS } from "./tiers";

export function TierLadder() {
  return (
    <ul
      role="list"
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5"
      data-testid="homepage-tier-ladder"
    >
      {HOMEPAGE_TIERS.map((tier) => {
        const accent = tier.emphasis;
        return (
          <li
            key={tier.id}
            className={[
              "flex flex-col rounded-2xl border p-5 sm:p-6",
              accent
                ? "border-action bg-surface shadow-sm"
                : "border-line-subtle bg-surface",
            ].join(" ")}
          >
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
                {tier.name}
              </p>
              {accent && (
                <span className="rounded-full bg-action px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-on-action">
                  The next step
                </span>
              )}
            </div>

            <p className="mt-3 flex items-baseline gap-1.5">
              <span className="font-sans text-4xl font-semibold leading-none tracking-tight text-primary tabular-nums">
                {tier.price}
              </span>
              {tier.priceSuffix && (
                <span className="text-sm text-muted">{tier.priceSuffix}</span>
              )}
            </p>

            <p className="mt-2 text-sm leading-snug text-secondary">
              {tier.ask}
            </p>

            <ul role="list" className="mt-5 flex-1 space-y-2">
              {tier.includes.map((line) => (
                <li key={line} className="flex items-start gap-2 text-sm">
                  <Check
                    size={14}
                    aria-hidden
                    strokeWidth={2.5}
                    className="mt-1 shrink-0 text-action"
                  />
                  <span className="text-secondary">{line}</span>
                </li>
              ))}
            </ul>

            <Link
              href={tier.cta.href}
              className={[
                "mt-6 inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
                accent
                  ? "bg-action text-on-action hover:opacity-90"
                  : "border border-line text-primary hover:bg-surface-hover",
              ].join(" ")}
            >
              {tier.cta.label}
              <ArrowRight size={15} aria-hidden />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export default TierLadder;
