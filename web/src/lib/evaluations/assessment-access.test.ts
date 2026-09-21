// Colocated vitest for lib/evaluations/assessment-access.ts (S-D2 · G22-A).
// Pins: a malformed id never reaches the loader; the evaluator persona gate
// applies to assessors (a lapsed seat → null) and never to the claimed
// founder; G22-A: a BlockID Cohort seat (`viaBatchId`) is refused by default
// — every assessment / share / action WRITE stays 404 for it — and admitted
// only with `allowViaBatch` (the IC memo route), skipping the persona gate
// (membership is the entitlement).

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const resolveDossierAccessMock = vi.fn();
vi.mock("@/lib/evaluations/dossier", () => ({ resolveDossierAccess: (id: string, uid: string) => resolveDossierAccessMock(id, uid) }));

const isEvaluatorUserMock = vi.fn();
vi.mock("@/lib/evaluations", () => ({ isEvaluatorUser: (u: unknown) => isEvaluatorUserMock(u) }));

import { resolveAssessmentAccess } from "./assessment-access";

const USER = { id: "u-1", plan: "investor_angel", accountType: "investor_angel" };
const ASSESSOR = { role: "assessor", viaOrgId: null, viaBatchId: null, readOnly: false, evaluation: { id: "e-1" } };
const FOUNDER = { role: "founder", viaOrgId: null, viaBatchId: null, readOnly: false, evaluation: { id: "e-1" } };
const COHORT_SEAT = { role: "assessor", viaOrgId: null, viaBatchId: "b-1", readOnly: true, evaluation: { id: "e-1" } };

beforeEach(() => {
  vi.clearAllMocks();
  resolveDossierAccessMock.mockResolvedValue(ASSESSOR);
  isEvaluatorUserMock.mockResolvedValue(true);
});

describe("resolveAssessmentAccess", () => {
  it("rejects a malformed id before any read", async () => {
    expect(await resolveAssessmentAccess("bad id!", USER)).toBeNull();
    expect(resolveDossierAccessMock).not.toHaveBeenCalled();
  });

  it("assessor: passes with the evaluator persona, null when it lapsed; founder: never persona-gated", async () => {
    expect(await resolveAssessmentAccess("e-1", USER)).toEqual(ASSESSOR);
    isEvaluatorUserMock.mockResolvedValueOnce(false);
    expect(await resolveAssessmentAccess("e-1", USER)).toBeNull();
    resolveDossierAccessMock.mockResolvedValue(FOUNDER);
    isEvaluatorUserMock.mockResolvedValue(false);
    expect(await resolveAssessmentAccess("e-1", USER)).toEqual(FOUNDER);
    expect(isEvaluatorUserMock).toHaveBeenCalledTimes(2);
  });

  it("G22-A: a cohort seat is refused by default (writes) and admitted with allowViaBatch without the persona gate", async () => {
    resolveDossierAccessMock.mockResolvedValue(COHORT_SEAT);
    expect(await resolveAssessmentAccess("e-1", USER)).toBeNull();
    expect(await resolveAssessmentAccess("e-1", USER, { allowViaBatch: false })).toBeNull();
    isEvaluatorUserMock.mockResolvedValue(false);
    expect(await resolveAssessmentAccess("e-1", USER, { allowViaBatch: true })).toEqual(COHORT_SEAT);
    expect(isEvaluatorUserMock).not.toHaveBeenCalled();
  });

  it("null from the loader stays null", async () => {
    resolveDossierAccessMock.mockResolvedValue(null);
    expect(await resolveAssessmentAccess("e-1", USER, { allowViaBatch: true })).toBeNull();
  });
});
