import { describe, expect, it } from "vitest";
import {
  validateAdminDecision,
  validateCodeRequest,
  validateCollateralApproval,
  validateOverBudgetApproval,
  validateResellerRequestBody,
} from "./requests";

describe("validateCodeRequest", () => {
  const ctx = { allowed_tiers: [0, 10, 20, 30, 40] as const };

  it("rejects non-object payloads", () => {
    expect(validateCodeRequest(null, ctx)).toEqual({ ok: false, reason: "invalid_payload" });
    expect(validateCodeRequest("nope", ctx)).toEqual({ ok: false, reason: "invalid_payload" });
    expect(validateCodeRequest([], ctx)).toEqual({ ok: false, reason: "invalid_payload" });
  });

  it("rejects invalid tier values", () => {
    expect(validateCodeRequest({ tier_pct: 15 }, ctx)).toEqual({
      ok: false,
      reason: "invalid_tier_pct",
    });
    expect(validateCodeRequest({ tier_pct: "abc" }, ctx)).toEqual({
      ok: false,
      reason: "invalid_tier_pct",
    });
  });

  it("rejects a tier not in the reseller's allowed_tiers", () => {
    expect(
      validateCodeRequest({ tier_pct: 40 }, { allowed_tiers: [0, 10, 20] }),
    ).toEqual({ ok: false, reason: "tier_not_allowed" });
  });

  it("uppercases + trims + validates suggested_suffix format", () => {
    expect(validateCodeRequest({ tier_pct: 20, suggested_suffix: "  q1  " }, ctx)).toEqual(
      { ok: true, value: { tier_pct: 20, suggested_suffix: "Q1", notes: null } },
    );
    expect(validateCodeRequest({ tier_pct: 20, suggested_suffix: "has space" }, ctx)).toEqual({
      ok: false,
      reason: "suffix_bad_format",
    });
  });

  it("allows empty / missing suggested_suffix + notes", () => {
    expect(validateCodeRequest({ tier_pct: 10 }, ctx)).toEqual({
      ok: true,
      value: { tier_pct: 10, suggested_suffix: null, notes: null },
    });
  });

  it("rejects notes longer than the 200-char limit", () => {
    expect(
      validateCodeRequest({ tier_pct: 10, notes: "n".repeat(201) }, ctx),
    ).toEqual({ ok: false, reason: "reason_too_long" });
  });
});

describe("validateOverBudgetApproval", () => {
  const uuid = "11111111-2222-3333-4444-555555555555";

  it("rejects when reseller lacks can_grant_credits", () => {
    expect(
      validateOverBudgetApproval(
        { target_user_id: uuid, requested_amount: 100 },
        { can_grant_credits: false },
      ),
    ).toEqual({ ok: false, reason: "capability_disabled" });
  });

  it("rejects malformed target_user_id", () => {
    expect(
      validateOverBudgetApproval(
        { target_user_id: "not-a-uuid", requested_amount: 100 },
        { can_grant_credits: true },
      ),
    ).toEqual({ ok: false, reason: "target_user_id_required" });
  });

  it("rejects non-positive / non-integer amounts", () => {
    for (const amount of [0, -5, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(
        validateOverBudgetApproval(
          { target_user_id: uuid, requested_amount: amount },
          { can_grant_credits: true },
        ),
      ).toEqual({ ok: false, reason: "invalid_amount" });
    }
  });

  it("passes valid input + strips optional fields", () => {
    expect(
      validateOverBudgetApproval(
        {
          target_user_id: uuid,
          requested_amount: 250,
          reason: " give more ",
          remaining_budget_snapshot: 12.6,
        },
        { can_grant_credits: true },
      ),
    ).toEqual({
      ok: true,
      value: {
        target_user_id: uuid,
        requested_amount: 250,
        reason: "give more",
        remaining_budget_snapshot: 12,
      },
    });
  });
});

describe("validateCollateralApproval", () => {
  it("requires an https URL", () => {
    expect(
      validateCollateralApproval({ collateral_url: "http://x.com", purpose: "banner" }),
    ).toEqual({ ok: false, reason: "collateral_url_required" });
    expect(
      validateCollateralApproval({ collateral_url: "", purpose: "banner" }),
    ).toEqual({ ok: false, reason: "collateral_url_required" });
  });

  it("requires a purpose", () => {
    expect(
      validateCollateralApproval({ collateral_url: "https://a.b/c", purpose: "   " }),
    ).toEqual({ ok: false, reason: "purpose_required" });
  });

  it("returns trimmed values on success", () => {
    expect(
      validateCollateralApproval({
        collateral_url: " https://a.b/c ",
        purpose: " Homepage banner ",
      }),
    ).toEqual({
      ok: true,
      value: { collateral_url: "https://a.b/c", purpose: "Homepage banner" },
    });
  });
});

describe("validateResellerRequestBody", () => {
  const ctx = { allowed_tiers: [0, 10, 20, 30, 40] as const, can_grant_credits: true };
  const uuid = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

  it("rejects unknown request_type", () => {
    expect(validateResellerRequestBody({ request_type: "nope", payload: {} }, ctx)).toEqual({
      ok: false,
      reason: "invalid_request_type",
    });
  });

  it("dispatches to code_request", () => {
    const res = validateResellerRequestBody(
      { request_type: "code_request", payload: { tier_pct: 30 } },
      ctx,
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.request_type).toBe("code_request");
      expect(res.value.payload).toEqual({ tier_pct: 30, suggested_suffix: null, notes: null });
    }
  });

  it("dispatches to over_budget_approval", () => {
    const res = validateResellerRequestBody(
      {
        request_type: "over_budget_approval",
        payload: { target_user_id: uuid, requested_amount: 100 },
      },
      ctx,
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.request_type).toBe("over_budget_approval");
      expect(res.value.payload.target_user_id).toBe(uuid);
    }
  });

  it("dispatches to collateral_approval", () => {
    const res = validateResellerRequestBody(
      {
        request_type: "collateral_approval",
        payload: { collateral_url: "https://x.io/a.png", purpose: "email header" },
      },
      ctx,
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.request_type).toBe("collateral_approval");
    }
  });
});

describe("validateAdminDecision", () => {
  it("rejects when the row is already decided", () => {
    expect(
      validateAdminDecision({ status: "approved" }, { action: "deny" }),
    ).toEqual({ ok: false, reason: "already_decided" });
  });

  it("rejects unknown action", () => {
    expect(
      validateAdminDecision({ status: "pending" }, { action: "shrug" }),
    ).toEqual({ ok: false, reason: "invalid_action" });
  });

  it("maps action → status + trims reason", () => {
    expect(
      validateAdminDecision(
        { status: "pending" },
        { action: "approve", decision_reason: " ok " },
      ),
    ).toEqual({ ok: true, status: "approved", decision_reason: "ok" });
    expect(
      validateAdminDecision({ status: "pending" }, { action: "deny" }),
    ).toEqual({ ok: true, status: "denied", decision_reason: null });
    expect(
      validateAdminDecision({ status: "pending" }, { action: "cancel" }),
    ).toEqual({ ok: true, status: "cancelled", decision_reason: null });
  });

  it("rejects a decision_reason longer than 200 chars", () => {
    expect(
      validateAdminDecision(
        { status: "pending" },
        { action: "deny", decision_reason: "z".repeat(201) },
      ),
    ).toEqual({ ok: false, reason: "reason_too_long" });
  });
});
