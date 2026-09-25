import { expect, it, vi } from "vitest";
import pkg from "../../../../package.json";
import { PIPELINE_VERSION, CODE_PROMPT_VERSION } from "@/lib/report-pipeline/version";
vi.mock("@/lib/site/deployment-metadata", () => ({
  readDeploymentMetadata: () => ({ version: "v3.33.3", build_sha: "built", deployed_at: "2026-09-25T01:34:50Z" }),
  deploymentSourceSha: () => "built",
}));
import { GET } from "./route";
it("distinguishes package compatibility version from deployed release and report generator", async () => {
  const body = await (await GET()).json();
  expect(body).toMatchObject({ version: pkg.version, package_version: pkg.version, deployment_version: "v3.33.3", source_sha: "built", report_pipeline_version: PIPELINE_VERSION, code_prompt_version: CODE_PROMPT_VERSION });
});
