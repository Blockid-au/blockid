// Div 83A ESOP scheme-rules funding gate.
//
// Sibling of `esic-funding-gate.ts` (Div 360 ESIC gate). Where the ESIC
// gate protects the *investor*-facing 20% tax offset story, this gate
// protects the *employee*-facing ESS start-up concession story: any
// fundraise round that will offer ESOP grants to employees under the
// Division 83A start-up concession must not go out the door until the
// active option grants on file have been Div 83A-checked and pass.
//
// Two modes (identical shape to `assertESICEligibleOrWarn`):
//   - Warn-only (default, non-blocking): returns {ok:true, warn?}. The
//     caller surfaces `warn.reason` in the UI so the founder sees the
//     compliance pointer without breaking the flow. `div83a_gate.warn_*`
//     analytics events fire so CS can see who's about to raise with
//     unchecked / ineligible grants.
//   - Blocking (requireEligible=true, wholesale-only rounds that market
//     the ESS start-up concession): the caller must 412 Precondition
//     Failed when {ok:false} — shipping a round that pitches
//     "your options qualify for the Div 83A concession" while an active
//     grant has `div83a_status = 'ineligible'` is a s911A + s1041H
//     (misleading conduct in relation to a financial product) exposure.
//
// Legal refs:
//   - ITAA 1997 Subdivision 83A-B / 83A-C — ESS start-up concession:
//     https://www.legislation.gov.au/C2004A05138/latest/text
//   - ATO ESS start-up concession guidance:
//     https://www.ato.gov.au/business/employee-share-schemes/in-detail/employee-share-schemes-and-startups
//   - Corporations Act 2001 (Cth) s911A (AFSL requirement) &
//     s1041H (misleading or deceptive conduct in relation to a
//     financial product).
//
// Not tax or legal advice — every payload carries DIV83A_GATE_DISCLAIMER.

import type { SupabaseClient } from "@supabase/supabase-js";
import { DIV83A_QUALIFYING_TESTS_DISCLAIMER } from "@/lib/compliance/div83a-qualifying-tests";
import { emitEvent } from "@/lib/analytics/server";

/**
 * How stale a Div 83A check can be before the gate treats it as
 * "no fresh check on file". 180 days is deliberately longer than the
 * ESIC 90-day window because grant terms (strike, vesting, cliff) rarely
 * change between checks — the check only re-fails when the *company*
 * crosses the s83A-33(1)(a) A$50m turnover cap or the s83A-33(1)(c)
 * 10-year age cap.
 */
export const DIV83A_STALE_AFTER_DAYS = 180;

export interface Div83AGateInput {
  /** Optional — pass null when the founder has no active project row. */
  projectId: string | null;
  /** app_users.id of the founder initiating the funding action. */
  userId: string;
  /**
   * Blocking mode. Pass `true` only when the round is wholesale-only and
   * markets the Div 83A ESS start-up concession in the pitch. Every
   * other caller should leave this false and treat the result as
   * advisory.
   */
  requireEligible?: boolean;
  /**
   * Short context tag written into the analytics event so downstream
   * dashboards can slice `div83a_gate.warn_*` events by call site
   * (e.g. "fundraise_round_create", "esop_pool_grant").
   */
  action?: string;
}

export interface Div83AGateOk {
  ok: true;
  warn?: Div83AGateWarn;
  disclaimer: string;
}

export interface Div83AGateFail {
  ok: false;
  reason: Div83AGateReason;
  url_to_fix: string;
  message: string;
  disclaimer: string;
}

export type Div83AGateResult = Div83AGateOk | Div83AGateFail;

export type Div83AGateReason =
  | "no_grants_on_file"
  | "unchecked_grants"
  | "check_stale"
  | "grants_unsure"
  | "grants_ineligible"
  | "db_unavailable";

export interface Div83AGateWarn {
  reason: Div83AGateReason;
  message: string;
  url_to_fix: string;
}

