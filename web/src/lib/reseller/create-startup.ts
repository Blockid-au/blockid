// Pure decision library for POST /api/reseller/create-startup (§24 remainder).
//
// The wholesale create-startup flow (plan §C.1.5, §U.3, §H.8) is a multi-step
// atomic transaction: validate reseller capability + tier, create/reuse the
// founder's app_users row (provisional), create the workspace, insert the
// reseller_attributions row scoped to the workspace, mint a magic-link so the
// founder can claim the workspace, dispatch sendWholesaleWelcome().
//
// This module keeps all the validation + shape decisions pure so the eventual
// route handler is a thin composition of already-tested primitives. That
// mirrors the P6.3 grant-api → decideGrant, P6.4 sandbox → buildSandboxProjectInsert,
// P9.4 code-mint → decideCodeMint pattern.
//
// The route handler still owns: Supabase writes, Stripe subscription create on
// the reseller's payment method, the magic_links row insert, sendWholesaleWelcome.

import { normaliseResellerCode } from "./attribution";

export const WHOLESALE_PLAN_ID = "founder_growth";
export const WHOLESALE_ATTRIBUTION_SOURCE = "provisioned";
const COMPANY_NAME_MAX = 200;
const FOUNDER_NAME_MAX = 120;
const EMAIL_MAX = 320;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface WholesaleResellerRow {
  id: string;
  code: string;
  display_name: string;
  status: "active" | "paused" | "terminated";
  can_create_startups: boolean;
  billing_model: "retail" | "wholesale";
  allowed_tiers: number[] | null;
}

export interface CreateStartupInput {
  founder_email: unknown;
  company_name: unknown;
  plan_tier: unknown;
  discount_tier: unknown;
  founder_name?: unknown;
}

export interface NormalisedCreateStartupInput {
  founder_email: string;
  company_name: string;
  plan_tier: typeof WHOLESALE_PLAN_ID;
  discount_tier: number;
  founder_name: string | null;
}

export type CreateStartupError =
  | "invalid_email"
  | "company_name_required"
  | "company_name_too_long"
  | "invalid_plan_tier"
  | "invalid_discount_tier"
  | "reseller_not_active"
  | "capability_disabled"
  | "billing_model_not_wholesale"
  | "tier_not_allowed"
  | "existing_active_attribution"
  | "promotion_code_missing";

export interface NormaliseResult {
  ok: true;
  input: NormalisedCreateStartupInput;
}
export interface NormaliseError {
  ok: false;
  reason: Extract<
    CreateStartupError,
    | "invalid_email"
    | "company_name_required"
    | "company_name_too_long"
    | "invalid_plan_tier"
    | "invalid_discount_tier"
  >;
}

/**
 * Trim + validate + narrow the request body. Applies the same email regex as
 * lib/auth.ts::isValidEmail and lowercases per normaliseEmail. Company name
 * is trimmed, non-empty, ≤200 chars. plan_tier must equal WHOLESALE_PLAN_ID
 * (only Growth is provisionable per §C.1.5). discount_tier must be one of
 * 0/10/20/30/40 (matches reseller_promotion_codes.tier_pct enum in 0091).
 */
