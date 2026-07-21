// Pure validators + shape builders for reseller_requests (P9.3).
//
// The workflow table backs three admin-approval flows: code_request,
// over_budget_approval, collateral_approval. This module keeps the
// per-type payload rules dependency-free so they can be unit tested
// without hitting Supabase; the /api/reseller/requests route composes
// these validators before writing.
//
// See docs/plans/reseller-module-plan.md § C.5 admin approval flows +
// migration web/supabase/migrations/0095_reseller_requests.sql.

export type ResellerRequestType =
  | "code_request"
  | "over_budget_approval"
  | "collateral_approval";

export type ResellerRequestStatus =
  | "pending"
  | "approved"
  | "denied"
  | "cancelled";

export interface CodeRequestPayload {
  tier_pct: number;
  suggested_suffix?: string | null;
  notes?: string | null;
}

export interface OverBudgetApprovalPayload {
  target_user_id: string;
  requested_amount: number;
  reason?: string | null;
  remaining_budget_snapshot?: number | null;
}

export interface CollateralApprovalPayload {
  collateral_url: string;
  purpose: string;
}

export type ResellerRequestPayload =
  | { type: "code_request"; payload: CodeRequestPayload }
  | { type: "over_budget_approval"; payload: OverBudgetApprovalPayload }
  | { type: "collateral_approval"; payload: CollateralApprovalPayload };

export type ResellerRequestValidationError =
  | "invalid_request_type"
  | "invalid_payload"
  | "invalid_tier_pct"
  | "tier_not_allowed"
  | "suffix_bad_format"
  | "target_user_id_required"
  | "invalid_amount"
  | "capability_disabled"
  | "collateral_url_required"
  | "purpose_required"
  | "reason_too_long";

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: ResellerRequestValidationError };

const ALLOWED_TIER_VALUES = new Set([0, 10, 20, 30, 40]);
const SUFFIX_RE = /^[A-Z0-9]{1,16}$/;
const HTTPS_URL_RE = /^https:\/\/[a-zA-Z0-9.-]+(\/.*)?$/;
const REASON_MAX = 200;
const PURPOSE_MAX = 500;

function isUuid(v: unknown): v is string {
  return (
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
  );
}

/**
 * Validate a code_request payload against the reseller's allowed_tiers.
 * suggested_suffix is optional; if present, must be [A-Z0-9]{1,16}. The
 * admin ultimately writes the customer-facing code so a suffix here is a
 * hint, not a guarantee.
 */
export function validateCodeRequest(
  input: unknown,
  ctx: { allowed_tiers: readonly number[] },
): ValidationResult<CodeRequestPayload> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, reason: "invalid_payload" };
  }
  const p = input as Record<string, unknown>;
  const tier =
    typeof p.tier_pct === "number" ? p.tier_pct : Number(p.tier_pct);
  if (!ALLOWED_TIER_VALUES.has(tier)) {
    return { ok: false, reason: "invalid_tier_pct" };
  }
  if (!ctx.allowed_tiers.includes(tier)) {
    return { ok: false, reason: "tier_not_allowed" };
  }
  let suffix: string | null = null;
  if (p.suggested_suffix != null && p.suggested_suffix !== "") {
    const s = String(p.suggested_suffix).trim().toUpperCase();
    if (!SUFFIX_RE.test(s)) {
      return { ok: false, reason: "suffix_bad_format" };
    }
    suffix = s;
  }
  let notes: string | null = null;
  if (p.notes != null && p.notes !== "") {
    const n = String(p.notes).trim();
    if (n.length > REASON_MAX) {
      return { ok: false, reason: "reason_too_long" };
    }
    notes = n;
  }
  return {
    ok: true,
    value: { tier_pct: tier, suggested_suffix: suffix, notes },
  };
}

/**
 * Validate an over_budget_approval payload. The reseller must have
 * can_grant_credits=true to file the request at all (self-approval is
 * forbidden here — the endpoint stays a queue-writer).
 */
export function validateOverBudgetApproval(
  input: unknown,
  ctx: { can_grant_credits: boolean },
): ValidationResult<OverBudgetApprovalPayload> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, reason: "invalid_payload" };
  }
  if (!ctx.can_grant_credits) {
    return { ok: false, reason: "capability_disabled" };
  }
  const p = input as Record<string, unknown>;
  if (!isUuid(p.target_user_id)) {
    return { ok: false, reason: "target_user_id_required" };
  }
  const amount =
    typeof p.requested_amount === "number"
      ? p.requested_amount
      : Number(p.requested_amount);
  if (
    !Number.isFinite(amount) ||
    !Number.isInteger(amount) ||
    amount <= 0
  ) {
    return { ok: false, reason: "invalid_amount" };
  }
  let reason: string | null = null;
  if (p.reason != null && p.reason !== "") {
    const r = String(p.reason).trim();
    if (r.length > REASON_MAX) {
      return { ok: false, reason: "reason_too_long" };
    }
    reason = r;
  }
  const remainingSnapshot =
    typeof p.remaining_budget_snapshot === "number" &&
    Number.isFinite(p.remaining_budget_snapshot)
      ? Math.max(0, Math.floor(p.remaining_budget_snapshot))
      : null;
  return {
    ok: true,
    value: {
      target_user_id: p.target_user_id,
      requested_amount: amount,
      reason,
      remaining_budget_snapshot: remainingSnapshot,
    },
  };
}

