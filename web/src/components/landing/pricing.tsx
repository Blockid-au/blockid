import Link from "next/link";
import { Check, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Tier {
  name: string;
  price: string;
  cadence?: string;
  audience: string;
  features: string[];
  cta: { label: string; href: string };
  highlight?: boolean;
  badge?: string;
}

const tiers: Tier[] = [
  {
    name: "Free",
    price: "$0",
    audience: "Every founder. Forever.",
    features: [
      "Investor-Ready Score",
      "Shareable web link",
      "1 Stripe + Xero connection",
      "Basic dilution calculator",
    ],
    cta: { label: "Get my score", href: "/score" },
  },
  {
    name: "Founder",
    price: "$99",
    cadence: "/ month",
    audience: "Pre-seed solo founder",
    features: [
      "Everything in Free",
      "Cap table OS + diff",
      "Investor View Link with read receipts",
      "Term Sheet AI (3 / month)",
    ],
    cta: { label: "Start trial", href: "/score" },
  },
  {
    name: "Growth",
    price: "$499",
    cadence: "/ month",
    audience: "Active fundraise · Seed → A",
    features: [
      "Everything in Founder",
      "Unlimited Term Sheet AI",
      "One-Click Data Room",
      "Comparable Companies Wall",
      "30-day money back",
    ],
    cta: { label: "Talk to founder", href: "#" },
    highlight: true,
    badge: "Most popular",
  },
  {
    name: "Pilot Concierge",
    price: "$5,000",
    cadence: "once-off",
    audience: "First 30 design partners",
    features: [
      "Everything in Growth",
      "Founder-led onboarding",
      "Recorded testimonial credit",
      "Direct Slack channel",
      "30-day deal close commitment",
    ],
    cta: { label: "Apply for a pilot", href: "#" },
  },
  {
    name: "Accelerator",
    price: "$20–60k",
    cadence: "/ year",
    audience: "Cohort programs & venture studios",
    features: [
      "Co-branded white-label portal",
      "Cohort aggregate dashboard",
      "Bulk founder onboarding",
      "Investor Welcome Pack for LPs",
    ],
    cta: { label: "Partner with us", href: "#" },
  },
];

export function Pricing() {
  return (
    <section
      id="pricing"
      aria-labelledby="pricing-title"
      className="py-24 md:py-32 border-t border-ink-700"
    >
      <div className="mx-auto max-w-7xl px-6">
        <div className="max-w-3xl">
          <p className="text-xs uppercase tracking-[0.2em] text-teal-400 font-medium">
            Pricing designed to close
          </p>
          <h2
            id="pricing-title"
            className="mt-3 text-3xl md:text-5xl font-semibold tracking-tight text-slate-50"
          >
            Free to start. The Pilot Concierge is the magic SKU.
          </h2>
          <p className="mt-4 text-base md:text-lg leading-relaxed text-slate-400">
            High enough to be real revenue. Low enough to fit a CFO&apos;s
            discretionary budget. Limited to the next 30 founders.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 md:gap-6">
          {tiers.map((tier) => (
            <div
              key={tier.name}
              className={cn(
                "relative flex flex-col rounded-2xl border p-6 transition-colors duration-200",
                tier.highlight
                  ? "border-teal-500/50 bg-ink-800 ring-1 ring-teal-500/20"
                  : "border-ink-700 bg-ink-900 hover:border-teal-500/40",
              )}
            >
              {tier.badge && (
                <span className="absolute -top-3 left-6 inline-flex items-center gap-1 rounded-full border border-teal-500/40 bg-ink-950 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-teal-300">
                  <Star strokeWidth={1.75} className="h-3 w-3" />
                  {tier.badge}
                </span>
              )}
              <h3 className="text-base font-semibold text-slate-50">
                {tier.name}
              </h3>
              <p className="mt-1 text-xs text-slate-500">{tier.audience}</p>
              <p className="mt-5 flex items-end gap-1">
                <span className="font-mono tabular-nums text-3xl font-semibold text-slate-50">
                  {tier.price}
                </span>
                {tier.cadence && (
                  <span className="text-xs text-slate-500 mb-1">
                    {tier.cadence}
                  </span>
                )}
              </p>
              <ul className="mt-5 space-y-2.5 text-sm text-slate-300 flex-1">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check
                      strokeWidth={1.75}
                      className="h-4 w-4 mt-0.5 shrink-0 text-teal-400"
                    />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-6">
                <Link href={tier.cta.href} className="block">
                  <Button
                    variant={tier.highlight ? "primary" : "secondary"}
                    size="md"
                    className="w-full"
                  >
                    {tier.cta.label}
                  </Button>
                </Link>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-8 text-xs text-slate-500">
          Enterprise / Sovereign chain (AUD $50k–$500k / yr) available for
          holding companies and family offices — contact us.
        </p>
      </div>
    </section>
  );
}
