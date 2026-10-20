// v5-payg — Pricing v5 pay-as-you-go catalogue (G35 P1, founder-approved
// D25–D30 on 2026-10-20; docs/pricing-v5-plan.md §2, §6.1, §6.2).
//
// The ONE table for every one-off report SKU sold outside a subscription:
//
//   report_snapshot        A$19   STRIPE_PRICE_REPORT_SNAPSHOT
//   report_full            A$49   STRIPE_PRICE_REPORT_FULL
//   report_verified        A$149  STRIPE_PRICE_REPORT_VERIFIED
//   upgrade_snapshot_full  A$30   STRIPE_PRICE_UPGRADE_SNAPSHOT_FULL   (D28)
//   upgrade_full_verified  A$100  STRIPE_PRICE_UPGRADE_FULL_VERIFIED   (D28)
//   report_funding         A$19   STRIPE_PRICE_REPORT_FUNDING          (D25 Money Finder)
//
// Rules this module encodes (and its colocated test pins):
//   - Every amount is AUD cents, GST-INCLUSIVE; the Stripe Price is minted
//     with `tax_behavior: "inclusive"` (scripts/stripe/mint-payg-v5.mjs) and
//     the checkout issues an ATO tax invoice.
//   - The CHARGED amount is always the Stripe Price the env var points at.
//     `amountCents` here is what that Price must hold (drift → stripe audit).
//     The DISPLAYED amount comes from platform_config (`payg_*_cents`) via
//     `displayPriceCents()`, so ops can correct copy without a redeploy; the
//     Stripe sync page flags display ≠ Stripe.
//   - Upgrades are their own one-time Prices (D28) — never a coupon or a
//     discount code (founder rule G25).
//   - Credits (D27): Snapshot 19, Full 49, Money Finder 19 (D25); Verified is
//     card-only. Credits are shown as "N credits", never converted to A$.
//   - Legacy A$3 SKUs (v3-skus.ts) are not sold once `payg_enabled` flips, but
//     a late webhook for a session created before the cut-over must still
//     resolve — `skuForPriceId()` / `resolveSkuId()` map them.
//
// Behind `platform_config.payg_enabled` (default false). Nothing in the UI
// reads this module yet — copy changes land in wave P5.
//
// Pure and isomorphic (no I/O; env is injectable), safe in "use client".

import type { PlatformConfig } from "@/lib/platform-config";

export const PAYG_PRICING_VERSION = "v5" as const;

// ─── Tiers ───────────────────────────────────────────────────────────────────

export const PAYG_TIERS = ["snapshot", "full", "verified"] as const;
export type PaygTier = (typeof PAYG_TIERS)[number];

/** Tier rank — an upgrade only ever moves up. */
export const PAYG_TIER_RANK: Readonly<Record<PaygTier, number>> = Object.freeze({
  snapshot: 1,
  full: 2,
  verified: 3,
});

export function isPaygTier(value: unknown): value is PaygTier {
  return typeof value === "string" && (PAYG_TIERS as readonly string[]).includes(value);
}

// ─── SKU ids ─────────────────────────────────────────────────────────────────

export const PAYG_REPORT_SKU_IDS = ["report_snapshot", "report_full", "report_verified"] as const;
export const PAYG_UPGRADE_SKU_IDS = ["upgrade_snapshot_full", "upgrade_full_verified"] as const;
export const PAYG_SKU_IDS = [...PAYG_REPORT_SKU_IDS, ...PAYG_UPGRADE_SKU_IDS, "report_funding"] as const;

export type PaygReportSkuId = (typeof PAYG_REPORT_SKU_IDS)[number];
export type PaygUpgradeSkuId = (typeof PAYG_UPGRADE_SKU_IDS)[number];
export type PaygSkuId = (typeof PAYG_SKU_IDS)[number];

/** report = a tier bought outright · upgrade = D28 difference Price · funding = D25 Money Finder. */
export type PaygSkuKind = "report" | "upgrade" | "funding";

/** `revenue_events.kind` each SKU books (migration 0474 extends the CHECK). */
export type PaygRevenueKind = "report_snapshot" | "report_full" | "report_verified" | "report_upgrade" | "report_funding";

