import { describe, expect, it } from "vitest";
import {
  ONBOARDING_RETURN_STEP_URL,
  buildCheckoutSuccessUrl,
  shouldReturnToOnboarding,
} from "./checkout-success-url";

describe("buildCheckoutSuccessUrl", () => {
  it("returns the standalone marketing thank-you URL when origin is omitted", () => {
    expect(buildCheckoutSuccessUrl("https://blockid.au", "founding50")).toBe(
      "https://blockid.au/checkout/success?plan=founding50",
    );
  });

  it("returns the standalone URL when origin is anything other than 'onboarding'", () => {
    expect(
      buildCheckoutSuccessUrl("https://blockid.au", "growth", "upgrade"),
    ).toBe("https://blockid.au/checkout/success?plan=growth");
    expect(
      buildCheckoutSuccessUrl("https://blockid.au", "growth", null),
    ).toBe("https://blockid.au/checkout/success?plan=growth");
  });

  it("appends onboarding=1 only when origin is exactly 'onboarding'", () => {
    expect(
      buildCheckoutSuccessUrl("https://blockid.au", "founding50", "onboarding"),
    ).toBe("https://blockid.au/checkout/success?plan=founding50&onboarding=1");
  });

  it("encodes the plan id so a weird value can't break the URL", () => {
    expect(
      buildCheckoutSuccessUrl("https://blockid.au", "plan with space", "onboarding"),
    ).toBe(
      "https://blockid.au/checkout/success?plan=plan%20with%20space&onboarding=1",
    );
  });
});

describe("shouldReturnToOnboarding", () => {
  it("is true only when the flag is '1' AND the user is signed in", () => {
    expect(shouldReturnToOnboarding("1", true)).toBe(true);
  });

  it("is false when the user isn't signed in (they need to see the sign-in CTA first)", () => {
    expect(shouldReturnToOnboarding("1", false)).toBe(false);
  });

  it("is false when the onboarding flag is missing or wrong value", () => {
    expect(shouldReturnToOnboarding(undefined, true)).toBe(false);
    expect(shouldReturnToOnboarding(null, true)).toBe(false);
    expect(shouldReturnToOnboarding("0", true)).toBe(false);
    expect(shouldReturnToOnboarding("true", true)).toBe(false);
  });
});

describe("ONBOARDING_RETURN_STEP_URL", () => {
  it("points at Step 6 — 'Create your first startup'", () => {
    // Step 6 is the activation moment shipped in 41ab0cfc — the wizard
    // shell reads ?step= and jumps directly (onboarding-wizard.tsx L95-98).
    expect(ONBOARDING_RETURN_STEP_URL).toBe("/onboarding?step=6");
  });
});
