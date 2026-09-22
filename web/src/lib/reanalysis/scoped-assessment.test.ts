import { describe, expect, it, vi } from "vitest";
import type { AICallOptions, AICallResult } from "@/lib/ai-client";
import { runScopedPublicResearch } from "./scoped-public-research";
import { synthesizeScopedAssessment, type ScopedAssessmentInput } from "./scoped-assessment";
import { REANALYSIS_SCOPE_VERSION } from "./scope";
import { retrievePublicSources } from "@/lib/research/public-sources";
import { qualifyRetrievedBusinessStatements } from "@/lib/research/qualify-public-statement";
async function fixture() {
  const request = { site: "blockid.au", businessId: "b1", accountId: "a1", baseRevision: "r1", inputSha256: "a".repeat(64), scopeVersion: REANALYSIS_SCOPE_VERSION, scopeIds: ["blockid:criterion:market"], mode: "fresh_public_research", researchPolicyVersion: "v1", researchCutoff: "2026-09-22T00:00:00Z", acceptedQuoteId: "q1" };
  const research = await runScopedPublicResearch({ id: "j1", operationKey: "o1", leaseToken: "l1", request, businessName: "Clinic Business", publicLinks: [{ url: "https://example.com", role: "business" }] }, { ownsLease: async () => true, isCancelled: async () => false, checkpoint: async () => {}, retrieve: task => retrievePublicSources(task, { now: () => 0, read: async () => ({ ok: true, status: 200, text: "Clinic Business describes a scheduling product for regional clinics. The page states 20 trials, without independent confirmation.", blocked: false, truncated: false, attempts: 1 }) }) });
  const qualified = qualifyRetrievedBusinessStatements(research.research!)[0].result;
  if (qualified.status !== "qualified_attribution") throw Error("fixture must qualify");
  const evidence = qualified.evidence;
  const section = { scopeId: request.scopeIds[0], verdict: "Trial claims leave paid conversion unresolved.", strengths: [], gaps: ["No independently supported paid conversion evidence."], nextAction: "Request anonymized trial-to-paid cohorts.", investorImplication: "Uncertain conversion limits revenue predictability.", comparison: null, limitations: ["No verified competitor discovery; source truth remains unverified."], deltaRationale: "A source statement adds context but does not justify changing the prior score.", observations: [{ evidence_id: evidence.id, quote: evidence.quote, attributedStatement: evidence.supportedClaim }] };
  const input: ScopedAssessmentInput = { jobId: "j1", request, research, original: { revision: "r1", inputSha256: request.inputSha256, criteria: [] }, userId: "u1", locale: "en" };
  const transport = vi.fn<(options: AICallOptions) => Promise<AICallResult>>(async () => ({ policy: "blockid-report-v1" as const, text: JSON.stringify({ sections: [section] }), provider: "groq" as const, model: "mock-only" }));
  return { input, section, transport, deps: { transport, mayContinue: async () => true } };
}
describe("scoped assessment draft quality boundary", () => {
  it("consumes collector, pins policy, retains exact attribution and blocks scores/capture", async () => {
    const { input, deps, transport } = await fixture();
    const result = await synthesizeScopedAssessment(input, deps);
    expect(result.status).toBe("draft_partial"); expect(result.sections[0].investorImplication).toContain("conversion");
    expect(result.readyForFinalCapture).toBe(false); expect(result.scoreChange).toBeNull();
    expect(transport.mock.calls[0]).toEqual([expect.objectContaining({ policy: "blockid-report-v1", taskClass: "synthesis", userId: "u1" })]);
  });
  it("rejects stale base and mutated research before inference", async () => {
    for (const mutation of ["base", "snapshot"]) {
      const { input, deps, transport } = await fixture();
      if (mutation === "base") input.original.revision = "other";
      else input.research.research!.sources[0].excerpt = "Tampered";
      expect((await synthesizeScopedAssessment(input, deps)).status).toBe("rejected"); expect(transport).not.toHaveBeenCalled();
    }
  });
  it("rejects fabricated quotes and same-number wrong-entity attributions", async () => {
    for (const field of ["quote", "attributedStatement"] as const) {
      const { input, deps, section } = await fixture();
      section.observations[0][field] = "Other Business has 20 trials";
      expect((await synthesizeScopedAssessment(input, deps)).reason).toBe("unsupported_attribution");
    }
  });
  it("rejects duplicate scope, unsupported score fields and missing policy confirmation", async () => {
    for (const mode of ["duplicate", "score", "policy"]) {
      const { input, deps, section } = await fixture();
      deps.transport = vi.fn(async () => ({ policy: mode === "policy" ? undefined : "blockid-report-v1", text: JSON.stringify({ sections: mode === "duplicate" ? [section, section] : [{ ...section, ...(mode === "score" ? { score: 99 } : {}) }] }), provider: "groq", model: "mock" }));
      expect((await synthesizeScopedAssessment(input, deps)).status).toBe("rejected");
    }
  });
  it("does not deliver after cancellation or cite unavailable research", async () => {
    const { input, deps, transport } = await fixture();
    deps.mayContinue = vi.fn().mockResolvedValueOnce(true).mockResolvedValue(false);
    expect((await synthesizeScopedAssessment(input, deps)).status).toBe("cancelled");
    transport.mockClear(); input.research.status = "not_run";
    expect((await synthesizeScopedAssessment(input, deps)).reason).toBe("research_not_available"); expect(transport).not.toHaveBeenCalled();
  });
});
