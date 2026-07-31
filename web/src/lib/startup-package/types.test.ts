// Startup Package — types.ts pin-shape suite.
//
// Every schema here mirrors a column set in migration 0118. Column adds,
// renames, or CHECK-constraint changes must be reflected on both sides —
// this suite pins the constants + Zod schemas bit-for-bit so a silent
// drift on the TypeScript side is caught before the repo layer sees a
// row it cannot validate.

import { describe, expect, it } from "vitest";

import {
  INTERVIEW_STEP_KEYS,
  InterviewStepKeySchema,
  PURCHASE_STATUSES,
  PROGRESS_STATUSES,
  PackagePurchaseSchema,
  PackageInterviewAnswerSchema,
  PackageReservedAllocationSchema,
  PackageProgressSchema,
  PackagePurchaseInputSchema,
  PackageInterviewAnswerInputSchema,
  PackageReservedAllocationInputSchema,
  PackageProgressInputSchema,
  StartupPackagePurchaseSchema,
  StartupPackageInterviewAnswerSchema,
  StartupPackageReservedAllocationSchema,
  StartupPackageProgressSchema,
} from "./types";

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";
const UUID_C = "33333333-3333-4333-8333-333333333333";

describe("INTERVIEW_STEP_KEYS", () => {
  it("ships the exact 8-step order the wizard reducer relies on", () => {
    expect(Array.from(INTERVIEW_STEP_KEYS)).toEqual([
      "vision",
      "problem",
      "solution",
      "customer",
      "market",
      "revenue_model",
      "team",
      "traction",
    ]);
  });

  it("contains no duplicate keys", () => {
    expect(new Set(INTERVIEW_STEP_KEYS).size).toBe(INTERVIEW_STEP_KEYS.length);
  });

  it("InterviewStepKeySchema accepts every declared key", () => {
    for (const key of INTERVIEW_STEP_KEYS) {
      expect(InterviewStepKeySchema.parse(key)).toBe(key);
    }
  });

  it("InterviewStepKeySchema rejects an unknown step key", () => {
    expect(InterviewStepKeySchema.safeParse("investors").success).toBe(false);
  });
});

describe("status constants", () => {
  it("PURCHASE_STATUSES mirrors the 0118 CHECK constraint", () => {
    expect(Array.from(PURCHASE_STATUSES)).toEqual([
      "active",
      "refunded",
      "disputed",
    ]);
  });

  it("PROGRESS_STATUSES mirrors the 0118 CHECK constraint", () => {
    expect(Array.from(PROGRESS_STATUSES)).toEqual([
      "not_started",
      "in_progress",
      "review",
      "completed",
    ]);
  });
});

describe("PackagePurchaseSchema", () => {
  const valid = {
    id: "purchase_1",
    user_id: UUID_A,
    project_id: UUID_B,
    stripe_session_id: "cs_test_1",
    stripe_price_id: "price_1",
    purchased_at: "2026-07-31T00:00:00Z",
    seed_credits: 25,
    status: "active" as const,
  };

  it("parses a valid purchase row", () => {
    expect(PackagePurchaseSchema.parse(valid)).toMatchObject(valid);
  });

  it("accepts null stripe_session_id + stripe_price_id (offline seat)", () => {
    const res = PackagePurchaseSchema.safeParse({
      ...valid,
      stripe_session_id: null,
      stripe_price_id: null,
    });
    expect(res.success).toBe(true);
  });

  it("rejects a status outside the CHECK constraint", () => {
    expect(
      PackagePurchaseSchema.safeParse({ ...valid, status: "pending" }).success,
    ).toBe(false);
  });

  it("rejects negative seed_credits", () => {
    expect(
      PackagePurchaseSchema.safeParse({ ...valid, seed_credits: -1 }).success,
    ).toBe(false);
  });

  it("rejects non-integer seed_credits", () => {
    expect(
      PackagePurchaseSchema.safeParse({ ...valid, seed_credits: 1.5 }).success,
    ).toBe(false);
  });
});

