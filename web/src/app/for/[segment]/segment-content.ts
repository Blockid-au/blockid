/**
 * SEGMENT_CONTENT — canonical marketing copy for the /for/[segment] landing
 * pages. Hard-coded on the server (no fetch, no i18n at this stage) so the
 * dynamic route stays trivially cache-friendly and statically renderable.
 *
 * Keep each segment under ~250 words total (features + steps + FAQ + hero).
 * No emoji, no marketing fluff — write like a diligence memo.
 *
 * PRICES ARE NOT TYPED HERE. Three of the four were wrong on 2026-09-09 —
 * Founder Growth read A$79 against A$69, Investor Angel A$99 against A$79,
 * and Accelerator Growth A$499 against A$1,500 — because a literal on a
 * marketing page cannot follow a price change it does not know about. Each
 * anchor now names a plan id and `anchorPrice()` reads that plan's cents from
 * the generated catalogue, which is built from plans.csv.
 */

import { GENERATED_PLANS_BY_ID } from "@/config/pricing/plans.generated";

/**
 * "A$69 / month" for a plan id, from the catalogue.
 *
 * Throws on an unknown id rather than printing a wrong or empty price: a
 * marketing page showing the wrong amount is a compliance problem, and this
 * module is imported at build time, so a bad id fails the build instead of
 * reaching a visitor. Whole dollars only — every subscription price in the
 * catalogue is a round dollar amount, and the colocated suite pins that.
 */
export function anchorPrice(planId: string): string {
  const plan = GENERATED_PLANS_BY_ID[planId];
  if (!plan) throw new Error(`segment planAnchor names unknown plan "${planId}"`);
  const dollars = plan.price_aud_cents / 100;
  return `A$${dollars.toLocaleString("en-AU")} / month`;
}

export interface SegmentContent {
  slug: "founder" | "investor" | "accelerator";
  label: string;
  hero: { headline: string; subhead: string };
  features: string[];
  steps: string[];
  planAnchor: { id: string; label: string; price: string };
  faq: Array<{ q: string; a: string }>;
}

/**
 * 2026-09-10 (T0274): `advisor` removed. Every `/for/*` slug now 301s to its
 * `/solutions/*` twin in next.config.ts — `/for/advisor` was the last one
 * that still rendered, and it recommended the founder Growth plan to
 * advisory firms. `/solutions/advisor` (Firm A$149) is the real page.
 */
export const SEGMENT_SLUGS = [
  "founder",
  "investor",
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
      "Investor-ready SVI score with 8 SVI dimensions",
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
      price: anchorPrice("founder_growth"),
    },
    faq: [
      {
        q: "How is SVI different from a pitch deck score?",
        a: "SVI grades 8 SVI dimensions — traction, team, market, moat, terms — using the same rubric professional investors use during a first-pass review.",
      },
      {
        q: "Can I import my existing cap table?",
        a: "You enter holders, share classes and option grants directly in the cap table, and the SAFE and conversion modelling runs off those. There is no CSV importer yet — for a register of any size, expect to spend a few minutes typing it in.",
      },
      {
        q: "Do investors need a BlockID account to view my pack?",
        a: "No. They receive a signed link that you can expire or revoke, and you see who opened it and when — all without them creating an account. The link is not an NDA: if you need one signed, do that separately before you send it.",
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
      "Saved filters and a daily digest of new matches",
    ],
    steps: [
      "Add filters — stage, sector, geo, minimum SVI band.",
      "See scored deals — daily digest of matches with founder intros.",
      "Save to watchlist — get notified when a company re-scores or raises.",
    ],
    planAnchor: {
      id: "investor_angel",
      label: "Investor Angel",
      price: anchorPrice("investor_angel"),
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
  accelerator: {
    slug: "accelerator",
    label: "Accelerators",
    hero: {
      headline: "BlockID for Accelerators",
      subhead:
        "Run every cohort on one platform — batch-score startups, track progress week over week, and ship LPs a quarterly report they trust.",
    },
    // 2026-09-09. `/api/accelerator/cohort` describes itself as a "cohort CRUD
    // stub", and `lib/accelerator-portal.ts` reads a `cohorts` table that does
    // not exist, so `getCohort()` returns a hard-coded placeholder for every
    // caller. Batch scoring, the LP quarterly pack and the demo-day export
    // have no code path at all. Mentor tooling is the exception — the roster,
    // check-ins and notes at /api/mentor are real — so it stays, described as
    // what it is rather than as "matching by expertise".
    features: [
      "A workspace per startup, each scored on the same eight dimensions",
      "Score history per startup, so you can see movement across the programme",
      "Mentor roster with check-ins and shared notes on each founder",
      "Data room and live investor link for every company you take to Demo Day",
      "Quarterly report surface for the programme — in build",
      "Batch scoring across a whole cohort in one run — in build",
    ],
    steps: [
      "Set up each startup — its profile, then its first score.",
      "Assign mentors — roster, check-ins and notes live alongside the score.",
      "Review the movement — score history per company, session to session.",
    ],
    planAnchor: {
      id: "accelerator_growth",
      label: "Accelerator Growth",
      price: anchorPrice("accelerator_growth"),
    },
    faq: [
      {
        q: "How many startups can I run?",
        a: "Seats scale with your cohort size — the plan you talk to us about is sized around the number of companies, not the number of programmes.",
      },
      {
        q: "Can LPs see the underlying startups?",
        a: "Only if you choose. Nothing about a startup leaves its workspace unless you or the founder shares it. The packaged LP quarterly report is still in build; today you would assemble it from each company's own report.",
      },
      {
        q: "Do you integrate with our existing CRM?",
        a: "There is an outbound webhook you can point at Zapier, which is how most teams reach their CRM today. There is no HubSpot or Airtable connector, and no public write API — if you need one, tell us what you would send it.",
      },
    ],
  },
};
