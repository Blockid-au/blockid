// feature-requirement — "what does this feature need, and where do I buy it?"
//
// S31-B (2026-09-13). `requireTierForPage()` and `<FeatureGate>` both send a
// locked user to `/pricing?feature=<slug>&from=<path>`, and the VISIBILITY
// table even documents an "upgradeCTA rendered on the pricing?feature=
// landing" — but /pricing never read either param. A trial founder who
// clicked "Cap table" in the sidebar simply arrived on the pricing page with
// no idea why. This resolver turns the two params into one sentence and a
// card anchor; <PricingFeatureNotice> renders it.
//
// Pure and isomorphic: plans-v2 + the tier ladder, no I/O.

import type { PlanTier } from "@/lib/segments";
import { PLAN_TIER_RANK } from "@/lib/segments";
import { PLANS_V2, EQUITY_ADDON_MONTHLY_AUD, formatAud, type Plan } from "@/lib/plans-v2";
import { ALL_LADDER_ENTRIES, type TierLadderEntry } from "./tier-ladder";
import { VISIBILITY, type FeatureSlug } from "./tier-visibility";
import { UPGRADE_CATALOGUE } from "./next-best-upgrade";

export interface FeatureRequirement {
  /** The slug as received (already validated as a plausible feature key). */
  feature: string;
  /** Plain-English name of the capability. */
  label: string;
  /** Plan that first includes it; null when only contact-sales rungs carry it. */
  plan: Plan | null;
  /** Price line for the plan or add-on, e.g. "A$29/mo" — "" when custom. */
  priceLine: string;
  /** `#tier-…` anchor on /pricing for the plan card, or null. */
  anchor: string | null;
  /** True when the feature comes from the A$59 Equity add-on on top of Growth. */
  viaAddon: boolean;
  /** Contact-sales only (Enterprise / reseller / cohort). */
  contactSales: boolean;
  /** Human label for the page the user came from, when `from` was given. */
  fromLabel: string | null;
}

const SLUG_RE = /^[a-z][a-z0-9_.]{1,63}$/;

const TIER_TO_PLAN_ID: Readonly<Record<PlanTier, string>> = Object.freeze({
  free: "founder_free",
  starter: "founder_starter",
  growth: "founder_growth",
  scale: "founder_growth", // Scale retired 2026-09-08; its features moved to Growth + add-on
  enterprise: "founder_enterprise",
  angel: "investor_angel",
  advisor: "investor_advisor",
  vc_small: "investor_vc_small",
  vc_ent: "investor_vc_ent",
  accel_starter: "accelerator_starter",
  accel_growth: "accelerator_growth",
  accel_ent: "accelerator_enterprise",
});

const TIER_ANCHORS: Readonly<Record<string, string>> = Object.freeze({
  founder_free: "#tier-free",
  founder_starter: "#tier-starter",
  founder_growth: "#tier-growth",
  investor_angel: "#tier-scout",
  investor_advisor: "#tier-firm",
  investor_vc_small: "#tier-program",
});

/** Slugs the resolver knows a friendly name for; everything else is humanised. */
const LABELS: Readonly<Record<string, string>> = Object.freeze({
  "svi.run": "unlimited SVI analyses",
  "svi.run.limited": "SVI analyses",
  "cap_table.write": "the cap table",
  "cap_table.read": "the cap table",
  share_management: "the cap table and share register",
  "data_room.access": "the investor data room",
  "data_room.read": "the investor data room",
  "data_room.write": "data-room uploads",
  "evidence.upload": "the Evidence Vault",
  "report.basic": "the written SVI report",
  "report.premium": "the premium investor report",
  investor_links: "investor share links",
  "investor_links.premium": "live investor links with watermarked PDFs",
  "term_sheet.ai": "Term Sheet AI",
  term_sheet_ai: "Term Sheet AI",
  "esop.manage": "ESOP management",
  "vesting.read": "vesting schedules",
  "vesting.write": "vesting schedules",
  "blockchain.sync": "on-chain cap-table sync",
  pdf_branding: "custom branding on exports",
  "equity_offer.request": "in-app equity offers",
  "secondary_market.view": "the secondary-market sandbox",
  grant_finder: "the full Money Finder report",
  money_radar: "Founder Radar alerts",
  "profile.multi": "multiple startup workspaces",
  advisor_portal: "the advisor portal",
  api: "API access",
  "api.access": "API access",
  sso: "single sign-on",
  white_label: "white-label branding",
  multi_entity: "multi-entity workspaces",
  watchlist: "the watchlist",
  "svi.feed": "the SVI feed",
  diligence_pack: "diligence packs",
  portfolio: "portfolio tracking",
  lp_export: "LP / sponsor export",
  lp_report: "the LP report",
  "cohort.view": "cohort views",
  "cohort.manage": "cohort management",
  "accelerator.cohort": "cohort reporting",
  investor_pack: "the investor pack",
  startup_package: "the Startup Package",
});

