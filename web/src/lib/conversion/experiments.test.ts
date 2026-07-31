import { describe, it, expect, vi, beforeEach } from "vitest";

// experiments.ts is `import "server-only"` — the shim in vitest.config.ts
// resolves that, but keep an explicit mock in case the alias breaks.
vi.mock("server-only", () => ({}));

// Supabase admin surface. Each test resets `adminConfigured`, the row queue
// used for the .maybeSingle() reply, and captures the upsert payload so we can
// assert on the persistence contract.
let adminConfigured = true;
let nextExistingVariant: string | null | undefined = undefined;
let nextExistingError: { message: string } | null = null;
const upsertCalls: Array<{
  row: Record<string, unknown>;
  opts: Record<string, unknown>;
}> = [];
const selectCalls: Array<{
  table: string;
  experimentId: string;
  userId: string;
}> = [];

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => {
    if (!adminConfigured) return null;
    return {
      from(table: string) {
        return {
          select(_cols: string) {
            const chain = {
              _experimentId: "",
              _userId: "",
              eq(col: string, val: string) {
                if (col === "experiment_id") chain._experimentId = val;
                if (col === "user_id") chain._userId = val;
                return chain;
              },
              maybeSingle() {
                selectCalls.push({
                  table,
                  experimentId: chain._experimentId,
                  userId: chain._userId,
                });
                if (nextExistingError) {
                  const err = nextExistingError;
                  nextExistingError = null;
                  return Promise.resolve({ data: null, error: err });
                }
                if (nextExistingVariant === undefined) {
                  return Promise.resolve({ data: null, error: null });
                }
                const variant = nextExistingVariant;
                nextExistingVariant = undefined;
                return Promise.resolve({
                  data: variant === null ? null : { variant },
                  error: null,
                });
              },
            };
            return chain;
          },
          upsert(
            row: Record<string, unknown>,
            opts: Record<string, unknown>,
          ) {
            upsertCalls.push({ row, opts });
            return Promise.resolve({ error: null });
          },
        };
      },
    };
  },
}));

// Import AFTER the mocks so `getSupabaseAdmin` binds to our stub.
import {
  assign,
  bucket,
  getExperiment,
  listExperiments,
  type ExperimentConfig,
} from "./experiments";

beforeEach(() => {
  adminConfigured = true;
  nextExistingVariant = undefined;
  nextExistingError = null;
  upsertCalls.length = 0;
  selectCalls.length = 0;
});

describe("EXPERIMENTS registry — shape + integrity", () => {
  it("ships exactly the 4 canonical experiment ids", () => {
    const ids = listExperiments().map((e) => e.id).sort();
    expect(ids).toEqual(
      [
        "cap_hit_copy",
        "day5_email_subject",
        "pricing_anchor_order",
        "trial_cc_required",
      ].sort(),
    );
  });

  it("every experiment has a non-empty name + ≥ 2 variants + default_variant that is a member of variants[]", () => {
    for (const exp of listExperiments()) {
      expect(exp.name.length).toBeGreaterThan(0);
      expect(exp.variants.length).toBeGreaterThanOrEqual(2);
      expect(exp.variants).toContain(exp.default_variant);
      expect(typeof exp.active).toBe("boolean");
    }
  });

  it("every experiment weight map keys match variants[] exactly (no orphan / no missing)", () => {
    for (const exp of listExperiments()) {
      if (!exp.weights) continue;
      const weightKeys = Object.keys(exp.weights).sort();
      const variantKeys = [...exp.variants].sort();
      expect(weightKeys).toEqual(variantKeys);
    }
  });

  it("every weight is a strictly positive integer and each weight-map sums to ~1000", () => {
    for (const exp of listExperiments()) {
      if (!exp.weights) continue;
      let total = 0;
      for (const w of Object.values(exp.weights)) {
        expect(Number.isInteger(w)).toBe(true);
        expect(w).toBeGreaterThan(0);
        total += w;
      }
      // Allow ±1 for 333/334/333 rounding.
      expect(total).toBeGreaterThanOrEqual(999);
      expect(total).toBeLessThanOrEqual(1001);
    }
  });

  it("listExperiments returns a fresh iteration order matching Object.values ordering", () => {
    const first = listExperiments();
    const second = listExperiments();
    expect(first.map((e) => e.id)).toEqual(second.map((e) => e.id));
  });
});

