// legacy-price-allowlist — every file that may still spell the retired A$3
// one-off report price or a bare A$1 report / credit price (G35 Pricing v5,
// docs/pricing-v5-plan.md §6.7; docs/design/messaging.md § 11).
//
// Read by two guards:
//   - `legacy-price.guard.test.ts` scans web/src + web/content/legal (+ the
//     i18n messages) with LEGACY_PRICE_PATTERNS and fails on a hit in a file
//     that is not listed here, on a `legacy-gated` file that no longer reads
//     the Pricing v5 switch, and on a stale entry (listed, no hit any more);
//   - `marketing/messaging.test.ts` expands the `@legacy-price-allowlist`
//     marker in the § 11 rows to these paths.
//
// Kinds:
//   history           a dated changelog / version page — it names what was sold
//   legacy-catalogue  the v3 SKU / Stripe catalogue rows a late webhook and
//                     receipts still resolve (never rendered as an offer)
//   legacy-gated      the flag-OFF branch of a surface that reads
//                     `payg_enabled` (PaygView / isPaygEnabled) and renders v5
//                     when ON — delete the branch after the cut-over
//   internal          admin-only label, internal note or LLM prompt — not
//                     customer copy
//   asset             a marketing video script; needs a re-render, does not
//                     block the release (plan §6.7)
//
// After the cut-over is permanent, remove the flag-OFF branches and their
// rows; the list should end with only `history` / `legacy-catalogue` /
// `asset` entries.

export type LegacyPriceKind = "history" | "legacy-catalogue" | "legacy-gated" | "internal" | "asset";

export interface LegacyPriceEntry {
  readonly kind: LegacyPriceKind;
  readonly note: string;
}

/**
 * Retired price literals. Ranges and magnitudes (A$3M, A$3–8K, A$3,500,
 * A$1–5M, "A$1 of revenue", "A$1+ in revenue") are not prices and do not
 * match. Mirrored verbatim in docs/design/messaging.md § 11 (the guard test
 * pins that the two agree).
 */
export const LEGACY_PRICE_PATTERNS: Readonly<Record<"a3" | "a1", RegExp>> = Object.freeze({
  a3: /A\$3(?!\d|,\d|\.\d|\s?(?:[MBKmbk]\b|million|billion|bn\b)|\s?[–-]\s?\d)/,
  a1: /A\$1(?!\d|,\d|\.\d|\s?(?:[MBKmbk]\b|million|billion|bn\b)|\s?[–-]\s?\d|\s(?:of|in)\b|\+)/,
});

/** Paths relative to `web/`. */
export const LEGACY_PRICE_ALLOWLIST: Readonly<Record<string, LegacyPriceEntry>> = Object.freeze({
  // ── history ──────────────────────────────────────────────────────────────
  "src/app/version/page.tsx": { kind: "history", note: "release notes name what each version sold" },
  "src/app/(marketing)/roadmap/page.tsx": { kind: "history", note: "dated roadmap entries" },
  "src/app/docs/page.tsx": { kind: "history", note: "the dated G16 / G11 changelog entries; the live pricing section reads the PaygView" },

  // ── legacy catalogue (resolution, receipts) ──────────────────────────────
  "src/config/pricing/stripe-price-catalogue.json": { kind: "legacy-catalogue", note: "names of the A$3 / A$1 Stripe Prices kept for audit + late webhooks" },
  "src/lib/ab-pricing.ts": { kind: "legacy-catalogue", note: "retired A/B arms (active:false) kept so historic assignments resolve" },

  // ── internal (not customer copy) ─────────────────────────────────────────
  "src/lib/privacy/erasure-map.ts": { kind: "internal", note: "erasure note describing the legacy guest_analyses rows" },

  // ── assets ───────────────────────────────────────────────────────────────
  "src/remotion/compositions/PitchVideo1MinV2.tsx": { kind: "asset", note: "pitch video — re-render with v5 prices before reuse" },
  "src/remotion/compositions/PitchVideo3Min.tsx": { kind: "asset", note: "pitch video — re-render with v5 prices before reuse" },
  "src/remotion/scripts/pitch-1min-v2.ts": { kind: "asset", note: "pitch video script" },
  "src/remotion/scripts/pitch-3min.ts": { kind: "asset", note: "pitch video script" },
});

/** Does this source read the Pricing v5 switch (so a legacy literal sits in a flag-OFF branch)? */
export function readsPaygSwitch(source: string): boolean {
  return /\bpayg|Payg[A-Z]|PAYG_|paygEnabled|isPaygEnabled|getPaygView|usePaygView/.test(source);
}
