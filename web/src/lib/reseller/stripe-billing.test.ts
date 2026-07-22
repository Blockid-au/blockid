import { describe, expect, it } from "vitest";
import {
  buildResellerSetupIntentParams,
  buildResellerStripeCustomerParams,
  decideResellerCustomerAction,
  decideSaveDefaultPaymentMethod,
  RESELLER_STRIPE_BILLING_ERROR_MESSAGES,
  validateResellerBillingReadiness,
  type ResellerBillingRow,
} from "./stripe-billing";

function row(overrides: Partial<ResellerBillingRow> = {}): ResellerBillingRow {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    code: "INFOVISION",
    display_name: "InfoVision",
    status: "active",
    billing_model: "wholesale",
    contact_email: "billing@infovision.example",
    stripe_customer_id: null,
    stripe_default_payment_method_id: null,
    ...overrides,
  };
}

describe("buildResellerStripeCustomerParams", () => {
  it("returns Customer.create params for an active wholesale reseller", () => {
    const result = buildResellerStripeCustomerParams(row());
    expect(result).toEqual({
      ok: true,
      params: {
        name: "InfoVision",
        email: "billing@infovision.example",
        metadata: {
          reseller_id: "11111111-1111-1111-1111-111111111111",
          reseller_code: "INFOVISION",
          billing_model: "wholesale",
          source: "reseller_org",
        },
      },
    });
  });

  it("omits email when contact_email is null", () => {
    const result = buildResellerStripeCustomerParams(row({ contact_email: null }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.params.email).toBeUndefined();
      expect(result.params.name).toBe("InfoVision");
    }
  });

  it("omits email when contact_email is whitespace-only", () => {
    const result = buildResellerStripeCustomerParams(row({ contact_email: "   " }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.params.email).toBeUndefined();
  });

  it("lowercases contact_email", () => {
    const result = buildResellerStripeCustomerParams(row({ contact_email: "Ops@INFOVision.Example" }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.params.email).toBe("ops@infovision.example");
  });

  it("rejects retail resellers", () => {
    expect(buildResellerStripeCustomerParams(row({ billing_model: "retail" }))).toEqual({
      ok: false,
      reason: "billing_model_not_wholesale",
    });
  });

  it("rejects paused / terminated resellers", () => {
    expect(buildResellerStripeCustomerParams(row({ status: "paused" }))).toEqual({
      ok: false,
      reason: "reseller_not_active",
    });
    expect(buildResellerStripeCustomerParams(row({ status: "terminated" }))).toEqual({
      ok: false,
      reason: "reseller_not_active",
    });
  });

  it("rejects blank display_name", () => {
    expect(buildResellerStripeCustomerParams(row({ display_name: "   " }))).toEqual({
      ok: false,
      reason: "display_name_required",
    });
  });

  it("rejects malformed contact_email", () => {
    expect(buildResellerStripeCustomerParams(row({ contact_email: "not-an-email" }))).toEqual({
      ok: false,
      reason: "invalid_contact_email",
    });
  });

  it("rejects contact_email exceeding 320 chars", () => {
    const long = `${"a".repeat(316)}@x.co`; // 321 chars
    expect(buildResellerStripeCustomerParams(row({ contact_email: long })).ok).toBe(false);
  });
});

describe("decideResellerCustomerAction", () => {
  it("reuses when stripe_customer_id is set", () => {
    expect(
      decideResellerCustomerAction(row({ stripe_customer_id: "cus_ABC123" })),
    ).toEqual({ kind: "reuse", stripe_customer_id: "cus_ABC123" });
  });

  it("creates when stripe_customer_id is null", () => {
    const action = decideResellerCustomerAction(row());
    expect(action.kind).toBe("create");
    if (action.kind === "create") {
      expect(action.params.name).toBe("InfoVision");
      expect(action.params.metadata.reseller_id).toBe(
        "11111111-1111-1111-1111-111111111111",
      );
    }
  });

  it("surfaces underlying param error for retail resellers", () => {
    expect(decideResellerCustomerAction(row({ billing_model: "retail" }))).toEqual({
      kind: "error",
      reason: "billing_model_not_wholesale",
    });
  });

  it("prefers reuse even when other fields would otherwise error", () => {
    // Once a Stripe Customer is stored, reuse it even if contact_email was
    // later cleared — the Customer already exists in Stripe and we can push
    // updates through Customer.update on the reseller-stripe-sync cron rather
    // than re-minting a fresh Customer here.
    expect(
      decideResellerCustomerAction(
        row({ stripe_customer_id: "cus_XYZ", display_name: "" }),
      ),
    ).toEqual({ kind: "reuse", stripe_customer_id: "cus_XYZ" });
  });
});

describe("validateResellerBillingReadiness", () => {
  it("returns ok when wholesale + active + customer + PM all present", () => {
    const result = validateResellerBillingReadiness(
      row({
        stripe_customer_id: "cus_ABC",
        stripe_default_payment_method_id: "pm_XYZ",
      }),
    );
    expect(result).toEqual({
      ok: true,
      stripe_customer_id: "cus_ABC",
      stripe_default_payment_method_id: "pm_XYZ",
    });
  });

  it("rejects retail resellers", () => {
    expect(
      validateResellerBillingReadiness(
        row({
          billing_model: "retail",
          stripe_customer_id: "cus_ABC",
          stripe_default_payment_method_id: "pm_XYZ",
        }),
      ),
    ).toEqual({ ok: false, reason: "billing_model_not_wholesale" });
  });

  it("rejects paused resellers", () => {
    expect(
      validateResellerBillingReadiness(
        row({
          status: "paused",
          stripe_customer_id: "cus_ABC",
          stripe_default_payment_method_id: "pm_XYZ",
        }),
      ),
    ).toEqual({ ok: false, reason: "reseller_not_active" });
  });

  it("rejects when stripe_customer_id is missing", () => {
    expect(
      validateResellerBillingReadiness(
        row({ stripe_default_payment_method_id: "pm_XYZ" }),
      ),
    ).toEqual({ ok: false, reason: "stripe_customer_missing" });
  });

  it("rejects when default_payment_method is missing", () => {
    expect(
      validateResellerBillingReadiness(row({ stripe_customer_id: "cus_ABC" })),
    ).toEqual({ ok: false, reason: "default_payment_method_missing" });
  });
});

describe("buildResellerSetupIntentParams", () => {
  it("returns SetupIntent params when the reseller has a Stripe Customer", () => {
    const result = buildResellerSetupIntentParams(
      row({ stripe_customer_id: "cus_ABC" }),
    );
    expect(result).toEqual({
      ok: true,
      params: {
        customer: "cus_ABC",
        payment_method_types: ["card"],
        usage: "off_session",
        metadata: {
          reseller_id: "11111111-1111-1111-1111-111111111111",
          reseller_code: "INFOVISION",
          intent: "reseller_default_pm",
        },
      },
    });
  });

  it("rejects when no Stripe Customer is on file yet", () => {
    expect(buildResellerSetupIntentParams(row())).toEqual({
      ok: false,
      reason: "stripe_customer_missing",
    });
  });

  it("rejects retail resellers", () => {
    expect(
      buildResellerSetupIntentParams(
        row({ billing_model: "retail", stripe_customer_id: "cus_ABC" }),
      ),
    ).toEqual({ ok: false, reason: "billing_model_not_wholesale" });
  });

  it("rejects paused resellers", () => {
    expect(
      buildResellerSetupIntentParams(
        row({ status: "paused", stripe_customer_id: "cus_ABC" }),
      ),
    ).toEqual({ ok: false, reason: "reseller_not_active" });
  });
});

describe("RESELLER_STRIPE_BILLING_ERROR_MESSAGES", () => {
  it("covers every error union member", () => {
    const keys = [
      "billing_model_not_wholesale",
      "reseller_not_active",
      "display_name_required",
      "invalid_contact_email",
      "stripe_customer_missing",
      "default_payment_method_missing",
      "setup_intent_id_required",
      "setup_intent_customer_mismatch",
      "setup_intent_not_succeeded",
      "setup_intent_no_payment_method",
    ] as const;
    for (const k of keys) {
      expect(RESELLER_STRIPE_BILLING_ERROR_MESSAGES[k]).toBeTruthy();
    }
  });
});

describe("decideSaveDefaultPaymentMethod", () => {
  const CUSTOMER = "cus_existing";
  const chargeable = (): ResellerBillingRow => row({ stripe_customer_id: CUSTOMER });

  it("accepts a well-formed setup_intent_id on an active wholesale customer", () => {
    const result = decideSaveDefaultPaymentMethod(chargeable(), {
      setup_intent_id: "seti_1abc",
    });
    expect(result).toEqual({
      ok: true,
      stripe_customer_id: CUSTOMER,
      setup_intent_id: "seti_1abc",
    });
  });

  it("trims surrounding whitespace before validating", () => {
    const result = decideSaveDefaultPaymentMethod(chargeable(), {
      setup_intent_id: "  seti_trimmed  ",
    });
    expect(result).toEqual({
      ok: true,
      stripe_customer_id: CUSTOMER,
      setup_intent_id: "seti_trimmed",
    });
  });

  it("refuses retail resellers", () => {
    expect(
      decideSaveDefaultPaymentMethod(
        chargeable(),
        { setup_intent_id: "seti_1abc" },
      ),
    ).toBeTruthy();
    expect(
      decideSaveDefaultPaymentMethod(
        row({ stripe_customer_id: CUSTOMER, billing_model: "retail" }),
        { setup_intent_id: "seti_1abc" },
      ),
    ).toEqual({ ok: false, reason: "billing_model_not_wholesale" });
  });

  it("refuses paused / terminated resellers", () => {
    expect(
      decideSaveDefaultPaymentMethod(
        row({ stripe_customer_id: CUSTOMER, status: "paused" }),
        { setup_intent_id: "seti_1abc" },
      ),
    ).toEqual({ ok: false, reason: "reseller_not_active" });
    expect(
      decideSaveDefaultPaymentMethod(
        row({ stripe_customer_id: CUSTOMER, status: "terminated" }),
        { setup_intent_id: "seti_1abc" },
      ),
    ).toEqual({ ok: false, reason: "reseller_not_active" });
  });

  it("refuses when the reseller has no stripe_customer_id yet", () => {
    expect(
      decideSaveDefaultPaymentMethod(row(), { setup_intent_id: "seti_1abc" }),
    ).toEqual({ ok: false, reason: "stripe_customer_missing" });
  });

  it("refuses malformed / missing setup_intent_id", () => {
    for (const bad of ["", "   ", "pi_wrong_prefix", "seti_", "seti_bad!"]) {
      expect(
        decideSaveDefaultPaymentMethod(chargeable(), { setup_intent_id: bad }),
      ).toEqual({ ok: false, reason: "setup_intent_id_required" });
    }
  });
});