const URL_TO_FIX = "/workspace/esop/grants";
export const DIV83A_GATE_DISCLAIMER = DIV83A_QUALIFYING_TESTS_DISCLAIMER;

interface GrantRow {
  id: string;
  div83a_status: "eligible" | "ineligible" | "unsure" | null;
  div83a_last_checked_at: string | null;
}

/**
 * Read the founder's active `esop_option_grants` rows for the given
 * project and decide whether the caller should proceed, warn, or block.
 *
 * Failure precedence (worst first — the caller only ever sees one
 * envelope): grants_ineligible → grants_unsure → unchecked_grants →
 * check_stale → no_grants_on_file (only relevant in blocking mode, and
 * treated as pass-through — see below).
 *
 * "No grants on file" is deliberately a **pass** in both modes: a round
 * that does not have any ESOP grants attached cannot mislead an employee
 * about the Div 83A concession. The gate is a check on outstanding
 * grants, not a prerequisite for any grants to exist.
 *
 * Never throws. On any Supabase error the function returns
 * `{ok:false, reason:'db_unavailable'}` in blocking mode and
 * `{ok:true, warn:...}` in warn mode — analytics events still fire so
 * ops can see the failure rate.
 */
export async function assertDiv83AEligibleOrWarn(
  supabase: SupabaseClient | null,
  input: Div83AGateInput,
): Promise<Div83AGateResult> {
  const requireEligible = input.requireEligible === true;
  const action = input.action ?? "unknown";

  if (!supabase) {
    await safeEmit("div83a_gate.db_unavailable", input, action);
    if (requireEligible) {
      return {
        ok: false,
        reason: "db_unavailable",
        url_to_fix: URL_TO_FIX,
        message:
          "Cannot verify Div 83A eligibility right now — the compliance database is not reachable. Try again shortly or contact support.",
        disclaimer: DIV83A_GATE_DISCLAIMER,
      };
    }
    return {
      ok: true,
      warn: {
        reason: "db_unavailable",
        message:
          "Div 83A eligibility could not be verified (compliance database unavailable). Proceeding without the check.",
        url_to_fix: URL_TO_FIX,
      },
      disclaimer: DIV83A_GATE_DISCLAIMER,
    };
  }

  let query = supabase
    .from("esop_option_grants")
    .select("id, div83a_status, div83a_last_checked_at")
    .eq("user_id", input.userId)
    .eq("status", "active");
  if (input.projectId) {
    query = query.eq("project_id", input.projectId);
  }

  const { data, error } = await query;

  if (error) {
    await safeEmit("div83a_gate.query_error", input, action, {
      error: error.message,
    });
    if (requireEligible) {
      return {
        ok: false,
        reason: "db_unavailable",
        url_to_fix: URL_TO_FIX,
        message: "Div 83A eligibility query failed — try again shortly.",
        disclaimer: DIV83A_GATE_DISCLAIMER,
      };
    }
    return {
      ok: true,
      warn: {
        reason: "db_unavailable",
        message:
          "Div 83A eligibility query failed; proceeding without the check.",
        url_to_fix: URL_TO_FIX,
      },
      disclaimer: DIV83A_GATE_DISCLAIMER,
    };
  }

  const grants = (data ?? []) as GrantRow[];

  if (grants.length === 0) {
    // No active grants means nothing to gate — a round without ESOP
    // pitches cannot mislead an employee about Div 83A. Pass silently
    // in both warn and blocking mode.
    return { ok: true, disclaimer: DIV83A_GATE_DISCLAIMER };
  }

  const ineligible = grants.filter((g) => g.div83a_status === "ineligible");
  if (ineligible.length > 0) {
    return handleReason({
      reason: "grants_ineligible",
      message: `${ineligible.length} active ESOP grant${ineligible.length === 1 ? "" : "s"} failed the Div 83A start-up concession check — re-issue at the correct valuation before marketing the round with the ESS tax concession.`,
      requireEligible,
      input,
      action,
      extra: { grant_count: ineligible.length },
    });
  }

  const unsure = grants.filter((g) => g.div83a_status === "unsure");
  if (unsure.length > 0) {
    return handleReason({
      reason: "grants_unsure",
      message: `${unsure.length} active ESOP grant${unsure.length === 1 ? " has" : "s have"} an unresolved Div 83A check — supply the missing evidence (turnover, incorporation date, ownership %) before marketing the ESS concession.`,
      requireEligible,
      input,
      action,
      extra: { grant_count: unsure.length },
    });
  }

  const unchecked = grants.filter((g) => g.div83a_status === null);
  if (unchecked.length > 0) {
    return handleReason({
      reason: "unchecked_grants",
      message: `${unchecked.length} active ESOP grant${unchecked.length === 1 ? " has" : "s have"} never been run through the Div 83A checker — the ESS start-up concession cannot be pitched to investors without a check on file.`,
      requireEligible,
      input,
      action,
      extra: { grant_count: unchecked.length },
    });
  }

  // Every remaining grant is div83a_status='eligible' — check staleness.
  const staleAfterMs = DIV83A_STALE_AFTER_DAYS * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const stale = grants.filter((g) => {
    if (!g.div83a_last_checked_at) return true; // eligible-but-undated → treat as stale
    const t = Date.parse(g.div83a_last_checked_at);
    return !Number.isFinite(t) || now - t > staleAfterMs;
  });
  if (stale.length > 0) {
    return handleReason({
      reason: "check_stale",
      message: `${stale.length} active ESOP grant${stale.length === 1 ? " has" : "s have"} a Div 83A check older than ${DIV83A_STALE_AFTER_DAYS} days — re-run the checker to confirm the s83A-33 turnover + age tests still pass.`,
      requireEligible,
      input,
      action,
      extra: { grant_count: stale.length },
    });
  }

  // All grants fresh + eligible — happy path.
  return { ok: true, disclaimer: DIV83A_GATE_DISCLAIMER };
}

