// ESIC funding gate — surfaces ESIC (Early Stage Innovation Company)
// eligibility to the founder BEFORE they configure a fundraise round.
//
// Two modes:
//   - Warn-only (default, non-blocking): the gate returns {ok:true}
//     regardless of eligibility, but emits an `esic_gate.warn` analytics
//     event whenever the founder starts a funding action without a
//     fresh assessment. Callers use the `warn` object to render an
//     inline nudge without breaking the flow.
//   - Blocking (requireEligible=true, used for *wholesale-only* rounds):
//     the caller must 412 Precondition Failed when {ok:false} comes back
//     — the offer is being marketed as "unlocks the 20% ESIC tax offset"
//     to sophisticated investors, so shipping a round without eligibility
//     confirmed is a s911A + s1041H (misleading conduct) exposure.
//
// Legal refs:
//   - ITAA97 Div 360 (ss 360-10 to 360-100) — ESIC concessions:
//     https://www.legislation.gov.au/C2004A05138/latest/text
//   - AusIndustry ESIC guidance:
//     https://business.gov.au/grants-and-programs/tax-incentives-for-early-stage-investors
//   - ATO Div 360 self-assessment overview:
//     https://www.ato.gov.au/business/tax-incentives-for-innovation/in-detail/tax-incentives-for-early-stage-investors/qualifying-as-an-early-stage-innovation-company/
//   - Corporations Act 2001 (Cth) s911A (AFSL requirement) &
//     s1041H (misleading or deceptive conduct in relation to a
//     financial product).
//
// Not tax or legal advice — every payload carries ESIC_DISCLAIMER.

import type { SupabaseClient } from "@supabase/supabase-js";
import { ESIC_DISCLAIMER } from "@/lib/compliance/esic-eligibility";
import { emitEvent } from "@/lib/analytics/server";

/**
 * How stale an assessment can be before we treat it as "no fresh
 * assessment on file". 90 days matches the compliance-panel
 * refresh-nudge cadence.
 */
export const ESIC_STALE_AFTER_DAYS = 90;

export interface EsicGateInput {
  /** Optional — pass null when the founder has no active project row. */
  projectId: string | null;
  /** app_users.id of the founder initiating the funding action. */
  userId: string;
  /**
   * Blocking mode. Pass `true` only when the round is wholesale-only
   * (marketed under s708(8)/(11) with the ESIC tax offset in the pitch).
   * Every other caller should leave this false and treat the result
   * as advisory.
   */
  requireEligible?: boolean;
  /**
   * Short context tag written into the analytics event so downstream
   * dashboards can slice `esic_gate.warn` events by call site
   * (e.g. "fundraise_round_create", "equity_request", "term_sheet").
   */
  action?: string;
}

export interface EsicGateOk {
  ok: true;
  /**
   * Optional warn envelope — set when the founder is not currently
   * eligible OR has no fresh assessment. Non-blocking callers should
   * surface `warn.reason` in the UI so the founder sees the compliance
   * pointer even though the action succeeded.
   */
  warn?: EsicGateWarn;
  disclaimer: string;
}

export interface EsicGateFail {
  ok: false;
  reason: EsicGateReason;
  /** Deep-link to the surface that resolves the reason. */
  url_to_fix: string;
  message: string;
  disclaimer: string;
}

export type EsicGateResult = EsicGateOk | EsicGateFail;

export type EsicGateReason =
  | "no_assessment_on_file"
  | "assessment_stale"
  | "not_esic_eligible"
  | "db_unavailable";

export interface EsicGateWarn {
  reason: EsicGateReason;
  message: string;
  url_to_fix: string;
}

const URL_TO_FIX = "/compliance/esic";

interface EsicRow {
  is_esic: boolean;
  assessed_at: string;
}

/**
 * Read the most-recent `compliance_esic_assessments` row for the
 * (userId, projectId) pair and decide whether the caller should
 * proceed, warn, or block.
 *
 * Non-blocking by default. Callers pass `requireEligible: true` only
 * for wholesale-only fundraise flows where ESIC status is a material
 * claim in the pitch.
 *
 * Never throws. On any Supabase error the function returns
 * `{ok:false, reason:'db_unavailable'}` in blocking mode and
 * `{ok:true, warn:...}` in warn mode — analytics events are still
 * emitted so ops can see the failure rate.
 */
