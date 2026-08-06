// Colocated invariant suite for the auto-generated pricing catalogue.
//
// `plans.generated.ts` is regenerated from `plans.csv` by
// `scripts/build-plans.ts`, so this suite intentionally sticks to
// structural invariants that must hold for ANY valid regeneration —
// specific SKU IDs, prices, and feature flags are pinned by the
// sibling `plans.test.ts` (PRC-INV lane). Duplicating those pins here
// would double the maintenance cost every time the CSV moves.
//
// Invariants covered:
//   * shape of every plan row (id, segment, interval, prices, flags, limits)
//   * uniqueness across ids and sort_order
//   * segment coverage vs the exported enum
//   * interval-conditional rules (free → $0, non-free → STRIPE env var, etc)
//   * GENERATED_PLANS_BY_ID mirrors GENERATED_PLANS 1:1 by identity

import { describe, expect, it } from "vitest";
import {
  GENERATED_PLANS,
  GENERATED_PLANS_BY_ID,
  type GeneratedPlan,
} from "./plans.generated";

const VALID_SEGMENTS: ReadonlySet<GeneratedPlan["segment"]> = new Set([
  "founder",
  "investor_angel",
  "advisor",
  "investor_vc",
  "accelerator",
]);

const VALID_INTERVALS: ReadonlySet<GeneratedPlan["interval"]> = new Set([
  "free",
  "monthly",
  "yearly",
  "once",
  "custom",
]);

const FIELDS: ReadonlyArray<keyof GeneratedPlan> = [
  "id",
  "segment",
  "name",
  "price_aud_cents",
  "annual_price_aud_cents",
  "interval",
  "trial_days",
  "stripe_env_var",
  "feature_flags",
  "usage_limits",
  "active",
  "sort_order",
];

const isIntegerCents = (n: number): boolean =>
  Number.isInteger(n) && n >= 0;

describe("plans.generated — module surface", () => {
  it("exports GENERATED_PLANS as a non-empty array", () => {
    expect(Array.isArray(GENERATED_PLANS)).toBe(true);
    expect(GENERATED_PLANS.length).toBeGreaterThan(0);
  });

  it("exports GENERATED_PLANS_BY_ID as a plain object", () => {
    expect(GENERATED_PLANS_BY_ID).toBeTruthy();
    expect(typeof GENERATED_PLANS_BY_ID).toBe("object");
    expect(Array.isArray(GENERATED_PLANS_BY_ID)).toBe(false);
  });

  it("has at least one active plan per known segment", () => {
    for (const seg of VALID_SEGMENTS) {
      const any = GENERATED_PLANS.some(
        (p) => p.segment === seg && p.active,
      );
      expect(any, `no active plan for segment ${seg}`).toBe(true);
    }
  });
});

