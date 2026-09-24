/** A score is never a currency amount. Only reviewed question-level mappings
 * may propose financial assumptions, bound to the same evidence revision. */
export interface CfoQuestionAssessment {
  questionId: string;
  evidenceSetHash: string;
  evidenceIds: string[];
  score: number | null;
  rubricVersion: string;
}

export interface CfoDriverMapping {
  questionId: string;
  driver: string;
  unit: string;
  version: string;
  rubricVersion: string;
  calibrationReference: string;
  reviewedBy: string;
  expiresOn: string;
  /** A calibrated value for each rubric level 0–4; no global SVI input. */
  values: [number, number, number, number, number];
  minimum: number;
  maximum: number;
}

export function proposeCfoDrivers(input: {
  evidenceSetHash: string;
  asOf: string;
  assessments: CfoQuestionAssessment[];
  mappings: CfoDriverMapping[];
}) {
  const proposals: Array<{ questionId: string; driver: string; unit: string; value: number;
    mappingVersion: string; evidenceIds: string[]; evidenceSetHash: string; calibrationReference: string }> = [];
  const rejected: Array<{ questionId: string; reason: string }> = [];
  if (!input.evidenceSetHash?.trim() || !Number.isFinite(Date.parse(input.asOf))) {
    throw new Error("An evidence revision and valid assessment date are required");
  }
  for (const mapping of input.mappings) {
    const rows = input.assessments.filter(row => row.questionId === mapping.questionId);
    const row = rows[0];
    let reason: string | undefined;
    if (rows.length !== 1) reason = "missing_or_duplicate_question";
    else if (row.evidenceSetHash !== input.evidenceSetHash) reason = "evidence_revision_mismatch";
    else if (!row.evidenceIds.length || row.evidenceIds.some(id => !id.trim())) reason = "missing_evidence";
    else if (row.score === null) reason = "abstained_or_not_applicable";
    else if (!Number.isInteger(row.score) || row.score < 0 || row.score > 4) reason = "invalid_rubric_score";
    else if (row.rubricVersion !== mapping.rubricVersion) reason = "rubric_version_mismatch";
    else if (![mapping.reviewedBy, mapping.calibrationReference, mapping.version, mapping.driver, mapping.unit].every(s => s?.trim())) reason = "unreviewed_mapping";
    else if (!Number.isFinite(Date.parse(mapping.expiresOn)) || Date.parse(mapping.expiresOn) < Date.parse(input.asOf)) reason = "expired_mapping";
    else if (!Number.isFinite(mapping.minimum) || !Number.isFinite(mapping.maximum) || mapping.minimum > mapping.maximum ||
      mapping.values.length !== 5 || mapping.values.some(v => !Number.isFinite(v) || v < mapping.minimum || v > mapping.maximum)) reason = "invalid_calibration_bounds";
    else if (input.mappings.filter(other => other.driver === mapping.driver).length > 1) reason = "overlapping_driver_requires_reconciliation";
    if (reason) { rejected.push({ questionId: mapping.questionId, reason }); continue; }
    proposals.push({ questionId: row.questionId, driver: mapping.driver, unit: mapping.unit,
      value: mapping.values[row.score!], mappingVersion: mapping.version,
      evidenceIds: [...row.evidenceIds].sort(), evidenceSetHash: input.evidenceSetHash,
      calibrationReference: mapping.calibrationReference });
  }
  return { version: "cfo-assessment-drivers/1" as const, status: "proposals_only" as const, proposals, rejected };
}
