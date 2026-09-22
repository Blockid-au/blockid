import { createHash } from "node:crypto";
import { z } from "zod";

export const FREE_REPORT_SUITE = "blockid-scoped-assessment-free-v1";
export const REQUIRED_FREE_REPORT_CASES = ["source_attribution", "wrong_entity_same_number", "missing_evidence", "contradictory_evidence", "prompt_injection", "investor_implication", "score_abstention"] as const;
const sha = z.string().regex(/^[a-f0-9]{64}$/);
const id = z.string().regex(/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+:free$/);
const tag = z.string().regex(/^[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)*$/);
const dataScope = z.enum(["public_synthetic_only", "private_report"]);
const timestamp = z.string().datetime({ offset: true });
const manifestSchema = z.object({
  version: z.literal("report-free-qualification-v1"),
  entries: z.array(z.object({ modelId: id, endpointTag: tag, metadataSha256: sha, qualitySha256: sha, zeroCostContractSha256: sha.optional(),
    dataScope, reviewedAt: timestamp, reviewer: z.string().min(1), task: z.literal("scoped_assessment") }).strict()).max(30),
}).strict();
const metadataSchema = z.object({
  fetchedAt: timestamp, sourceUrl: z.string().url(),
  data: z.object({ id, architecture: z.object({ input_modalities: z.array(z.string()), output_modalities: z.array(z.string()) }).passthrough(), endpoints: z.array(z.object({
    model_id: id, tag, status: z.number(), context_length: z.number().int().positive(),
    max_completion_tokens: z.number().int().positive(), max_prompt_tokens: z.number().int().positive().nullable().optional(),
    supported_parameters: z.array(z.string()), pricing: z.record(z.string(), z.union([z.string(), z.number()])),
  }).passthrough()) }).passthrough(),
}).strict();
export const FREE_VARIANT_CONTRACT_QUOTE = "Free variants provide access to models without cost, but may have different rate limits or availability compared to paid versions.";
const zeroCostContractSchema = z.object({
  modelId: id, checkedAt: timestamp,
  sourceUrl: z.literal("https://openrouter.ai/docs/guides/routing/model-variants/free"),
  quote: z.literal(FREE_VARIANT_CONTRACT_QUOTE),
  appliesTo: z.literal("listed_free_variant_text_chat_without_plugins_or_paid_fallback"),
}).strict();
const qualitySchema = z.object({
  suiteVersion: z.literal(FREE_REPORT_SUITE), dataScope, modelId: id, endpointTag: tag, task: z.literal("scoped_assessment"),
  evaluatedAt: timestamp, promptSha256: sha, fixtureSha256: sha,
  // Per-case result artifacts must retain the actual synthetic prompt, response and reviewed assertions.
  cases: z.array(z.object({ caseId: z.enum(REQUIRED_FREE_REPORT_CASES), locale: z.enum(["en", "vi"]),
    resultSha256: sha, servedModelId: id, servedEndpointTag: tag, passed: z.boolean(), unsupportedClaims: z.number().int().min(0),
    fabricatedCitations: z.number().int().min(0), schemaValid: z.boolean(), latencyMs: z.number().positive().max(60000), costUsd: z.number().nonnegative(),
  }).strict()).min(14).max(100),
}).strict();
const quotaSchema = z.object({ accountId: z.string().min(1), checkedAt: timestamp, utcDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dailyRemaining: z.number().int().nonnegative(), minuteRemaining: z.number().int().min(0).max(20),
  accountWideLedgerSynchronized: z.literal(true), blockedUntil: timestamp.nullable(),
}).strict();
export interface FreeFallbackDemand {
  dataScope: "public_synthetic_only" | "private_report";
  accountId: string; now: number; inputTokens: number; outputTokens: number;
  /** Authenticated server context only. Unknown identity/permission must remain false. */
  inferenceAuthorized: boolean;
  privacyApproved: boolean;
  quota: unknown;
}
export interface FreeFallbackCandidate {
  dataScope: "public_synthetic_only" | "private_report";
  modelId: string; endpointTag: string; metadataSha256: string; qualitySha256: string;
  /** Loader eligibility is not permission to dispatch: acquire one atomic account-wide quota reservation first. */
  executionAllowed: false;
  requiredNext: "atomic_account_quota_reservation_and_scoped_transport_integration";
  requestConstraints: { model: string; max_tokens: number; response_format: { type: "json_object" }; provider: {
    only: string[]; order: string[]; allow_fallbacks: false; require_parameters: true;
    max_price: { prompt: 0; completion: 0; request: 0 }; data_collection: "deny" | "allow"; zdr: boolean;
  }; plugins: []; stream: false };
}
export interface FreeFallbackQualification {
  eligible: FreeFallbackCandidate[];
  rejected: Array<{ modelId: string | null; reason: string }>;
}
export const freeArtifactSha256 = (bytes: string) => createHash("sha256").update(bytes).digest("hex");
const fresh = (date: string, now: number, maxAge: number) => { const age = now - Date.parse(date); return Number.isFinite(age) && age >= 0 && age <= maxAge; };

