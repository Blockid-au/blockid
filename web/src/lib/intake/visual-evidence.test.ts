import { describe, expect, it } from "vitest";
import { createVisualEvidenceManifest, visualCacheKey, type VisualManifestInput } from "./visual-evidence";

function fixture(): VisualManifestInput {
  return {
    version: "visual-evidence-v1", site: "blockid.au", tenantId: "tenant-a", businessId: "company-a",
    inputSnapshotId: "input-a", revisionId: "revision-a", extractorVersion: "extractor-1",
    coordinateSpace: "upright-full-source-pixels",
    sources: [{ id: "slide-1", kind: "slide", index: 1, fileSha256: "a".repeat(64), derivativeSha256: "b".repeat(64), width: 100, height: 60, transformVersion: "upright-png-v1",
      regions: [{ id: "chart-1", kind: "chart", bbox: { x: 10, y: 5, width: 90, height: 55 }, state: "pending", reason: null, evidenceIds: [] }],
    }],
  };
}
const policy = { provider: "deepinfra" as const, model: "fixture-vision", promptVersion: "prompt-1", permissionScopeId: "private-a" };

describe("visual evidence boundaries", () => {
  it("binds metadata to site, tenant, input, revision and source bytes", () => {
    const a = createVisualEvidenceManifest(fixture());
    expect(createVisualEvidenceManifest(fixture())).toEqual(a);
    for (const key of ["tenantId", "businessId", "inputSnapshotId", "revisionId", "extractorVersion"] as const) {
      expect(createVisualEvidenceManifest({ ...fixture(), [key]: "different" }).digestSha256).not.toBe(a.digestSha256);
    }
    expect(createVisualEvidenceManifest({ ...fixture(), site: "startupvalueindex.com" }).digestSha256).not.toBe(a.digestSha256);
    const changed = fixture(); changed.sources[0].derivativeSha256 = "c".repeat(64);
    expect(createVisualEvidenceManifest(changed).digestSha256).not.toBe(a.digestSha256);
  });
  it("rejects ambiguous page numbering and out-of-bounds or duplicate regions", () => {
    for (const change of [
      (f: VisualManifestInput) => { f.sources[0].index = 0; },
      (f: VisualManifestInput) => { f.sources[0].kind = "image"; },
      (f: VisualManifestInput) => { f.sources[0].regions[0].bbox.width = 91; },
      (f: VisualManifestInput) => { f.sources[0].regions.push(f.sources[0].regions[0]); },
      (f: VisualManifestInput) => { f.sources.push(f.sources[0]); },
    ]) {
      const f = fixture(); change(f); expect(() => createVisualEvidenceManifest(f)).toThrow();
    }
  });
  it("cannot silently skip a chart or attach claims to unreadable content", () => {
    const f = fixture(); const r = f.sources[0].regions[0];
    r.state = "skipped_decorative"; r.reason = "Ignore chart";
    expect(() => createVisualEvidenceManifest(f)).toThrow();
    r.state = "unreadable"; r.evidenceIds = ["false-fact"];
    expect(() => createVisualEvidenceManifest(f)).toThrow();
    r.evidenceIds = []; r.reason = null;
    expect(() => createVisualEvidenceManifest(f)).toThrow();
    r.reason = "Labels too small";
    expect(createVisualEvidenceManifest(f).sources[0].regions[0].state).toBe("unreadable");
  });
  it("requires evidence references for extraction without declaring them verified", () => {
    const f = fixture(); f.sources[0].regions[0].state = "extracted";
    expect(() => createVisualEvidenceManifest(f)).toThrow();
    f.sources[0].regions[0].evidenceIds = ["observed-claim"];
    expect(createVisualEvidenceManifest(f).sources[0].regions[0].evidenceIds).toEqual(["observed-claim"]);
  });
  it("partitions cache by model, prompt and permission and detects mutation", () => {
    const manifest = createVisualEvidenceManifest(fixture()); const key = visualCacheKey(manifest, policy);
    for (const field of ["model", "promptVersion", "permissionScopeId"] as const) expect(visualCacheKey(manifest, { ...policy, [field]: "different" })).not.toBe(key);
    manifest.sources[0].width++;
    expect(() => visualCacheKey(manifest, policy)).toThrow("visual_manifest_digest_mismatch");
  });
  it("rejects raw content or provider URLs smuggled into metadata", () => {
    expect(() => createVisualEvidenceManifest({ ...fixture(), rawImage: "private-bytes" } as VisualManifestInput)).toThrow();
    expect(() => visualCacheKey(createVisualEvidenceManifest(fixture()), { ...policy, endpoint: "https://untrusted" } as typeof policy)).toThrow();
  });
});
