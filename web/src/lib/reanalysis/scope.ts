import { createHash } from "node:crypto";
import { CRITERIA, type CriterionKey } from "@/lib/evaluation-criteria";

/** Related scope only: these SVI questions are not equivalent to BlockID's 52 guiding questions. */
export const SVI_SCOPE_MAP: Record<string, readonly CriterionKey[]> = {
  q01_what_does_company_do: ["idea", "website"], q02_is_problem_important: ["idea", "customer_size"],
  q03_market_large_and_growing: ["market"], q04_anyone_succeeded_in_category: ["market"],
  q05_someone_doing_it_better: ["market", "idea"], q06_genuinely_differentiated: ["idea", "code_git"],
  q07_can_survive_long_enough: ["revenue", "roadmap"], q08_model_economically_viable: ["revenue", "gtm_strategy"],
  q09_claims_supported_by_evidence: ["documents", "dataroom"], q10_legal_regulatory_governance_captable_risks: ["documents", "team_structure"],
  q11_valuation_makes_sense: ["revenue", "market", "documents"], q12_ownership_and_dilution: ["documents", "team_structure"],
  q13_what_could_make_thesis_fail: ["idea", "market", "revenue", "team"], q14_what_needs_diligenced: ["documents", "dataroom"],
  q15_questions_for_next_meeting: ["documents", "dataroom"], q16_progressing_or_deteriorating: ["roadmap", "revenue", "customer_size"],
  team_deep: ["founder_profile", "team", "team_structure"], competitor_reality_check: ["market", "idea"],
  market_deep: ["market"], valuation_deep: ["revenue", "market", "documents"], risk_synthesis: ["market", "revenue", "team", "documents"],
};
const digest = (text: string) => createHash("sha256").update(text).digest("hex");
export interface ReanalysisScope { id: string; criteria: CriterionKey[]; question?: string; relation: "native" | "related_not_equivalent" }
// Question identity is content-bound, not array position. A changed question receives a new ID.
export const REANALYSIS_SCOPES: ReanalysisScope[] = CRITERIA.flatMap<ReanalysisScope>(c => [
  { id: `blockid:criterion:${c.key}`, criteria: [c.key], relation: "native" as const },
  ...c.guidingQuestions.map(question => ({ id: `blockid:question:${c.key}:${digest(question).slice(0, 16)}`, criteria: [c.key], question, relation: "native" as const })),
]).concat(Object.entries(SVI_SCOPE_MAP).map(([field, criteria]) => ({ id: `svi:field:${field}`, criteria: [...criteria], relation: "related_not_equivalent" as const })));
export const REANALYSIS_SCOPE_VERSION = `scope-v1-${digest(JSON.stringify(REANALYSIS_SCOPES)).slice(0, 16)}`;
export function resolveReanalysisScopes(site: "blockid.au" | "startupvalueindex.com", ids: string[]): ReanalysisScope[] | null {
  if (!ids.length || ids.length > 64) return null;
  const prefix = site === "blockid.au" ? "blockid:" : "svi:";
  const entries = [...new Set(ids)].sort().map(id => REANALYSIS_SCOPES.find(scope => scope.id === id && id.startsWith(prefix)));
  return entries.every((entry): entry is ReanalysisScope => Boolean(entry)) ? entries : null;
}
