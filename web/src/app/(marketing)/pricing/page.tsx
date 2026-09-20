import type { Metadata } from "next";
import { LEGAL_ENTITY } from "@/lib/site/legal-entity";
import { Suspense } from "react";
import { pageMetadata } from "@/lib/seo/page-meta";
import { PageViewTracker } from "@/components/site/page-view-tracker";
import { Building2, Check, Database, Users } from "lucide-react";
import Link from "next/link";
import { FAQV2 } from "@/components/landing/faq-v2";
import { PricingSegmentSwitch } from "@/components/landing/pricing-segment-switch";
import { annualAvailablePlanIds, purchasablePlanIds } from "@/lib/plans/annual-available";
import { FAQJsonLd } from "@/components/seo/json-ld";
import { BreadcrumbListJsonLd } from "@/components/seo/breadcrumb-json-ld";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { CtaBand, FeatureGrid, PageHero, Section } from "@/components/marketing/template";
import { LogoCloud } from "@/components/landing/logo-cloud";
import { StickyCta } from "@/components/sales/sticky-cta";
import { PricingFeatureNotice } from "@/components/landing/pricing-feature-notice";
import { GST_POLICY_LINE } from "@/lib/plans-v2";

// S31-D: static + ISR (300 s, the edge TTL in
// lib/security/public-cacheable-routes.ts). The catalogue is code
// (`lib/plans-v2`), there is no Supabase read on this page any more, and
// the `?segment=` deep link is resolved client-side by
// <PricingSegmentSwitch> instead of via `searchParams` (which would force a
// per-request render).
export const revalidate = 300;