/**
 * Validate a collateral_approval payload. Requires an https URL + a
 * human-readable purpose so the admin has enough context to decide.
 */
export function validateCollateralApproval(
  input: unknown,
): ValidationResult<CollateralApprovalPayload> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, reason: "invalid_payload" };
  }
  const p = input as Record<string, unknown>;
  const url = typeof p.collateral_url === "string" ? p.collateral_url.trim() : "";
  if (!url || !HTTPS_URL_RE.test(url)) {
    return { ok: false, reason: "collateral_url_required" };
  }
  const purpose = typeof p.purpose === "string" ? p.purpose.trim() : "";
  if (!purpose) {
    return { ok: false, reason: "purpose_required" };
  }
  if (purpose.length > PURPOSE_MAX) {
    return { ok: false, reason: "reason_too_long" };
  }
  return { ok: true, value: { collateral_url: url, purpose } };
}

export interface ValidatedRequestInput {
  request_type: ResellerRequestType;
  payload: Record<string, unknown>;
}

/**
 * Top-level dispatcher. Feeds the raw body through the per-type validator
 * and returns the JSON-serialisable payload ready for INSERT.
 */
export function validateResellerRequestBody(
  body: unknown,
  ctx: { allowed_tiers: readonly number[]; can_grant_credits: boolean },
): ValidationResult<ValidatedRequestInput> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, reason: "invalid_payload" };
  }
  const b = body as { request_type?: unknown; payload?: unknown };
  const type = b.request_type;
  if (
    type !== "code_request" &&
    type !== "over_budget_approval" &&
    type !== "collateral_approval"
  ) {
    return { ok: false, reason: "invalid_request_type" };
  }
  if (type === "code_request") {
    const res = validateCodeRequest(b.payload, { allowed_tiers: ctx.allowed_tiers });
    if (!res.ok) return res;
    return {
      ok: true,
      value: {
        request_type: "code_request",
        payload: { ...res.value },
      },
    };
  }
  if (type === "over_budget_approval") {
    const res = validateOverBudgetApproval(b.payload, {
      can_grant_credits: ctx.can_grant_credits,
    });
    if (!res.ok) return res;
    return {
      ok: true,
      value: {
        request_type: "over_budget_approval",
        payload: { ...res.value },
      },
    };
  }
  const res = validateCollateralApproval(b.payload);
  if (!res.ok) return res;
  return {
    ok: true,
    value: {
      request_type: "collateral_approval",
      payload: { ...res.value },
    },
  };
}

export type AdminDecisionAction = "approve" | "deny" | "cancel";

export interface AdminDecisionInput {
  action: AdminDecisionAction;
  decision_reason?: string | null;
}

export type AdminDecisionError =
  | "invalid_action"
  | "reason_too_long"
  | "already_decided";

/**
 * Validate an admin decision on a request row. Denials benefit from a
 * short-form reason (up to 200 chars) so the reseller sees the "why".
 * Approvals may include a reason too but it's optional.
 */
export function validateAdminDecision(
  current: { status: ResellerRequestStatus },
  input: unknown,
):
  | { ok: true; status: "approved" | "denied" | "cancelled"; decision_reason: string | null }
  | { ok: false; reason: AdminDecisionError } {
  if (current.status !== "pending") {
    return { ok: false, reason: "already_decided" };
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, reason: "invalid_action" };
  }
  const p = input as Record<string, unknown>;
  const action = p.action;
  if (action !== "approve" && action !== "deny" && action !== "cancel") {
    return { ok: false, reason: "invalid_action" };
  }
  let reason: string | null = null;
  if (p.decision_reason != null && p.decision_reason !== "") {
    const r = String(p.decision_reason).trim();
    if (r.length > REASON_MAX) {
      return { ok: false, reason: "reason_too_long" };
    }
    reason = r;
  }
  const status =
    action === "approve" ? "approved" : action === "deny" ? "denied" : "cancelled";
  return { ok: true, status, decision_reason: reason };
}
