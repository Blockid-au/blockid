import { describe, expect, it } from "vitest";
import { proposeCfoDrivers, type CfoDriverMapping, type CfoQuestionAssessment } from "./cfo-assessment-drivers";

const assessment: CfoQuestionAssessment = { questionId: "retention", evidenceSetHash: "rev1", evidenceIds: ["cohort1"], score: 3, rubricVersion: "r1" };
const mapping: CfoDriverMapping = { questionId: "retention", driver: "churn", unit: "fraction/month", version: "m1", rubricVersion: "r1", calibrationReference: "review-fixture", reviewedBy: "analyst", expiresOn: "2027-01-01", values: [.1, .08, .06, .04, .02], minimum: 0, maximum: 1 };
const run = (a = assessment, m = mapping) => proposeCfoDrivers({ evidenceSetHash: "rev1", asOf: "2026-09-24", assessments: [a], mappings: [m] });
describe("CFO assessment driver proposals", () => {
  it("is deterministic and does not apply confidence a second time", () => {
    expect(run()).toEqual(run());
    expect(run().proposals[0].value).toBe(.04);
    expect(run().status).toBe("proposals_only");
  });
  it.each([
    [{ ...assessment, score: null }, "abstained_or_not_applicable"],
    [{ ...assessment, score: 5 }, "invalid_rubric_score"],
    [{ ...assessment, evidenceSetHash: "other" }, "evidence_revision_mismatch"],
    [{ ...assessment, evidenceIds: [] }, "missing_evidence"],
  ] as const)("rejects ineligible assessment %#", (row, reason) => {
    const result = run({ ...row, evidenceIds: [...row.evidenceIds] });
    expect(result.proposals).toHaveLength(0);
    expect(result.rejected[0].reason).toBe(reason);
  });
  it("requires calibration approval and valid bounds", () => {
    expect(run(assessment, { ...mapping, reviewedBy: "" }).rejected[0].reason).toBe("unreviewed_mapping");
    expect(run(assessment, { ...mapping, maximum: .03 }).rejected[0].reason).toBe("invalid_calibration_bounds");
  });
  it("does not silently sum two effects on the same driver", () => {
    const result = proposeCfoDrivers({ evidenceSetHash: "rev1", asOf: "2026-09-24", assessments: [assessment], mappings: [mapping, mapping] });
    expect(result.proposals).toHaveLength(0);
    expect(result.rejected[0].reason).toBe("overlapping_driver_requires_reconciliation");
  });
});
