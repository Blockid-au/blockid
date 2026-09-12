import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo/page-meta";
import { PageViewTracker } from "@/components/site/page-view-tracker";
import { Building2, Check } from "lucide-react";
import Link from "next/link";
import { FAQV2 } from "@/components/landing/faq-v2";
import { PricingSegmentSwitch } from "@/components/landing/pricing-segment-switch";
import { resolvePricingTab, type PricingTab } from "@/components/landing/pricing-tab";
import { FAQJsonLd } from "@/components/seo/json-ld";
import { BreadcrumbListJsonLd } from "@/components/seo/breadcrumb-json-ld";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { MarketingHero } from "@/components/marketing/marketing-hero";
import { MarketingSection } from "@/components/marketing/marketing-section";
import { MarketingCtaStrip } from "@/components/marketing/marketing-cta-strip";
import { LogoCloud } from "@/components/landing/logo-cloud";
import { StickyCta } from "@/components/sales/sticky-cta";

// Force dynamic — pricing reads platform_config (Supabase) on every
// request, and searchParams (?segment=…) picks the initial tab. ISR would
// serve stale copy while the pricing catalogue evolves.
export const dynamic = "force-dynamic";

// 2026-09-07 (Workstream B5) retired the four persona tabs (Founder /
// Investor / Advisor / Accelerator). 2026-09-10 (G12, T0268) brings back a
// deliberately smaller switch — two tabs, one per self-serve ladder:
//
//   Founder    Free / Starter A$29 / Growth A$69
//   Evaluator  Scout A$79 / Firm A$149 / Program A$349
//              (investor_angel / investor_advisor / investor_vc_small)
//
// The contact-sales row below the switch stays visible under both tabs.
// Deep links: `?segment=evaluator` (canonical), plus the legacy `?tab=` and
// `?tier=` params still linked from older campaigns — any evaluator-shaped
// value (investor / advisor / accelerator) lands on the Evaluator tab, so
// none of those links 404 or silently show the wrong ladder. Persona pages
// keep deep-linking to a card via `#tier-growth` / `#tier-scout` fragments
// defined on <PricingMatrix />.
function resolveInitialTab(sp: {
  segment?: string | string[];
  tab?: string | string[];
  tier?: string | string[];
}): PricingTab {
  return resolvePricingTab(sp.segment ?? sp.tab ?? sp.tier);
}

export const metadata: Metadata = pageMetadata({
  title: "Pricing — founder and evaluator plans",
  description: "Founder plans from free (Starter A$29, Growth A$69). Evaluator plans for investors, advisors and programs (Scout A$79, Firm A$149, Program A$349). 7-day free trial.",
  path: "/pricing",
  viPath: "/vi/pricing",
});

