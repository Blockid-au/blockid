import { describe, expect, it } from "vitest";
import { FREE_REPORT_SUITE, FREE_VARIANT_CONTRACT_QUOTE, REQUIRED_FREE_REPORT_CASES, freeArtifactSha256, loadQualifiedFreeFallbacks, type FreeFallbackDemand } from "./free-fallback-qualification";
function fixture() {
  const now = Date.parse("2026-09-22T12:00:00Z"); const date = new Date(now).toISOString();
  const modelId = "example/synthetic-only:free"; const endpointTag = "synthetic";
  const artifacts = new Map<string, string>();
  const store = (value: unknown) => { const raw = JSON.stringify(value); const hash = freeArtifactSha256(raw); artifacts.set(hash, raw); return hash; };
  const metadata = { fetchedAt: date, sourceUrl: `https://openrouter.ai/api/v1/models/${modelId}/endpoints`, data: { id: modelId, architecture: { input_modalities: ["text"], output_modalities: ["text"] }, endpoints: [{ model_id: modelId, tag: endpointTag, status: 0, context_length: 32000, max_completion_tokens: 8000, supported_parameters: ["max_tokens", "response_format", "structured_outputs"], pricing: { prompt: "0", completion: "0", request: "0" } }] } };
  const quality = { suiteVersion: FREE_REPORT_SUITE, modelId, endpointTag, task: "scoped_assessment", evaluatedAt: date, promptSha256: store({ syntheticPrompt: "fixture" }), fixtureSha256: store({ syntheticFixture: "fixture" }), cases: REQUIRED_FREE_REPORT_CASES.flatMap(caseId => ["en", "vi"].map(locale => ({ caseId, locale, resultSha256: store({ syntheticResult: true, caseId, locale }), servedModelId: modelId, servedEndpointTag: endpointTag, passed: true, unsupportedClaims: 0, fabricatedCitations: 0, schemaValid: true, latencyMs: 1000, costUsd: 0 }))) };
  const manifest = { version: "report-free-qualification-v1", entries: [{ modelId, endpointTag, metadataSha256: store(metadata), qualitySha256: store(quality), zeroCostContractSha256: undefined as string | undefined, reviewedAt: date, reviewer: "synthetic-test-review-only", task: "scoped_assessment" }] };
  const demand: FreeFallbackDemand = { accountId: "a1", now, inputTokens: 10000, outputTokens: 5000, inferenceAuthorized: true, privacyApproved: true, quota: { accountId: "a1", checkedAt: date, utcDay: "2026-09-22", dailyRemaining: 25, minuteRemaining: 10, accountWideLedgerSynchronized: true, blockedUntil: null } };
  const run = () => { manifest.entries[0].metadataSha256 = store(metadata); manifest.entries[0].qualitySha256 = store(quality); return loadQualifiedFreeFallbacks(manifest, async hash => artifacts.get(hash) ?? null, demand); };
  return { metadata, quality, manifest, demand, artifacts, run, store };
}
describe("reviewed exact free fallback qualification", () => {
  it("accepts synthetic reviewed evidence without granting dispatch permission", async () => {
    const { run } = fixture(); const result = await run();
    expect(result.rejected).toEqual([]); expect(result.eligible).toHaveLength(1);
    expect(result.eligible[0].executionAllowed).toBe(false);
    expect(result.eligible[0].requestConstraints).toMatchObject({ model: "example/synthetic-only:free", provider: { allow_fallbacks: false, max_price: { prompt: 0, completion: 0, request: 0 }, only: ["synthetic"], data_collection: "deny", zdr: true }, plugins: [] });
  });
  it("does not promote legacy verified/ping registries or paid/random aliases", async () => {
    const f = fixture(); expect((await loadQualifiedFreeFallbacks({ verified: { openrouter: ["some/model:free"] } }, async () => null, f.demand)).eligible).toEqual([]);
    for (const model of ["example/synthetic-only", "openrouter/free", "openrouter/auto"]) {
      f.manifest.entries[0].modelId = model; expect((await f.run()).rejected[0].reason).toBe("invalid_or_legacy_manifest");
    }
  });
  it("accepts omitted request price only with current model-bound official free contract", async () => {
    const f = fixture();
    delete (f.metadata.data.endpoints[0].pricing as Record<string, string>).request;
    const contract = { modelId: f.manifest.entries[0].modelId, checkedAt: new Date(f.demand.now).toISOString(), sourceUrl: "https://openrouter.ai/docs/guides/routing/model-variants/free", quote: FREE_VARIANT_CONTRACT_QUOTE, appliesTo: "listed_free_variant_text_chat_without_plugins_or_paid_fallback" };
    f.manifest.entries[0].zeroCostContractSha256 = f.store(contract);
    expect((await f.run()).eligible).toHaveLength(1);
    f.manifest.entries[0].zeroCostContractSha256 = f.store({ ...contract, modelId: "other/model:free" });
    expect((await f.run()).eligible).toEqual([]);
    f.manifest.entries[0].zeroCostContractSha256 = f.store(contract);
    f.metadata.data.endpoints[0].pricing.request = "0.01";
    expect((await f.run()).eligible).toEqual([]);
  });
  it("rejects nonzero or unknown pricing and stale metadata", async () => {
    for (const mode of ["paid", "missing", "stale"]) {
      const f = fixture();
      if (mode === "paid") f.metadata.data.endpoints[0].pricing.completion = "0.000001";
      if (mode === "missing") delete (f.metadata.data.endpoints[0].pricing as Record<string, string>).request;
      if (mode === "stale") f.metadata.fetchedAt = "2026-09-21T00:00:00Z";
      expect((await f.run()).eligible).toEqual([]);
    }
  });
  it("requires every EN/VI rubric case, original artifacts and zero unsupported claims", async () => {
    for (const mode of ["missing-case", "wrong-model", "false-fact", "missing-artifact", "old-quality"]) {
      const f = fixture();
      if (mode === "missing-case") f.quality.cases.pop();
      if (mode === "wrong-model") f.quality.cases[0].servedModelId = "other/model:free";
      if (mode === "false-fact") f.quality.cases[0].unsupportedClaims = 1;
      if (mode === "missing-artifact") f.artifacts.delete(f.quality.cases[0].resultSha256);
      if (mode === "old-quality") f.quality.evaluatedAt = "2026-09-01T00:00:00Z";
      expect((await f.run()).eligible).toEqual([]);
    }
  });
  it("blocks wrong-account, unknown, exhausted, stale and throttled quota", async () => {
    for (const patch of [null, { accountId: "a2" }, { dailyRemaining: 5 }, { minuteRemaining: 1 }, { checkedAt: "2026-09-22T11:59:00Z" }, { blockedUntil: "2026-09-22T12:01:00Z" }]) {
      const f = fixture(); f.demand.quota = patch === null ? null : { ...(f.demand.quota as object), ...patch };
      expect((await f.run()).rejected[0].reason).toBe("quota_unknown_stale_exhausted_or_blocked");
    }
  });
  it("rejects ambiguous entries, insufficient context and tampered evidence", async () => {
    const duplicate = fixture(); duplicate.manifest.entries.push(duplicate.manifest.entries[0]); expect((await duplicate.run()).rejected[0].reason).toBe("duplicate_qualification");
    const small = fixture(); small.demand.inputTokens = 50000; expect((await small.run()).rejected[0].reason).toBe("endpoint_capability_insufficient");
    const tampered = fixture(); expect((await loadQualifiedFreeFallbacks(tampered.manifest, async () => "tampered", tampered.demand)).rejected[0].reason).toBe("artifact_missing_or_digest_mismatch");
  });
});
