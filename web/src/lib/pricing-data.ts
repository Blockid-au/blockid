// Shared pricing display data — single source of truth for all pricing UIs.
//
// Both `src/components/landing/pricing.tsx` and `src/app/pricing/page.tsx`
// import from here so credit counts, plan names, and prices never diverge.
//
// Underlying plan IDs, cent-prices, and billing helpers live in `@/lib/plans`.

// ---------------------------------------------------------------------------
// Plan tiers
// ---------------------------------------------------------------------------

export interface PricingTier {
  id: string;
  name: string;
  /** Display price string (e.g. "$0", "A$49"). */
  price: string;
  /** Numeric price in AUD dollars (for coupon math). undefined = free. */
  numericPrice?: number;
  /** Human-readable billing cadence shown next to price. */
  cadence?: string;
  /** Secondary note beneath the price. */
  subtitle?: string;
  /** Short credits tagline (e.g. "2 credits", "100 credits included"). */
  credits: string;
  /** Who this plan is for (one-liner). */
  audience: string;
  /** Bullet-point feature list. */
  features: string[];
  /** Primary CTA. */
  cta: { label: string; href: string };
  /** Visual style hint — only one tier should be highlighted at a time. */
  highlight?: boolean;
  /** Badge label (e.g. "Best Value", "Early Bird"). */
  badge?: string;
  /** Urgency / scarcity text beneath CTA. */
  urgency?: string;
  /** Button style hint for the dedicated pricing page. */
  ctaStyle: "primary" | "secondary";
}

export const PRICING_TIERS: PricingTier[] = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    cadence: "forever",
    credits: "2 credits",
    audience: "Try BlockID — no signup needed",
    features: [
      "1 SVI analysis",
      "Investor-Ready Score",
      "Basic dilution calculator",
      "Shareable web link",
    ],
    cta: { label: "Get Started Free", href: "/#svi" },
    ctaStyle: "secondary",
  },
  {
    id: "founding50",
    name: "Founding 50",
    price: "A$49",
    numericPrice: 49,
    cadence: "one-off",
    subtitle: "one-time \u00b7 lifetime access",
    credits: "50 credits",
    audience: "Everything you need from idea to fundraise",
    features: [
      "50 SVI analyses",
      "Evidence Vault & export packs",
      "Cap table & equity tools",
      "Term Sheet AI",
      "Co-founder matching",
      "30-day growth plan",
      "Referral credits",
      "Priority support",
    ],
    cta: { label: "Get Founding 50 \u2014 A$49", href: "/founding-50" },
    highlight: true,
    badge: "Best Value",
    urgency: "Only 50 spots at this price",
    ctaStyle: "primary",
  },
  {
    id: "growth",
    name: "Growth",
    price: "A$99",
    numericPrice: 99,
    cadence: "/mo (early-bird)",
    subtitle: "Early-bird \u2014 normally $499/mo",
    credits: "100 credits/mo",
    audience: "For active fundraise \u00b7 Seed to Series A",
    features: [
      "100 SVI analyses/mo",
      "Everything in Founding 50",
      "Multi-entity cap table",
      "Investor data room",
      "Term Sheet AI (unlimited)",
      "Custom branding",
      "Dedicated account manager",
      "30-day money back",
    ],
    cta: { label: "Start Growth \u2014 A$99/mo", href: "/auth/login?plan=growth" },
    badge: "Early Bird",
    urgency: "Early-bird until July 31, 2026",
    ctaStyle: "primary",
  },
  {
    id: "growth_annual",
    name: "Growth",
    price: "A$950",
    numericPrice: 950,
    cadence: "/year",
    subtitle: "Save A$238/year (20% off monthly)",
    credits: "100 credits/mo",
    audience: "For active fundraise \u00b7 Seed to Series A",
    features: [
      "100 SVI analyses/mo",
      "Everything in Founding 50",
      "Multi-entity cap table",
      "Investor data room",
      "Term Sheet AI (unlimited)",
      "Custom branding",
      "Dedicated account manager",
      "30-day money back",
    ],
    cta: { label: "Start Growth \u2014 A$950/yr", href: "/auth/login?plan=growth_annual" },
    badge: "Save 20%",
    urgency: "Early-bird until July 31, 2026",
    ctaStyle: "primary",
  },
];