// 2026-09-07 (Workstream B5) retired the four persona tabs (Founder /
// Investor / Advisor / Accelerator). 2026-09-10 (G12, T0268) brought back a
// deliberately smaller switch; Pricing v4 (2026-09-16, plan §3.2) makes it
// three tabs, one per self-serve ladder:
//
//   Founder    Free / Starter A$29 / Growth A$69
//   Evaluator  Scout A$79 / Firm A$149 / Program A$349 / Fund A$999
//              (investor_angel / investor_advisor / investor_vc_small /
//              investor_fund)
//   Programs   Intake link A$249 / Cohort 25 A$500 / Cohort 100 A$1,500
//              (accelerator_intake / accelerator_starter /
//              accelerator_growth — annual-first, 14-day trial)
//
// The contact-sales row below the switch (VC Enterprise / Cohort
// Enterprise / Index API) stays visible under every tab.
// Deep links: `?segment=evaluator|programs` (canonical),
// `?persona=investor|accelerator` (the deck v3 / G14 alias, 2026-09-16),
// plus the legacy `?tab=` and `?tier=` params still linked from older
// campaigns — investor-shaped values (investor / advisor / fund / vc) land
// on Evaluator, program-shaped values (accelerator / program / incubator /
// university) on Programs, so none of those links 404 or silently show the
// wrong ladder. Persona pages keep deep-linking to a card via `#tier-growth`
// / `#tier-scout` / `#tier-fund` / `#tier-cohort-25` fragments defined on
// <PricingMatrix />.
export const metadata: Metadata = pageMetadata({
  title: "Pricing — founder, evaluator and program plans",
  description: "Founder plans from free (Starter A$29, Growth A$69). Evaluators: Scout A$79, Firm A$149, Program A$349, Fund A$999. Accelerators from an Intake link. Free trial.",
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
    question: "Founder, Evaluator or Programs — which plans do I see?",
    answer:
      "Use the Founder / Evaluator / Programs switch above the plans. Founder shows Free, Starter A$29 and Growth A$69. Evaluator shows Scout A$79, Firm A$149, Program A$349 and Fund A$999 for angels, advisory firms, VC teams and funds — each with a 7-day free trial, card required, cancel anytime. Programs shows the Intake link (A$2,490 a year), Cohort 25 (A$5,000 a year) and Cohort 100 (A$15,000 a year) for accelerators, incubators and university programs, billed annually with a 14-day free trial. Without a subscription, every full Trusted Business Report is A$3 per startup.",
  },
  {
    question: "What does Fund add over Program, and what is the Intake link?",
    answer:
      "Fund (A$999 a month) takes Program to 10 seats, 500 tracked startups and unlimited Trusted Business Reports, with your own rubric weights on every batch and the quarterly LP / sponsor export. The Intake link (A$249 a month, billed annually) is the smallest Programs rung: score one application round on one rubric — 40 reports a month, 60 startups, 3 seats. Cohort 25 and Cohort 100 add the cohort dashboard, monthly AI credits and, on Cohort 100, cohort management for multi-cohort programs.",
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

export default async function PricingPage() {
  // Annual toggle honesty (2026-09-16 audit): only rungs with a yearly
  // Stripe Price render a per-year figure + carry `interval=annual`.
  const [annualAvailable, purchasable] = await Promise.all([annualAvailablePlanIds(), purchasablePlanIds()]);
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

      {/* S31-B — why the visitor is here, when a gate sent them. Client-side
          (useSearchParams) so /pricing stays static/cacheable (S31-D). */}
      <Suspense fallback={null}>
        <PricingFeatureNotice />
      </Suspense>

      {/* Above-the-fold hero — ONE primary CTA + the anchor link to the
          ladder as the secondary, per CRO §06. G17 P2-A: the template's
          PageHero (one h1); the trust row + guarantees sit in its footnote
          so nothing reflows across the hydration boundary. */}
      <PageHero
        eyebrow="Pricing v4"
        title="Get fundable in 7 days. Then choose your plan."
        sub="Free trial on every self-serve plan — Founder (Starter, Growth), Evaluator (Scout, Firm, Program, Fund) or Programs (Intake link, Cohort 25, Cohort 100). Card required at signup, charged only when the trial ends (7 days; 14 days on Programs). Cancel anytime before with no charge. Enterprise on request."
        ctas={[
          { href: "/signup?plan=founder_growth&trial=1", label: "Start 7-day free trial", ctaId: "pricing_hero_trial" },
          { href: "#pricing-matrix", label: "See the plans below", variant: "link" },
        ]}
        align="start"
        footnote={
          <span className="flex flex-col gap-3">
            <span aria-label="Pricing trust row" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-secondary">
              <span>Cancel any time</span>
              <span aria-hidden="true">&middot;</span>
              <span>AUD pricing, GST-inclusive</span>
              <span aria-hidden="true">&middot;</span>
              <span>ATO tax invoice issued for every charge</span>
              <span aria-hidden="true">&middot;</span>
              <span>AU-based support</span>
            </span>
            <span aria-label="Pricing guarantees" className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-secondary">
              {PRICING_GUARANTEES.map((g) => (
                <span key={g} className="inline-flex items-center gap-2">
                  <Check aria-hidden="true" className="h-4 w-4 text-action" />
                  {g}
                </span>
              ))}
            </span>
          </span>
        }
      />

      {/* Founder | Evaluator switch (G12, T0268) over the 3-rung ladders.
          Founder: Free / Starter A$29 / Growth A$69 — "Pro" (founder_scale)
          retired 2026-09-08. Evaluator: Scout A$79 / Firm A$149 / Program
          A$349. `publicPlansForSegment()` is the authority for each ladder;
          plans-v2.test.ts pins both. `id="pricing-matrix"` is the anchor
          target for the hero's secondary text link; persona pages deep-link
          to a card via `#tier-growth` / `#tier-scout` fragments. */}
      <Section id="pricing-matrix" ariaLabel="Pricing matrix" spacing="sm" divider={false}>
        <PricingSegmentSwitch annualAvailable={annualAvailable} purchasable={purchasable} />
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
      </Section>

      {/* Contact-sales row for the tiers that don't fit either self-serve
          ladder — Accelerator cohorts, VC Enterprise, and multi-entity
          Enterprise. Rendered under both tabs. Each tile prefills /contact
          with `?plan=<slug>` so the sales team can pick the intent up in
          one glance. */}
      <ContactSalesRow />

      {/* FAQ — <FAQV2 /> carries its own heading; the JSON-LD above mirrors it. */}
      <Section id="faq-band" ariaLabel="Frequently asked questions" spacing="sm">
        <FAQV2 />
      </Section>

      {/* Enterprise */}
      <Section
        id="enterprise"
        eyebrow="Enterprise"
        title="Need custom pricing or equity-in-lieu?"
        lede="Enterprise multi-entity plans with SSO, API access, dedicated CSM, or our compliance-gated equity-for-solution arrangement (5–10% equity in lieu of cash)."
        tone="sunken"
        align="center"
        spacing="sm"
      >
        {/* Narrow curator-controlled integration strip. Renders NOTHING when the config is empty. */}
        <LogoCloud group="integrated" density="compact" />
      </Section>

      <CtaBand
        title="Talk to sales for a bespoke fit."
        sub="Every enterprise tier includes a demo call with our founder team."
        primary={{ href: "/contact", label: "Talk to sales", ctaId: "pricing_final_sales" }}
        secondary={{ href: "/workspace/esop/offers", label: "Explore equity-for-solution" }}
        footnote={`Not financial advice. Equity arrangements require independent legal and tax review. ${LEGAL_ENTITY.operator} · ${LEGAL_ENTITY.city}.`}
      />

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
// Every tier that needs a conversation (funds beyond ten seats with SSO,
// unlimited cohorts, the data-only Index API) surfaces below the grid in
// this row, under every tab. Each tile links to /contact with
// `?plan=<slug>` + `?contact_reason=<slug>` prefill so the sales team knows
// which SKU prompted the enquiry without asking again. Pricing v4
// (2026-09-16): the accelerator tile became the self-serve Programs tab and
// the row now carries VC Enterprise / Cohort Enterprise / Index API.
interface ContactSalesTier {
  slug: string;
  label: string;
  price: string;
  blurb: string;
}

const CONTACT_SALES_TIERS: ReadonlyArray<ContactSalesTier> = [
  {
    slug: "investor_vc_ent",
    label: "VC Enterprise",
    price: "custom",
    blurb: "Funds beyond Fund's 10 seats: unlimited seats and reports, SSO / SAML, dedicated success manager.",
  },
  {
    slug: "accelerator_enterprise",
    label: "Cohort Enterprise",
    price: "from A$35,000/yr",
    blurb: "Unlimited startups, seats and reports; white-label reports, read-only API, SSO / SAML, a dedicated program manager.",
  },
  {
    slug: "index_api",
    label: "Index API",
    price: "A$299/mo",
    blurb: "Read-only Startup Value Index feed — 1,000 calls a day, 2 keys. Data access only, no workspace.",
  },
];

const PRICING_GUARANTEES = [
  "7-day free trial on every Founder and Evaluator plan",
  "14-day pilot on request (Cohort / Enterprise)",
  "No lock-in — cancel any time",
  GST_POLICY_LINE,
] as const;

const CONTACT_SALES_ICONS = { investor_vc_ent: Building2, accelerator_enterprise: Users, index_api: Database } as const;

function ContactSalesRow() {
  return (
    <Section
      id="contact-sales"
      eyebrow="Funds, enterprise programs and data access"
      title="Talk to sales for a bespoke fit"
      lede="Program A$349 and Fund A$999 cover most VC teams self-serve; Cohort 25 and Cohort 100 cover most programs. Need SSO, unlimited seats or the raw index feed? Every tier below includes a demo call with our founder team."
      align="center"
      spacing="sm"
    >
      <FeatureGrid
        columns={3}
        ariaLabel="Contact-sales pricing row"
        items={CONTACT_SALES_TIERS.map((tier) => ({
          icon: CONTACT_SALES_ICONS[tier.slug as keyof typeof CONTACT_SALES_ICONS] ?? Building2,
          title: `${tier.label} — ${tier.price}`,
          body: tier.blurb,
          href: `/contact?plan=${tier.slug}&contact_reason=${tier.slug}`,
          cta: "Contact sales",
          ctaId: `pricing_contact_${tier.slug}`,
        }))}
      />
    </Section>
  );
}
