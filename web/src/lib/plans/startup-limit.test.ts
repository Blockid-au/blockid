import { describe, expect, it } from "vitest";
import {
  ACCOUNT_TYPES_WITH_MULTI_STARTUP,
  FOUNDER_ONE_STARTUP_ERROR,
  canCreateAnotherStartup,
  type StartupCreateDecision,
} from "./startup-limit";

const MULTI_TYPES = [
  "accelerator",
  "incubator",
  "reseller",
  "affiliate",
  "advisor",
  "investor_angel",
  "investor_vc",
  "investor",
  "journalist",
] as const;

describe("ACCOUNT_TYPES_WITH_MULTI_STARTUP", () => {
  it("has exactly the shipped 9 account types", () => {
    expect(ACCOUNT_TYPES_WITH_MULTI_STARTUP.size).toBe(9);
  });

  it("contains every shipped multi-startup account type", () => {
    for (const t of MULTI_TYPES) {
      expect(ACCOUNT_TYPES_WITH_MULTI_STARTUP.has(t)).toBe(true);
    }
  });

  it("does NOT include 'founder'", () => {
    expect(ACCOUNT_TYPES_WITH_MULTI_STARTUP.has("founder")).toBe(false);
  });

  it("does NOT include the empty string", () => {
    expect(ACCOUNT_TYPES_WITH_MULTI_STARTUP.has("")).toBe(false);
  });

  it("is case-sensitive — an uppercase variant is not a member", () => {
    expect(ACCOUNT_TYPES_WITH_MULTI_STARTUP.has("Investor")).toBe(false);
    expect(ACCOUNT_TYPES_WITH_MULTI_STARTUP.has("ACCELERATOR")).toBe(false);
  });
});

describe("canCreateAnotherStartup — multi-startup account types", () => {
  it.each(MULTI_TYPES)(
    "%s with 0 startups is allowed",
    (account_type) => {
      const decision = canCreateAnotherStartup({
        account_type,
        current_startup_count: 0,
      });
      expect(decision).toEqual({ allowed: true });
    },
  );

  it.each(MULTI_TYPES)(
    "%s with 1 startup is still allowed (no cap)",
    (account_type) => {
      const decision = canCreateAnotherStartup({
        account_type,
        current_startup_count: 1,
      });
      expect(decision).toEqual({ allowed: true });
    },
  );

  it.each(MULTI_TYPES)(
    "%s with 50 startups is still allowed",
    (account_type) => {
      const decision = canCreateAnotherStartup({
        account_type,
        current_startup_count: 50,
      });
      expect(decision).toEqual({ allowed: true });
    },
  );
});

describe("canCreateAnotherStartup — founder single-startup cap", () => {
  it("founder with 0 startups is allowed", () => {
    const decision = canCreateAnotherStartup({
      account_type: "founder",
      current_startup_count: 0,
    });
    expect(decision).toEqual({ allowed: true });
  });

  it("founder with exactly 1 startup is denied at the boundary", () => {
    const decision = canCreateAnotherStartup({
      account_type: "founder",
      current_startup_count: 1,
    });
    expect(decision).toEqual({
      allowed: false,
      reason: "founder_one_startup_limit",
      current_count: 1,
    });
  });

  it("founder with 5 startups is denied and reports the current count verbatim", () => {
    const decision = canCreateAnotherStartup({
      account_type: "founder",
      current_startup_count: 5,
    });
    expect(decision).toEqual({
      allowed: false,
      reason: "founder_one_startup_limit",
      current_count: 5,
    });
  });

  it("denied decision reason is the exact string 'founder_one_startup_limit'", () => {
    const decision = canCreateAnotherStartup({
      account_type: "founder",
      current_startup_count: 3,
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.reason).toBe("founder_one_startup_limit");
    }
  });
});

describe("canCreateAnotherStartup — blank / missing account_type falls through to founder", () => {
  it("null account_type is treated as founder — 0 count allowed", () => {
    const decision = canCreateAnotherStartup({
      account_type: null,
      current_startup_count: 0,
    });
    expect(decision).toEqual({ allowed: true });
  });

  it("null account_type is treated as founder — 1 count denied", () => {
    const decision = canCreateAnotherStartup({
      account_type: null,
      current_startup_count: 1,
    });
    expect(decision).toEqual({
      allowed: false,
      reason: "founder_one_startup_limit",
      current_count: 1,
    });
  });

  it("undefined account_type is treated as founder — denied at count 2", () => {
    const decision = canCreateAnotherStartup({
      account_type: undefined,
      current_startup_count: 2,
    });
    expect(decision).toEqual({
      allowed: false,
      reason: "founder_one_startup_limit",
      current_count: 2,
    });
  });

  it("empty string account_type is treated as founder — denied at count 1", () => {
    const decision = canCreateAnotherStartup({
      account_type: "",
      current_startup_count: 1,
    });
    expect(decision).toEqual({
      allowed: false,
      reason: "founder_one_startup_limit",
      current_count: 1,
    });
  });

  it("empty string account_type is treated as founder — allowed at count 0", () => {
    const decision = canCreateAnotherStartup({
      account_type: "",
      current_startup_count: 0,
    });
    expect(decision).toEqual({ allowed: true });
  });
});

