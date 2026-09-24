import { createHash } from "node:crypto";
import type { CfoQuestionAssessment } from "../valuation/cfo-assessment-drivers";

/** G32 shadow-only reducer. No rubric, model calls, point weights, live scoring,
 * cache persistence or calibration is introduced here. Accepted means only that
 * supplied votes pass this reducer; it is not publication or analyst approval.
 * Model family/version and source classifications must come from trusted callers,
 * never from the model's own self-description. Quote matching establishes textual
 * support only, not that a quote semantically proves a claimed level. */
export const QUESTION_PANEL_VERSION = "question-panel-shadow/1" as const;
export type QuestionLevel = 0 | 1 | 2 | 3 | 4;
export interface QuestionPanelBinding {
  entityId: string;
  evidenceRevision: string;
  questionId: string;
  rubricVersion: string;
  promptVersion: string;
  evidenceSetHash: string;
}
export interface QuestionPanelModel {
  id: string;
  version: string;
  family: string;
}
export interface QuestionPanelSource {
  id: string;
  entityId: string;
  evidenceRevision: string;
  text: string;
  level: "verified" | "third_party" | "founder_claim";
}
export interface QuestionPanelVote extends QuestionPanelBinding {
  role: "owner" | "judge";
  model: QuestionPanelModel;
  level: QuestionLevel | "N/A";
  citations: Array<{ evidenceId: string; quote: string }>;
  rationale: string;
  /** A verified contradiction flagged upstream is held for human review, not
   * converted into an invented numeric penalty by this shadow helper. */
  contradictsVerifiedFact?: boolean;
}
export interface QuestionPanelInput extends QuestionPanelBinding {
  sources: QuestionPanelSource[];
  votes: QuestionPanelVote[];
}
export interface QuestionPanelCacheIdentity extends QuestionPanelBinding {
  models: Array<{ role: "owner" | "judge"; model: QuestionPanelModel }>;
}
export interface QuestionPanelResult {
  version: typeof QUESTION_PANEL_VERSION;
  shadowOnly: true;
  status: "accepted" | "pending" | "review_needed";
  assessment: CfoQuestionAssessment;
  validVoteCount: number;
  abstentions: number;
  votes: Array<{ modelId: string; originalLevel: QuestionLevel; effectiveLevel: QuestionLevel; founderCapped: boolean }>;
  rejectedVotes: Array<{ index: number; reasons: string[] }>;
  issues: string[];
  escalationRequired: boolean;
  cacheKey: string | null;
}

const BINDING_KEYS = ["entityId", "evidenceRevision", "questionId", "rubricVersion", "promptVersion", "evidenceSetHash"] as const;
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const nonempty = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const canonicalFamily = (family: string) => family.trim().toLowerCase();
const validModel = (m: unknown): m is QuestionPanelModel => object(m) && [m.id, m.version, m.family].every(nonempty);
const validBinding = (input: QuestionPanelBinding) => BINDING_KEYS.every(key => nonempty(input[key])) && /^[a-f0-9]{64}$/i.test(input.evidenceSetHash);

/** The hash pins versions and evidence, never the sampled outputs. Reordering
 * judge votes does not invalidate a cache key; changing a model/prompt does.
 * Caller must compute evidenceSetHash from immutable source content and persist
 * results by this key to obtain rerun stability. A hash alone is not a cache. */
