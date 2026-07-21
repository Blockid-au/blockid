// Feature-gate manifest — single source of truth for which routes require
// which entitlement flag. Per docs/plans/reseller-module-plan.md § U.15.12
// R-02, R-03 (CISO D3-CISO-02).
//
// AST lint at CI enforces that every exported POST/PATCH/DELETE/PUT handler
// in the directories listed below appears here AND calls requireFeature()
// before the first `await` outside conditionals.
//
// New routes MUST be added here in the same PR that creates them. Otherwise
// the unit test `web/src/__tests__/feature-gates.manifest.test.ts` fails.

import type { Feature } from "@/lib/entitlements";

export interface FeatureGate {
  /** Route path relative to web/src/app — e.g. "api/cap-table/entries/route.ts" */
  route: string;
  /** Feature flag required by the handler */
  required_feature: Feature | "share_management";
  /** Optional note explaining the gate */
  note?: string;
}

/**
 * Every mutation route in a gated directory. Read routes are gated at the
 * data-access layer (typed resellerSupabase, scoped queries) and not
 * enumerated here.
 */
export const FEATURE_GATES: readonly FeatureGate[] = Object.freeze([
  // Cap table (Share Management add-on)
  { route: "api/cap-table/entries/route.ts", required_feature: "share_management" },
  { route: "api/cap-table/import/route.ts", required_feature: "share_management" },
  { route: "api/cap-table/export/route.ts", required_feature: "share_management" },

  // Data room — write side (read side handled elsewhere)
  { route: "api/data-room/documents/route.ts", required_feature: "share_management" },
  { route: "api/dataroom/documents/route.ts", required_feature: "share_management", note: "reconcile with data-room folder in P8" },

  // Vesting
  { route: "api/vesting/schedules/route.ts", required_feature: "share_management" },
  { route: "api/vesting/events/route.ts", required_feature: "share_management" },
  { route: "api/ai/vesting/route.ts", required_feature: "share_management" },
  { route: "api/ai/vesting-review/route.ts", required_feature: "share_management" },

  // ESOP
  { route: "api/esop/grants/route.ts", required_feature: "share_management" },
  { route: "api/esop/exercise/route.ts", required_feature: "share_management" },

  // Blockchain / tokenisation
  { route: "api/blockchain/create-token/route.ts", required_feature: "share_management" },
  { route: "api/blockchain/token/route.ts", required_feature: "share_management" },
  { route: "api/tokenization/mint/route.ts", required_feature: "share_management" },

  // Reseller module
  { route: "api/reseller/create-startup/route.ts", required_feature: "reseller.create_startup" as Feature },
  { route: "api/reseller/credits/grant/route.ts", required_feature: "reseller.grant_credits" as Feature },
]);

/** Look up the required feature for a route path. Returns null if ungated. */
export function requiredFeatureFor(route: string): Feature | "share_management" | null {
  const found = FEATURE_GATES.find((g) => g.route === route);
  return found?.required_feature ?? null;
}

/** Directories under `api/` whose mutation routes MUST appear in the manifest. */
export const GATED_DIRECTORIES: readonly string[] = Object.freeze([
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
  "api/reseller/create-startup",
  "api/reseller/credits",
]);
