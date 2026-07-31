// P9-model-discovery-lib-test — colocated vitest for src/lib/model-discovery.ts.
//
// The module is a pure ranking helper (scoreModel / rank / filterFreeOpenRouter)
// plus a thin fetch wrapper (fetchJson). It ships live under two cron routes
// (/api/cron/refresh-models and /api/cron/discover-models) that pick the top-N
// free models daily. A silent regression in scoreModel would swap the models
// the platform uses for every AI report — this suite pins the family table, the
// bounds on each sub-score, and the filter guarantees.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  KNOWN_PAID,
  fetchJson,
  filterFreeOpenRouter,
  rank,
  scoreModel,
  type RawModel,
} from "./model-discovery";

const DAY = 86_400;

describe("scoreModel — hard-negative filter", () => {
  it.each([
    "meta/llama-guard-3-8b",
    "openai/omni-moderation",
    "some/safety-tuned",
    "cohere/content-safety",
    "any/text-embed-3-large",
    "some/reranker-xl",
    "openai/tts-1-hd",
    "openai/whisper-large",
    "some/stt-model",
    "stability/image-diffusion",
    "some/audio-generator",
    "openai/vision-only-mini",
    "moderat-preview-2026",
  ])("returns -1 for non-text-completion id %s", (id) => {
    expect(scoreModel(id)).toBe(-1);
  });

  it("matches on the name field too, not just id", () => {
    expect(scoreModel("provider/model-x", "Text Embedding Small")).toBe(-1);
  });
});

describe("scoreModel — family table", () => {
  // Expected paramScore for each case is derived the same way the module does:
  //   paramScore = pm ? min(25, log2(paramB+1) * 3.2) : 8
  // where pm is the first `\d{2,4}\s?b\b` match in the id (case-insensitive
  // via toLowerCase() upstream, first match wins).
  const paramFor = (id: string): number => {
    const pm = id.toLowerCase().match(/(\d{2,4})\s?b\b/);
    if (!pm) return 8;
    const b = parseInt(pm[1], 10);
    return Math.min(25, Math.log2(b + 1) * 3.2);
  };

  const cases: Array<[string, number]> = [
    ["deepseek/deepseek-v3.1", 115],
    ["deepseek/deepseek-r1", 115],
    ["deepseek/deepseek-v4-preview", 115],
    ["deepseek/deepseek-v3.2-exp", 115],
    ["moonshot/kimi-k2", 113],
    ["minimax/minimax-01", 108],
    ["qwen/qwen3-coder-plus", 100],
    ["qwen/qwen3-235b-instruct", 100],
    ["qwen/qwen3-max", 100],
    ["zai/glm-4.6", 96],
    ["zai/glm-5", 96],
    ["nvidia/nemotron-ultra-253b", 92],
    ["meta/llama-4-scout", 88],
    ["qwen/qwen3-8b", 84],
    ["openai/gpt-oss-120b", 80],
    ["meta/llama-3.3-70b-instruct", 78],
    ["nous/hermes-3-llama-3.1-405b", 76],
    ["google/gemma-3-27b-it", 70],
    ["nvidia/nemotron-nano-9b", 58],
    ["openai/gpt-oss-20b", 50],
    ["unknown/foo-nano", 38],
    ["some-vendor/lite-preview", 38],
    ["provider/tiny-instruct", 38],
    ["opaque-vendor/some-model", 55],
  ];

  for (const [id, fam] of cases) {
    it(`resolves ${id} → family band ${fam}`, () => {
      // No ctx, no capacity, no recency, no moderation → score = fam + paramScore.
      const total = scoreModel(id, "", 0);
      expect(total).toBeCloseTo(fam + paramFor(id), 5);
    });
  }

  it("is case-insensitive on the family match", () => {
    expect(scoreModel("DEEPSEEK/DEEPSEEK-R1")).toBe(scoreModel("deepseek/deepseek-r1"));
  });
});

