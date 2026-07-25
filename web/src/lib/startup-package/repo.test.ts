// Startup Package repo — Zod round-trip tests.
//
// Every repo function that touches Supabase branches on getSupabaseAdmin()
// returning null (the local-dev / test posture), so we can exercise the
// short-circuit paths without spinning up Postgres. Schema behaviour lives
// under types.ts — this file only validates the wiring: null-safe reads,
// input validation, and that parse errors bubble out.

import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => null }));

import {
  getPurchaseByProject,
  getPurchaseByStripeSession,
  insertPurchase,
  listInterviewAnswers,
  upsertInterviewAnswer,
  getReservedAllocation,
  upsertReservedAllocation,
  listProgress,
  upsertProgress,
} from "./repo";
import {
  PackagePurchaseSchema,
  PackageInterviewAnswerSchema,
  PackageReservedAllocationSchema,
  PackageProgressSchema,
  INTERVIEW_STEP_KEYS,
} from "./types";

const PROJECT_ID = "00000000-0000-0000-0000-000000000001";
const USER_ID = "00000000-0000-0000-0000-000000000002";

describe("startup-package repo — short-circuit when supabase absent", () => {
  it("getPurchaseByProject returns null", async () => {
    await expect(getPurchaseByProject(PROJECT_ID)).resolves.toBeNull();
  });

  it("getPurchaseByStripeSession returns null", async () => {
    await expect(getPurchaseByStripeSession("cs_test_x")).resolves.toBeNull();
  });

  it("insertPurchase returns null", async () => {
    await expect(
      insertPurchase({ user_id: USER_ID, project_id: PROJECT_ID }),
    ).resolves.toBeNull();
  });

  it("listInterviewAnswers returns []", async () => {
    await expect(listInterviewAnswers(PROJECT_ID)).resolves.toEqual([]);
  });

  it("upsertInterviewAnswer returns null", async () => {
    await expect(
      upsertInterviewAnswer({
        project_id: PROJECT_ID,
        step_key: "vision",
        answer_text: "hello",
      }),
    ).resolves.toBeNull();
  });

  it("getReservedAllocation returns null", async () => {
    await expect(getReservedAllocation(PROJECT_ID)).resolves.toBeNull();
  });

  it("upsertReservedAllocation returns null", async () => {
    await expect(
      upsertReservedAllocation({ project_id: PROJECT_ID, pct_reserved: 20 }),
    ).resolves.toBeNull();
  });

  it("listProgress returns []", async () => {
    await expect(listProgress(PROJECT_ID)).resolves.toEqual([]);
  });

  it("upsertProgress returns null", async () => {
    await expect(
      upsertProgress({ project_id: PROJECT_ID, phase_id: "vision" }),
    ).resolves.toBeNull();
  });
});

describe("startup-package repo — input validation propagates", () => {
  it("upsertInterviewAnswer rejects unknown step_key", async () => {
    await expect(
      upsertInterviewAnswer({
        project_id: PROJECT_ID,
        // @ts-expect-error — intentional invalid step_key
        step_key: "not-a-real-step",
        answer_text: "",
      }),
    ).rejects.toThrow();
  });

  it("upsertReservedAllocation rejects pct_reserved below 10", async () => {
    await expect(
      upsertReservedAllocation({ project_id: PROJECT_ID, pct_reserved: 5 }),
    ).rejects.toThrow();
  });

  it("upsertReservedAllocation rejects a 2-letter ticker_hint", async () => {
    await expect(
      upsertReservedAllocation({
        project_id: PROJECT_ID,
        pct_reserved: 20,
        ticker_hint: "AB",
      }),
    ).rejects.toThrow();
  });

  it("upsertProgress rejects completion_pct above 100", async () => {
    await expect(
      upsertProgress({
        project_id: PROJECT_ID,
        phase_id: "vision",
        completion_pct: 150,
      }),
    ).rejects.toThrow();
  });

  it("insertPurchase rejects invalid user_id UUID", async () => {
    await expect(
      insertPurchase({ user_id: "not-a-uuid", project_id: PROJECT_ID }),
    ).rejects.toThrow();
  });
});

describe("startup-package types — schema round-trips", () => {
  it("parses a full purchase row", () => {
    const row = {
      id: "00000000-0000-0000-0000-000000000010",
      user_id: USER_ID,
      project_id: PROJECT_ID,
      stripe_session_id: "cs_test_x",
      stripe_price_id: "price_x",
      purchased_at: "2026-07-25T00:00:00Z",
      seed_credits: 25,
      status: "active" as const,
    };
    expect(PackagePurchaseSchema.parse(row)).toEqual(row);
  });

  it("parses an interview answer row for every step key", () => {
    for (const step of INTERVIEW_STEP_KEYS) {
      const row = {
        id: "00000000-0000-0000-0000-000000000011",
        project_id: PROJECT_ID,
        user_id: USER_ID,
        step_key: step,
        answer_text: "x".repeat(100),
        char_count: 100,
        created_at: "2026-07-25T00:00:00Z",
        updated_at: "2026-07-25T00:00:00Z",
      };
      expect(PackageInterviewAnswerSchema.parse(row).step_key).toBe(step);
    }
  });

  it("parses a reserved allocation row", () => {
    const row = {
      id: "00000000-0000-0000-0000-000000000012",
      project_id: PROJECT_ID,
      pct_reserved: 42.5,
      ticker_hint: "TCK",
      on_chain_token_id: null,
      opt_in_at: null,
      created_at: "2026-07-25T00:00:00Z",
      updated_at: "2026-07-25T00:00:00Z",
    };
    expect(PackageReservedAllocationSchema.parse(row).pct_reserved).toBe(42.5);
  });

  it("parses a progress row", () => {
    const row = {
      id: "00000000-0000-0000-0000-000000000013",
      project_id: PROJECT_ID,
      phase_id: "vision",
      status: "in_progress" as const,
      completion_pct: 40,
      updated_at: "2026-07-25T00:00:00Z",
    };
    expect(PackageProgressSchema.parse(row).completion_pct).toBe(40);
  });
});
