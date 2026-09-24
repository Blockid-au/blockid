import { describe, expect, it } from "vitest";
import { evaluateQuestionPanel, questionPanelCacheKey, type QuestionPanelInput,
  type QuestionPanelBinding, type QuestionPanelVote } from "./question-panel";
import { proposeCfoDrivers } from "../valuation/cfo-assessment-drivers";

const binding: QuestionPanelBinding = { entityId: "company-1", evidenceRevision: "revision-1",
  questionId: "revenue-1", rubricVersion: "rubric-fixture-1", promptVersion: "prompt-1", evidenceSetHash: "a".repeat(64) };
function input(levels: Array<QuestionPanelVote["level"]> = [2, 2, 3]): QuestionPanelInput {
  return { ...binding,
    sources: [{ id: "source-1", entityId: binding.entityId, evidenceRevision: binding.evidenceRevision,
      level: "verified", text: "Annual recurring revenue is AUD 120,000. Source captured 2026-09-20." }],
    votes: levels.map((level, index) => ({ ...binding, role: index === 0 ? "owner" : "judge",
      model: { id: ["fixture-deepseek", "fixture-qwen", "fixture-oss"][index], version: "pinned-1", family: ["deepseek", "qwen", "gpt-oss"][index] },
      level, rationale: "Fixture rubric anchor is supported by the quoted period.",
      citations: level === "N/A" ? [] : [{ evidenceId: "source-1", quote: "Annual recurring revenue is AUD 120,000." }],
    })) };
}
function key(request: QuestionPanelInput) {
  return questionPanelCacheKey({ ...request, models: request.votes.map(v => ({ role: v.role, model: v.model })) });
}