describe("scoreModel — sub-score components", () => {
  it("caps paramScore at 25 for astronomical param counts", () => {
    const s = scoreModel("provider/model-9999b");
    // baseline (no param in id): fam 55 + 8 default param + 0 + 0 + 0 + 0 = 63
    // with a large param: fam 55 + capped 25 = 80
    expect(s).toBeGreaterThanOrEqual(80);
    expect(s).toBeLessThan(85);
  });

  it("defaults paramScore to 8 when no NNb marker is present", () => {
    expect(scoreModel("opaque/foo")).toBe(55 + 8);
  });

  it("scores context length monotonically increasing but capped", () => {
    const zeroCtx = scoreModel("opaque/foo", "", 0);
    const smallCtx = scoreModel("opaque/foo", "", 8_000);
    const bigCtx = scoreModel("opaque/foo", "", 1_000_000);
    const huge = scoreModel("opaque/foo", "", 1_000_000_000);
    expect(smallCtx).toBeGreaterThan(zeroCtx);
    expect(bigCtx).toBeGreaterThan(smallCtx);
    // ctx bonus is bounded at 15 → delta between zeroCtx and huge is ≤ 15
    expect(huge - zeroCtx).toBeLessThanOrEqual(15 + 1e-9);
  });

  it("adds a capacity bonus (max 12) for large max_completion_tokens", () => {
    const noCap = scoreModel("opaque/foo", "", 0, { maxCompletionTokens: undefined });
    const bigCap = scoreModel("opaque/foo", "", 0, { maxCompletionTokens: 200_000 });
    expect(bigCap - noCap).toBeGreaterThan(0);
    expect(bigCap - noCap).toBeLessThanOrEqual(12 + 1e-9);
  });

  it("returns capacity bonus 0 when maxCompletionTokens is missing", () => {
    const base = scoreModel("opaque/foo", "", 0);
    const same = scoreModel("opaque/foo", "", 0, {});
    expect(same).toBe(base);
  });

  it("applies +8 recency bonus for models newer than 90 days", () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const base = scoreModel("opaque/foo", "", 0);
    const fresh = scoreModel("opaque/foo", "", 0, { created: nowSec - 30 * DAY });
    expect(fresh - base).toBeCloseTo(8, 5);
  });

  it("returns 0 recency bonus for models older than 180 days", () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const base = scoreModel("opaque/foo", "", 0);
    const stale = scoreModel("opaque/foo", "", 0, { created: nowSec - 400 * DAY });
    expect(stale).toBe(base);
  });

  it("linearly decays recency bonus between 90 and 180 days", () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const base = scoreModel("opaque/foo", "", 0);
    const mid = scoreModel("opaque/foo", "", 0, { created: nowSec - 135 * DAY });
    // 135d is 50% of the way from 90→180, so bonus should be 8*(1-0.5) = 4
    expect(mid - base).toBeCloseTo(4, 5);
  });

  it("returns 0 recency for negative ages (created in the future)", () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const base = scoreModel("opaque/foo", "", 0);
    const future = scoreModel("opaque/foo", "", 0, { created: nowSec + 30 * DAY });
    expect(future).toBe(base);
  });

  it("returns 0 recency when created is omitted", () => {
    const base = scoreModel("opaque/foo", "", 0);
    expect(scoreModel("opaque/foo", "", 0, {})).toBe(base);
  });

  it("penalises moderated models by 3", () => {
    const base = scoreModel("opaque/foo", "", 0);
    expect(scoreModel("opaque/foo", "", 0, { isModerated: true })).toBe(base - 3);
  });

  it("does not penalise when isModerated is false or omitted", () => {
    const base = scoreModel("opaque/foo", "", 0);
    expect(scoreModel("opaque/foo", "", 0, { isModerated: false })).toBe(base);
    expect(scoreModel("opaque/foo", "", 0)).toBe(base);
  });
});

describe("rank", () => {
  const models: RawModel[] = [
    { id: "deepseek/deepseek-r1", context_length: 200_000 },
    { id: "qwen/qwen3-max", context_length: 128_000 },
    { id: "openai/gpt-oss-120b" },
    { id: "some/tts-1" },              // negative-scored, must be excluded
    { id: "meta/llama-guard-3" },      // negative-scored
    { id: "MiniMax-M2.7" },            // KNOWN_PAID canonical
    { id: "MINIMAX-M2.7" },            // KNOWN_PAID lowercase-hit
    { id: "opaque/foo" },
  ];

  it("returns top-N ids by descending score", () => {
    const out = rank(models, 3);
    expect(out).toEqual([
      "deepseek/deepseek-r1",
      "qwen/qwen3-max",
      "openai/gpt-oss-120b",
    ]);
  });

  it("excludes negative-scored models", () => {
    const out = rank(models, 20);
    expect(out).not.toContain("some/tts-1");
    expect(out).not.toContain("meta/llama-guard-3");
  });

  it("excludes KNOWN_PAID by canonical spelling", () => {
    expect(rank(models, 20)).not.toContain("MiniMax-M2.7");
  });

  it("excludes KNOWN_PAID via the lowercase set membership", () => {
    expect(rank(models, 20)).not.toContain("MINIMAX-M2.7");
  });

  it("honours the caller-supplied exclude set", () => {
    const out = rank(models, 5, new Set(["deepseek/deepseek-r1"]));
    expect(out).not.toContain("deepseek/deepseek-r1");
    expect(out[0]).toBe("qwen/qwen3-max");
  });

  it("returns [] for an empty model list", () => {
    expect(rank([], 5)).toEqual([]);
  });

  it("returns [] when topN is 0", () => {
    expect(rank(models, 0)).toEqual([]);
  });

  it("respects requested topN when smaller than eligible set", () => {
    const out = rank(models, 2);
    expect(out.length).toBe(2);
  });
});

