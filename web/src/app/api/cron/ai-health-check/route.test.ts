// Colocated vitest for POST /api/cron/ai-health-check — W1 (pricing v5 §7.2 #3):
// a model excluded from probing (hard 404 / 402, or 48 failed probes) is not
// pinged again; everything else in the active chain + known-good pool is.

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  dir: "",
  strikes: {} as Record<string, unknown>,
  written: [] as unknown[],
  checkModelsBatch: vi.fn(),
}));

vi.mock("@/lib/ai-client", () => ({
  get FREE_MODELS_CONFIG() { return `${mocks.dir}/ai-free-models.json`; },
}));
vi.mock("@/lib/security/cron-auth", () => ({ isCronAuthorised: () => true }));
vi.mock("@/lib/telegram", () => ({ sendTelegram: vi.fn(async () => true), mdEscape: (s: string) => s }));
vi.mock("@/lib/ai/provider-status", () => ({ probeProviders: vi.fn(async () => null) }));
vi.mock("@/lib/ai/report-price-policy-alert", () => ({
  maybeAlertReportPricePolicyExpiry: vi.fn(async () => ({ expiresAt: "2026-11-22T00:00:00Z", daysLeft: 30, warn: false, alerted: false })),
}));
vi.mock("@/lib/ai/health-check", () => ({
  checkModelsBatch: mocks.checkModelsBatch,
  endpointFor: (p: string) => ({ groq: { url: "u", envKey: "GROQ_API_KEY" }, openrouter: { url: "u", envKey: "OPENROUTER_API_KEY" } } as Record<string, { url: string; envKey: string }>)[p] ?? null,
}));
vi.mock("@/lib/ai/registry", () => ({
  readRegistry: () => ({ updated_at: "", primary_chain: [], fallback_pool: [], degraded: [], candidates_discovered: [] }),
  writeRegistry: vi.fn(),
  persistHealthResults: vi.fn(),
  nextBackoffMs: () => 3_600_000,
  pruneDegraded: (r: unknown) => r,
  entryKey: (e: { provider: string; model: string }) => `${e.provider}::${e.model}`,
}));
vi.mock("@/lib/ai/model-strikes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/model-strikes")>();
  return { ...actual, readStrikes: () => mocks.strikes, writeStrikes: (s: unknown) => { mocks.written.push(s); } };
});

import { POST } from "./route";

beforeEach(() => {
  mocks.dir = mkdtempSync(join(tmpdir(), "ai-health-check-"));
  mocks.written.length = 0;
  process.env.GROQ_API_KEY = "gq";
  delete process.env.OPENROUTER_API_KEY;
  mocks.checkModelsBatch.mockReset();
  mocks.checkModelsBatch.mockImplementation(async (targets: Array<{ provider: string; model: string }>) =>
    targets.map((t) => ({ ...t, status: "healthy", healthy: true, quota_exceeded: false, latency_ms: 10, http_status: 200, checked_at: new Date().toISOString() })));
});
afterEach(() => {
  rmSync(mocks.dir, { recursive: true, force: true });
  delete process.env.GROQ_API_KEY;
});

describe("POST /api/cron/ai-health-check — W1 probe exclusion", () => {
  it("never probes a probe-excluded model (hard 404 within the last 7 days)", async () => {
    writeFileSync(`${mocks.dir}/ai-free-models.json`, JSON.stringify({ groq: ["qwen/qwen3.8-27b", "llama-3.3-70b-versatile"] }));
    mocks.strikes = {
      "groq::llama-3.3-70b-versatile": { strikes: 1763, last_status: "model_not_found", last_at: new Date().toISOString(), probe_excluded_at: new Date().toISOString(), probe_excluded_reason: "hard_dead" },
    };
    const res = await POST(new Request("http://localhost/api/cron/ai-health-check", { method: "POST" }));
    const body = await res.json();
    const probed = (mocks.checkModelsBatch.mock.calls[0][0] as Array<{ provider: string; model: string }>).map((t) => `${t.provider}::${t.model}`);
    expect(probed).toContain("groq::qwen/qwen3.8-27b");
    expect(probed).not.toContain("groq::llama-3.3-70b-versatile");
    expect(body.probe_excluded).toBe(1);
    expect(body.ok).toBe(true);
  });
});
