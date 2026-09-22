// G15-R2 — /api/status.ai reader (lib/status/ai.ts): tolerant of a missing
// getProviderHealthSnapshot export (R3 lane), a missing model-health file and
// a missing report-pipeline-health.jsonl.

import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { normaliseModelHealth, normaliseSnapshot, readAiStatus } from "./ai";

// The real dispatcher pulls in workers + env; the reader must cope with the
// export being absent, which is exactly what this stub models.
vi.mock("@/lib/ai-client", () => ({ getAIQueueDepth: () => ({}) }));

const NOW = Date.parse("2026-09-18T06:00:00.000Z");

function root(files: Record<string, string> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), "ai-"));
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(join(dir, rel, ".."), { recursive: true });
    writeFileSync(join(dir, rel), body);
  }
  return dir;
}

describe("normaliseSnapshot", () => {
  it("coerces the R3 shape and drops junk", () => {
    const s = normaliseSnapshot({
      providers: [{ name: "deepinfra", state: "ok", cooldown_until: null }, { name: "anthropic", state: "blocked", cooldown_until: "2026-09-18T07:00:00Z", reason: "401 invalid key" }, { state: "weird" }, { name: "x", state: "weird" }],
      budget_exhausted_1h: 2,
      interactive_order: ["deepinfra", 3, "groq"],
    });
    expect(s.providers).toEqual([
      { name: "deepinfra", state: "ok", cooldown_until: null },
      { name: "anthropic", state: "blocked", cooldown_until: "2026-09-18T07:00:00Z", reason: "401 invalid key" },
      { name: "x", state: "ok", cooldown_until: null },
    ]);
    expect(s.budget_exhausted_1h).toBe(2);
    expect(s.interactive_order).toEqual(["deepinfra", "groq"]);
  });
  it("G29-A: carries healthy_providers / unfunded / dead_rungs, derives the count from the rows for an older dispatcher, drops junk", () => {
    const s = normaliseSnapshot({
      providers: [{ name: "groq", state: "ok", cooldown_until: null }, { name: "sambanova", state: "blocked", cooldown_until: null, reason: "unfunded" }],
      healthy_providers: 1,
      unfunded: ["sambanova", 7],
      dead_rungs: {
        sambanova: { state: "unfunded", reason: "payment_required", dead: ["DeepSeek-V3.2", 3], total: 9, until: "2026-09-22T10:00:00.000Z" },
        groq: { state: "weird", dead: "no", total: "x", until: null },
        junk: null,
      },
    });
    expect(s.healthy_providers).toBe(1);
    expect(s.unfunded).toEqual(["sambanova"]);
    expect(s.dead_rungs).toEqual({
      sambanova: { state: "unfunded", reason: "payment_required", dead: ["DeepSeek-V3.2"], total: 9, until: "2026-09-22T10:00:00.000Z" },
      groq: { state: "ok", dead: [], total: 0, until: null },
    });
    const old = normaliseSnapshot({ providers: [{ name: "groq", state: "ok", cooldown_until: null }, { name: "gemini", state: "cooldown", cooldown_until: "x" }] });
    expect(old.healthy_providers).toBe(1);
    expect(old.unfunded).toEqual([]);
    expect(old.dead_rungs).toEqual({});
  });
  it("null / garbage → all null", () => {
    expect(normaliseSnapshot(null)).toEqual({ providers: null, budget_exhausted_1h: null, interactive_order: null, healthy_providers: null, unfunded: [], dead_rungs: {} });
    expect(normaliseSnapshot("x")).toEqual({ providers: null, budget_exhausted_1h: null, interactive_order: null, healthy_providers: null, unfunded: [], dead_rungs: {} });
  });
});

describe("normaliseModelHealth", () => {
  it("keeps the four counters only", () => {
    expect(normaliseModelHealth({ updated_at: "2026-09-17T13:00:04.508Z", total: 28, healthy: 13, quota_exceeded: 0, results: [{ provider: "groq" }] })).toEqual({ updated_at: "2026-09-17T13:00:04.508Z", total: 28, healthy: 13, quota_exceeded: 0 });
    expect(normaliseModelHealth({ total: 1 })).toBeNull();
    expect(normaliseModelHealth(null)).toBeNull();
  });
});

describe("readAiStatus", () => {
  it("returns null when nothing is readable and the export is missing", async () => {
    expect(await readAiStatus(root(), NOW)).toBeNull();
  });
  it("dispatcher export missing → providers null but file-backed fields present", async () => {
    const r = root({
      "content/ai-model-health.json": JSON.stringify({ updated_at: "2026-09-18T05:00:00Z", total: 28, healthy: 13, quota_exceeded: 1 }),
      "content/reports/report-pipeline-health.jsonl": [
        JSON.stringify({ ts: "2026-09-18T05:30:00Z", project_hash: "abc", reason: "all_cooldown", llm_calls: 0 }),
        JSON.stringify({ ts: "2026-09-16T05:30:00Z", project_hash: "old", reason: "x", llm_calls: 0 }),
        "garbage",
      ].join("\n"),
    });
    expect(await readAiStatus(r, NOW)).toEqual({
      providers: null,
      budget_exhausted_1h: null,
      interactive_order: null,
      healthy_providers: null,
      unfunded: [],
      dead_rungs: {},
      model_health: { updated_at: "2026-09-18T05:00:00Z", total: 28, healthy: 13, quota_exceeded: 1 },
      fully_degraded_24h: 1,
    });
  });
  it("uses an injected snapshot function and survives it throwing", async () => {
    const r = root();
    const ok = await readAiStatus(r, NOW, { snapshot: () => ({ providers: [{ name: "groq", state: "cooldown", cooldown_until: "2026-09-18T06:10:00Z" }], budget_exhausted_1h: 0, interactive_order: ["groq"] }) });
    expect(ok?.providers).toEqual([{ name: "groq", state: "cooldown", cooldown_until: "2026-09-18T06:10:00Z" }]);
    expect(ok?.fully_degraded_24h).toBe(0);
    const boom = await readAiStatus(r, NOW, {
      snapshot: () => {
        throw new Error("no");
      },
    });
    expect(boom).toBeNull();
  });
});
