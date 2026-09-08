import type { Metadata } from "next";
import { PageViewTracker } from "@/components/site/page-view-tracker";
import { Building2, Check } from "lucide-react";
import Link from "next/link";
import { FAQV2 } from "@/components/landing/faq-v2";
import { PricingMatrix } from "@/components/landing/pricing-matrix";
import { FAQJsonLd } from "@/components/seo/json-ld";
import { BreadcrumbListJsonLd } from "@/components/seo/breadcrumb-json-ld";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { MarketingHero } from "@/components/marketing/marketing-hero";
import { MarketingSection } from "@/components/marketing/marketing-section";
import { MarketingCtaStrip } from "@/components/marketing/marketing-cta-strip";
import { LogoCloud } from "@/components/landing/logo-cloud";
import { StickyCta } from "@/components/sales/sticky-cta";
import type { Segment } from "@/lib/plans-v2";

// Force dynamic — pricing reads platform_config (Supabase) on every
// request, and searchParams (?tier=…) picks the initial tab. ISR would
// serve stale copy while the pricing catalogue evolves.
export const dynamic = "force-dynamic";

// 2026-09-07 (Workstream B5): the persona segment tabs are gone. /pricing
// renders the Universal 3-rung ladder (Free / Growth / Pro) + a
// contact-sales row for Accelerator / VC / Enterprise. Persona pages now
// deep-link to a specific card via `#tier-growth` / `#tier-pro`
// fragments defined on <PricingMatrix />.
//
// resolveSegmentFromTier() is kept as a no-op returning "founder" so the
// `?tier=` query param (still linked from legacy campaigns + tests) does
// not 404. VALID_SEGMENTS stays exported for the SSR type contract.
const VALID_SEGMENTS: readonly Segment[] = [
  "founder",
  "investor",
  "advisor",
  "accelerator",
] as const;

function resolveSegmentFromTier(
  _tier: string | string[] | undefined,
): Segment {
  void _tier;
  void VALID_SEGMENTS;
  return "founder";
}

export const metadata: Metadata = {
  title: "Pricing — BlockID.au",
  description:
    "12-SKU pricing across Founder, Investor, Advisor and Accelerator tiers. Every monthly plan includes a 7-day free trial. Cancel anytime before Day 8 — no charge.",
  alternates: {
    canonical: "https://blockid.au/pricing",
  },
  openGraph: {
    title: "Pricing — BlockID.au",
    description:
      "12-SKU pricing across Founder, Investor, Advisor and Accelerator tiers. Every monthly plan includes a 7-day free trial.",
    url: "https://blockid.au/pricing",
    siteName: "BlockID.au",
    type: "website",
    locale: "en_AU",
    images: [
      {
        url: "/images/logo-full.png",
        width: 1556,
        height: 880,
        alt: "BlockID.au — 12-SKU pricing matrix with 7-day trial",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Pricing — BlockID.au",
    description:
      "12-SKU pricing across Founder, Investor, Advisor and Accelerator tiers. 7-day trial included.",
    images: ["/images/logo-full.png"],
  },
  robots: { index: true, follow: true },
};

const FAQ_JSONLD = [
  {
    question: "What happens after the 7-day free trial?",
    answer:
      "Your plan auto-charges on Day 8 unless you cancel at least 24 hours before the trial ends. We email reminders at T-3, T-1, and T-0 so you always know what's coming.",
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
    question: "What's the refund policy?",
    answer:
      "7-day money-back guarantee on your first paid month. Contact support and we'll process within 3 business days.",
  },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface PricingPageProps {
  searchParams: Promise<{ tier?: string | string[] }>;
}

export default async function PricingPage({ searchParams }: PricingPageProps) {
  const sp = await searchParams;
  // Kept for the SSR contract; the retired persona segment tabs used to
  // consume this. See resolveSegmentFromTier() docstring.
  void resolveSegmentFromTier(sp?.tier);
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
        subtitle="7-day free trial (Growth + Pro). Card required at signup, charged only on Day 8. Cancel anytime before with no charge. Accelerator / VC / Enterprise pilots on request (14-day)."
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
            See all 12 plans below ↓
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
            7-day free trial (Growth + Pro)
          </span>
          <span className="inline-flex items-center gap-2">
            <Check aria-hidden="true" className="h-4 w-4 text-action" />
            14-day pilot on request (Accelerator / VC / Enterprise)
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

      {/* Universal 3-rung pricing matrix (Free / Growth / Pro).
          `id="pricing-matrix"` is the anchor target for the hero's
          secondary text link. Persona segment tabs retired 2026-09-07 —
          persona pages now deep-link to a specific card via
          `/pricing#tier-growth` / `#tier-pro` fragments. */}
      <section
        id="pricing-matrix"
        aria-label="Pricing matrix"
        className="mx-auto max-w-7xl px-6 py-8 sm:py-12 scroll-mt-24"
      >
        <PricingMatrix />
      </section>

      {/* Contact-sales row for the tiers that don't fit the self-serve
          Universal 3-rung ladder — Accelerator cohort, Investor VC, and
          Enterprise. Each tile prefills /contact with `?plan=<slug>` so
          the sales team can pick the intent up in one glance. */}
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
// The public /pricing ladder is deliberately three rungs (Free / Growth /
// Pro) — every tier that needs a conversation (cohort seats, fund
// deal-flow, multi-entity enterprise) surfaces below the grid in this
// row. Each tile links to /contact with `?plan=<slug>` +
// `?contact_reason=<slug>` prefill so the sales team knows which SKU
// prompted the enquiry without asking again.
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
    label: "Investor VC",
    price: "from A$349/mo",
    blurb: "Curated deal flow, portfolio tracking, LP export, team seats.",
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
          14-day pilot on request. Every tier below includes a demo call
          with our founder team.
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