const FAQ_JSONLD = [
  {
    question: "What happens after the 7-day free trial?",
    // QA-3 (2026-09-12): mirrors Terms v2.1 clause 3 + faq-v2.tsx.
    answer:
      "Your plan auto-charges when the 7-day trial ends unless you cancel before the trial ends (Cohort plans for accelerators and programs have a 14-day trial). We send email reminders at T-3, T-1, and T-0 so you always know what's coming.",
  },
  {
    question: "Is a credit card required to start the trial?",
    answer:
      "Yes — a card is saved via Stripe SetupIntent, but you are only charged on Day 8. If you don't add a payment method, the subscription cancels automatically at trial end.",
  },
  {
    question: "Can I switch plans mid-trial?",
    answer:
      "Yes. Upgrade or downgrade any time from Billing settings; prorated changes apply immediately.",
  },
  {
    question: "Founder or Evaluator — which plans do I see?",
    answer:
      "Use the Founder / Evaluator switch above the plans. Founder shows Free, Starter A$29 and Growth A$69. Evaluator shows Scout A$79, Firm A$149 and Program A$349 for investors, advisors, accelerators and programs — each with a 7-day free trial, card required, cancel anytime (Cohort plans: 14-day trial). Without a subscription, every full Trust BizReport is A$3 per startup.",
  },
  {
    question: "What's the refund policy?",
    // QA-3 (2026-09-12): the ONE refund policy — Terms v2.1 clause 3A
    // (/legal/terms#refunds). Keep identical to faq-v2.tsx.
    answer:
      "7-day money-back guarantee on your first monthly subscription payment, no questions asked — email support and we refund within 3 business days. Annual plans are refunded pro-rata if you cancel within 14 days. One-off A$3 reports and credit packs are non-refundable once delivered, except where the Australian Consumer Law requires a refund. Your Australian Consumer Law guarantees are never excluded. Full policy: /legal/terms#refunds.",
  },
  {
    // G11 (2026-09-10, T0249): Money Finder ladder — mirrors faq-v2.tsx.
    // `grant_finder` is a plain plan flag (Starter, Growth, Package) with
    // no monthly quota in code, so the copy says "included", not "1/mo".
    question: "What is the Grant & Program Finder (Money Finder)?",
    answer:
      "A ranked scan of Australian grants, programs and events your startup qualifies for. Free = the preview (how many you match, top 3 named) and the open-grants directory · A$3 = the full Money Finder report per startup — ranked matches, eligibility checklist, 12-month timeline, PDF · Starter A$29 = Founder Radar deadline alerts and monthly re-match, with full reports included · Growth A$69 = the same, with 45 credits a month for application drafts. A grants consultant charges A$500–2,000 for this scan.",
  },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface PricingPageProps {
  searchParams: Promise<{
    segment?: string | string[];
    tab?: string | string[];
    tier?: string | string[];
  }>;
}

export default async function PricingPage({ searchParams }: PricingPageProps) {
  const sp = await searchParams;
  const initialTab = resolveInitialTab(sp ?? {});
  // Founding-50 promo sunset 2026-09-01 (Phase 3b) — the urgency banner
  // that used to live here linked to the (now deleted) /founding-50 route
  // and has been removed outright. `getFoundingPromoState()` still exists
  // for the grandfathered Stripe SKU + admin surfaces but is no longer
  // consumed by this page.
  return (
    <MarketingShell>
      <FAQJsonLd items={FAQ_JSONLD} />
      <BreadcrumbListJsonLd
        items={[
          { name: "Home", href: "/" },
          { name: "Pricing", href: "/pricing" },
        ]}
      />
      <PageViewTracker event="pricing_viewed" params={{}} />

      {/* Above-the-fold hero — ONE primary CTA + text-link secondary, per
          CRO §06. Height reserved with min-h to keep CLS < 0.02 across the
          hydration boundary. */}
      <MarketingHero
        eyebrow="Pricing v2.0"
        title="Get fundable in 7 days. Then choose your plan."
        subtitle="7-day free trial on every self-serve plan — Founder (Starter, Growth) or Evaluator (Scout, Firm, Program). Card required at signup, charged only on Day 8. Cancel anytime before with no charge. Cohort / Enterprise pilots on request (14-day)."
        primaryCta={{
          href: "/signup?plan=founder_growth&trial=1",
          label: "Start 7-day free trial",
        }}
      />

      <section
        aria-label="Pricing hero secondary"
        className="mx-auto -mt-4 max-w-5xl px-6 pb-2"
      >
        <div className="min-h-[24px]">
          <a
            href="#pricing-matrix"
            className="text-sm font-medium text-action underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-surface rounded"
          >
            See the plans below ↓
          </a>
        </div>
      </section>

      {/* P1 audit (2026-08-23) — trust row directly under the primary CTA.
          Each item stays small text-tertiary so it never competes with the
          hero button. `text-tertiary` is the fintech token equivalent. */}
      <section
        aria-label="Pricing trust row"
        className="mx-auto max-w-5xl px-6 pb-3"
      >
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-secondary">
          <li>Cancel any time</li>
          <li aria-hidden="true">&middot;</li>
          <li>AUD pricing, GST-inclusive</li>
          <li aria-hidden="true">&middot;</li>
          <li>ATO tax invoice issued for every charge</li>
          <li aria-hidden="true">&middot;</li>
          <li>AU-based support</li>
        </ul>
      </section>

      <section
        aria-label="Pricing guarantees"
        className="mx-auto max-w-5xl px-6 pb-4"
      >
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-secondary">
          <span className="inline-flex items-center gap-2">
            <Check aria-hidden="true" className="h-4 w-4 text-action" />
            7-day free trial on every Founder and Evaluator plan
          </span>
          <span className="inline-flex items-center gap-2">
            <Check aria-hidden="true" className="h-4 w-4 text-action" />
            14-day pilot on request (Cohort / Enterprise)
          </span>
          <span className="inline-flex items-center gap-2">
            <Check aria-hidden="true" className="h-4 w-4 text-action" />
            No lock-in — cancel any time
          </span>
          <span className="inline-flex items-center gap-2">
            <Check aria-hidden="true" className="h-4 w-4 text-action" />
            AUD pricing, GST-inclusive. Every charge produces an ATO tax invoice.
          </span>
        </div>
      </section>

      {/* Founder | Evaluator switch (G12, T0268) over the 3-rung ladders.
          Founder: Free / Starter A$29 / Growth A$69 — "Pro" (founder_scale)
          retired 2026-09-08. Evaluator: Scout A$79 / Firm A$149 / Program
          A$349. `publicPlansForSegment()` is the authority for each ladder;
          plans-v2.test.ts pins both. `id="pricing-matrix"` is the anchor
          target for the hero's secondary text link; persona pages deep-link
          to a card via `#tier-growth` / `#tier-scout` fragments. */}
      <section
        id="pricing-matrix"
        aria-label="Pricing matrix"
        className="mx-auto max-w-7xl px-6 py-8 sm:py-12 scroll-mt-24"
      >
        <PricingSegmentSwitch initialSegment={initialTab} />
        {/* G11 §4g anchor line (T0249): prices the Money Finder scan against
            what a grants consultant charges. Sits under the ladder, outside
            <PricingMatrix /> so the matrix component stays untouched. */}
        <p
          data-testid="money-finder-anchor"
          className="mx-auto mt-6 max-w-3xl text-center text-sm text-secondary"
        >
          Every Founder plan includes the Grant &amp; Program Finder — free
          preview, A$3 for a full report, alerts and re-match from Starter. A
          grants consultant charges A$500–2,000 for this scan.{" "}
          <Link
            href="/funding"
            className="font-medium text-action underline-offset-4 hover:underline"
          >
            See what you qualify for
          </Link>
        </p>
      </section>

      {/* Contact-sales row for the tiers that don't fit either self-serve
          ladder — Accelerator cohorts, VC Enterprise, and multi-entity
          Enterprise. Rendered under both tabs. Each tile prefills /contact
          with `?plan=<slug>` so the sales team can pick the intent up in
          one glance. */}
      <ContactSalesRow />

      {/* FAQ */}
      <section
        aria-label="Frequently asked questions"
        className="mx-auto max-w-7xl px-6 pb-12 pt-4"
      >
        <FAQV2 />
      </section>

      {/* Enterprise CTA — bespoke enough to render inline rather than through
          MarketingCtaStrip so we can keep the two-CTA layout intact. */}
      <MarketingSection
        tone="elevated"
        title="Need custom pricing or equity-in-lieu?"
        kicker="Enterprise"
      >
        <div className="flex flex-col items-start gap-6 text-center sm:items-center">
          <Building2 aria-hidden="true" className="h-10 w-10 text-action" />
          <p className="max-w-xl text-secondary">
            Enterprise multi-entity plans with SSO, API access, dedicated
            CSM, or our compliance-gated equity-for-solution arrangement
            (5–10% equity in lieu of cash).
          </p>
        </div>
      </MarketingSection>

      {/* Narrow curator-controlled integration strip, immediately above the
          final CTA. Renders NOTHING when the config is empty. */}
      <LogoCloud group="integrated" density="compact" />

      <MarketingCtaStrip
        headline="Talk to sales for a bespoke fit."
        primary={{ href: "/contact", label: "Talk to sales" }}
        secondary={{
          href: "/workspace/equity-offer",
          label: "Explore equity-for-solution",
        }}
      />

      <p className="mx-auto mb-16 max-w-5xl px-6 text-center text-xs text-secondary">
        Not financial advice. Equity arrangements require independent legal
        and tax review. Auschain PTY LTD · Sydney NSW.
      </p>

      {/* Persistent bottom CTA — hidden 7 days after dismissal. Marketing
          surface only. */}
      <StickyCta variant="pricing" phase="validation" location="pricing" />
    </MarketingShell>
  );
}

// ---------------------------------------------------------------------------
// Contact-sales row
// ---------------------------------------------------------------------------
//
// Each public ladder is deliberately three rungs — every tier that needs a
// conversation (cohort seats, funds beyond five seats, multi-entity
// enterprise) surfaces below the grid in this row, under both tabs. Each
// tile links to /contact with `?plan=<slug>` + `?contact_reason=<slug>`
// prefill so the sales team knows which SKU prompted the enquiry without
// asking again. "Investor VC from A$349" moved onto the Evaluator tab as
// Program (self-serve) on 2026-09-10; the fund-grade tier here is custom.
interface ContactSalesTier {
  slug: string;
  label: string;
  price: string;
  blurb: string;
}

const CONTACT_SALES_TIERS: ReadonlyArray<ContactSalesTier> = [
  {
    slug: "accelerator",
    label: "Accelerator",
    price: "from A$500/mo",
    blurb: "Cohort seats, batched SVI reports, mentor pool, alumni tracking.",
  },
  {
    slug: "investor_vc",
    label: "VC Enterprise",
    price: "custom",
    blurb: "Funds beyond 5 seats: multi-fund, custom benchmarks, SSO/SAML, LP reporting suite.",
  },
  {
    slug: "enterprise",
    label: "Enterprise",
    price: "custom",
    blurb: "Multi-entity groups, SSO/SAML, dedicated CSM, custom SLA.",
  },
];

function ContactSalesRow() {
  return (
    <section
      id="contact-sales"
      aria-label="Contact-sales pricing row"
      className="mx-auto max-w-7xl px-6 py-8 scroll-mt-24"
    >
      <div className="mb-6 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-action">
          Cohorts, funds, and multi-entity groups
        </p>
        <h2 className="mt-2 font-display text-2xl font-semibold text-primary">
          Talk to sales for a bespoke fit
        </h2>
        <p className="mt-2 text-sm text-secondary">
          Program A$349 covers most VC teams and accelerators self-serve.
          Need more seats, cohorts or SSO? 14-day pilot on request — every
          tier below includes a demo call with our founder team.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {CONTACT_SALES_TIERS.map((tier) => (
          <Link
            key={tier.slug}
            href={`/contact?plan=${tier.slug}&contact_reason=${tier.slug}`}
            className="flex flex-col rounded-2xl border border-line-subtle bg-surface-raised p-6 transition-colors hover:border-action"
          >
            <p className="text-sm font-semibold uppercase tracking-wide text-action">
              {tier.label}
            </p>
            <p className="mt-2 font-display text-xl font-semibold text-primary">
              {tier.price}
            </p>
            <p className="mt-3 flex-1 text-sm text-secondary">
              {tier.blurb}
            </p>
            <span className="mt-4 text-sm font-medium text-action">
              Contact sales →
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
