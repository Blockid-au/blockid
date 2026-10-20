// G35 A2 — the /admin/ai-health scorecard + routing-policy cards render from the coordinator JSON.
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
const dir = mkdtempSync(join(tmpdir(), "ai-scorecard-"));
vi.mock("@/lib/runtime-paths", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  runtimeReportsPath: (...s: string[]) => join(dir, "content", "reports", ...s),
}));

import { AIScorecardCards } from "./ai-scorecard";
import { coordinate } from "@/lib/ai/model-coordinator";
import type { EvalRunState } from "@/lib/ai/model-eval";
import type { CaseScore } from "@/lib/ai/model-eval-scoring";

const V32 = "deepseek-ai/DeepSeek-V3.2";
const V4F = "deepseek-ai/DeepSeek-V4-Flash";
const reports = () => join(dir, "content", "reports");

function run(id: string): EvalRunState {
  const mk = (model: string, quality: number, cost: number) =>
    Array.from({ length: 6 }, (_, i): { task: "report_chapter"; provider: string; model: string; score: CaseScore } => ({
      task: "report_chapter", provider: "deepinfra", model,
      score: { caseId: `${i}`, lang: i % 2 ? "vi" : "en", section: i % 3 ? "traction" : "team", ok: true, schemaOk: true, critical: [], groundedShare: 0.92, numericOk: true, quality, accepted: true, latencyMs: 8_000, costUsd: cost },
    }));
  return {
    version: 1, run_id: id, mode: "full", split: "heldout", period: id, started_at: "2026-10-25T05:00:00Z", updated_at: "2026-10-25T06:00:00Z", finished_at: "2026-10-25T06:00:00Z",
    status: "done", cap_usd: 1, spent_usd: 0.12, calls: 12, judge_calls: 0, judge_spent_usd: 0, pending: [], skipped: [], planned: 12,
    candidates: { report_chapter: [{ provider: "deepinfra", model: V32, family: "deepseek", billing: "paid", tier: "primary", vision: false }, { provider: "deepinfra", model: V4F, family: "deepseek", billing: "paid", tier: "challenger", vision: false }] },
    results: [...mk(V32, 0.9, 0.001), ...mk(V4F, 0.9, 0.0004)],
  };
}

beforeAll(() => {
  mkdirSync(reports(), { recursive: true });
  const input = { live: {}, isDead: () => false, freeLadders: {}, defaultPaidLadders: { report: [V32, "Qwen/Qwen3-235B-A22B-Instruct-2507", V4F], synthesis: [V32, V4F], classify: ["openai/gpt-oss-120b"] }, now: new Date("2026-10-25T06:00:00Z") };
  const a = coordinate({ run: run("full-1"), prior: null, policy: null, ...input });
  const b = coordinate({ run: run("full-2"), prior: a.scorecard, policy: a.policy, ...input });
  writeFileSync(join(reports(), "ai-model-scorecard.json"), JSON.stringify(b.scorecard));
  writeFileSync(join(reports(), "ai-routing-policy.json"), JSON.stringify(b.policy));
  writeFileSync(join(reports(), "ai-routing-policy-history.jsonl"), b.history.map((h) => JSON.stringify(h)).join("\n") + "\n");
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("AIScorecardCards", () => {
  it("renders primary vs challenger with quality, cost/accepted, p95, last eval, detail, and the proposal diff with Approve", () => {
    const html = renderToStaticMarkup(AIScorecardCards());
    expect(html).toContain("Model scorecard (primary vs challenger)");
    expect(html).toContain("Report chapter (JSON with citations)");
    expect(html).toContain("DeepSeek-V3.2");
    expect(html).toContain("DeepSeek-V4-Flash");
    expect(html).toMatch(/US\$0\.00040\/accepted/);
    expect(html).toContain("p95 8.0 s");
    expect(html).toContain("wins 2/2");
    expect(html).toContain("per language / section");
    expect(html).toContain("Cost per accepted output by provider + task");
    expect(html).toContain("Routing policy (ai-routing-policy.json)");
    expect(html).toContain("dispatcher defaults");
    expect(html).toContain("Proposal prop-full-2");
    expect(html).toContain("Approve proposal");
    expect(html).not.toContain("Rollback paid ladder"); // nothing approved yet
    expect(html).toContain("Policy history");
  });

  it("no files → empty states, no buttons", () => {
    rmSync(join(reports(), "ai-model-scorecard.json"));
    rmSync(join(reports(), "ai-routing-policy.json"));
    const html = renderToStaticMarkup(AIScorecardCards());
    expect(html).toContain("No eval yet");
    expect(html).toContain("No policy file — the dispatcher routes exactly as coded");
    expect(html).not.toContain("Approve proposal");
  });
});