describe("plans.generated — row shape", () => {
  it.each(GENERATED_PLANS.map((p) => [p.id, p] as const))(
    "plan %s carries every documented field",
    (_id, plan) => {
      for (const field of FIELDS) {
        expect(plan, `plan ${plan.id} missing field ${String(field)}`).toHaveProperty(field);
      }
    },
  );

  it.each(GENERATED_PLANS.map((p) => [p.id, p] as const))(
    "plan %s has a non-empty id string",
    (_id, plan) => {
      expect(typeof plan.id).toBe("string");
      expect(plan.id.length).toBeGreaterThan(0);
    },
  );

  it.each(GENERATED_PLANS.map((p) => [p.id, p] as const))(
    "plan %s has a non-empty display name",
    (_id, plan) => {
      expect(typeof plan.name).toBe("string");
      expect(plan.name.trim().length).toBeGreaterThan(0);
    },
  );

  it.each(GENERATED_PLANS.map((p) => [p.id, p] as const))(
    "plan %s has a valid segment enum value",
    (_id, plan) => {
      expect(VALID_SEGMENTS.has(plan.segment)).toBe(true);
    },
  );

  it.each(GENERATED_PLANS.map((p) => [p.id, p] as const))(
    "plan %s has a valid interval enum value",
    (_id, plan) => {
      expect(VALID_INTERVALS.has(plan.interval)).toBe(true);
    },
  );

  it.each(GENERATED_PLANS.map((p) => [p.id, p] as const))(
    "plan %s has a boolean active flag",
    (_id, plan) => {
      expect(typeof plan.active).toBe("boolean");
    },
  );

  it.each(GENERATED_PLANS.map((p) => [p.id, p] as const))(
    "plan %s has an integer sort_order >= 0",
    (_id, plan) => {
      expect(Number.isInteger(plan.sort_order)).toBe(true);
      expect(plan.sort_order).toBeGreaterThanOrEqual(0);
    },
  );

  it.each(GENERATED_PLANS.map((p) => [p.id, p] as const))(
    "plan %s uses integer cents for price_aud_cents",
    (_id, plan) => {
      expect(isIntegerCents(plan.price_aud_cents)).toBe(true);
    },
  );

  it.each(GENERATED_PLANS.map((p) => [p.id, p] as const))(
    "plan %s uses integer cents for annual_price_aud_cents",
    (_id, plan) => {
      expect(isIntegerCents(plan.annual_price_aud_cents)).toBe(true);
    },
  );

  it.each(GENERATED_PLANS.map((p) => [p.id, p] as const))(
    "plan %s has a non-negative integer trial_days",
    (_id, plan) => {
      expect(Number.isInteger(plan.trial_days)).toBe(true);
      expect(plan.trial_days).toBeGreaterThanOrEqual(0);
    },
  );

  it.each(GENERATED_PLANS.map((p) => [p.id, p] as const))(
    "plan %s has an array feature_flags with unique non-empty strings",
    (_id, plan) => {
      expect(Array.isArray(plan.feature_flags)).toBe(true);
      const set = new Set<string>();
      for (const flag of plan.feature_flags) {
        expect(typeof flag).toBe("string");
        expect(flag.length).toBeGreaterThan(0);
        expect(set.has(flag), `duplicate flag ${flag} on ${plan.id}`).toBe(false);
        set.add(flag);
      }
    },
  );

  it.each(GENERATED_PLANS.map((p) => [p.id, p] as const))(
    "plan %s has a plain-object usage_limits with numeric values",
    (_id, plan) => {
      expect(plan.usage_limits).toBeTruthy();
      expect(typeof plan.usage_limits).toBe("object");
      expect(Array.isArray(plan.usage_limits)).toBe(false);
      for (const [key, value] of Object.entries(plan.usage_limits)) {
        expect(key.length, `empty usage_limits key on ${plan.id}`).toBeGreaterThan(0);
        expect(typeof value, `${plan.id}.${key} is not number`).toBe("number");
        expect(Number.isFinite(value)).toBe(true);
        expect(Number.isInteger(value)).toBe(true);
      }
    },
  );

  it.each(GENERATED_PLANS.map((p) => [p.id, p] as const))(
    "plan %s has a string stripe_env_var",
    (_id, plan) => {
      expect(typeof plan.stripe_env_var).toBe("string");
    },
  );
});

describe("plans.generated — cross-row invariants", () => {
  it("every plan id is unique across the catalogue", () => {
    const seen = new Set<string>();
    for (const p of GENERATED_PLANS) {
      expect(seen.has(p.id), `duplicate id ${p.id}`).toBe(false);
      seen.add(p.id);
    }
    expect(seen.size).toBe(GENERATED_PLANS.length);
  });

  it("every sort_order is unique across the catalogue", () => {
    const seen = new Set<number>();
    for (const p of GENERATED_PLANS) {
      expect(seen.has(p.sort_order), `duplicate sort_order ${p.sort_order} on ${p.id}`).toBe(false);
      seen.add(p.sort_order);
    }
  });

  it("sort_order values form a strictly ordered set (no ties across the catalogue)", () => {
    const orders = GENERATED_PLANS.map((p) => p.sort_order);
    const sorted = [...orders].sort((a, b) => a - b);
    // Uniqueness is asserted separately; here we just check that no two rows
    // collide once sorted — protects the /pricing tab renderer from ambiguity.
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i]).toBeGreaterThan(sorted[i - 1]);
    }
  });

  it("id set is disjoint from empty string / whitespace-only ids", () => {
    for (const p of GENERATED_PLANS) {
      expect(p.id).toBe(p.id.trim());
      expect(p.id.length).toBeGreaterThan(0);
    }
  });

  it("segments observed are a subset of the declared enum", () => {
    const observed = new Set(GENERATED_PLANS.map((p) => p.segment));
    for (const seg of observed) {
      expect(VALID_SEGMENTS.has(seg), `unknown segment ${seg}`).toBe(true);
    }
  });

  it("intervals observed are a subset of the declared enum", () => {
    const observed = new Set(GENERATED_PLANS.map((p) => p.interval));
    for (const iv of observed) {
      expect(VALID_INTERVALS.has(iv), `unknown interval ${iv}`).toBe(true);
    }
  });

  it("at least one interval other than 'custom' is present (real Stripe SKUs)", () => {
    const others = GENERATED_PLANS.filter((p) => p.interval !== "custom");
    expect(others.length).toBeGreaterThan(0);
  });
});

