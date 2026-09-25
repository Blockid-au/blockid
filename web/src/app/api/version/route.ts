import { NextResponse } from "next/server";
import { readDeploymentMetadata, deploymentSourceSha } from "@/lib/site/deployment-metadata";
import { PIPELINE_VERSION, CODE_PROMPT_VERSION } from "@/lib/report-pipeline/version";
import pkg from "../../../../package.json";

// Wave 31b — machine-readable version endpoint for post-deploy smoke tests
// and Cloudflare cache-purge verification. Kept deliberately tiny: no
// database calls, no secrets, no user context. Runtime pinned to Node so
// `process.uptime()` and `process.version` resolve correctly (Edge would
// return undefined for both).

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const manifest = readDeploymentMetadata();
  return NextResponse.json({
    ok: true,
    version: pkg.version,
    package_version: pkg.version,
    deployment_version: manifest?.version ?? null,
    source_sha: deploymentSourceSha(manifest),
    deployed_at: manifest?.deployed_at ?? null,
    report_pipeline_version: PIPELINE_VERSION,
    code_prompt_version: CODE_PROMPT_VERSION,
    name: pkg.name,
    ts: new Date().toISOString(),
    node: process.version,
    uptime_sec: Math.floor(process.uptime()),
  });
}
