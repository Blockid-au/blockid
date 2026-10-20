// G35 P2-2 — the evaluator card order's default access check + baseline,
// as the paid-order generator wires them. A DB error must surface as a
// thrown (retryable) error, never as "access revoked" / "project missing"
// (those fail the paid order permanently and refund it).

import { beforeEach, describe, expect, it, vi } from "vitest";

const canAccessMock = vi.fn();
const prepareMock = vi.fn();
vi.mock("@/lib/evaluations", () => ({
  canAccessProjectAsEvaluator: (u: string, p: string) => canAccessMock(u, p),
}));
vi.mock("@/lib/report-pipeline/run-for-project", () => ({
  prepareProjectReportBaseline: (p: string, opts?: unknown) => prepareMock(p, opts),
}));

import { defaultEvaluatorAccess, defaultEvaluatorBaseline } from "./report-generator";

beforeEach(() => {
  canAccessMock.mockReset();
  prepareMock.mockReset();
});

describe("defaultEvaluatorAccess", () => {
  it("allowed as evaluator → true; founder_claimed / plain deny → false", async () => {
    canAccessMock.mockResolvedValueOnce({ allowed: true, via: "evaluator", evaluation: {} });
    expect(await defaultEvaluatorAccess("u", "p")).toBe(true);
    canAccessMock.mockResolvedValueOnce({ allowed: true, via: "founder_claimed", evaluation: {} });
    expect(await defaultEvaluatorAccess("u", "p")).toBe(false);
    canAccessMock.mockResolvedValueOnce({ allowed: false });
    expect(await defaultEvaluatorAccess("u", "p")).toBe(false);
  });

  it("a check that could not run throws (the generator maps it to a retryable failure)", async () => {
    canAccessMock.mockResolvedValueOnce({ allowed: false, error: true });
    await expect(defaultEvaluatorAccess("u", "p")).rejects.toThrow("evaluations_lookup_failed");
  });
});

describe("defaultEvaluatorBaseline", () => {
  it("asks for strict lookups so DB errors read as *_lookup_failed, not *_not_found", async () => {
    prepareMock.mockResolvedValueOnce({ ownerEmail: "owner@startup.au" });
    expect(await defaultEvaluatorBaseline("p-1")).toEqual({ ownerEmail: "owner@startup.au" });
    expect(prepareMock).toHaveBeenCalledWith("p-1", { strictLookups: true });
  });
});