/** platform_config keys that hold a display price (cents, GST-inclusive). */
export type PaygDisplayConfigKey = "payg_snapshot_cents" | "payg_full_cents" | "payg_verified_cents";

/** The platform_config slice this module reads. */
export type PaygConfig = Pick<
  PlatformConfig,
  | "payg_enabled"
  | "payg_snapshot_cents"
  | "payg_full_cents"
  | "payg_verified_cents"
  | "verified_sla_business_days"
  | "payg_verified_max_open"
>;

export interface PaygSku {
  /** Stable id — Stripe Product + Price `metadata.sku`, checkout `metadata.sku`, `report_orders.product_sku`. */
  readonly id: PaygSkuId;
  readonly kind: PaygSkuKind;
  /** Short label (admin, receipts, Stripe sync). Not marketing copy — that lands in P5. */
  readonly label: string;
  /** Stripe Product name the mint script creates. */
  readonly productName: string;
  /** What the Stripe Price must hold: AUD cents, GST-inclusive. */
  readonly amountCents: number;
  /**
   * The report tier this SKU leaves the buyer holding (`report` / `upgrade`
   * kinds), or `null` for Money Finder (a separate product, not a TBR tier).
   */
  readonly tier: PaygTier | null;
  /** Upgrades only: the tier the buyer must already hold. */
  readonly fromTier: PaygTier | null;
  /** Env var holding the Stripe Price id. */
  readonly envVar: string;
  /** What the buyer gets (plan §6.1) — cumulative for report tiers. */
  readonly included: readonly string[];
  /** Credits that buy this SKU instead of a card (D27/D25); `null` = card only. */
  readonly creditCost: number | null;
  /** platform_config key holding its display price, or `null` (derived / catalogue). */
  readonly displayConfigKey: PaygDisplayConfigKey | null;
  readonly revenueKind: PaygRevenueKind;
}

const SNAPSHOT_INCLUDED = [
  "SVI score and 8-dimension radar",
  "Top 3 strengths and top 3 risks",
  "Evidence-confidence %",
  "1-page PDF",
] as const;

const FULL_INCLUDED = [
  ...SNAPSHOT_INCLUDED.slice(0, 3),
  "All 16 sections of the Trusted Business Report",
  "Australian comparables",
  "Evidence register",
  "Questions to ask next",
  "Full PDF",
] as const;

const VERIFIED_INCLUDED = [
  ...FULL_INCLUDED,
  "Evidence reviewed by the BlockID team",
  "Investor Pack PDF",
  "\"BlockID Reviewed\" badge",
  "Delivered within 2 business days",
] as const;

