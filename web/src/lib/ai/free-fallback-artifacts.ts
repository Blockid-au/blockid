import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadQualifiedFreeFallbacks, type FreeFallbackDemand, type FreeFallbackQualification } from "./free-fallback-qualification";

/** Deployment-owned immutable JSON only. Never accept an artifact directory or manifest from a request. */
export async function loadRepositoryFreeFallbacks(demand: FreeFallbackDemand): Promise<FreeFallbackQualification> {
  const root = path.join(process.cwd(), "content", "ai-qualification");
  let manifest: unknown;
  try { manifest = JSON.parse(await readFile(path.join(root, "report-free-manifest.json"), "utf8")); }
  catch { return { eligible: [], rejected: [{ modelId: null, reason: "reviewed_manifest_unavailable" }] }; }
  return loadQualifiedFreeFallbacks(manifest, async hash => {
    if (!/^[a-f0-9]{64}$/.test(hash)) return null;
    try { return await readFile(path.join(root, "artifacts", `${hash}.json`), "utf8"); } catch { return null; }
  }, demand);
}