describe("shadow question panel", () => {
  it("accepts the median of three quote-verified ordinal votes with CFO-compatible output", () => {
    const result = evaluateQuestionPanel(input());
    expect(result.status).toBe("accepted");
    expect(result.shadowOnly).toBe(true);
    expect(result.assessment).toEqual({ questionId: binding.questionId, evidenceSetHash: binding.evidenceSetHash,
      rubricVersion: binding.rubricVersion, evidenceIds: ["source-1"], score: 2 });
    const driver = proposeCfoDrivers({ evidenceSetHash: binding.evidenceSetHash, asOf: "2026-09-24",
      assessments: [result.assessment], mappings: [{ questionId: binding.questionId, driver: "fixture_driver", unit: "fraction",
        version: "mapping-1", rubricVersion: binding.rubricVersion, calibrationReference: "fixture-only",
        reviewedBy: "reviewer-fixture", expiresOn: "2027-01-01", values: [0, 0.1, 0.2, 0.3, 0.4], minimum: 0, maximum: 0.4 }] });
    expect(driver.proposals[0].value).toBe(0.2);
  });

  it("caps founder-only votes at level 2 before aggregation", () => {
    const request = input([4, 3, 4]);
    request.sources[0].level = "founder_claim";
    const result = evaluateQuestionPanel(request);
    expect(result.status).toBe("accepted");
    expect(result.assessment.score).toBe(2);
    expect(result.votes.map(v => v.effectiveLevel)).toEqual([2, 2, 2]);
    expect(result.votes.every(v => v.founderCapped)).toBe(true);
  });

  it("does not cap genuine third-party evidence as founder-only", () => {
    const request = input([3, 3, 4]);
    request.sources[0].level = "third_party";
    expect(evaluateQuestionPanel(request).assessment.score).toBe(3);
  });

  it.each(["edited quote", "annual recurring revenue is aud 120,000.", "", "   "])("rejects non-exact or empty quote %j", quote => {
    const request = input([2, 2, 4]);
    request.votes[2].citations[0].quote = quote;
    const result = evaluateQuestionPanel(request);
    expect(result.rejectedVotes).toHaveLength(1);
    expect(result.validVoteCount).toBe(2);
    expect(result.assessment.score).toBe(2);
  });

  it("never accepts a quote from another source, even if it exists in the pack", () => {
    const request = input();
    request.sources.push({ ...request.sources[0], id: "source-2", text: "Unrelated document." });
    request.votes.forEach(v => { v.citations[0].evidenceId = "source-2"; });
    expect(evaluateQuestionPanel(request)).toMatchObject({ status: "pending", validVoteCount: 0, assessment: { score: null } });
  });

  it("keeps two N/A votes pending even with a valid level4 vote", () => {
    expect(evaluateQuestionPanel(input([4, "N/A", "N/A"]))).toMatchObject({ status: "pending", abstentions: 2, assessment: { score: null }, escalationRequired: false });
  });

  it("does not let mismatched N/A votes overrule the bound vote", () => {
    const request = input([2, "N/A", "N/A"]);
    request.votes[1].evidenceRevision = "other";
    request.votes[2].rubricVersion = "other";
    const result = evaluateQuestionPanel(request);
    expect(result.abstentions).toBe(0);
    expect(result.rejectedVotes).toHaveLength(2);
    expect(result.assessment.score).toBe(2); // No invented quorum requirement: median of valid votes.
  });

  it("marks disagreement for escalation without making an AI call", () => {
    expect(evaluateQuestionPanel(input([0, 2, 2]))).toMatchObject({ status: "review_needed", escalationRequired: true,
      issues: ["ordinal_disagreement_requires_escalation"], assessment: { score: null } });
  });

  it("does not round a fractional median after one vote fails verification", () => {
    const request = input([2, 3, 3]);
    request.votes[2].citations = [];
    expect(evaluateQuestionPanel(request)).toMatchObject({ status: "review_needed", escalationRequired: false,
      issues: ["fractional_median_requires_review"], assessment: { score: null } });
  });

  it("holds verified contradictions without inventing a penalty score", () => {
    const request = input();
    request.votes[0].contradictsVerifiedFact = true;
    expect(evaluateQuestionPanel(request)).toMatchObject({ status: "review_needed", assessment: { score: null },
      issues: ["verified_fact_contradiction_requires_review"] });
  });

  it.each(["same", "case-space", "same-model"])("rejects reused family/model (%s)", variant => {
    const request = input();
    if (variant === "same-model") request.votes[2].model.id = request.votes[0].model.id;
    else request.votes[2].model.family = variant === "same" ? "deepseek" : " DEEPSEEK ";
    expect(evaluateQuestionPanel(request)).toMatchObject({ status: "review_needed", assessment: { score: null },
      issues: ["three_distinct_model_families_required"] });
  });

  it.each(["questionId", "rubricVersion", "promptVersion", "evidenceSetHash", "evidenceRevision", "entityId"] as const)("rejects mismatched vote %s", field => {
    const request = input([2, 2, 4]);
    request.votes[2][field] = "other";
    const result = evaluateQuestionPanel(request);
    expect(result.rejectedVotes[0].reasons).toContain("vote_binding_mismatch");
    expect(result.assessment.score).toBe(2);
  });

  it("rejects malformed panel and ambiguous or cross-revision sources", () => {
    const request = input();
    request.sources.push({ ...request.sources[0] });
    expect(evaluateQuestionPanel(request).issues).toContain("invalid_duplicate_or_mismatched_source");
    request.sources = [{ ...request.sources[0], evidenceRevision: "other" }];
    expect(evaluateQuestionPanel(request).status).toBe("review_needed");
    expect(evaluateQuestionPanel({ ...input(), votes: [] }).issues).toContain("three_votes_required");
    expect(evaluateQuestionPanel(null as unknown as QuestionPanelInput).issues).toContain("invalid_panel_binding");
  });
});

describe("versioned shadow cache identity", () => {
  it("is stable under rerun and judge-order changes without mutating inputs", () => {
    const request = input();
    const before = structuredClone(request);
    expect(evaluateQuestionPanel(request)).toEqual(evaluateQuestionPanel(request));
    expect(request).toEqual(before);
    const reversed = { ...request, votes: [...request.votes].reverse() };
    expect(key(request)).toBe(key(reversed));
    expect(evaluateQuestionPanel(request).cacheKey).toBe(key(request));
    expect(key(request)).toMatch(/^[a-f0-9]{64}$/);
  });
  it.each(["questionId", "rubricVersion", "promptVersion", "evidenceRevision", "evidenceSetHash"] as const)("invalidates when %s changes", field => {
    const original = input();
    const changed = input();
    changed[field] = field === "evidenceSetHash" ? "b".repeat(64) : "changed";
    expect(key(original)).not.toBe(key(changed));
  });
  it("pins exact model version rather than only family", () => {
    const original = input();
    const changed = input();
    changed.votes[1].model.version = "pinned-2";
    expect(key(original)).not.toBe(key(changed));
  });
});