export function normaliseCreateStartupInput(
  raw: CreateStartupInput,
): NormaliseResult | NormaliseError {
  const emailRaw = typeof raw.founder_email === "string" ? raw.founder_email.trim() : "";
  if (
    !emailRaw ||
    emailRaw.length > EMAIL_MAX ||
    !EMAIL_RE.test(emailRaw)
  ) {
    return { ok: false, reason: "invalid_email" };
  }
  const email = emailRaw.toLowerCase();

  const companyRaw = typeof raw.company_name === "string" ? raw.company_name.trim() : "";
  if (!companyRaw) return { ok: false, reason: "company_name_required" };
  if (companyRaw.length > COMPANY_NAME_MAX) {
    return { ok: false, reason: "company_name_too_long" };
  }

  if (raw.plan_tier !== WHOLESALE_PLAN_ID) {
    return { ok: false, reason: "invalid_plan_tier" };
  }

  const tierNum =
    typeof raw.discount_tier === "number"
      ? raw.discount_tier
      : typeof raw.discount_tier === "string"
        ? Number.parseInt(raw.discount_tier, 10)
        : Number.NaN;
  if (!Number.isFinite(tierNum) || ![0, 10, 20, 30, 40].includes(tierNum)) {
    return { ok: false, reason: "invalid_discount_tier" };
  }

  const founderRaw = typeof raw.founder_name === "string" ? raw.founder_name.trim() : "";
  const founder_name = founderRaw ? founderRaw.slice(0, FOUNDER_NAME_MAX) : null;

  return {
    ok: true,
    input: {
      founder_email: email,
      company_name: companyRaw,
      plan_tier: WHOLESALE_PLAN_ID,
      discount_tier: tierNum,
      founder_name,
    },
  };
}

export interface DecideCreateStartupArgs {
  input: NormalisedCreateStartupInput;
  reseller: WholesaleResellerRow;
  /**
   * Existing app_users row keyed on the lowercased founder_email, or null when
   * no account exists yet. Only the id + verified_at are inspected.
   */
  existingUser: { id: string; verified_at: string | null } | null;
  /**
   * True when the founder already has an active reseller_attributions row of
   * subject_type=project for this reseller. Route resolves via a scoped query
   * before calling. See allowedCustomerIds() in scope.ts.
   */
  hasActiveProjectAttribution: boolean;
  /**
   * Promotion code row for (reseller_id, tier_pct). Route must look this up
   * before calling — the wholesale flow reuses reseller_promotion_codes so
   * checkout stamping stays consistent with the retail redemption path.
   * Null → decideCreateStartup returns promotion_code_missing so the caller
   * can surface a fixable admin error rather than silently attributing 0%.
   */
  promotionCode: { id: string; code: string; tier_pct: number } | null;
}

export interface CreateStartupPlan {
  founder_email: string;
  company_name: string;
  founder_name: string | null;
  plan_tier: typeof WHOLESALE_PLAN_ID;
  discount_tier: number;
  reseller_id: string;
  reseller_code: string;
  reseller_display_name: string;
  promotion_code_id: string;
  promotion_code: string;
  /** True → route inserts a new app_users row. False → route reuses existingUser.id. */
  createNewUser: boolean;
  /** True → workspace stays provisional until magic-link verified (H.8). */
  provisional: boolean;
  attribution: {
    subject_type: "project";
    source: typeof WHOLESALE_ATTRIBUTION_SOURCE;
    metadata: { origin: "wholesale_create"; discount_tier: number };
  };
  magicLink: {
    intent: "login";
    /** Passed to /auth/verify?token= — the verify route reads this and 303s the founder there. */
    next: string;
    pendingPayload: { resellerCode: string; wholesaleProvisioning: true };
  };
}

export type DecideCreateStartupResult =
  | { ok: true; plan: CreateStartupPlan }
  | { ok: false; reason: CreateStartupError };

/**
 * Given a validated input + the reseller + existing-user + attribution-lookup
 * results, decide whether the create-startup call should proceed and produce
 * the execution plan the route handler will act on.
 *
 * Gates enforced (in order — first failing gate wins):
 *   1. reseller.status === "active"
 *   2. reseller.can_create_startups === true (capability flag per §C.1.5)
 *   3. reseller.billing_model === "wholesale" (retail resellers don't provision)
 *   4. discount_tier ∈ reseller.allowed_tiers (per U.15.1 admin-controlled)
 *   5. no active project attribution to this reseller for an existing user
 *      (protects against double-billing the same reseller for the same
 *      founder × workspace pair per U.15.1 project-level partial unique)
 *   6. promotionCode is non-null (route pre-fetch must find (reseller, tier))
 */
