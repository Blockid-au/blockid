// Colocated vitest for the AI provider registry (registry.ts) — W1 health-log
// rotation (pricing v5 §7.2 #3: ai-model-health.jsonl had grown to 16 MB).
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { HEALTH_LOG_MAX_AGE_DAYS, HEALTH_LOG_MAX_BYTES, compactHealthLogLines, entryKey, nextBackoffMs, rotateHealthLog } from "./registry";

const NOW = Date.parse("2026-10-20T13:00:00Z");
const DAY = 24 * 60 * 60_000;
const line = (t: number, model = "m") => JSON.stringify({ provider: "groq", model, status: "healthy", checked_at: new Date(t).toISOString() });

describe("compactHealthLogLines", () => {
  it("keeps the last 7 days only and drops blank / malformed lines", () => {
    expect(HEALTH_LOG_MAX_AGE_DAYS).toBe(7);
    const kept = compactHealthLogLines([line(NOW - 8 * DAY, "old"), "", "not json", line(NOW - 6 * DAY, "a"), line(NOW, "b")], NOW);
    expect(kept.map((l) => JSON.parse(l).model)).toEqual(["a", "b"]);
  });

  it("keeps the NEWEST lines within the byte cap", () => {
    expect(HEALTH_LOG_MAX_BYTES).toBe(5 * 1024 * 1024);
    const lines = [line(NOW - 3, "x"), line(NOW - 2, "y"), line(NOW - 1, "z")];
    const cap = Buffer.byteLength(lines[2]) + 1 + Buffer.byteLength(lines[1]) + 1;
    expect(compactHealthLogLines(lines, NOW, cap).map((l) => JSON.parse(l).model)).toEqual(["y", "z"]);
  });
});

describe("rotateHealthLog", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "health-log-")); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it("leaves a small, young file alone", () => {
    const f = join(dir, "h.jsonl");
    writeFileSync(f, `${line(NOW - DAY)}\n${line(NOW)}\n`);
    expect(rotateHealthLog(f, NOW)).toBe(false);
  });

  it("rewrites a file whose oldest line is past 7 days", () => {
    const f = join(dir, "h.jsonl");
    writeFileSync(f, `${line(NOW - 30 * DAY, "dead")}\n${line(NOW - DAY, "live")}\n`);
    expect(rotateHealthLog(f, NOW)).toBe(true);
    expect(readFileSync(f, "utf8")).toBe(`${line(NOW - DAY, "live")}\n`);
  });

  it("fails open on a missing file", () => {
    expect(rotateHealthLog(join(dir, "missing.jsonl"), NOW)).toBe(false);
  });
});

describe("registry helpers", () => {
  it("entryKey + nextBackoffMs (1 h → doubling → 24 h cap)", () => {
    expect(entryKey({ provider: "groq", model: "m" })).toBe("groq::m");
    expect(nextBackoffMs()).toBe(60 * 60_000);
    expect(nextBackoffMs({ provider: "g", model: "m", degraded_until: "", reason: "", backoff_ms: 20 * 60 * 60_000, first_degraded_at: "" })).toBe(24 * 60 * 60_000);
  });
});
