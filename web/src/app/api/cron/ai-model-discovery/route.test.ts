// Colocated vitest for POST /api/cron/ai-model-discovery (weekly) — W1:
// re-admits probe-excluded models the live catalogue lists again, and never
// injects a dead / probe-excluded / sub-floor model into the active chain.

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  dir: "",
  strikes: {} as Record<string, unknown>,
  written: [] as Array<Record<string, { probe_excluded_at?: string }>>,
  catalogues: {} as Record<string, Array<{ id: string; context_length?: number; pricing?: { prompt: string; completion: string } }>>,
}));

vi.mock("@/lib/ai-client", () => ({
  get FREE_MODELS_CONFIG() { return `${mocks.dir}/ai-free-models.json`; },
}));
vi.mock("@/lib/security/cron-auth", () => ({ isCronAuthorised: () => true }));
vi.mock("@/lib/model-discovery", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/model-discovery")>();
  return { ...actual, fetchJson: async (url: string) => mocks.catalogues[url] ?? [] };
});
vi.mock("@/lib/ai/registry", () => ({
  readRegistry: () => ({ updated_at: "", primary_chain: [], fallback_pool: [], degraded: [], candidates_discovered: [] }),
  writeRegistry: vi.fn(),
  get CANDIDATES_FILE() { return `${mocks.dir}/candidates.json`; },
  get HEALTH_SNAPSHOT_FILE() { return `${mocks.dir}/health.json`; },
  entryKey: (e: { provider: string; model: string }) => `${e.provider}::${e.model}`,
}));
vi.mock("@/lib/ai/model-strikes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/model-strikes")>();
  return { ...actual, readStrikes: () => mocks.strikes, writeStrikes: (s: Record<string, { probe_excluded_at?: string }>) => { mocks.written.push(s); } };
});

import { POST } from "./route";

const free = { prompt: "0", completion: "0" };
beforeEach(() => {
  mocks.dir = mkdtempSync(join(tmpdir(), "ai-model-discovery-"));
  mocks.written.length = 0;
  process.env.GROQ_API_KEY = "gq";
  delete process.env.CEREBRAS_API_KEY;
  delete process.env.SAMBANOVA_API_KEY;
  vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: () => void) => { fn(); return 0 as unknown as NodeJS.Timeout; }) as typeof setTimeout);
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(mocks.dir, { recursive: true, force: true });
  delete process.env.GROQ_API_KEY;
});

describe("POST /api/cron/ai-model-discovery — W1", () => {
  it("re-admits only listed excluded models and injects neither dead, excluded nor sub-20B ids", async () => {
    const now = new Date().toISOString();
    mocks.catalogues = {
      "https://openrouter.ai/api/v1/models": [
        { id: "nvidia/nemotron-3-ultra-550b-a55b:free", context_length: 1_000_000, pricing: free },
        { id: "liquid/lfm-2.5-2.6b:free", context_length: 65_000, pricing: free },
      ],
      "https://api.groq.com/openai/v1/models": [{ id: "qwen/qwen3.8-27b" }, { id: "allam-2-7b" }, { id: "llama-3.3-70b-versatile" }],
    };
    mocks.strikes = {
      "groq::llama-3.3-70b-versatile": { strikes: 1763, last_status: "model_not_found", last_at: now, probe_excluded_at: now, probe_excluded_reason: "hard_dead", dead_until: new Date(Date.now() + 3_600_000).toISOString(), dead_reason: "model_not_found" },
      "groq::mixtral-8x7b-32768": { strikes: 1762, last_status: "error", last_at: now, probe_excluded_at: now, probe_excluded_reason: "strikes" },
    };
    const body = await (await POST(new Request("http://localhost/api/cron/ai-model-discovery", { method: "POST" }))).json();
    expect(body.probe_readmitted).toEqual({ groq: ["llama-3.3-70b-versatile"] });
    const written = mocks.written.at(-1)!;
    expect(written["groq::llama-3.3-70b-versatile"].probe_excluded_at).toBeUndefined();
    expect(written["groq::mixtral-8x7b-32768"].probe_excluded_at).toBe(now);
    const active = JSON.parse(readFileSync(`${mocks.dir}/ai-free-models.json`, "utf8")) as Record<string, string[]>;
    const all = Object.values(active).filter(Array.isArray).flat();
    expect(all).not.toContain("allam-2-7b");
    expect(all).not.toContain("liquid/lfm-2.5-2.6b:free");
    expect(all).not.toContain("llama-3.3-70b-versatile"); // still dead right now — re-admitted for a probe, not for dialling
    expect(all).toContain("nvidia/nemotron-3-ultra-550b-a55b:free");
  });
});