describe("PackageInterviewAnswerSchema", () => {
  const valid = {
    id: "answer_1",
    project_id: UUID_A,
    user_id: UUID_B,
    step_key: "vision" as const,
    answer_text: "We are building X for Y.",
    char_count: 24,
    created_at: "2026-07-31T00:00:00Z",
    updated_at: "2026-07-31T00:00:01Z",
  };

  it("parses a valid interview answer row", () => {
    expect(PackageInterviewAnswerSchema.parse(valid)).toMatchObject(valid);
  });

  it("allows a null user_id (server-side anonymous seed)", () => {
    const res = PackageInterviewAnswerSchema.safeParse({
      ...valid,
      user_id: null,
    });
    expect(res.success).toBe(true);
  });

  it("rejects an unknown step_key", () => {
    expect(
      PackageInterviewAnswerSchema.safeParse({ ...valid, step_key: "roadmap" })
        .success,
    ).toBe(false);
  });

  it("rejects a negative char_count", () => {
    expect(
      PackageInterviewAnswerSchema.safeParse({ ...valid, char_count: -1 })
        .success,
    ).toBe(false);
  });
});

describe("PackageReservedAllocationSchema", () => {
  const valid = {
    id: "alloc_1",
    project_id: UUID_A,
    pct_reserved: 25,
    ticker_hint: "ABC",
    on_chain_token_id: null,
    opt_in_at: null,
  };

  it("parses a valid reservation row", () => {
    expect(PackageReservedAllocationSchema.parse(valid)).toMatchObject(valid);
  });

  it("rejects pct_reserved below the 10% floor", () => {
    expect(
      PackageReservedAllocationSchema.safeParse({ ...valid, pct_reserved: 9 })
        .success,
    ).toBe(false);
  });

  it("rejects pct_reserved above the 100% ceiling", () => {
    expect(
      PackageReservedAllocationSchema.safeParse({ ...valid, pct_reserved: 101 })
        .success,
    ).toBe(false);
  });

  it("accepts the tightest ticker (3 chars) and the longest (4 chars)", () => {
    expect(
      PackageReservedAllocationSchema.safeParse({ ...valid, ticker_hint: "AB" })
        .success,
    ).toBe(false);
    expect(
      PackageReservedAllocationSchema.safeParse({ ...valid, ticker_hint: "ABC" })
        .success,
    ).toBe(true);
    expect(
      PackageReservedAllocationSchema.safeParse({ ...valid, ticker_hint: "ABCD" })
        .success,
    ).toBe(true);
    expect(
      PackageReservedAllocationSchema.safeParse({
        ...valid,
        ticker_hint: "ABCDE",
      }).success,
    ).toBe(false);
  });

  it("accepts null ticker_hint (founder skipped it)", () => {
    expect(
      PackageReservedAllocationSchema.safeParse({ ...valid, ticker_hint: null })
        .success,
    ).toBe(true);
  });
});

describe("PackageProgressSchema", () => {
  const valid = {
    id: "prog_1",
    project_id: UUID_A,
    phase_id: "phase_ideation",
    status: "in_progress" as const,
    completion_pct: 40,
    updated_at: "2026-07-31T00:00:00Z",
  };

  it("parses a valid progress row", () => {
    expect(PackageProgressSchema.parse(valid)).toMatchObject(valid);
  });

  it("rejects completion_pct below 0", () => {
    expect(
      PackageProgressSchema.safeParse({ ...valid, completion_pct: -1 }).success,
    ).toBe(false);
  });

  it("rejects completion_pct above 100", () => {
    expect(
      PackageProgressSchema.safeParse({ ...valid, completion_pct: 101 }).success,
    ).toBe(false);
  });

  it("rejects a non-integer completion_pct", () => {
    expect(
      PackageProgressSchema.safeParse({ ...valid, completion_pct: 50.5 })
        .success,
    ).toBe(false);
  });

  it("rejects an unknown status", () => {
    expect(
      PackageProgressSchema.safeParse({ ...valid, status: "archived" }).success,
    ).toBe(false);
  });
});

