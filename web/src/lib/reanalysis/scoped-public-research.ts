import { createHash } from "node:crypto";
import { CRITERIA } from "@/lib/evaluation-criteria";
import { retrievePublicSources, type PublicResearchResult, type PublicSourceTask } from "@/lib/research/public-sources";
import { reanalysisRequestSchema } from "./request-contract";
import { REANALYSIS_SCOPE_VERSION, resolveReanalysisScopes } from "./scope";

export interface ScopedResearchJob {
  id: string;
  operationKey: string;
  leaseToken: string;
  /** Loaded from a durable, authorized job, never assembled from a browser body. */
  request: unknown;
  businessName: string;
  publicLinks: PublicSourceTask["sources"];
}
export interface ScopedResearchDeps {
  /** Must check the same job/token is active, unexpired and not cancelled in durable storage. */
  ownsLease: (jobId: string, leaseToken: string) => Promise<boolean>;
  isCancelled: (jobId: string) => Promise<boolean>;
  checkpoint: (jobId: string, leaseToken: string, value: Record<string, unknown>) => Promise<void>;
  retrieve?: typeof retrievePublicSources;
}
export interface ScopedResearchOutput {
  status: "partial" | "no_evidence" | "not_run" | "cancelled" | "lease_lost";
  reason: string;
  jobId: string;
  baseRevision?: string;
  inputSha256?: string;
  researchSnapshotSha256?: string;
  research?: PublicResearchResult;
  sections: Array<{ scopeId: string; question: string; criteria: string[]; status: "partial" | "no_evidence" | "not_run"; reason: string; sourceIds: string[] }>;
  scoreChange: null;
  readyForFinalCapture: false;
}

/** One bounded public-page pass shared by selected market scopes; no inference, billing or head mutation. */
export async function runScopedPublicResearch(job: ScopedResearchJob, deps: ScopedResearchDeps): Promise<ScopedResearchOutput> {
  const empty = (status: ScopedResearchOutput["status"], reason: string): ScopedResearchOutput => ({ status, reason, jobId: job.id, sections: [], scoreChange: null, readyForFinalCapture: false });
  const parsed = reanalysisRequestSchema.safeParse(job.request);
  if (!parsed.success || !job.id || !job.leaseToken || !job.operationKey || !job.businessName.trim()) return empty("not_run", "invalid_job_binding");
  const request = parsed.data;
  if (request.scopeVersion !== REANALYSIS_SCOPE_VERSION) return empty("not_run", "scope_version_mismatch");
  const scopes = resolveReanalysisScopes(request.site, request.scopeIds);
  if (!scopes) return empty("not_run", "invalid_scope");
  if (request.mode !== "fresh_public_research") return empty("not_run", "existing_evidence_mode_does_not_refresh_sources");
  if (await deps.isCancelled(job.id)) return empty("cancelled", "cancelled_before_retrieval");
  if (!await deps.ownsLease(job.id, job.leaseToken)) return empty("lease_lost", "active_lease_required");
  const questionFor = (scope: typeof scopes[number]) => scope.question ?? CRITERIA.filter(c => scope.criteria.includes(c.key)).flatMap(c => c.guidingQuestions).join(" ");
  const marketScopes = scopes.filter(scope => scope.criteria.includes("market"));
  if (!marketScopes.length) return { ...empty("not_run", "no_public_retrieval_adapter_for_selected_scope"), sections: scopes.map(scope => ({ scopeId: scope.id, question: questionFor(scope), criteria: scope.criteria, status: "not_run", reason: "scope_adapter_not_implemented", sourceIds: [] })) };
  await deps.checkpoint(job.id, job.leaseToken, { step: "retrieving_public_sources", baseRevision: request.baseRevision, inputSha256: request.inputSha256, scopeIds: scopes.map(scope => scope.id), maxSources: 5 });
  // A checkpoint/storage roundtrip may race cancellation/lease takeover.
  if (await deps.isCancelled(job.id)) return empty("cancelled", "cancelled_before_retrieval");
  if (!await deps.ownsLease(job.id, job.leaseToken)) return empty("lease_lost", "active_lease_required");
  let research: PublicResearchResult;
  try {
    research = await (deps.retrieve ?? retrievePublicSources)({
      criterion: "market", question: marketScopes.map(questionFor).join(" "),
      businessScope: { name: job.businessName, projectId: request.businessId },
      // These are the only outward input fields; no private financial/deck payload.
      sources: job.publicLinks.map(({ url, role }) => ({ url, role })),
    });
  } catch {
    return empty("no_evidence", "retrieval_failed");
  }
  // Existing safe-fetch controls each request. Cancellation blocks publishing
  // after return; it does not pretend an in-flight request was aborted remotely.
  if (await deps.isCancelled(job.id)) return empty("cancelled", "cancelled_during_retrieval");
  if (!await deps.ownsLease(job.id, job.leaseToken)) return empty("lease_lost", "lease_lost_during_retrieval");
  const readable = research.sources.filter(source => source.status === "found").map(source => source.id);
  const status = readable.length ? "partial" as const : "no_evidence" as const;
  const sections = scopes.map(scope => ({
    scopeId: scope.id, question: questionFor(scope), criteria: scope.criteria,
    status: scope.criteria.includes("market") ? status : "not_run" as const,
    reason: scope.criteria.includes("market") ? readable.length ? "pages_read_relevance_and_analysis_pending" : `retrieval_${research.status}` : "scope_adapter_not_implemented",
    // Read-source scope only, never a claim that each page supports this question.
    sourceIds: scope.criteria.includes("market") ? readable : [],
  }));
  const snapshot = { version: "scoped-public-research-v1", baseRevision: request.baseRevision, inputSha256: request.inputSha256, scopeVersion: request.scopeVersion, researchPolicyVersion: request.researchPolicyVersion, researchCutoff: request.researchCutoff, research, sections };
  const researchSnapshotSha256 = createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
  await deps.checkpoint(job.id, job.leaseToken, { step: "public_retrieval_finished", researchSnapshotSha256, status, sourceCount: readable.length, scopeIds: scopes.map(scope => scope.id) });
  if (await deps.isCancelled(job.id)) return empty("cancelled", "cancelled_before_result_delivery");
  if (!await deps.ownsLease(job.id, job.leaseToken)) return empty("lease_lost", "lease_lost_before_result_delivery");
  return { status, reason: "source_collection_only_assessment_pending", jobId: job.id, baseRevision: request.baseRevision, inputSha256: request.inputSha256, researchSnapshotSha256, research, sections, scoreChange: null, readyForFinalCapture: false };
}
