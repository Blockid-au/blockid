/**
 * /demo — book-a-demo landing surface.
 *
 * The homepage hero variants (hero-v2) surface a "Book Demo" CTA that
 * historically 404'd. This page describes what the walk-through covers and
 * routes visitors to the same `/contact` inbox that the sales team already
 * monitors — plus a self-serve fallback (/pricing) for founders who would
 * rather trial the product themselves.
 *
 * Server component. `robots: index+follow` so the "book demo" query shows a
 * canonical answer in search.
 */

import type { Metadata } from "next";
import { CheckCircle2 } from "lucide-react";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { MarketingHero } from "@/components/marketing/marketing-hero";
import { MarketingSection } from "@/components/marketing/marketing-section";
import { MarketingCtaStrip } from "@/components/marketing/marketing-cta-strip";

const SITE_URL = "https://blockid.au";

export const metadata: Metadata = {
  title: "Book a demo — BlockID.au",
  description:
    "See a 20-minute walk-through of the BlockID.au investor-readiness stack — SVI, valuation, cap table, ESOP, and data room in one live session.",
  alternates: { canonical: `${SITE_URL}/demo` },
  robots: { index: true, follow: true },
};

const HIGHLIGHTS = [
  "SVI live-score against a startup you nominate before the call.",
  "Valuation snapshot with DCF, Berkus, Scorecard, and comparables side-by-side.",
  "Cap-table + ESOP dilution modelled against a fresh SAFE or priced round.",
  "Investor-pack PDF export walk-through — the same deck we ship to LPs.",
  "AI copilot Q&A anchored to your own uploaded evidence.",
];

export default function DemoPage() {
  return (
    <MarketingShell>
      <MarketingHero
        eyebrow="20-minute walk-through"
        title="Book a live demo"
        subtitle="A short, honest walk-through of the BlockID.au stack against a startup you nominate. No slide deck, no upsell — the demo is driven straight from the product with your data in the room."
        primaryCta={{ href: "/contact?topic=demo", label: "Request a demo slot" }}
        secondaryCta={{ href: "/pricing", label: "See pricing instead" }}
      />

      <MarketingSection
        tone="elevated"
        title="What you will see"
        kicker="Agenda"
      >
        <ul className="space-y-3">
          {HIGHLIGHTS.map((h) => (
            <li key={h} className="flex items-start gap-3">
              <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--fintech-surface)] text-[var(--fintech-accent)]">
                <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
              </span>
              <span className="text-sm leading-relaxed text-[var(--fintech-ink)]">
                {h}
              </span>
            </li>
          ))}
        </ul>
      </MarketingSection>

      <MarketingSection
        tone="elevated"
        title="Who a demo is right for"
        kicker="Fit"
      >
        <p className="text-sm leading-relaxed text-[var(--fintech-ink-muted)]">
          Best for founders who are actively raising in the next 90 days,
          operators pricing a corporate compare bake-off (Cake, Carta,
          Foundersuite, Visible, AngelList), and accelerator / advisor
          teams sizing a multi-seat rollout. If you are pre-idea or
          evaluating for a personal project, the free self-serve form at
          /score is a faster starting point and skips the calendar dance.
        </p>
      </MarketingSection>

      <MarketingCtaStrip
        headline="Ready when you are."
        primary={{ href: "/contact?topic=demo", label: "Request a demo" }}
        secondary={{ href: "/pricing", label: "See pricing" }}
      />
    </MarketingShell>
  );
}