export function decideCreateStartup(args: DecideCreateStartupArgs): DecideCreateStartupResult {
  const { input, reseller, existingUser, hasActiveProjectAttribution, promotionCode } = args;

  if (reseller.status !== "active") {
    return { ok: false, reason: "reseller_not_active" };
  }
  if (!reseller.can_create_startups) {
    return { ok: false, reason: "capability_disabled" };
  }
  if (reseller.billing_model !== "wholesale") {
    return { ok: false, reason: "billing_model_not_wholesale" };
  }
  const allowed = Array.isArray(reseller.allowed_tiers) ? reseller.allowed_tiers : [];
  if (!allowed.includes(input.discount_tier)) {
    return { ok: false, reason: "tier_not_allowed" };
  }
  if (existingUser && hasActiveProjectAttribution) {
    // Existing project attribution → the founder already has a live workspace
    // attributed to this reseller. Creating another would breach the U.15.1
    // project-level partial unique on reseller_attributions.
    return { ok: false, reason: "existing_active_attribution" };
  }
  if (!promotionCode || promotionCode.tier_pct !== input.discount_tier) {
    return { ok: false, reason: "promotion_code_missing" };
  }

  const createNewUser = !existingUser;
  // Provisional until magic-link verified. Existing verified users don't need
  // to re-verify — verified_at already set means the workspace can flip active
  // immediately. New users OR previously-unverified users start provisional.
  const provisional = createNewUser || existingUser?.verified_at == null;

  return {
    ok: true,
    plan: {
      founder_email: input.founder_email,
      company_name: input.company_name,
      founder_name: input.founder_name,
      plan_tier: input.plan_tier,
      discount_tier: input.discount_tier,
      reseller_id: reseller.id,
      reseller_code: reseller.code,
      reseller_display_name: reseller.display_name,
      promotion_code_id: promotionCode.id,
      promotion_code: promotionCode.code,
      createNewUser,
      provisional,
      attribution: {
        subject_type: "project",
        source: WHOLESALE_ATTRIBUTION_SOURCE,
        metadata: { origin: "wholesale_create", discount_tier: input.discount_tier },
      },
      magicLink: {
        intent: "login",
        // Post-verify landing: the founder lands on their new workspace by
        // slug. The route handler substitutes {slug} once the workspace row
        // is inserted (createSandboxProject-style contract). See
        // handleWholesaleCreate() when P24(c) endpoint lands.
        next: "/workspace",
        // resellerCode carried through so the verify route's processAttribution()
        // call (via consumeMagicLink) is a no-op safety net if the primary
        // attribution insert somehow failed above.
        pendingPayload: {
          resellerCode: normaliseResellerCode(reseller.code) ?? reseller.code,
          wholesaleProvisioning: true,
        },
      },
    },
  };
}

/**
 * Human-readable, EN-only error copy for the create-startup form. Kept next
 * to the error union so future error-code additions surface as a compile
 * error in tests. The form component is EN-only per U.15.13 admin surfaces —
 * VI parity for reseller-admin tooling is out of scope.
 */
export const CREATE_STARTUP_ERROR_MESSAGES: Record<CreateStartupError, string> = {
  invalid_email: "Please enter a valid founder email address.",
  company_name_required: "Company name is required.",
  company_name_too_long: "Company name is too long (max 200 characters).",
  invalid_plan_tier: "Only Founder — Growth is provisionable via wholesale.",
  invalid_discount_tier: "Discount tier must be one of 0, 10, 20, 30, or 40.",
  reseller_not_active: "Your reseller account is not active. Contact admin@blockid.au.",
  capability_disabled: "Your reseller account is not enabled for wholesale provisioning.",
  billing_model_not_wholesale: "Wholesale provisioning requires the wholesale billing model.",
  tier_not_allowed: "That discount tier is not enabled for your reseller account.",
  existing_active_attribution:
    "This founder already has a workspace attributed to your reseller account. Ask them to create a second project from their existing workspace.",
  promotion_code_missing:
    "The promotion code for that discount tier has not been minted yet. Request it in /reseller/codes and try again after admin approval.",
};
