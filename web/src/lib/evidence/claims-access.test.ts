// G21 P1-A — claims-access.ts: viewer resolution (member → owner scope;
// entitled evaluator with an evaluations row → evaluator scope + consent
// tier; anyone else → null; a DB outage surfaces) and the pure consent-tier
// projection (attributed_only → counts only; reports_shared → no private
// links; full_mentor / owner → links; consent_scope never leaves).

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  assertProjectAccess: vi.fn(),
  isEvaluatorUser: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock("@/lib/projects", () => {
  class ProjectAccessError extends Error {
    constructor(
      msg: string,
      public code: "not_found" | "forbidden" | "service_unavailable",
    ) {
      super(msg);
    }
  }
  return { ProjectAccessError, assertProjectAccess: (...a: unknown[]) => mocks.assertProjectAccess(...a) };
});
vi.mock("@/lib/evaluations", () => ({ isEvaluatorUser: (...a: unknown[]) => mocks.isEvaluatorUser(...a) }));
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: mocks.maybeSingle }) }) }) }),
      }),
    }),
  }),
}));

import { ProjectAccessError } from "@/lib/projects";
import { projectClaimsByTier, resolveClaimsViewer } from "./claims-access";
import type { Claim, EvidenceRecord } from "./types";

const PROJECT = "11111111-1111-4111-8111-111111111111";
const USER = { id: "u-1", plan: "free" };

beforeEach(() => {
  mocks.assertProjectAccess.mockReset();
  mocks.isEvaluatorUser.mockReset();
  mocks.maybeSingle.mockReset();
});

describe("resolveClaimsViewer", () => {
  it("a member (any role) is the owner scope", async () => {
    mocks.assertProjectAccess.mockResolvedValue({ role: "viewer" });
    expect(await resolveClaimsViewer(USER, PROJECT)).toEqual({ kind: "owner", role: "viewer", viewer: { scope: "owner", userId: "u-1" }, consentTier: null });
    expect(mocks.assertProjectAccess).toHaveBeenCalledWith("u-1", PROJECT, "viewer");
    expect(mocks.isEvaluatorUser).not.toHaveBeenCalled();
  });

  it("a non-member evaluator with an evaluations row gets the evaluator scope + the row's consent tier", async () => {
    mocks.assertProjectAccess.mockRejectedValue(new ProjectAccessError("no", "not_found"));
    mocks.isEvaluatorUser.mockResolvedValue(true);
    mocks.maybeSingle.mockResolvedValue({ data: { id: "ev-1", consent_tier: "reports_shared" } });
    expect(await resolveClaimsViewer(USER, PROJECT)).toEqual({ kind: "evaluator", evaluationId: "ev-1", viewer: { scope: "evaluators", userId: "u-1" }, consentTier: "reports_shared" });
  });

  it("null for a non-evaluator, for an evaluator without a row; a DB outage throws", async () => {
    mocks.assertProjectAccess.mockRejectedValue(new ProjectAccessError("no", "not_found"));
    mocks.isEvaluatorUser.mockResolvedValue(false);
    expect(await resolveClaimsViewer(USER, PROJECT)).toBeNull();
    mocks.isEvaluatorUser.mockResolvedValue(true);
    mocks.maybeSingle.mockResolvedValue({ data: null });
    expect(await resolveClaimsViewer(USER, PROJECT)).toBeNull();
    mocks.assertProjectAccess.mockRejectedValue(new ProjectAccessError("down", "service_unavailable"));
    await expect(resolveClaimsViewer(USER, PROJECT)).rejects.toThrow(/down/);
  });
});

describe("projectClaimsByTier", () => {
  const claim = { id: "c-1", claim_key: "traction.mrr_aud", assessment_status: "evidence_backed" } as Claim;
  const recs = [
    { id: "r-1", visibility: "evaluators", source_uri: "https://drive.example/x", consent_scope: { allowed_viewers: ["x"] } } as EvidenceRecord,
    { id: "r-2", visibility: "public", source_uri: "https://acme.example", consent_scope: {} } as EvidenceRecord,
  ];
  const map = new Map([["c-1", recs]]);

  it("attributed_only → counts only; reports_shared → private links stripped; full_mentor and owner (null) → links; consent_scope never serialised", () => {
    expect(projectClaimsByTier([claim], map, "attributed_only")).toEqual([{ ...claim, records: [], records_count: 2 }]);
    const shared = projectClaimsByTier([claim], map, "reports_shared")[0].records;
    expect(shared.map((r) => r.source_uri)).toEqual([null, "https://acme.example"]);
    expect(shared.every((r) => !("consent_scope" in r))).toBe(true);
    expect(projectClaimsByTier([claim], map, "full_mentor")[0].records.map((r) => r.source_uri)).toEqual(["https://drive.example/x", "https://acme.example"]);
    expect(projectClaimsByTier([claim], map, null)[0].records.map((r) => r.source_uri)).toEqual(["https://drive.example/x", "https://acme.example"]);
    expect(projectClaimsByTier([claim], new Map(), null)[0].records).toEqual([]);
  });
});
