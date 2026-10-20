import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ModelEvalFixture } from "./model-eval-scoring";
import { MODEL_CATALOG } from "./model-catalog";
import { EVAL_TASK_IDS, MAX_FREE_POOL_CANDIDATES, TASK_PROFILES, evalCandidates, familyOf, isEvalCallable, judgeFor } from "./task-profiles";

const FIXTURES = path.resolve(__dirname, "../../../test-fixtures/model-eval");

describe("task profiles", () => {
  it("there are exactly the 8 plan tasks, each with every pass criterion", () => {
    expect(EVAL_TASK_IDS).toHaveLength(8);
    for (const id of EVAL_TASK_IDS) {
      const p = TASK_PROFILES[id];
      expect(p.id).toBe(id);
      expect(p.criteria.schemaGate).toBe(true);
      expect(p.criteria.p95LatencyMs).toBeGreaterThan(0);
      expect(p.criteria.maxCostUsdPerOutput).toBeGreaterThan(0);
      expect(p.criteria.maxSchemaFailRate).toBe(0.1);
      expect(p.system).toMatch(/JSON/);
      expect(p.timeoutMs).toBeGreaterThanOrEqual(p.criteria.p95LatencyMs > 60_000 ? 60_000 : 1);
    }
  });

  it("report scope = report_chapter + ceo_synthesis, grounded ≥ 0.85, no fabricated citation, numeric check", () => {
    for (const id of ["report_chapter", "ceo_synthesis"] as const) {
      const p = TASK_PROFILES[id];
      expect(p.reportScope).toBe(true);
      expect(p.criteria.minGroundedShare).toBe(0.85);
      expect(p.criteria.noFabricatedCitation).toBe(true);
      expect(p.criteria.numericCheck).toBe(true);
    }
    expect(EVAL_TASK_IDS.filter((id) => TASK_PROFILES[id].reportScope)).toEqual(["report_chapter", "ceo_synthesis"]);
  });
});

describe("isEvalCallable — DeepInfra is the only paid provider the eval may dial", () => {
  it("allows DeepInfra + the free tiers + OpenRouter :free only", () => {
    expect(isEvalCallable("deepinfra", "deepseek-ai/DeepSeek-V3.2")).toBe(true);
    expect(isEvalCallable("groq", "openai/gpt-oss-120b")).toBe(true);
    expect(isEvalCallable("cerebras", "gpt-oss-120b")).toBe(true);
    expect(isEvalCallable("openrouter", "nvidia/nemotron-3-ultra-550b-a55b:free")).toBe(true);
    expect(isEvalCallable("openrouter", "openai/gpt-5-mini")).toBe(false);
    expect(isEvalCallable("gemini", "gemini-2.5-flash")).toBe(false);
    expect(isEvalCallable("claude-oauth", "claude-sonnet-5")).toBe(false);
    expect(isEvalCallable("anthropic", "claude-opus-5")).toBe(false);
    expect(isEvalCallable("openai", "gpt-5")).toBe(false);
  });
});

