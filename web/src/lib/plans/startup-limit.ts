// Founder 1-startup-per-account guard (2026-07-24 founder directive).
//
// A user with `app_users.account_type = 'founder'` may own AT MOST ONE
// active startup/project, regardless of plan tier. Multi-startup workflows
// (cohort operators, syndicate leads, wholesale channel partners, press)
// bypass this limit — see ACCOUNT_TYPES_WITH_MULTI_STARTUP below.
//
// This module is dependency-free so it can be imported from server
// (createProject write path) AND client (create-project button gating)
// bundles without dragging Supabase or plans-db along.
//
// Legacy founders who already have >1 project keep those projects — this
// guard only blocks NEW `create` calls. The workspace UI surfaces a soft
// banner explaining the historic mismatch.

/**
 * Account types that are permitted to own more than one startup at a time.
 * Everyone else who is *not* on this list is treated as a single-startup
 * account (currently just `founder` — but investors/journalists/etc. sit on
 * the allow-list explicitly so a future account_type addition defaults to
 * "capped at 1" until reviewed).
 */
export const ACCOUNT_TYPES_WITH_MULTI_STARTUP: ReadonlySet<string> = new Set([
  "accelerator",
  "incubator",
  "reseller",
  "affiliate",
  "advisor",
  "investor_angel",
  "investor_vc",
  "investor",
  "journalist",
]);

export type StartupCreateDecision =
  | { allowed: true }
  | {
      allowed: false;
      reason: "founder_one_startup_limit";
      current_count: number;
    };

/**
 * Decide whether `user` may create another startup right now.
 *
 * Callers pass the current owned-startup count (active projects only —
 * archived rows do NOT count toward the limit; they are restore-only and the
 * unarchive path already re-checks). `account_type` is the raw string from
 * `app_users.account_type`; unknown / null values are treated as `founder`
 * so a mis-migrated user cannot dodge the limit by having a blank column.
 */
export function canCreateAnotherStartup(user: {
  account_type: string | null | undefined;
  current_startup_count: number;
}): StartupCreateDecision {
  const at = typeof user.account_type === "string" && user.account_type.length > 0
    ? user.account_type
    : "founder";

  if (ACCOUNT_TYPES_WITH_MULTI_STARTUP.has(at)) {
    return { allowed: true };
  }

  // Everyone else — `founder` and any unknown / null account_type — is
  // capped at exactly one active startup.
  if (user.current_startup_count >= 1) {
    return {
      allowed: false,
      reason: "founder_one_startup_limit",
      current_count: user.current_startup_count,
    };
  }

  return { allowed: true };
}

/** Message body shape returned by the create-project API on 403 refusals. */
export const FOUNDER_ONE_STARTUP_ERROR = {
  error: "founder_one_startup_limit",
  message:
    "Founder accounts can own one startup. Upgrade to Accelerator to manage multiple.",
  hint_upgrade_url: "/pricing?highlight=accelerator",
} as const;
