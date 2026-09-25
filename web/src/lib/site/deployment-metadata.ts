import fs from "node:fs";
import path from "node:path";

export type DeploymentMetadata = {
  version?: string;
  git_sha?: string;
  build_sha?: string;
  deployed_at?: string;
  next_hash?: string;
  task_id?: string;
};

/** Read the serving release's manifest; never infer deployment from repository HEAD. */
export function readDeploymentMetadata(): DeploymentMetadata | null {
  for (const file of [
    path.join(process.cwd(), ".deploy-manifest.json"),
    path.join(process.cwd(), "web", ".deploy-manifest.json"),
    path.join(process.cwd(), "..", "web", ".deploy-manifest.json"),
  ]) {
    try {
      const raw: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
      const result: DeploymentMetadata = {};
      for (const key of ["version", "git_sha", "build_sha", "deployed_at", "next_hash", "task_id"] as const) {
        const value = (raw as Record<string, unknown>)[key];
        if (typeof value === "string" && value.trim()) result[key] = value;
      }
      return result;
    } catch { /* Try the next supported working directory. */ }
  }
  return null;
}

export function deploymentSourceSha(manifest: DeploymentMetadata | null): string | null {
  return manifest?.build_sha ?? manifest?.git_sha ?? null;
}