/** Read only repository-reviewed artifacts, keyed by SHA-256; never browser-controlled qualification flags.
 * No env/credentials, network, account mutation or provider activation. Empty/legacy manifests fail closed.
 */
export async function loadQualifiedFreeFallbacks(manifest: unknown, readArtifact: (sha256: string) => Promise<string | null>, demand: FreeFallbackDemand): Promise<FreeFallbackQualification> {
  const result: FreeFallbackQualification = { eligible: [], rejected: [] };
  const reject = (modelId: string | null, reason: string) => result.rejected.push({ modelId, reason });
  const parsed = manifestSchema.safeParse(manifest);
  if (!parsed.success) { reject(null, "invalid_or_legacy_manifest"); return result; }
  if (!Number.isFinite(demand.now) || !Number.isSafeInteger(demand.inputTokens) || !Number.isSafeInteger(demand.outputTokens) || demand.inputTokens <= 0 || demand.outputTokens <= 0) { reject(null, "invalid_demand"); return result; }
  if (!demand.inferenceAuthorized || !demand.privacyApproved) { reject(null, "account_or_privacy_authorization_missing"); return result; }
  const quota = quotaSchema.safeParse(demand.quota);
  if (!quota.success || quota.data.accountId !== demand.accountId || !fresh(quota.data.checkedAt, demand.now, 30_000) || quota.data.utcDay !== new Date(demand.now).toISOString().slice(0, 10) || quota.data.dailyRemaining < 6 || quota.data.minuteRemaining < 2 || (quota.data.blockedUntil && Date.parse(quota.data.blockedUntil) > demand.now)) { reject(null, "quota_unknown_stale_exhausted_or_blocked"); return result; }
  const pairs = parsed.data.entries.map(e => `${e.modelId}@${e.endpointTag}`);
  if (new Set(pairs).size !== pairs.length) { reject(null, "duplicate_qualification"); return result; }
  const readVerified = async (hash: string): Promise<string | null> => {
    try { const bytes = await readArtifact(hash); return bytes !== null && bytes.length <= 2_000_000 && freeArtifactSha256(bytes) === hash ? bytes : null; } catch { return null; }
  };
  for (const entry of parsed.data.entries) {
    if (entry.dataScope !== demand.dataScope) { reject(entry.modelId, "data_scope_not_qualified"); continue; }
    if (!fresh(entry.reviewedAt, demand.now, 7 * 86400_000)) { reject(entry.modelId, "review_stale_or_future"); continue; }
    const [metadataBytes, qualityBytes] = await Promise.all([readVerified(entry.metadataSha256), readVerified(entry.qualitySha256)]);
    if (!metadataBytes || !qualityBytes) { reject(entry.modelId, "artifact_missing_or_digest_mismatch"); continue; }
    let metadata: z.infer<typeof metadataSchema>; let quality: z.infer<typeof qualitySchema>;
    try { metadata = metadataSchema.parse(JSON.parse(metadataBytes)); quality = qualitySchema.parse(JSON.parse(qualityBytes)); }
    catch { reject(entry.modelId, "artifact_schema_invalid"); continue; }
    if (metadata.sourceUrl !== `https://openrouter.ai/api/v1/models/${entry.modelId}/endpoints` || metadata.data.id !== entry.modelId || !fresh(metadata.fetchedAt, demand.now, 3600_000)) { reject(entry.modelId, "metadata_binding_or_freshness"); continue; }
    const endpoints = metadata.data.endpoints.filter(e => e.model_id === entry.modelId && e.tag === entry.endpointTag);
    if (endpoints.length !== 1) { reject(entry.modelId, "endpoint_missing_or_ambiguous"); continue; }
    const endpoint = endpoints[0];
    // Optional request pricing may be omitted by the API. A dated official free-variant
    // contract bound to this catalog-listed ID can cover that omission, never a nonzero price.
    let documentedZeroRequestCost = false;
    if (entry.zeroCostContractSha256) {
      const contractBytes = await readVerified(entry.zeroCostContractSha256);
      try {
        const contract = zeroCostContractSchema.parse(JSON.parse(contractBytes ?? "null"));
        documentedZeroRequestCost = contract.modelId === entry.modelId && fresh(contract.checkedAt, demand.now, 7 * 86400_000);
      } catch { /* Unknown contract cannot attest omitted pricing. */ }
    }
    if (!["prompt", "completion"].every(k => Object.hasOwn(endpoint.pricing, k)) || (!Object.hasOwn(endpoint.pricing, "request") && !documentedZeroRequestCost) || Object.entries(endpoint.pricing).some(([k, v]) => k !== "discount" && (typeof v === "string" ? !/^0(?:\.0+)?$/.test(v) : v !== 0))) { reject(entry.modelId, "zero_cost_not_fully_attested"); continue; }
    if (!metadata.data.architecture.input_modalities.includes("text") || !metadata.data.architecture.output_modalities.includes("text") || endpoint.status !== 0 || endpoint.context_length < demand.inputTokens + demand.outputTokens || endpoint.max_completion_tokens < demand.outputTokens || (endpoint.max_prompt_tokens != null && endpoint.max_prompt_tokens < demand.inputTokens) || !["max_tokens", "response_format"].every(p => endpoint.supported_parameters.includes(p))) { reject(entry.modelId, "endpoint_capability_insufficient"); continue; }
    if (quality.dataScope !== entry.dataScope || quality.modelId !== entry.modelId || quality.endpointTag !== entry.endpointTag || !fresh(quality.evaluatedAt, demand.now, 7 * 86400_000) || Date.parse(entry.reviewedAt) < Date.parse(quality.evaluatedAt)) { reject(entry.modelId, "quality_binding_or_freshness"); continue; }
    const caseKeys = quality.cases.map(c => `${c.caseId}:${c.locale}`);
    if (new Set(caseKeys).size !== caseKeys.length || REQUIRED_FREE_REPORT_CASES.some(c => ["en", "vi"].some(locale => !caseKeys.includes(`${c}:${locale}`))) || quality.cases.some(c => c.servedModelId !== entry.modelId || c.servedEndpointTag !== entry.endpointTag || !c.passed || !c.schemaValid || c.unsupportedClaims !== 0 || c.fabricatedCitations !== 0 || c.costUsd !== 0)) { reject(entry.modelId, "quality_rubric_failed_or_incomplete"); continue; }
    // Retain reproducible fixtures/prompts/results; a passed summary alone is insufficient.
    const artifacts = await Promise.all([quality.promptSha256, quality.fixtureSha256, ...quality.cases.map(c => c.resultSha256)].map(readVerified));
    if (artifacts.some(a => !a)) { reject(entry.modelId, "quality_evidence_missing"); continue; }
    result.eligible.push({ dataScope: entry.dataScope, modelId: entry.modelId, endpointTag: entry.endpointTag, metadataSha256: entry.metadataSha256, qualitySha256: entry.qualitySha256,
      executionAllowed: false, requiredNext: "atomic_account_quota_reservation_and_scoped_transport_integration",
      requestConstraints: { model: entry.modelId, max_tokens: demand.outputTokens, response_format: { type: "json_object" }, provider: { only: [entry.endpointTag], order: [entry.endpointTag], allow_fallbacks: false, require_parameters: true, max_price: { prompt: 0, completion: 0, request: 0 }, data_collection: entry.dataScope === "private_report" ? "deny" : "allow", zdr: entry.dataScope === "private_report" }, plugins: [], stream: false },
    });
  }
  return result;
}
