/**
 * SEGMENT_CONTENT — canonical marketing copy for the /for/[segment] landing
 * pages. Hard-coded on the server (no fetch, no i18n at this stage) so the
 * dynamic route stays trivially cache-friendly and statically renderable.
 *
 * Keep each segment under ~250 words total (features + steps + FAQ + hero).
 * No emoji, no marketing fluff — write like a diligence memo.
 */

export interface SegmentContent {
  slug: "founder" | "investor" | "advisor" | "accelerator";
  label: string;
  hero: { headline: string; subhead: string };
  features: string[];
  steps: string[];
  planAnchor: { id: string; label: string; price: string };
  faq: Array<{ q: string; a: string }>;
}

export const SEGMENT_SLUGS = [
  "founder",
  "investor",
  "advisor",
  "accelerator",
] as const;

export type SegmentSlug = (typeof SEGMENT_SLUGS)[number];

export function isSegmentSlug(v: string): v is SegmentSlug {
  return (SEGMENT_SLUGS as readonly string[]).includes(v);
}

export const SEGMENT_CONTENT: Record<SegmentSlug, SegmentContent> = {
  founder: {
    slug: "founder",
    label: "Founders",
    hero: {
      headline: "BlockID for Founders",
      subhead:
        "Score your startup, keep your cap table clean, and hand investors a diligence-ready pack in a single link.",
    },
    features: [
      "Investor-ready SVI score with 13 diligence signals",
      "Cap table with SAFE, options and conversion modelling",
      "ESOP plan generator with vesting schedules",
      "Data room with granular investor access logs",
      "Valuation range with comparable-transaction sourcing",
      "Shareable investor pack — one link, always current",
    ],
    steps: [
      "Sign up — 60-second onboarding, no credit card until Day 8.",
      "Run your SVI — auto-fills from your idea plus a short questionnaire.",
      "Share with investors — send the pack link, watch views in real time.",
    ],
    planAnchor: {
      id: "founder_growth",
      label: "Founder Growth",
      price: "A$79 / month",
    },
    faq: [
      {
        q: "How is SVI different from a pitch deck score?",
        a: "SVI grades 13 diligence signals — traction, team, market, moat, terms — using the same rubric professional investors use during a first-pass review.",
      },
      {
        q: "Can I import my existing cap table?",
        a: "Yes. Paste from a spreadsheet or upload a CSV — we detect founders, SAFEs, options and preferred rounds automatically.",
      },
      {
        q: "Do investors need a BlockID account to view my pack?",
        a: "No. They receive a signed link; view tracking and NDA gating happen without them creating an account.",
      },
    ],
  },
  investor: {
    slug: "investor",
    label: "Investors",
    hero: {
      headline: "BlockID for Investors",
      subhead:
        "Scored deal flow, watchlists, and diligence packs that stay in sync with the founder — never a stale PDF again.",
    },
    features: [
      "Deal flow feed ranked by SVI score with saved filters",
      "Watchlist with change alerts when a startup re-scores",
      "Diligence pack viewer with founder-authored source docs",
      "SVI feed API for syndicate scouts and analysts",
      "Portfolio dashboard with quarterly re-scoring",
      "Angel and VC modes with per-fund note privacy",
    ],
    steps: [
      "Add filters — stage, sector, geo, minimum SVI band.",
      "See scored deals — daily digest of matches with founder intros.",
      "Save to watchlist — get notified when a company re-scores or raises.",
    ],
    planAnchor: {
      id: "investor_angel",
      label: "Investor Angel",
      price: "A$99 / month",
    },
    faq: [
      {
        q: "Where does deal flow come from?",
        a: "Founders opt-in to the investor index during onboarding. You only see startups that have consented to being surfaced.",
      },
      {
        q: "Is SVI a substitute for diligence?",
        a: "No. SVI is a triage layer — it surfaces signals worth chasing. Every deal still ships with source docs and a data-room link for real diligence.",
      },
      {
        q: "Can my analysts share a watchlist?",
        a: "Yes. Investor plans include team seats with role-scoped access to watchlists and notes.",
      },
    ],
  },
  advisor: {
    slug: "advisor",
    label: "Advisors",
    hero: {
      headline: "BlockID for Advisors",
      subhead:
        "One console for every client — track their SVI progress, log engagements, and report progress in your own brand.",
    },
    features: [
      "Client roster with per-client SVI trend",
      "Engagement notes tied to the client's timeline",
      "Per-client score deltas and coaching prompts",
      "White-label reports with your firm's brand and domain",
      "Retainer billing metrics and utilisation reporting",
      "Referral pipeline with founder-consent workflow",
    ],
    steps: [
      "Add a client — invite by email or import from your CRM.",
      "Track SVI — quarterly re-score with prompts on stalled signals.",
      "Report progress — export a white-labelled PDF or share a live link.",
    ],
    planAnchor: {
      id: "investor_advisor",
      label: "Advisor Practice",
      price: "A$149 / month",
    },
    faq: [
      {
        q: "Can I brand reports as my firm?",
        a: "Yes. Advisor plans include a white-label domain, logo, and colour theme applied to shared reports and PDFs.",
      },
      {
        q: "Do my clients see other clients?",
        a: "Never. Every client workspace is siloed — you are the only account that can see across the roster.",
      },
      {
        q: "How does billing work for clients?",
        a: "You can either bring your own billing relationship or use the advisor console to invoice clients through BlockID.",
      },
    ],
  },
  accelerator: {
    slug: "accelerator",
    label: "Accelerators",
    hero: {
      headline: "BlockID for Accelerators",
      subhead:
        "Run every cohort on one platform — batch-score startups, track progress week over week, and ship LPs a quarterly report they trust.",
    },
    features: [
      "Cohort management with batch onboarding",
      "Batch SVI scoring across the full cohort",
      "Weekly progress dashboard with signal deltas",
      "LP-ready quarterly report with portfolio SVI",
      "Mentor matching by expertise and cohort tag",
      "Demo day pack export for every graduating startup",
    ],
    steps: [
      "Add a cohort — invite founders in bulk with a signed link.",
      "Batch-score — kick off SVI for every startup in a single run.",
      "Export the report — LP quarterly pack in PDF and shareable link.",
    ],
    planAnchor: {
      id: "accelerator_growth",
      label: "Accelerator Growth",
      price: "A$499 / month",
    },
    faq: [
      {
        q: "How many cohorts can I run?",
        a: "Unlimited cohorts on the Growth plan; per-startup seats scale with your cohort size.",
      },
      {
        q: "Can LPs see the underlying startups?",
        a: "Only if you choose. LP reports default to aggregate SVI with per-startup detail behind an opt-in gate.",
      },
      {
        q: "Do you integrate with our existing CRM?",
        a: "Yes. Zapier, HubSpot and Airtable integrations ship on the accelerator tier, plus a REST API for custom pipelines.",
      },
    ],
  },
};
