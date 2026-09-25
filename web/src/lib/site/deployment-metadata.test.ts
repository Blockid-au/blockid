import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { deploymentSourceSha, readDeploymentMetadata } from "./deployment-metadata";

afterEach(() => vi.restoreAllMocks());
describe("serving deployment metadata", () => {
  it("prefers the serving cwd manifest and build provenance over promotion HEAD", () => {
    const read = vi.spyOn(fs, "readFileSync").mockReturnValue(JSON.stringify({ version: "v3.33.3", git_sha: "promotion", build_sha: "built", private: "never expose" }));
    const metadata = readDeploymentMetadata();
    expect(read.mock.calls[0][0]).toBe(path.join(process.cwd(), ".deploy-manifest.json"));
    expect(metadata).toEqual({ version: "v3.33.3", git_sha: "promotion", build_sha: "built" });
    expect(deploymentSourceSha(metadata)).toBe("built");
  });
  it("rejects malformed metadata and keeps unavailable facts explicit", () => {
    vi.spyOn(fs, "readFileSync").mockReturnValue("[]");
    expect(readDeploymentMetadata()).toBeNull();
    expect(deploymentSourceSha(null)).toBeNull();
  });
  it("falls back across supported paths and validates field types", () => {
    vi.spyOn(fs, "readFileSync").mockImplementationOnce(() => { throw Error("missing"); }).mockReturnValue(JSON.stringify({ version: 3, git_sha: "legacy", build_sha: "", task_id: {} }));
    expect(readDeploymentMetadata()).toEqual({ git_sha: "legacy" });
    expect(deploymentSourceSha(readDeploymentMetadata())).toBe("legacy");
  });
});