describe("UUID gating on *InputSchema", () => {
  it("PackagePurchaseInputSchema accepts a canonical UUID for user_id + project_id", () => {
    const res = PackagePurchaseInputSchema.safeParse({
      user_id: UUID_A,
      project_id: UUID_B,
    });
    expect(res.success).toBe(true);
  });

  it("PackagePurchaseInputSchema rejects a non-UUID project_id with the pinned message", () => {
    const res = PackagePurchaseInputSchema.safeParse({
      user_id: UUID_A,
      project_id: "not-a-uuid",
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues[0]?.message).toBe("Invalid UUID");
    }
  });

  it("PackageInterviewAnswerInputSchema accepts a valid UUID + step_key", () => {
    const res = PackageInterviewAnswerInputSchema.safeParse({
      project_id: UUID_A,
      user_id: UUID_B,
      step_key: "problem",
      answer_text: "text",
    });
    expect(res.success).toBe(true);
  });

  it("PackageInterviewAnswerInputSchema allows null user_id (server anon path)", () => {
    const res = PackageInterviewAnswerInputSchema.safeParse({
      project_id: UUID_A,
      user_id: null,
      step_key: "team",
      answer_text: "solo",
    });
    expect(res.success).toBe(true);
  });

  it("PackageReservedAllocationInputSchema enforces the 10-100 range", () => {
    expect(
      PackageReservedAllocationInputSchema.safeParse({
        project_id: UUID_A,
        pct_reserved: 15,
      }).success,
    ).toBe(true);
    expect(
      PackageReservedAllocationInputSchema.safeParse({
        project_id: UUID_A,
        pct_reserved: 5,
      }).success,
    ).toBe(false);
  });

  it("PackageProgressInputSchema requires only project_id + phase_id", () => {
    const res = PackageProgressInputSchema.safeParse({
      project_id: UUID_A,
      phase_id: "phase_launch",
    });
    expect(res.success).toBe(true);
  });

  it("PackageProgressInputSchema rejects a completion_pct out of bounds", () => {
    expect(
      PackageProgressInputSchema.safeParse({
        project_id: UUID_A,
        phase_id: "phase_launch",
        completion_pct: 150,
      }).success,
    ).toBe(false);
  });
});

describe("legacy StartupPackage* aliases", () => {
  // repo.ts + earlier integration suites import the "StartupPackage" prefix.
  // Rename them at your peril — the alias export IS the API for those callers.
  it("re-exports the four row schemas under the StartupPackage prefix", () => {
    expect(StartupPackagePurchaseSchema).toBe(PackagePurchaseSchema);
    expect(StartupPackageInterviewAnswerSchema).toBe(
      PackageInterviewAnswerSchema,
    );
    expect(StartupPackageReservedAllocationSchema).toBe(
      PackageReservedAllocationSchema,
    );
    expect(StartupPackageProgressSchema).toBe(PackageProgressSchema);
  });

  it("legacy aliases validate the same rows as the primary schemas", () => {
    const purchase = {
      id: "p1",
      user_id: UUID_A,
      project_id: UUID_B,
      purchased_at: "2026-07-31T00:00:00Z",
      seed_credits: 0,
      status: "refunded" as const,
    };
    expect(StartupPackagePurchaseSchema.safeParse(purchase).success).toBe(
      PackagePurchaseSchema.safeParse(purchase).success,
    );

    const answer = {
      id: "a1",
      project_id: UUID_A,
      step_key: "market" as const,
      answer_text: "",
      char_count: 0,
      created_at: "2026-07-31T00:00:00Z",
    };
    expect(StartupPackageInterviewAnswerSchema.safeParse(answer).success).toBe(
      PackageInterviewAnswerSchema.safeParse(answer).success,
    );

    const alloc = {
      id: "r1",
      project_id: UUID_C,
      pct_reserved: 100,
      ticker_hint: "XYZ",
      on_chain_token_id: null,
      opt_in_at: null,
    };
    expect(
      StartupPackageReservedAllocationSchema.safeParse(alloc).success,
    ).toBe(PackageReservedAllocationSchema.safeParse(alloc).success);
  });
});
