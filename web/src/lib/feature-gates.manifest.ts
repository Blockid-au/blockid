// Feature-gate manifest — single source of truth for which mutation routes
// require which entitlement flag. Per docs/plans/reseller-module-plan.md
// § U.15.12 R-02, R-03 (CISO D3-CISO-02) and § P8.1.
//
// This file drives the manifest-completeness test at
// web/src/lib/feature-gates.manifest.test.ts. The test walks every
// directory listed in GATED_DIRECTORIES, and for every `route.ts` that
// exports a mutation handler (POST / PATCH / PUT / DELETE), it asserts
// the file appears here with a required_feature. Entries pointing at
// files that don't exist also fail — no phantom rows.
//
// Wiring the actual `requireFeature()` call inside each route handler is
// P8.2. This tick (P8.1) only makes the manifest match the tree.

import type { Feature } from "@/lib/entitlements";

export interface FeatureGate {
  /** Route path relative to web/src/app — e.g. "api/cap-table/route.ts" */
  route: string;
  /** Feature flag required by the handler */
  required_feature: Feature;
  /** Optional note explaining the gate */
  note?: string;
}

/**
 * Every mutation route in a gated directory. Read routes are gated at the
 * data-access layer (typed resellerSupabase, scoped queries) and not
 * enumerated here. Every entry MUST point at an existing file — the
 * manifest-completeness test refuses phantom rows so drift can't hide.
 */
export const FEATURE_GATES: readonly FeatureGate[] = Object.freeze([
  // Cap table (Share Management add-on)
  { route: "api/cap-table/route.ts", required_feature: "share_management" },
  { route: "api/cap-table/documents/route.ts", required_feature: "share_management" },
  { route: "api/cap-table/health/route.ts", required_feature: "share_management" },
  { route: "api/cap-table/restrictions/route.ts", required_feature: "share_management" },
  { route: "api/cap-table/sync/route.ts", required_feature: "share_management" },

  // Data room — write side (read side handled elsewhere)
  { route: "api/data-room/access/route.ts", required_feature: "share_management" },
  { route: "api/data-room/auto-fill/route.ts", required_feature: "share_management" },
  { route: "api/data-room/engage/route.ts", required_feature: "share_management" },
  { route: "api/data-room/generate/route.ts", required_feature: "share_management" },
  { route: "api/data-room/goals/route.ts", required_feature: "share_management" },
  { route: "api/data-room/initialize/route.ts", required_feature: "share_management" },
  { route: "api/dataroom/clone/route.ts", required_feature: "share_management", note: "reconcile data-room vs dataroom folder split — P8 CTO call" },
  { route: "api/dataroom/setup/route.ts", required_feature: "share_management", note: "reconcile data-room vs dataroom folder split — P8 CTO call" },
  { route: "api/dataroom/populate-from-template/route.ts", required_feature: "share_management", note: "round 5.4c added rate-limit wiring; keep manifest complete" },
  { route: "api/dataroom/reseed-templates/route.ts", required_feature: "share_management", note: "mega batch 2026-07-24 — Day-0 dataroom template retry endpoint" },

  // Vesting
  { route: "api/vesting/route.ts", required_feature: "vesting.write" },
  { route: "api/vesting/[id]/route.ts", required_feature: "vesting.write" },
  { route: "api/ai/vesting/route.ts", required_feature: "vesting.write" },
  { route: "api/ai/vesting-review/route.ts", required_feature: "vesting.write" },

  // ESOP
  { route: "api/esop/grants/route.ts", required_feature: "esop.manage" },
  { route: "api/esop/grants/[id]/route.ts", required_feature: "esop.manage" },
  { route: "api/esop/pool/route.ts", required_feature: "esop.manage" },
  { route: "api/esop/div83a-check/route.ts", required_feature: "esop.manage" },
  { route: "api/ai/esop/route.ts", required_feature: "esop.manage" },

  // Blockchain / tokenisation
  { route: "api/blockchain/create-token/route.ts", required_feature: "blockchain.sync" },
  { route: "api/blockchain/sync-toggle/route.ts", required_feature: "blockchain.sync" },
  { route: "api/blockchain/verify/route.ts", required_feature: "blockchain.sync" },
  { route: "api/tokenization/route.ts", required_feature: "share_management" },

  // PDF branding (Growth+/Scale/Enterprise) — feature-upgrade-roadmap-v2 §3.
  // Renderer wire-in follows in a separate tick; this gate lets Growth+ users
  // save their brand config today so the settings surface is not a dead end.
  { route: "api/branding/route.ts", required_feature: "pdf_branding" },

  // Reseller module
  { route: "api/reseller/credits/grant/route.ts", required_feature: "reseller.grant_credits" },
  { route: "api/reseller/sandbox/setup/route.ts", required_feature: "reseller.console" },
  { route: "api/reseller/create-startup/route.ts", required_feature: "reseller.create_startup" },
  { route: "api/reseller/billing/setup-intent/route.ts", required_feature: "reseller.console" },
  { route: "api/reseller/billing/save-default-payment-method/route.ts", required_feature: "reseller.console" },
]);

/** Look up the required feature for a route path. Returns null if ungated. */
export function requiredFeatureFor(route: string): Feature | null {
  const found = FEATURE_GATES.find((g) => g.route === route);
  return found?.required_feature ?? null;
}

/**
 * Directories under `web/src/app/` whose mutation routes MUST appear in the
 * manifest. Read-only route.ts files (only GET exported) are ignored by the
 * completeness test.
 */
export const GATED_DIRECTORIES: readonly string[] = Object.freeze([
  "api/branding",
  "api/cap-table",
  "api/data-room",
  "api/dataroom",
  "api/vesting",
  "api/esop",
  "api/blockchain",
  "api/tokenization",
  "api/ai/vesting",
  "api/ai/vesting-review",
  "api/ai/esop",
  "api/reseller/credits",
  "api/reseller/sandbox",
  "api/reseller/create-startup",
  "api/reseller/billing",
]);

/** HTTP verbs that count as "mutation" for the completeness lens. */
export const MUTATION_METHODS: readonly string[] = Object.freeze([
  "POST",
  "PATCH",
  "PUT",
  "DELETE",
]);