describe("plans.generated — interval-conditional rules", () => {
  it("every 'free' interval plan is priced at $0", () => {
    for (const p of GENERATED_PLANS.filter((p) => p.interval === "free")) {
      expect(p.price_aud_cents, `${p.id} free but priced`).toBe(0);
      expect(p.annual_price_aud_cents, `${p.id} free but annual priced`).toBe(0);
    }
  });

  it("every 'free' interval plan has an empty stripe_env_var (no Stripe SKU)", () => {
    for (const p of GENERATED_PLANS.filter((p) => p.interval === "free")) {
      expect(p.stripe_env_var).toBe("");
    }
  });

  it("every 'once' interval plan has no annual price component", () => {
    for (const p of GENERATED_PLANS.filter((p) => p.interval === "once")) {
      expect(p.annual_price_aud_cents, `${p.id} 'once' but has annual price`).toBe(0);
    }
  });

  it("every priced plan (>$0) declares a STRIPE_ env var", () => {
    for (const p of GENERATED_PLANS.filter((p) => p.price_aud_cents > 0)) {
      expect(p.stripe_env_var.length, `${p.id} priced but no env var`).toBeGreaterThan(0);
      expect(
        p.stripe_env_var.startsWith("STRIPE_"),
        `${p.id} env var must start with STRIPE_, got ${p.stripe_env_var}`,
      ).toBe(true);
    }
  });

  it("every priced plan uses SCREAMING_SNAKE_CASE for its stripe_env_var", () => {
    for (const p of GENERATED_PLANS.filter((p) => p.stripe_env_var.length > 0)) {
      expect(p.stripe_env_var).toMatch(/^[A-Z][A-Z0-9_]*$/);
    }
  });

  it("stripe_env_var values are unique across priced plans", () => {
    const seen = new Set<string>();
    for (const p of GENERATED_PLANS.filter((p) => p.stripe_env_var.length > 0)) {
      expect(seen.has(p.stripe_env_var), `duplicate env var ${p.stripe_env_var} on ${p.id}`).toBe(false);
      seen.add(p.stripe_env_var);
    }
  });

  it("monthly recurring plans have annual >= monthly (annual can't be cheaper than one month)", () => {
    for (const p of GENERATED_PLANS.filter(
      (p) => p.interval === "monthly" && p.annual_price_aud_cents > 0,
    )) {
      expect(
        p.annual_price_aud_cents,
        `${p.id}: annual < monthly makes no sense`,
      ).toBeGreaterThanOrEqual(p.price_aud_cents);
    }
  });

  it("monthly recurring plans with annual set apply an annual discount (annual <= 12 months)", () => {
    for (const p of GENERATED_PLANS.filter(
      (p) => p.interval === "monthly" && p.annual_price_aud_cents > 0,
    )) {
      expect(
        p.annual_price_aud_cents,
        `${p.id}: annual > 12 * monthly means paying MORE per year`,
      ).toBeLessThanOrEqual(p.price_aud_cents * 12);
    }
  });

  it("free plans do not carry a trial_days", () => {
    for (const p of GENERATED_PLANS.filter((p) => p.interval === "free")) {
      expect(p.trial_days, `${p.id} is free but has trial`).toBe(0);
    }
  });

  it("'custom' interval plans have trial_days = 0 (sales-led, no self-serve trial)", () => {
    for (const p of GENERATED_PLANS.filter((p) => p.interval === "custom")) {
      expect(p.trial_days, `${p.id} custom but has trial`).toBe(0);
    }
  });

  it("'once' interval plans have trial_days = 0 (one-off purchase)", () => {
    for (const p of GENERATED_PLANS.filter((p) => p.interval === "once")) {
      expect(p.trial_days, `${p.id} 'once' but has trial`).toBe(0);
    }
  });
});