export const PAYG_SKUS: Readonly<Record<PaygSkuId, PaygSku>> = Object.freeze({
  report_snapshot: {
    id: "report_snapshot",
    kind: "report",
    label: "Snapshot report",
    productName: "BlockID Report — Snapshot",
    amountCents: 1900,
    tier: "snapshot",
    fromTier: null,
    envVar: "STRIPE_PRICE_REPORT_SNAPSHOT",
    included: SNAPSHOT_INCLUDED,
    creditCost: 19,
    displayConfigKey: "payg_snapshot_cents",
    revenueKind: "report_snapshot",
  },
  report_full: {
    id: "report_full",
    kind: "report",
    label: "Full report",
    productName: "BlockID Report — Full",
    amountCents: 4900,
    tier: "full",
    fromTier: null,
    envVar: "STRIPE_PRICE_REPORT_FULL",
    included: FULL_INCLUDED,
    creditCost: 49,
    displayConfigKey: "payg_full_cents",
    revenueKind: "report_full",
  },
  report_verified: {
    id: "report_verified",
    kind: "report",
    label: "Verified report",
    productName: "BlockID Report — Verified",
    amountCents: 14900,
    tier: "verified",
    fromTier: null,
    envVar: "STRIPE_PRICE_REPORT_VERIFIED",
    included: VERIFIED_INCLUDED,
    creditCost: null,
    displayConfigKey: "payg_verified_cents",
    revenueKind: "report_verified",
  },
  upgrade_snapshot_full: {
    id: "upgrade_snapshot_full",
    kind: "upgrade",
    label: "Upgrade Snapshot → Full",
    productName: "BlockID Report — Upgrade Snapshot to Full",
    amountCents: 3000,
    tier: "full",
    fromTier: "snapshot",
    envVar: "STRIPE_PRICE_UPGRADE_SNAPSHOT_FULL",
    included: FULL_INCLUDED.slice(SNAPSHOT_INCLUDED.length - 1),
    // D27 sets credits for Snapshot / Full only; paying an upgrade in credits
    // is not decided — card only until the founder says otherwise.
    creditCost: null,
    displayConfigKey: null,
    revenueKind: "report_upgrade",
  },
  upgrade_full_verified: {
    id: "upgrade_full_verified",
    kind: "upgrade",
    label: "Upgrade Full → Verified",
    productName: "BlockID Report — Upgrade Full to Verified",
    amountCents: 10000,
    tier: "verified",
    fromTier: "full",
    envVar: "STRIPE_PRICE_UPGRADE_FULL_VERIFIED",
    included: VERIFIED_INCLUDED.slice(FULL_INCLUDED.length),
    creditCost: null, // Verified is card-only (D27)
    displayConfigKey: null,
    revenueKind: "report_upgrade",
  },
  report_funding: {
    id: "report_funding",
    kind: "funding",
    label: "Money Finder report",
    productName: "BlockID Money Finder report",
    amountCents: 1900,
    tier: null,
    fromTier: null,
    envVar: "STRIPE_PRICE_REPORT_FUNDING",
    included: [
      "Ranked Australian grants and programs for your profile",
      "Eligibility checklist",
      "A$ estimates (R&DTI / ESIC)",
      "12-month timeline and next actions",
    ],
    creditCost: 19, // D25
    displayConfigKey: null, // D25 pins it to the Snapshot price point; no own config key
    revenueKind: "report_funding",
  },
} satisfies Record<PaygSkuId, PaygSku>);

/** Every v5 SKU in display order. */
export const PAYG_SKU_LIST: readonly PaygSku[] = Object.freeze(PAYG_SKU_IDS.map((id) => PAYG_SKUS[id]));

export function isPaygSkuId(value: unknown): value is PaygSkuId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(PAYG_SKUS, value);
}

export function paygSku(id: PaygSkuId): PaygSku {
  return PAYG_SKUS[id];
}

/** The SKU that buys a tier outright. */
export function reportSkuForTier(tier: PaygTier): PaygReportSkuId {
  return `report_${tier}`;
}

// ─── Upgrades (D28) ──────────────────────────────────────────────────────────

export interface PaygUpgrade {
  readonly from: PaygTier;
  readonly to: PaygTier;
  readonly sku: PaygUpgradeSkuId;
}

/**
 * The only upgrade paths sold. Snapshot → Verified is deliberately absent: it
 * is two steps (or a Verified purchase); D28 minted no Price for it.
 */
export const PAYG_UPGRADES: readonly PaygUpgrade[] = Object.freeze([
  { from: "snapshot", to: "full", sku: "upgrade_snapshot_full" },
  { from: "full", to: "verified", sku: "upgrade_full_verified" },
] as const);

/** Upgrade SKU for `from → to`, or `null` when no single upgrade Price exists. */
export function upgradeSkuFor(fromTier: PaygTier, toTier: PaygTier): PaygUpgradeSkuId | null {
  return PAYG_UPGRADES.find((u) => u.from === fromTier && u.to === toTier)?.sku ?? null;
}

// ─── Legacy A$3 SKUs (v3-skus.ts) — resolution only, never sold by v5 ───────

export const LEGACY_REPORT_SKU_IDS = [
  "sku_trust_report_5aud",
  "sku_one_click_report_3aud",
  "sku_funding_report_3aud",
] as const;
export type LegacyReportSkuId = (typeof LEGACY_REPORT_SKU_IDS)[number];

export interface LegacyReportSku {
  readonly id: LegacyReportSkuId;
  /** Env var of the archived-after-cutover A$3 Price. */
  readonly envVar: string;
  readonly amountCents: number;
  /** v5 SKU that describes what the buyer is owed (both A$3 reports sold a full report). */
  readonly successor: PaygSkuId;
}