export function questionPanelCacheKey(input: QuestionPanelCacheIdentity): string {
  if (!object(input) || !validBinding(input) || !Array.isArray(input.models)
    || input.models.length !== 3 || input.models.some(m => !object(m) || !["owner", "judge"].includes(m.role) || !validModel(m.model))) {
    throw new Error("Invalid question panel cache identity");
  }
  const models = input.models.map(({ role, model }) => ({ role, id: model.id, version: model.version, family: canonicalFamily(model.family) }))
    .sort((a, b) => {
      const left = JSON.stringify(a); const right = JSON.stringify(b);
      return left < right ? -1 : left > right ? 1 : 0;
    });
  const payload = { version: QUESTION_PANEL_VERSION,
    entityId: input.entityId, evidenceRevision: input.evidenceRevision,
    questionId: input.questionId, rubricVersion: input.rubricVersion,
    promptVersion: input.promptVersion, evidenceSetHash: input.evidenceSetHash, models };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function evaluateQuestionPanel(input: QuestionPanelInput): QuestionPanelResult {
  // The public typed contract still fails closed for malformed runtime payloads.
  const safe = object(input) ? input : {} as QuestionPanelInput;
  const result: QuestionPanelResult = {
    version: QUESTION_PANEL_VERSION, shadowOnly: true, status: "review_needed",
    assessment: { questionId: typeof safe.questionId === "string" ? safe.questionId : "",
      evidenceSetHash: typeof safe.evidenceSetHash === "string" ? safe.evidenceSetHash : "",
      rubricVersion: typeof safe.rubricVersion === "string" ? safe.rubricVersion : "",
      evidenceIds: [], score: null },
    validVoteCount: 0, abstentions: 0, votes: [], rejectedVotes: [], issues: [],
    escalationRequired: false, cacheKey: null,
  };
  if (!validBinding(safe)) { result.issues.push("invalid_panel_binding"); return result; }
  if (!Array.isArray(safe.votes) || safe.votes.length !== 3) { result.issues.push("three_votes_required"); return result; }
  if (safe.votes.some(v => !object(v) || !validModel(v.model) || !["owner", "judge"].includes(v.role))) {
    result.issues.push("invalid_model_or_role"); return result;
  }
  if (safe.votes.filter(v => v.role === "owner").length !== 1 || safe.votes.filter(v => v.role === "judge").length !== 2) {
    result.issues.push("one_owner_two_judges_required"); return result;
  }
  if (new Set(safe.votes.map(v => canonicalFamily(v.model.family))).size !== 3
    || new Set(safe.votes.map(v => v.model.id.trim())).size !== 3) {
    result.issues.push("three_distinct_model_families_required"); return result;
  }
  result.cacheKey = questionPanelCacheKey({ ...safe, models: safe.votes.map(v => ({ role: v.role, model: v.model })) });
  if (!Array.isArray(safe.sources)) { result.issues.push("source_pack_required"); return result; }
  const sources = new Map<string, QuestionPanelSource>();
  for (const source of safe.sources) {
    if (!object(source) || !nonempty(source.id) || typeof source.text !== "string"
      || source.entityId !== safe.entityId || source.evidenceRevision !== safe.evidenceRevision
      || !["verified", "third_party", "founder_claim"].includes(source.level) || sources.has(source.id)) {
      result.issues.push("invalid_duplicate_or_mismatched_source"); return result;
    }
    sources.set(source.id, source);
  }
  const evidenceIds = new Set<string>();
  let contradiction = false;
  for (const [index, vote] of safe.votes.entries()) {
    const reasons: string[] = [];
    if (BINDING_KEYS.some(key => vote[key] !== safe[key])) reasons.push("vote_binding_mismatch");
    if (!nonempty(vote.rationale)) reasons.push("rationale_required");
    const ordinal = Number.isInteger(vote.level) && Number(vote.level) >= 0 && Number(vote.level) <= 4;
    if (!ordinal && vote.level !== "N/A") reasons.push("invalid_ordinal_level");
    if (vote.contradictsVerifiedFact !== undefined && typeof vote.contradictsVerifiedFact !== "boolean") reasons.push("invalid_contradiction_flag");
    const cited: QuestionPanelSource[] = [];
    if (!Array.isArray(vote.citations)) reasons.push("citations_required");
    else {
      if (ordinal && vote.citations.length === 0) reasons.push("ordinal_vote_requires_quote");
      for (const citation of vote.citations) {
        if (!object(citation) || !nonempty(citation.evidenceId) || !nonempty(citation.quote)) { reasons.push("invalid_citation"); continue; }
        const source = sources.get(citation.evidenceId);
        if (!source || !source.text.includes(citation.quote)) { reasons.push("quote_not_exact_source_substring"); continue; }
        cited.push(source);
      }
    }
    if (reasons.length) { result.rejectedVotes.push({ index, reasons: [...new Set(reasons)] }); continue; }
    if (vote.contradictsVerifiedFact === true) contradiction = true;
    result.validVoteCount++;
    if (vote.level === "N/A") { result.abstentions++; continue; }
    const founderCapped = cited.every(s => s.level === "founder_claim") && vote.level > 2;
    const effectiveLevel: QuestionLevel = founderCapped ? 2 : vote.level;
    result.votes.push({ modelId: vote.model.id, originalLevel: vote.level, effectiveLevel, founderCapped });
    for (const source of cited) evidenceIds.add(source.id);
  }
  result.assessment.evidenceIds = [...evidenceIds].sort();
  if (contradiction) {
    result.issues.push("verified_fact_contradiction_requires_review");
    return result;
  }
  if (result.abstentions >= 2 || result.votes.length === 0) {
    result.status = "pending";
    result.issues.push(result.abstentions >= 2 ? "majority_not_applicable_or_unassessed" : "no_verified_ordinal_votes");
    return result;
  }
  const levels = result.votes.map(v => v.effectiveLevel).sort((a, b) => a - b);
  if (levels.at(-1)! - levels[0] >= 2) {
    result.escalationRequired = true;
    result.issues.push("ordinal_disagreement_requires_escalation");
    return result;
  }
  const median = levels.length % 2 ? levels[Math.floor(levels.length / 2)] : (levels[levels.length / 2 - 1] + levels[levels.length / 2]) / 2;
  if (!Number.isInteger(median)) {
    result.issues.push("fractional_median_requires_review");
    return result;
  }
  result.status = "accepted";
  result.assessment.score = median;
  return result;
}