describe("getExperiment", () => {
  it("returns the config object for a known id", () => {
    const exp = getExperiment("trial_cc_required");
    expect(exp).not.toBeNull();
    expect(exp?.id).toBe("trial_cc_required");
    expect(exp?.variants).toEqual(["card_required", "card_optional"]);
  });

  it("returns null for an unknown id (not undefined)", () => {
    expect(getExperiment("does_not_exist")).toBeNull();
  });
});

describe("bucket — deterministic hash bucketing", () => {
  it("returns null when the experiment id is unknown", () => {
    // Unknown → exp is undefined → `exp?.default_variant ?? null` → null.
    expect(bucket("no_such_experiment", "anyone")).toBeNull();
  });

  it("is deterministic — same (id, subject) yields the same variant across calls", () => {
    const a = bucket("trial_cc_required", "user_0");
    const b = bucket("trial_cc_required", "user_0");
    const c = bucket("trial_cc_required", "user_0");
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it("pins the shipped 700/300 weight bucket for trial_cc_required — user_0 (roll 323) → card_required", () => {
    expect(bucket("trial_cc_required", "user_0")).toBe("card_required");
  });

  it("pins the shipped 700/300 weight bucket for trial_cc_required — user_1 (roll 734) → card_optional", () => {
    expect(bucket("trial_cc_required", "user_1")).toBe("card_optional");
  });

  it("pins the 500/500 split for pricing_anchor_order — u1 (roll 710) → anchor_scale", () => {
    expect(bucket("pricing_anchor_order", "u1")).toBe("anchor_scale");
  });

  it("pins the 500/500 split for pricing_anchor_order — u2 (roll 441) → anchor_growth", () => {
    expect(bucket("pricing_anchor_order", "u2")).toBe("anchor_growth");
  });

  it("pins the 333/334/333 three-way split for day5_email_subject — subject 'b' (roll 88) → curiosity", () => {
    expect(bucket("day5_email_subject", "b")).toBe("curiosity");
  });

  it("pins the 333/334/333 three-way split for day5_email_subject — subject 'a' (roll 485) → benefit", () => {
    expect(bucket("day5_email_subject", "a")).toBe("benefit");
  });

  it("pins the 333/334/333 three-way split for day5_email_subject — subject 'e' (roll 726) → personalised", () => {
    expect(bucket("day5_email_subject", "e")).toBe("personalised");
  });

  it("handles the same-experiment three-way split across two boundary subjects (soft ↔ benefit_led ↔ urgency)", () => {
    // cap_hit_copy weights 333/334/333 → same boundary structure.
    // s10 rolls 0 → soft; s5 rolls 970 → urgency; s1 rolls 370 → benefit_led.
    expect(bucket("cap_hit_copy", "s10")).toBe("soft");
    expect(bucket("cap_hit_copy", "s1")).toBe("benefit_led");
    expect(bucket("cap_hit_copy", "s5")).toBe("urgency");
  });

  it("allows different subjects to reach different variants — sanity check the mapping is not stuck", () => {
    const results = new Set<string | null>();
    for (let i = 0; i < 50; i++) {
      results.add(bucket("trial_cc_required", `sample_${i}`));
    }
    expect(results.size).toBeGreaterThanOrEqual(2);
  });

  it("returns a value from the declared variants[] for every subject sampled", () => {
    const exp = getExperiment("day5_email_subject") as ExperimentConfig;
    for (let i = 0; i < 30; i++) {
      const v = bucket(exp.id, `p_${i}`);
      expect(exp.variants).toContain(v);
    }
  });

  it("empty subject string is a legal input — pins the deterministic default-user roll", () => {
    // Empty subject for trial_cc_required rolls 284 → card_required.
    expect(bucket("trial_cc_required", "")).toBe("card_required");
  });
});

describe("assign — persistence + fallback contracts", () => {
  it("returns null for an unknown experiment id (never touches the DB)", async () => {
    const result = await assign({ experimentId: "nope", userId: "u1" });
    expect(result).toBeNull();
    expect(selectCalls).toHaveLength(0);
    expect(upsertCalls).toHaveLength(0);
  });

  it("returns default_variant when neither userId nor sessionId is supplied", async () => {
    const result = await assign({ experimentId: "trial_cc_required" });
    expect(result).toBe("card_required");
    expect(selectCalls).toHaveLength(0);
    expect(upsertCalls).toHaveLength(0);
  });

  it("returns default_variant when both userId and sessionId are null", async () => {
    const result = await assign({
      experimentId: "pricing_anchor_order",
      userId: null,
      sessionId: null,
    });
    expect(result).toBe("anchor_growth");
    expect(selectCalls).toHaveLength(0);
    expect(upsertCalls).toHaveLength(0);
  });

  it("falls back to bucket() when getSupabaseAdmin returns null (no DB configured)", async () => {
    adminConfigured = false;
    const result = await assign({
      experimentId: "trial_cc_required",
      userId: "user_0",
    });
    // user_0 → roll 323 → card_required (matches pure bucket()).
    expect(result).toBe("card_required");
    // Zero DB round-trips because admin was null.
    expect(selectCalls).toHaveLength(0);
    expect(upsertCalls).toHaveLength(0);
  });

  it("uses bucket() for an anonymous session (sessionId only) — never writes ab_assignments", async () => {
    const result = await assign({
      experimentId: "pricing_anchor_order",
      sessionId: "u1",
    });
    // u1 → roll 710 → anchor_scale.
    expect(result).toBe("anchor_scale");
    // Anonymous subjects should never trigger the userId-scoped select / upsert.
    expect(selectCalls).toHaveLength(0);
    expect(upsertCalls).toHaveLength(0);
  });

  it("returns the persisted variant when ab_assignments already has a row for the user", async () => {
    // Persisted 'card_optional' should beat the bucket-derived 'card_required'.
    nextExistingVariant = "card_optional";
    const result = await assign({
      experimentId: "trial_cc_required",
      userId: "user_0",
    });
    expect(result).toBe("card_optional");
    expect(selectCalls).toEqual([
      {
        table: "ab_assignments",
        experimentId: "trial_cc_required",
        userId: "user_0",
      },
    ]);
    // No upsert on the "already persisted" branch.
    expect(upsertCalls).toHaveLength(0);
  });

  it("on first exposure — buckets, upserts, and returns the bucketed variant", async () => {
    nextExistingVariant = null; // no existing row
    const result = await assign({
      experimentId: "trial_cc_required",
      userId: "user_0",
    });
    // user_0 rolls 323 → card_required.
    expect(result).toBe("card_required");
    expect(selectCalls).toHaveLength(1);
    expect(upsertCalls).toHaveLength(1);
    expect(upsertCalls[0].row).toEqual({
      user_id: "user_0",
      experiment_id: "trial_cc_required",
      variant: "card_required",
    });
    // Composite-key upsert is required so re-runs don't insert a second row.
    expect(upsertCalls[0].opts).toEqual({
      onConflict: "user_id,experiment_id",
    });
  });

  it("prefers userId over sessionId when both are supplied (userId is the persisted subject)", async () => {
    // sessionId 'u2' would bucket to anchor_growth (roll 441). userId 'u1' buckets to anchor_scale (roll 710).
    // The userId branch must win.
    nextExistingVariant = null;
    const result = await assign({
      experimentId: "pricing_anchor_order",
      userId: "u1",
      sessionId: "u2",
    });
    expect(result).toBe("anchor_scale");
    expect(selectCalls[0].userId).toBe("u1");
    expect(upsertCalls[0].row).toMatchObject({
      user_id: "u1",
      variant: "anchor_scale",
    });
  });

  it("assign is deterministic — first-exposure bucket matches pure bucket() for the same subject", async () => {
    nextExistingVariant = null;
    const result = await assign({
      experimentId: "day5_email_subject",
      userId: "e",
    });
    // 'e' rolls 726 → personalised.
    expect(result).toBe("personalised");
    expect(result).toBe(bucket("day5_email_subject", "e"));
  });
});