export const LEGACY_REPORT_SKUS: Readonly<Record<LegacyReportSkuId, LegacyReportSku>> = Object.freeze({
  sku_trust_report_5aud: { id: "sku_trust_report_5aud", envVar: "STRIPE_PRICE_TRUST_REPORT_5AUD", amountCents: 300, successor: "report_full" },
  sku_one_click_report_3aud: { id: "sku_one_click_report_3aud", envVar: "STRIPE_PRICE_ONE_CLICK_REPORT", amountCents: 300, successor: "report_full" },
  sku_funding_report_3aud: { id: "sku_funding_report_3aud", envVar: "STRIPE_PRICE_FUNDING_REPORT", amountCents: 300, successor: "report_funding" },
});

export function isLegacyReportSkuId(value: unknown): value is LegacyReportSkuId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(LEGACY_REPORT_SKUS, value);
}

export type AnyReportSkuId = PaygSkuId | LegacyReportSkuId;

/** What a webhook needs to fulfil a session: the sku, whether it is a legacy A$3 one, and the v5 meaning. */
export type SkuResolution =
  | { readonly sku: PaygSkuId; readonly legacy: false; readonly pricingVersion: "v5"; readonly fulfilAs: PaygSkuId }
  | { readonly sku: LegacyReportSkuId; readonly legacy: true; readonly pricingVersion: "v3"; readonly fulfilAs: PaygSkuId };

function resolution(id: AnyReportSkuId): SkuResolution {
  if (isPaygSkuId(id)) return { sku: id, legacy: false, pricingVersion: "v5", fulfilAs: id };
  return { sku: id, legacy: true, pricingVersion: "v3", fulfilAs: LEGACY_REPORT_SKUS[id].successor };
}

/** Resolve a SKU id from session metadata (`sku` / `bid_sku`) — v5 or legacy; `null` if unknown. */
export function resolveSkuId(value: unknown): SkuResolution | null {
  if (isPaygSkuId(value) || isLegacyReportSkuId(value)) return resolution(value);
  return null;
}

// ─── Env ↔ Price id ──────────────────────────────────────────────────────────

export type EnvSource = Readonly<Record<string, string | undefined>>;

function defaultEnv(): EnvSource {
  return typeof process !== "undefined" && process.env ? process.env : {};
}

function envVarFor(sku: AnyReportSkuId): string {
  return isPaygSkuId(sku) ? PAYG_SKUS[sku].envVar : LEGACY_REPORT_SKUS[sku].envVar;
}

/** Stripe Price id configured for a SKU (v5 or legacy), or `null` when the env var is unset/blank. */
export function priceIdForSku(sku: AnyReportSkuId, env: EnvSource = defaultEnv()): string | null {
  const raw = env[envVarFor(sku)];
  const id = typeof raw === "string" ? raw.trim() : "";
  return id === "" ? null : id;
}

/**
 * Reverse lookup: which SKU a Stripe Price id bills (v5 first, then the legacy
 * A$3 Prices so a late `checkout.session.completed` still resolves after the
 * cut-over). `null` for an unknown / blank id.
 */
export function skuForPriceId(priceId: string | null | undefined, env: EnvSource = defaultEnv()): SkuResolution | null {
  const wanted = typeof priceId === "string" ? priceId.trim() : "";
  if (wanted === "") return null;
  for (const id of PAYG_SKU_IDS) {
    if (priceIdForSku(id, env) === wanted) return resolution(id);
  }
  for (const id of LEGACY_REPORT_SKU_IDS) {
    if (priceIdForSku(id, env) === wanted) return resolution(id);
  }
  return null;
}

// ─── platform_config: defaults, display price, validation ────────────────────

/** Defaults for the PAYG keys — spread into `CONFIG_DEFAULTS` (platform-config.ts). */
export const PAYG_CONFIG_DEFAULTS: Readonly<PaygConfig> = Object.freeze({
  payg_enabled: false,
  payg_snapshot_cents: PAYG_SKUS.report_snapshot.amountCents,
  payg_full_cents: PAYG_SKUS.report_full.amountCents,
  payg_verified_cents: PAYG_SKUS.report_verified.amountCents,
  verified_sla_business_days: 2,
  payg_verified_max_open: 5,
});

