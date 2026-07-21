// Pure validator for PATCH /api/admin/resellers/[code].
//
// Extracted so the endpoint stays a thin wrapper and the rules
// (§ U.15.1 D2-CFO-01, D4-CLO-03 — wholesale requires GST + ABN) get
// unit-tested without DB. Consumers pass the CURRENT row plus a partial
// PATCH; validator returns either an object of sanitised patch fields or
// a reason code the endpoint maps to an HTTP status.

export interface AdminResellerRow {
  billing_model: "retail" | "wholesale";
  gst_registered: boolean;
  abn: string | null;
}

export interface AdminResellerPatch {
  display_name?: string;
  billing_model?: "retail" | "wholesale";
  status?: "active" | "paused" | "terminated";
  gst_registered?: boolean;
  abn?: string | null;
  monthly_credit_budget?: number;
  monthly_sandbox_credits?: number;
  allowed_tiers?: number[];
  can_create_startups?: boolean;
  can_grant_credits?: boolean;
  commission_share_pct?: number;
  contact_email?: string | null;
  notes?: string | null;
  logo_url?: string | null;
  primary_color?: string | null;
}

export type AdminResellerValidationError =
  | "empty_patch"
  | "invalid_status"
  | "invalid_billing_model"
  | "wholesale_requires_gst"
  | "wholesale_requires_abn"
  | "abn_bad_format"
  | "budget_negative"
  | "sandbox_negative"
  | "commission_out_of_range"
  | "tiers_bad_value"
  | "display_name_blank"
  | "primary_color_bad_format";

export type ValidationResult =
  | { ok: true; patch: Record<string, unknown> }
  | { ok: false; reason: AdminResellerValidationError };

const ALLOWED_TIER_VALUES = new Set([0, 10, 20, 30, 40]);
const ABN_RE = /^\d{2} \d{3} \d{3} \d{3}$/;
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/**
 * Validate an admin PATCH against the current row. Merges patch onto row
 * before checking the wholesale/GST/ABN invariant so callers can toggle
 * billing_model in the same request as gst_registered/abn.
 */
export function validateAdminResellerPatch(
  current: AdminResellerRow,
  patch: AdminResellerPatch,
): ValidationResult {
  const out: Record<string, unknown> = {};

  if (patch.display_name !== undefined) {
    const dn = String(patch.display_name).trim();
    if (!dn) return { ok: false, reason: "display_name_blank" };
    out.display_name = dn;
  }

  if (patch.status !== undefined) {
    if (!["active", "paused", "terminated"].includes(patch.status)) {
      return { ok: false, reason: "invalid_status" };
    }
    out.status = patch.status;
  }

  if (patch.billing_model !== undefined) {
    if (!["retail", "wholesale"].includes(patch.billing_model)) {
      return { ok: false, reason: "invalid_billing_model" };
    }
    out.billing_model = patch.billing_model;
  }

  if (patch.gst_registered !== undefined) {
    out.gst_registered = Boolean(patch.gst_registered);
  }

  if (patch.abn !== undefined) {
    if (patch.abn === null || patch.abn === "") {
      out.abn = null;
    } else if (!ABN_RE.test(patch.abn)) {
      return { ok: false, reason: "abn_bad_format" };
    } else {
      out.abn = patch.abn;
    }
  }

  if (patch.monthly_credit_budget !== undefined) {
    if (!Number.isFinite(patch.monthly_credit_budget) || patch.monthly_credit_budget < 0) {
      return { ok: false, reason: "budget_negative" };
    }
    out.monthly_credit_budget = Math.floor(patch.monthly_credit_budget);
  }

  if (patch.monthly_sandbox_credits !== undefined) {
    if (!Number.isFinite(patch.monthly_sandbox_credits) || patch.monthly_sandbox_credits < 0) {
      return { ok: false, reason: "sandbox_negative" };
    }
    out.monthly_sandbox_credits = Math.floor(patch.monthly_sandbox_credits);
  }

  if (patch.commission_share_pct !== undefined) {
    if (
      !Number.isFinite(patch.commission_share_pct) ||
      patch.commission_share_pct < 0 ||
      patch.commission_share_pct > 100
    ) {
      return { ok: false, reason: "commission_out_of_range" };
    }
    out.commission_share_pct = patch.commission_share_pct;
  }

  if (patch.allowed_tiers !== undefined) {
    if (!Array.isArray(patch.allowed_tiers) || patch.allowed_tiers.length === 0) {
      return { ok: false, reason: "tiers_bad_value" };
    }
    for (const t of patch.allowed_tiers) {
      if (!ALLOWED_TIER_VALUES.has(t)) return { ok: false, reason: "tiers_bad_value" };
    }
    out.allowed_tiers = [...new Set(patch.allowed_tiers)].sort((a, b) => a - b);
  }

  if (patch.can_create_startups !== undefined) {
    out.can_create_startups = Boolean(patch.can_create_startups);
  }
  if (patch.can_grant_credits !== undefined) {
    out.can_grant_credits = Boolean(patch.can_grant_credits);
  }
  if (patch.contact_email !== undefined) {
    out.contact_email = patch.contact_email ? String(patch.contact_email).trim() : null;
  }
  if (patch.notes !== undefined) {
    out.notes = patch.notes ? String(patch.notes) : null;
  }
  if (patch.logo_url !== undefined) {
    out.logo_url = patch.logo_url ? String(patch.logo_url).trim() : null;
  }
  if (patch.primary_color !== undefined) {
    if (patch.primary_color === null || patch.primary_color === "") {
      out.primary_color = null;
    } else if (!HEX_COLOR_RE.test(patch.primary_color)) {
      return { ok: false, reason: "primary_color_bad_format" };
    } else {
      out.primary_color = patch.primary_color;
    }
  }

  if (Object.keys(out).length === 0) return { ok: false, reason: "empty_patch" };

  const merged: AdminResellerRow = {
    billing_model: (out.billing_model as "retail" | "wholesale" | undefined) ?? current.billing_model,
    gst_registered:
      out.gst_registered !== undefined ? Boolean(out.gst_registered) : current.gst_registered,
    abn: out.abn !== undefined ? (out.abn as string | null) : current.abn,
  };

  if (merged.billing_model === "wholesale") {
    if (!merged.gst_registered) return { ok: false, reason: "wholesale_requires_gst" };
    if (!merged.abn || !ABN_RE.test(merged.abn)) {
      return { ok: false, reason: "wholesale_requires_abn" };
    }
  }

  return { ok: true, patch: out };
}