// ---------------------------------------------------------------------------
// Credit packs
// ---------------------------------------------------------------------------

export interface CreditPack {
  credits: number;
  /** Price in AUD dollars. */
  price: number;
  /** Display savings badge (e.g. "Save 40%"). null = no badge. */
  savings: string | null;
  /** Link to purchase. */
  href: string;
}

export const CREDIT_PACKS: CreditPack[] = [
  { credits: 10, price: 5, savings: null, href: "/workspace/billing#credits" },
  { credits: 25, price: 9, savings: "Save 28%", href: "/workspace/billing#credits" },
  { credits: 50, price: 15, savings: "Save 40%", href: "/workspace/billing#credits" },
  { credits: 100, price: 25, savings: "Save 50%", href: "/workspace/billing#credits" },
];

// ---------------------------------------------------------------------------
// Feature comparison (used by /pricing page)
// ---------------------------------------------------------------------------

export interface ComparisonRow {
  feature: string;
  free: string;
  founding: string;
  growth: string;
}

export const COMPARISON_ROWS: ComparisonRow[] = [
  { feature: "SVI Analyses", free: "1", founding: "50", growth: "100/mo" },
  { feature: "PDF Export", free: "-", founding: "Yes", growth: "Yes" },
  { feature: "Evidence Vault", free: "-", founding: "Yes", growth: "Yes" },
  { feature: "Term Sheet AI", free: "-", founding: "Yes", growth: "Unlimited" },
  { feature: "Referral credits", free: "-", founding: "Yes", growth: "Yes" },
  { feature: "Priority support", free: "-", founding: "-", growth: "Yes" },
];

// ---------------------------------------------------------------------------
// FAQ (used by /pricing page)
// ---------------------------------------------------------------------------

export interface FaqItem {
  q: string;
  a: string;
}

export const FAQ_ITEMS: FaqItem[] = [
  {
    q: "What is a credit?",
    a: "Credits are the currency used across BlockID features. A standard SVI analysis costs 0.50 credits, while advanced features like Term Sheet AI cost 1 credit. Free features like evidence upload and investor score cost 0 credits.",
  },
  {
    q: "Can I upgrade later?",
    a: "Yes. You can upgrade from Free to Founding 50 or Growth at any time. Your existing credits and data carry over. Founding 50 members get priority upgrade pricing.",
  },
  {
    q: "Is there a free trial?",
    a: "Every new account starts with 2 free credits, enough for about 4 standard SVI analyses. No credit card required. If you need more, grab a credit pack or upgrade to a plan.",
  },
  {
    q: "How does billing work?",
    a: "Founding 50 is a one-off A$49 payment. Growth is available monthly at A$99/mo or annually at A$950/year (save 20%). Credit packs are one-off purchases. All prices are in AUD and processed securely via Stripe.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. Growth plan subscriptions can be cancelled at any time from your billing page. Your credits remain available until the end of the billing period. Founding 50 has no recurring charges to cancel.",
  },
  {
    q: "Do you offer refunds?",
    a: "Growth plan includes a 30-day money-back guarantee. For Founding 50, we assess refund requests on a case-by-case basis within 14 days of purchase. Credit packs are non-refundable once used.",
  },
  {
    q: "Is my data secure?",
    a: "Yes. All data is encrypted in transit (TLS 1.3) and at rest. We use Supabase with row-level security so your company data is strictly isolated from other users. Payments are handled by Stripe — we never store card details.",
  },
  {
    q: "Where is my data stored?",
    a: "Your data is stored on servers in Australia (Sydney region). We do not transfer your data outside AU/NZ. This ensures compliance with the Australian Privacy Act 1988 and GDPR where applicable.",
  },
  {
    q: "Do I need technical knowledge?",
    a: "No. BlockID is built for founders, not engineers. You can run a full SVI analysis by pasting a company description — no integrations required. OAuth connectors (Stripe, Xero, Google Analytics) are optional and take under 2 minutes to set up.",
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Prices that can be discounted, keyed by plan display name. Uses id-based dedup so Growth monthly & annual don't collide. */
export const discountablePrices: Record<string, number> = Object.fromEntries(
  PRICING_TIERS
    .filter((t) => t.numericPrice !== undefined && t.id !== "growth_annual")
    .map((t) => [t.name, t.numericPrice!]),
);