/** Route → label for the `from` param, so the notice can name the page. */
const FROM_LABELS: Readonly<Record<string, string>> = Object.freeze({
  "/workspace/equity/cap-table": "Cap Table",
  "/workspace/documents/data-room": "Data Room",
  "/workspace/esop": "ESOP",
  "/workspace/esop/vesting": "Vesting",
  "/workspace/exit/clean-room": "Clean Room",
  "/workspace/exit/listing": "Listing Readiness",
  "/workspace/equity/secondary": "Secondary Offer",
  "/workspace/esop/offers": "Equity Offer",
  "/workspace/settings/enterprise": "Custom Branding",
  "/workspace/settings/enterprise": "API Keys",
  "/workspace/reports/investor-pack": "Investor Pack",
  "/workspace/raise/round": "Fundraise",
  "/workspace/funding": "Money Finder",
  "/workspace/evidence": "Evidence Vault",
  "/workspace/raise/term-sheet": "Term Sheet AI",
  "/workspace/accelerator/quarterly-report": "Quarterly Report",
  "/workspace/exit/benchmark": "Exit Readiness",
  "/workspace/reports": "Reports",
});

function humanise(slug: string): string {
  return slug.replace(/[._]/g, " ").trim();
}

function planFor(tier: PlanTier | null): Plan | null {
  if (!tier) return null;
  const id = TIER_TO_PLAN_ID[tier];
  return PLANS_V2.find((p) => p.id === id) ?? null;
}

/** Lowest public ladder entry (any segment) whose unlocks carry the slug. */
function lowestLadderTier(feature: string): PlanTier | null {
  let best: TierLadderEntry | null = null;
  for (const entry of ALL_LADDER_ENTRIES) {
    if (!(entry.supportingUnlocks as readonly string[]).includes(feature)) continue;
    if (!best || entry.rank < best.rank) best = entry;
  }
  if (!best) return null;
  return ladderIdToTier(best.id);
}

function ladderIdToTier(id: string): PlanTier | null {
  const hit = (Object.entries(TIER_TO_PLAN_ID) as [PlanTier, string][]).find(([, pid]) => pid === id);
  return hit ? hit[0] : null;
}

/** Route path → label; unknown paths yield the last segment, title-cased. */
// The title-case fallback below only runs for paths under these trees — the
// only places that redirect to `/pricing?feature=…&from=…`. `from` is a URL
// parameter anyone can craft, and the label is rendered into "To open
// <label> you need …" on a public page; without the prefix + charset rule
// `?from=/Your-Account-Is-Locked-Call-…` would be echoed as page copy (S31
// review, 2026-09-14). React escapes the text, so this is copy hygiene, not
// an HTML-injection fix.
const FROM_FALLBACK_PREFIXES = ["/workspace/", "/dashboard/"] as const;
const FROM_SEGMENT_RE = /^[a-z0-9]+(?:-[a-z0-9]+){0,5}$/;

export function fromPathLabel(from: string | undefined | null): string | null {
  if (!from || !from.startsWith("/") || from.includes("//") || from.length > 200) return null;
  const clean = from.split("?")[0]!.split("#")[0]!.replace(/\/+$/, "");
  if (FROM_LABELS[clean]) return FROM_LABELS[clean]!;
  if (!FROM_FALLBACK_PREFIXES.some((p) => clean.startsWith(p))) return null;
  const seg = clean.split("/").filter(Boolean).pop();
  if (!seg || seg.length > 40 || !FROM_SEGMENT_RE.test(seg) || /^[0-9a-f-]{8,}$/i.test(seg)) return null;
  return seg
    .split("-")
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/**
 * Resolve a `?feature=` slug. Returns null for anything that does not look
 * like a feature key so a garbage query renders nothing at all.
 */
export function resolveFeatureRequirement(
  featureRaw: string | undefined | null,
  from?: string | undefined | null,
): FeatureRequirement | null {
  const feature = featureRaw?.trim() ?? "";
  if (!SLUG_RE.test(feature)) return null;

  const vis = (VISIBILITY as Readonly<Record<string, (typeof VISIBILITY)[FeatureSlug]>>)[feature];
  const cat = UPGRADE_CATALOGUE.find((c) => c.feature === feature);
  const tier: PlanTier | null = vis?.minTier ?? cat?.minTier ?? lowestLadderTier(feature);
  const viaAddon = Boolean(vis?.addOnKey ?? cat?.addOnKey);
  const plan = planFor(tier);
  const contactSales =
    !plan || plan.monthly_aud === null || plan.cta_kind === "contact" || plan.public === false;

  let priceLine = "";
  if (viaAddon) priceLine = `${formatAud(EQUITY_ADDON_MONTHLY_AUD)}/mo add-on`;
  else if (plan && plan.monthly_aud !== null && plan.monthly_aud > 0) priceLine = `${formatAud(plan.monthly_aud)}/mo`;

  return {
    feature,
    label: LABELS[feature] ?? humanise(feature),
    plan: contactSales ? null : plan,
    priceLine: contactSales ? "" : priceLine,
    anchor: !contactSales && plan ? (TIER_ANCHORS[plan.id] ?? null) : null,
    viaAddon,
    contactSales,
    fromLabel: fromPathLabel(from),
  };
}

/** True when `tier` sits above the free rung — used to skip the notice for free-tier features. */
export function requiresPaidTier(req: FeatureRequirement): boolean {
  if (req.contactSales || req.viaAddon) return true;
  if (!req.plan) return false;
  return (PLAN_TIER_RANK[ladderIdToTier(req.plan.id) ?? "free"] ?? 0) > 0;
}