describe("KNOWN_PAID", () => {
  it("contains both the canonical and lowercase spelling of MiniMax-M2.7", () => {
    expect(KNOWN_PAID.has("MiniMax-M2.7")).toBe(true);
    expect(KNOWN_PAID.has("minimax-m2.7")).toBe(true);
  });
});

describe("fetchJson", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    // Reset every test — each installs its own stub.
    globalThis.fetch = originalFetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns models from data.data on a 200 response", async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: [{ id: "a" }, { id: "b" }] }),
    })) as unknown as typeof fetch;
    const out = await fetchJson("https://example.test/models");
    expect(out).toEqual([{ id: "a" }, { id: "b" }]);
  });

  it("returns [] on a non-ok response", async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      json: async () => ({ data: [{ id: "should-not-appear" }] }),
    })) as unknown as typeof fetch;
    expect(await fetchJson("https://example.test/models")).toEqual([]);
  });

  it("returns [] when the body has no data field", async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ other: [] }),
    })) as unknown as typeof fetch;
    expect(await fetchJson("https://example.test/models")).toEqual([]);
  });

  it("returns [] when fetch rejects (network error swallowed)", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("connect ECONNREFUSED");
    }) as unknown as typeof fetch;
    expect(await fetchJson("https://example.test/models")).toEqual([]);
  });

  it("returns [] when json() throws (malformed body)", async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => {
        throw new SyntaxError("Unexpected token < in JSON");
      },
    })) as unknown as typeof fetch;
    expect(await fetchJson("https://example.test/models")).toEqual([]);
  });

  it("passes headers through to fetch", async () => {
    const spy = vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: [] }),
    })) as unknown as typeof fetch;
    globalThis.fetch = spy;
    await fetchJson("https://example.test/models", { Authorization: "Bearer x" });
    expect(spy).toHaveBeenCalledWith(
      "https://example.test/models",
      expect.objectContaining({ headers: { Authorization: "Bearer x" } }),
    );
  });
});

describe("filterFreeOpenRouter", () => {
  it("keeps rows with prompt=0 AND completion=0", () => {
    const kept = filterFreeOpenRouter([
      { id: "a", pricing: { prompt: "0", completion: "0" } },
      { id: "b", pricing: { prompt: "0.0", completion: "0.00" } },
    ]);
    expect(kept.map((m) => m.id)).toEqual(["a", "b"]);
  });

  it("accepts all zero spellings (0, 0.0, 0.00)", () => {
    const kept = filterFreeOpenRouter([
      { id: "a", pricing: { prompt: "0", completion: "0.00" } },
      { id: "b", pricing: { prompt: "0.0", completion: "0" } },
    ]);
    expect(kept.length).toBe(2);
  });

  it("drops rows with a non-zero prompt price", () => {
    const kept = filterFreeOpenRouter([
      { id: "paid", pricing: { prompt: "0.000001", completion: "0" } },
    ]);
    expect(kept).toEqual([]);
  });

  it("drops rows with a non-zero completion price", () => {
    const kept = filterFreeOpenRouter([
      { id: "paid", pricing: { prompt: "0", completion: "0.001" } },
    ]);
    expect(kept).toEqual([]);
  });

  it("drops rows that have no pricing field at all", () => {
    const kept = filterFreeOpenRouter([{ id: "x" }]);
    expect(kept).toEqual([]);
  });

  it("drops rows where pricing is an empty object", () => {
    const kept = filterFreeOpenRouter([{ id: "x", pricing: {} }]);
    expect(kept).toEqual([]);
  });

  it("returns [] for an empty input", () => {
    expect(filterFreeOpenRouter([])).toEqual([]);
  });
});