export async function assertESICEligibleOrWarn(
  supabase: SupabaseClient | null,
  input: EsicGateInput,
): Promise<EsicGateResult> {
  const requireEligible = input.requireEligible === true;
  const action = input.action ?? "unknown";

  if (!supabase) {
    await safeEmit("esic_gate.db_unavailable", input, action);
    if (requireEligible) {
      return {
        ok: false,
        reason: "db_unavailable",
        url_to_fix: URL_TO_FIX,
        message:
          "Cannot verify ESIC eligibility right now — the compliance database is not reachable. Try again shortly or contact support.",
        disclaimer: ESIC_DISCLAIMER,
      };
    }
    return {
      ok: true,
      warn: {
        reason: "db_unavailable",
        message:
          "ESIC eligibility could not be verified (compliance database unavailable). Proceeding without the check.",
        url_to_fix: URL_TO_FIX,
      },
      disclaimer: ESIC_DISCLAIMER,
    };
  }

  let query = supabase
    .from("compliance_esic_assessments")
    .select("is_esic, assessed_at")
    .eq("user_id", input.userId)
    .order("assessed_at", { ascending: false })
    .limit(1);
  // The compliance_esic_assessments row uses project_id=NULL for
  // account-scoped assessments; only filter when we actually have one.
  if (input.projectId) {
    query = query.eq("project_id", input.projectId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    await safeEmit("esic_gate.query_error", input, action, {
      error: error.message,
    });
    if (requireEligible) {
      return {
        ok: false,
        reason: "db_unavailable",
        url_to_fix: URL_TO_FIX,
        message: "ESIC eligibility query failed — try again shortly.",
        disclaimer: ESIC_DISCLAIMER,
      };
    }
    return {
      ok: true,
      warn: {
        reason: "db_unavailable",
        message: "ESIC eligibility query failed; proceeding without the check.",
        url_to_fix: URL_TO_FIX,
      },
      disclaimer: ESIC_DISCLAIMER,
    };
  }

  const row = data as EsicRow | null;

  if (!row) {
    return handleReason({
      reason: "no_assessment_on_file",
      message:
        "No ESIC self-assessment on file — run the Div 360 check before pitching investors on the ESIC tax offset.",
      requireEligible,
      input,
      action,
    });
  }

  const staleAfterMs = ESIC_STALE_AFTER_DAYS * 24 * 60 * 60 * 1000;
  const assessedAtMs = Date.parse(row.assessed_at);
  const isStale =
    Number.isFinite(assessedAtMs) && Date.now() - assessedAtMs > staleAfterMs;

  if (isStale) {
    return handleReason({
      reason: "assessment_stale",
      message: `Your ESIC self-assessment is older than ${ESIC_STALE_AFTER_DAYS} days — re-run the Div 360 check to confirm eligibility.`,
      requireEligible,
      input,
      action,
    });
  }

  if (!row.is_esic) {
    return handleReason({
      reason: "not_esic_eligible",
      message:
        "Latest ESIC self-assessment returned NOT eligible — review the gaps before marketing the round as ESIC-qualifying.",
      requireEligible,
      input,
      action,
    });
  }

  // Eligible + fresh — happy path.
  return { ok: true, disclaimer: ESIC_DISCLAIMER };
}

interface ReasonHandlerInput {
  reason: Exclude<EsicGateReason, "db_unavailable">;
  message: string;
  requireEligible: boolean;
  input: EsicGateInput;
  action: string;
}

async function handleReason(h: ReasonHandlerInput): Promise<EsicGateResult> {
  const eventName =
    h.reason === "not_esic_eligible"
      ? "esic_gate.blocked_not_eligible"
      : h.reason === "assessment_stale"
        ? "esic_gate.warn_stale"
        : "esic_gate.warn_missing";
  await safeEmit(eventName, h.input, h.action, {
    require_eligible: h.requireEligible,
  });
  if (h.requireEligible) {
    return {
      ok: false,
      reason: h.reason,
      url_to_fix: URL_TO_FIX,
      message: h.message,
      disclaimer: ESIC_DISCLAIMER,
    };
  }
  return {
    ok: true,
    warn: {
      reason: h.reason,
      message: h.message,
      url_to_fix: URL_TO_FIX,
    },
    disclaimer: ESIC_DISCLAIMER,
  };
}

async function safeEmit(
  name: string,
  input: EsicGateInput,
  action: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  try {
    await emitEvent({
      name,
      userId: input.userId,
      params: {
        project_id: input.projectId,
        action,
        require_eligible: input.requireEligible === true,
        ...extra,
      },
      source: "server",
    });
  } catch (err) {
    console.warn("[blockid:esic-gate] analytics emit failed", err);
  }
}