describe("plans.generated — GENERATED_PLANS_BY_ID mirror", () => {
  it("has exactly the same key count as GENERATED_PLANS", () => {
    expect(Object.keys(GENERATED_PLANS_BY_ID)).toHaveLength(
      GENERATED_PLANS.length,
    );
  });

  it("keys are exactly the ids in GENERATED_PLANS", () => {
    const keys = new Set(Object.keys(GENERATED_PLANS_BY_ID));
    const ids = new Set(GENERATED_PLANS.map((p) => p.id));
    expect(keys).toEqual(ids);
  });

  it("lookup returns the same object reference as the array entry", () => {
    for (const plan of GENERATED_PLANS) {
      expect(GENERATED_PLANS_BY_ID[plan.id]).toBe(plan);
    }
  });

  it("missing-key lookup is undefined for unknown plan ids", () => {
    expect(GENERATED_PLANS_BY_ID["__definitely_not_a_plan__"]).toBeUndefined();
    expect(GENERATED_PLANS_BY_ID[""]).toBeUndefined();
    // Own-property probes for prototype names — Object.fromEntries returns a
    // regular {} which still inherits Object.prototype, so we check own-ness
    // rather than the truthiness of a plain lookup.
    expect(Object.prototype.hasOwnProperty.call(GENERATED_PLANS_BY_ID, "toString")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(GENERATED_PLANS_BY_ID, "constructor")).toBe(false);
  });

  it("every mirror entry is itself a valid GeneratedPlan shape", () => {
    for (const key of Object.keys(GENERATED_PLANS_BY_ID)) {
      const plan = GENERATED_PLANS_BY_ID[key];
      expect(plan.id).toBe(key);
      expect(VALID_SEGMENTS.has(plan.segment)).toBe(true);
      expect(VALID_INTERVALS.has(plan.interval)).toBe(true);
    }
  });
});

describe("plans.generated — regression guards for known SKUs", () => {
  // These few pins are cheap because the SKUs they cover are the load-bearing
  // ones the /pricing and onboarding surfaces assume — if any of them
  // silently disappear from the catalogue, buyers hit a broken tier.
  it("founder_free is present, priced at $0, and interval=free", () => {
    const free = GENERATED_PLANS.find((p) => p.id === "founder_free");
    expect(free).toBeDefined();
    expect(free!.price_aud_cents).toBe(0);
    expect(free!.interval).toBe("free");
  });

  it("founder_package (Startup Package one-off) is a 'once' SKU with a Stripe env var", () => {
    const pkg = GENERATED_PLANS.find((p) => p.id === "founder_package");
    expect(pkg).toBeDefined();
    expect(pkg!.interval).toBe("once");
    expect(pkg!.stripe_env_var.startsWith("STRIPE_")).toBe(true);
  });

  it("every segment except 'advisor' hits the id-prefix convention", () => {
    // 'advisor' is deliberately exempt: the Advisor SKU is `investor_advisor`
    // because it lives on the Investor pricing tab (see plans.test.ts:161).
    for (const seg of VALID_SEGMENTS) {
      if (seg === "advisor") continue;
      const anyPrefixed = GENERATED_PLANS.some(
        (p) => p.segment === seg && p.id.startsWith(seg.split("_")[0]),
      );
      expect(anyPrefixed, `no id-prefix convention hit for ${seg}`).toBe(true);
    }
  });
});