/** Bounds the admin editor and the PUT route enforce. */
export const PAYG_CONFIG_LIMITS = Object.freeze({
  minPriceCents: 100,
  maxPriceCents: 100_000,
  minSlaDays: 1,
  maxSlaDays: 10,
  minVerifiedOpen: 0,
  maxVerifiedOpen: 100,
});

/** Keys of the PAYG slice — the PUT route validates a patch that touches any of them. */
export const PAYG_CONFIG_KEYS = Object.freeze(Object.keys(PAYG_CONFIG_DEFAULTS) as Array<keyof PaygConfig>);

function validCents(v: unknown): v is number {
  return (
    typeof v === "number" &&
    Number.isInteger(v) &&
    v >= PAYG_CONFIG_LIMITS.minPriceCents &&
    v <= PAYG_CONFIG_LIMITS.maxPriceCents
  );
}

function configCents(key: PaygDisplayConfigKey, config: Partial<PaygConfig> | null | undefined): number {
  const v = config?.[key];
  return validCents(v) ? v : PAYG_CONFIG_DEFAULTS[key];
}

/**
 * The amount a page SHOWS for a SKU (cents, GST-inclusive). Report tiers read
 * platform_config; upgrades show the difference of the two displayed tiers;
 * Money Finder and anything without a valid config value fall back to the
 * catalogue amount. The amount CHARGED is always the Stripe Price.
 */
export function displayPriceCents(sku: PaygSkuId, config?: Partial<PaygConfig> | null): number {
  const s = PAYG_SKUS[sku];
  if (s.displayConfigKey) return configCents(s.displayConfigKey, config);
  if (s.kind === "upgrade" && s.fromTier && s.tier) {
    const diff =
      displayPriceCents(reportSkuForTier(s.tier), config) - displayPriceCents(reportSkuForTier(s.fromTier), config);
    return diff > 0 ? diff : s.amountCents;
  }
  return s.amountCents;
}

/** Display prices that differ from the catalogue (what Stripe must hold) — the Stripe sync drift list. */
export function displayDrift(config?: Partial<PaygConfig> | null): Array<{ sku: PaygSkuId; displayCents: number; catalogueCents: number }> {
  return PAYG_SKU_LIST.filter((s) => displayPriceCents(s.id, config) !== s.amountCents).map((s) => ({
    sku: s.id,
    displayCents: displayPriceCents(s.id, config),
    catalogueCents: s.amountCents,
  }));
}

/**
 * Validate the PAYG slice of a (merged) platform_config. Returns one message
 * per problem — empty array = valid. Shared by Admin › System Config (client)
 * and PUT /api/admin/platform-config (server).
 */
export function validatePaygConfig(config: Partial<PaygConfig>): string[] {
  const errors: string[] = [];
  const L = PAYG_CONFIG_LIMITS;
  if (config.payg_enabled !== undefined && typeof config.payg_enabled !== "boolean") {
    errors.push("payg_enabled must be true or false.");
  }
  const priceKeys: PaygDisplayConfigKey[] = ["payg_snapshot_cents", "payg_full_cents", "payg_verified_cents"];
  for (const key of priceKeys) {
    const v = config[key];
    if (v !== undefined && !validCents(v)) {
      errors.push(`${key} must be a whole number of cents between ${L.minPriceCents} and ${L.maxPriceCents}.`);
    }
  }
  const snap = configCents("payg_snapshot_cents", config);
  const full = configCents("payg_full_cents", config);
  const ver = configCents("payg_verified_cents", config);
  if (!(snap < full && full < ver)) {
    errors.push("Display prices must rise Snapshot < Full < Verified.");
  }
  const sla = config.verified_sla_business_days;
  if (sla !== undefined && !(typeof sla === "number" && Number.isInteger(sla) && sla >= L.minSlaDays && sla <= L.maxSlaDays)) {
    errors.push(`verified_sla_business_days must be a whole number between ${L.minSlaDays} and ${L.maxSlaDays}.`);
  }
  const cap = config.payg_verified_max_open;
  if (cap !== undefined && !(typeof cap === "number" && Number.isInteger(cap) && cap >= L.minVerifiedOpen && cap <= L.maxVerifiedOpen)) {
    errors.push(`payg_verified_max_open must be a whole number between ${L.minVerifiedOpen} and ${L.maxVerifiedOpen} (0 hides Verified).`);
  }
  return errors;
}