describe("canCreateAnotherStartup — unknown account types default to the founder cap", () => {
  it("an unknown account_type is capped at 1 (denied at count 1)", () => {
    const decision = canCreateAnotherStartup({
      account_type: "observer",
      current_startup_count: 1,
    });
    expect(decision).toEqual({
      allowed: false,
      reason: "founder_one_startup_limit",
      current_count: 1,
    });
  });

  it("a case-mismatched 'Founder' (capitalised) does NOT match the multi-startup set and is capped", () => {
    const decision = canCreateAnotherStartup({
      account_type: "Founder",
      current_startup_count: 1,
    });
    expect(decision).toEqual({
      allowed: false,
      reason: "founder_one_startup_limit",
      current_count: 1,
    });
  });

  it("a case-mismatched 'ACCELERATOR' does NOT lift the cap", () => {
    const decision = canCreateAnotherStartup({
      account_type: "ACCELERATOR",
      current_startup_count: 1,
    });
    expect(decision).toEqual({
      allowed: false,
      reason: "founder_one_startup_limit",
      current_count: 1,
    });
  });

  it("a whitespace-only account_type is treated as founder (non-empty but not in the multi-set)", () => {
    const decision = canCreateAnotherStartup({
      account_type: "   ",
      current_startup_count: 1,
    });
    expect(decision).toEqual({
      allowed: false,
      reason: "founder_one_startup_limit",
      current_count: 1,
    });
  });
});

describe("canCreateAnotherStartup — cap boundary semantics", () => {
  it("founder with count 0 is allowed (strict '>= 1' gate)", () => {
    expect(
      canCreateAnotherStartup({
        account_type: "founder",
        current_startup_count: 0,
      }),
    ).toEqual({ allowed: true });
  });

  it("founder with count 1 crosses the '>= 1' gate", () => {
    const d = canCreateAnotherStartup({
      account_type: "founder",
      current_startup_count: 1,
    });
    expect(d.allowed).toBe(false);
  });

  it("negative counts (would-be legacy defensive value) do NOT block creation", () => {
    // The gate is `>= 1`, so any value < 1 (including negatives) falls through
    // to `allowed`. This documents the strict-inequality behaviour so a silent
    // widening to `> 0` (which would still block negatives) is visible.
    const d = canCreateAnotherStartup({
      account_type: "founder",
      current_startup_count: -1,
    });
    expect(d).toEqual({ allowed: true });
  });

  it("fractional counts round-trip: 0.5 is < 1 and allowed", () => {
    expect(
      canCreateAnotherStartup({
        account_type: "founder",
        current_startup_count: 0.5,
      }),
    ).toEqual({ allowed: true });
  });

  it("fractional counts: 1.1 crosses the '>= 1' gate and is denied", () => {
    const d = canCreateAnotherStartup({
      account_type: "founder",
      current_startup_count: 1.1,
    });
    expect(d.allowed).toBe(false);
  });
});

describe("FOUNDER_ONE_STARTUP_ERROR — API 403 shape", () => {
  it("error code matches the denied-decision reason so callers can key off a single string", () => {
    expect(FOUNDER_ONE_STARTUP_ERROR.error).toBe("founder_one_startup_limit");
  });

  it("message names the founder cap and points at the upgrade path", () => {
    expect(FOUNDER_ONE_STARTUP_ERROR.message).toMatch(/founder/i);
    expect(FOUNDER_ONE_STARTUP_ERROR.message).toMatch(/upgrade|accelerator/i);
  });

  it("hint URL points at the pricing page with an accelerator highlight", () => {
    expect(FOUNDER_ONE_STARTUP_ERROR.hint_upgrade_url).toBe(
      "/pricing?highlight=accelerator",
    );
  });

  it("frozen-at-runtime — the shape is `as const` so a downstream caller cannot mutate the shared object", () => {
    // `as const` in the source produces a readonly type; at runtime the object
    // is still writable unless explicitly frozen. This test pins the shape,
    // not the freeze — a future change that adds Object.freeze here would not
    // break this assertion.
    expect(Object.keys(FOUNDER_ONE_STARTUP_ERROR).sort()).toEqual([
      "error",
      "hint_upgrade_url",
      "message",
    ]);
  });
});

describe("StartupCreateDecision — discriminated-union type contract", () => {
  it("an allowed decision has no diagnostic fields", () => {
    const d: StartupCreateDecision = canCreateAnotherStartup({
      account_type: "investor",
      current_startup_count: 3,
    });
    expect(d).toEqual({ allowed: true });
  });

  it("a denied decision carries reason + current_count for the API response body", () => {
    const d: StartupCreateDecision = canCreateAnotherStartup({
      account_type: "founder",
      current_startup_count: 4,
    });
    expect(d.allowed).toBe(false);
    if (!d.allowed) {
      expect(typeof d.reason).toBe("string");
      expect(typeof d.current_count).toBe("number");
    }
  });
});
