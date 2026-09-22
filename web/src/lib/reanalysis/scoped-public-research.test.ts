import { describe, expect, it, vi } from "vitest";
import { runScopedPublicResearch, type ScopedResearchDeps, type ScopedResearchJob } from "./scoped-public-research";
import { REANALYSIS_SCOPE_VERSION } from "./scope";
import { retrievePublicSources } from "@/lib/research/public-sources";
function fixture() {
  const job: ScopedResearchJob = { id: "job1", operationKey: "op1", leaseToken: "lease1", businessName: "Clinic Business", publicLinks: [{ url: "https://example.com/pricing", role: "business" }], request: { site: "blockid.au", businessId: "b1", accountId: "a1", baseRevision: "r1", inputSha256: "a".repeat(64), scopeVersion: REANALYSIS_SCOPE_VERSION, scopeIds: ["blockid:criterion:market", "blockid:criterion:team"], mode: "fresh_public_research", researchPolicyVersion: "v1", researchCutoff: "2026-09-22T00:00:00Z", acceptedQuoteId: "q1" } };
  const retrieve = vi.fn(task => retrievePublicSources(task, { now: () => 0, read: async () => ({ ok: true, status: 200, text: "Clinic Business describes a scheduling product for regional clinics. This is a publisher statement, not independent confirmation.", blocked: false, truncated: false, attempts: 1 }) }));
  const deps: ScopedResearchDeps = { ownsLease: vi.fn(async () => true), isCancelled: vi.fn(async () => false), checkpoint: vi.fn(async () => {}), retrieve };
  return { job, deps, retrieve };
}
describe("scoped public-source orchestration", () => {
  it("runs one shared bounded pass and keeps unsupported criteria and scores explicit", async () => {
    const { job, deps, retrieve } = fixture(); const result = await runScopedPublicResearch(job, deps);
    expect(retrieve).toHaveBeenCalledTimes(1); expect(result.status).toBe("partial");
    expect(result.sections.find(s => s.scopeId.endsWith(":team"))?.status).toBe("not_run");
    expect(result.sections.find(s => s.scopeId.endsWith(":market"))?.reason).toBe("pages_read_relevance_and_analysis_pending");
    expect(result.readyForFinalCapture).toBe(false); expect(result.scoreChange).toBeNull();
    expect(result.researchSnapshotSha256).toMatch(/^[a-f0-9]{64}$/);
    expect((await runScopedPublicResearch(job, deps)).researchSnapshotSha256).toBe(result.researchSnapshotSha256);
  });
  it("never starts retrieval for cancelled or unleased work", async () => {
    for (const key of ["isCancelled", "ownsLease"] as const) {
      const { job, deps, retrieve } = fixture(); deps[key] = async () => key === "isCancelled";
      expect((await runScopedPublicResearch(job, deps)).status).toBe(key === "isCancelled" ? "cancelled" : "lease_lost");
      expect(retrieve).not.toHaveBeenCalled();
    }
  });
  it("late cancellation drops the result without a completion checkpoint", async () => {
    const { job, deps } = fixture(); deps.isCancelled = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(false).mockResolvedValue(true);
    const result = await runScopedPublicResearch(job, deps);
    expect(result.status).toBe("cancelled"); expect(result.research).toBeUndefined(); expect(deps.checkpoint).toHaveBeenCalledTimes(1);
  });
  it("no source remains no evidence, not a claim of no competitors", async () => {
    const { job, deps } = fixture(); job.publicLinks = [];
    const result = await runScopedPublicResearch(job, deps);
    expect(result.status).toBe("no_evidence"); expect(result.research?.discovery.status).toBe("not_run");
    expect(result.research?.limits.verifiedAlternatives).toBe(0);
  });
  it("keeps private job data out of the source task", async () => {
    const { job, deps, retrieve } = fixture();
    await runScopedPublicResearch({ ...job, privateDeck: "SECRET_REVENUE" } as ScopedResearchJob, deps);
    expect(JSON.stringify(retrieve.mock.calls)).not.toContain("SECRET_REVENUE");
  });
  it("does not refresh when the approved scope requested existing evidence", async () => {
    const { job, deps, retrieve } = fixture(); job.request = { ...(job.request as object), mode: "existing_evidence" };
    expect((await runScopedPublicResearch(job, deps)).status).toBe("not_run"); expect(retrieve).not.toHaveBeenCalled();
  });
});