describe("evalCandidates", () => {
  const freeLists = {
    groq: ["qwen/qwen3.8-27b", "openai/gpt-oss-120b", "allam-2-7b", "llama-3.1-8b-instant"],
    openrouter: ["minimax/minimax-m3.1-flash:free", "openai/gpt-5-mini", "nvidia/nemotron-3-ultra-550b-a55b:free", "poolside/laguna-s-2.1:free"],
    cerebras: ["gpt-oss-120b"],
  };

  it("report scope tasks: DeepInfra rows only, never a free pool", () => {
    for (const id of ["report_chapter", "ceo_synthesis"] as const) {
      const c = evalCandidates(TASK_PROFILES[id], freeLists);
      expect(c.length).toBeGreaterThan(1);
      expect(c.every((x) => x.provider === "deepinfra")).toBe(true);
    }
    expect(evalCandidates(TASK_PROFILES.report_chapter)[0]?.model).toBe("deepseek-ai/DeepSeek-V3.2");
  });

  it("every candidate of every task is eval-callable (no Gemini / Claude / paid OpenRouter)", () => {
    for (const id of EVAL_TASK_IDS) for (const c of evalCandidates(TASK_PROFILES[id], freeLists)) expect(isEvalCallable(c.provider, c.model)).toBe(true);
  });

  it("vision: vision-capable rows only", () => {
    const c = evalCandidates(TASK_PROFILES.vision, freeLists);
    expect(c.length).toBeGreaterThan(0);
    for (const x of c) expect(MODEL_CATALOG.find((m) => m.provider === x.provider && m.id === x.model)?.capabilities).toContain("vision");
  });

  it("free pool: capability floor applied, paid OpenRouter ids refused, capped", () => {
    const c = evalCandidates(TASK_PROFILES.chat, freeLists);
    const pool = c.filter((x) => x.tier === "free_pool");
    expect(pool.length).toBeLessThanOrEqual(MAX_FREE_POOL_CANDIDATES);
    const ids = c.map((x) => `${x.provider}:${x.model}`);
    expect(ids).not.toContain("groq:allam-2-7b");
    expect(ids).not.toContain("groq:llama-3.1-8b-instant");
    expect(ids).not.toContain("openrouter:openai/gpt-5-mini");
    expect(ids).not.toContain("openrouter:poolside/laguna-s-2.1:free"); // unknown size, not allow-listed
    expect(new Set(ids).size).toBe(ids.length);
    expect(pool.every((x) => x.billing === "free")).toBe(true);
  });
});

describe("judgeFor — a different family from the writer", () => {
  it("DeepSeek writer → Qwen judge; Qwen writer → Llama judge", () => {
    expect(judgeFor("deepseek")?.family).toBe("qwen");
    expect(judgeFor("qwen")?.family).toBe("llama");
    expect(judgeFor("deepseek", (p) => p !== "deepinfra")?.provider).toBe("groq");
    expect(judgeFor("gpt-oss", (p) => p !== "deepinfra")).toBeNull();
  });
  it("familyOf: catalogue first, then id pattern", () => {
    expect(familyOf("deepinfra", "deepseek-ai/DeepSeek-V3.2")).toBe("deepseek");
    expect(familyOf("openrouter", "minimax/minimax-m3.1-flash:free")).toBe("minimax");
    expect(familyOf("groq", "acme/new-thing-70b")).toBe("new");
  });
});

describe("golden set (test-fixtures/model-eval)", () => {
  const expected: Record<string, [number, number]> = { vision: [24, 12] };
  for (const task of EVAL_TASK_IDS) {
    it(`${task}: dev + held-out parse, EN + VI, disjoint ids, expected counts`, () => {
      const ids = new Set<string>();
      for (const [split, n] of [["dev", (expected[task] ?? [40, 20])[0]], ["heldout", (expected[task] ?? [40, 20])[1]]] as const) {
        const fx = ModelEvalFixture.parse(JSON.parse(readFileSync(path.join(FIXTURES, task, `${split}.json`), "utf-8")));
        expect(fx.task).toBe(task);
        expect(fx.split).toBe(split);
        expect(fx.source).toMatch(/synthetic/);
        expect(fx.cases).toHaveLength(n);
        expect(new Set(fx.cases.map((c) => c.lang))).toEqual(new Set(["en", "vi"]));
        for (const c of fx.cases) {
          expect(ids.has(c.id)).toBe(false);
          ids.add(c.id);
          if (task === "vision") expect(existsSync(path.join(FIXTURES, task, String(c.input.image)))).toBe(true);
          if (task === "report_chapter" || task === "ceo_synthesis") expect(Array.isArray(c.input.evidence)).toBe(true);
        }
      }
    });
  }

  it("no e-mail address, phone number or uuid (synthetic data only — the repo is public)", () => {
    for (const task of EVAL_TASK_IDS) for (const split of ["dev", "heldout"]) {
      const raw = readFileSync(path.join(FIXTURES, task, `${split}.json`), "utf-8");
      expect(raw).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
      expect(raw).not.toMatch(/\b0[45]\d{2}\s?\d{3}\s?\d{3}\b/);
      expect(raw).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    }
  });
});
