// G35 Pricing v5 — the evaluator as a PAYG card buyer (payg-buyer.ts).

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/evaluations", () => ({
  getEvaluationForUser: vi.fn(),
  canAccessProjectAsEvaluator: vi.fn(),
}));
vi.mock("@/lib/evaluations/report-quota", () => ({ previewReportCharge: vi.fn() }));

import { authoriseEvaluatorBuyer, evaluatorQuotaCoversFull, isEvaluationIdShape } from "./payg-buyer";

const EVAL = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const BIZ = "11111111-2222-3333-4444-555555555555";
const OTHER_BIZ = "99999999-2222-3333-4444-555555555555";

const evaluation = (projectId = BIZ) => ({ id: EVAL, evaluatorUserId: "u1", projectId }) as never;

describe("authoriseEvaluatorBuyer", () => {
  it("rejects a malformed evaluation id with 400 before any read", async () => {
    const getEvaluation = vi.fn();
    expect(isEvaluationIdShape("nope")).toBe(false);
    expect(await authoriseEvaluatorBuyer("u1", "nope", BIZ, { getEvaluation })).toMatchObject({ ok: false, status: 400, code: "invalid_evaluation" });
    expect(await authoriseEvaluatorBuyer("u1", 42, BIZ, { getEvaluation })).toMatchObject({ ok: false, status: 400 });
    expect(getEvaluation).not.toHaveBeenCalled();
  });

  it("404 when the row is not the caller's or is about another startup (no existence oracle)", async () => {
    const canAccess = vi.fn();
    expect(await authoriseEvaluatorBuyer("u1", EVAL, BIZ, { getEvaluation: async () => null, canAccess })).toMatchObject({ ok: false, status: 404 });
    expect(await authoriseEvaluatorBuyer("u1", EVAL, BIZ, { getEvaluation: async () => evaluation(OTHER_BIZ), canAccess })).toMatchObject({ ok: false, status: 404 });
    expect(canAccess).not.toHaveBeenCalled();
  });

  it("403 when evaluator access to the project is gone, or held only as the claiming founder", async () => {
    const getEvaluation = async () => evaluation();
    expect(await authoriseEvaluatorBuyer("u1", EVAL, BIZ, { getEvaluation, canAccess: async () => ({ allowed: false }) })).toMatchObject({ ok: false, status: 403 });
    expect(
      await authoriseEvaluatorBuyer("u1", EVAL, BIZ, { getEvaluation, canAccess: async () => ({ allowed: true, via: "founder_claimed", evaluation: evaluation() }) }),
    ).toMatchObject({ ok: false, status: 403 });
  });

  it("ok for the evaluator of that startup", async () => {
    const getEvaluation = vi.fn(async () => evaluation());
    const canAccess = vi.fn(async () => ({ allowed: true as const, via: "evaluator" as const, evaluation: evaluation() }));
    expect(await authoriseEvaluatorBuyer("u1", EVAL, BIZ, { getEvaluation, canAccess })).toEqual({ ok: true, evaluationId: EVAL });
    expect(getEvaluation).toHaveBeenCalledWith("u1", EVAL);
    expect(canAccess).toHaveBeenCalledWith("u1", BIZ);
  });
});

describe("evaluatorQuotaCoversFull", () => {
  const user = { id: "u1", plan: "scout" };

  it("true while the plan / trial still includes a Full report (PAYG costs)", async () => {
    const preview = vi.fn(async () => ({ via: "quota" }) as never);
    expect(await evaluatorQuotaCoversFull(user, { preview })).toBe(true);
    expect(preview).toHaveBeenCalledWith(user, "full", { payg: true });
  });

  it("false once the quota is used (credits or none)", async () => {
    expect(await evaluatorQuotaCoversFull(user, { preview: async () => ({ via: "credits" }) as never })).toBe(false);
    expect(await evaluatorQuotaCoversFull(user, { preview: async () => ({ via: "none" }) as never })).toBe(false);
  });

  it("fails closed for money: a read error counts as covered (never a card charge for an included report)", async () => {
    expect(await evaluatorQuotaCoversFull(user, { preview: async () => { throw new Error("db down"); } })).toBe(true);
  });
});