interface ReasonHandlerInput {
  reason: Exclude<Div83AGateReason, "db_unavailable">;
  message: string;
  requireEligible: boolean;
  input: Div83AGateInput;
  action: string;
  extra?: Record<string, unknown>;
}

async function handleReason(h: ReasonHandlerInput): Promise<Div83AGateResult> {
  const eventName = eventFor(h.reason, h.requireEligible);
  await safeEmit(eventName, h.input, h.action, {
    require_eligible: h.requireEligible,
    ...(h.extra ?? {}),
  });
  if (h.requireEligible) {
    return {
      ok: false,
      reason: h.reason,
      url_to_fix: URL_TO_FIX,
      message: h.message,
      disclaimer: DIV83A_GATE_DISCLAIMER,
    };
  }
  return {
    ok: true,
    warn: {
      reason: h.reason,
      message: h.message,
      url_to_fix: URL_TO_FIX,
    },
    disclaimer: DIV83A_GATE_DISCLAIMER,
  };
}

function eventFor(
  reason: Exclude<Div83AGateReason, "db_unavailable">,
  requireEligible: boolean,
): string {
  const hard = reason === "grants_ineligible" || reason === "grants_unsure";
  if (hard) {
    return requireEligible
      ? "div83a_gate.blocked_not_eligible"
      : "div83a_gate.warn_not_eligible";
  }
  if (reason === "check_stale") return "div83a_gate.warn_stale";
  // no_grants_on_file never reaches here (short-circuits to ok pass-through),
  // so the only remaining reason is unchecked_grants.
  return "div83a_gate.warn_missing";
}

async function safeEmit(
  name: string,
  input: Div83AGateInput,
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
    console.warn("[blockid:div83a-gate] analytics emit failed", err);
  }
}
