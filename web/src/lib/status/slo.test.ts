// G15-R2 — slo.latency_p95_ms reducer (lib/status/slo.ts).

import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readLatencySummary, summariseLatency } from "./slo";

const NOW = Date.parse("2026-09-18T06:00:00.000Z");
const cls = (n: number, p95: number | null, e5: number | null = 0) => ({ n, p50_ms: p95 === null ? null : Math.round(p95 / 2), p95_ms: p95, err_rate_5xx: e5 });
const row = (minAgo: number, timing: boolean, classes: Record<string, unknown>) => ({ ts: new Date(NOW - minAgo * 60_000).toISOString(), window_min: 10, timing, classes });

describe("summariseLatency", () => {
  it("null when never sampled or newest row is older than 30 min", () => {
    expect(summariseLatency([], NOW)).toBeNull();
    expect(summariseLatency([row(45, true, { marketing: cls(50, 300) })], NOW)).toBeNull();
  });
  it("newest fresh window; p95 null for classes without timing or with < 5 requests", () => {
    const s = summariseLatency(
      [
        row(25, true, { marketing: cls(50, 999) }),
        row(5, true, { marketing: cls(80, 412.6, 0.0125), workspace: cls(3, 900), api_ai: cls(6, 41000), api_other: cls(20, null), tbr: cls(0, null, null) }),
      ],
      NOW,
    );
    expect(s).toEqual({
      ts: new Date(NOW - 5 * 60_000).toISOString(),
      latency_p95_ms: { marketing: 413, workspace: null, api_ai: 41000, api_other: null, tbr: null },
      err_rate_5xx: { marketing: 0.0125, workspace: null, api_ai: 0, api_other: 0, tbr: null },
      requests: 109,
      timing: true,
    });
  });
  it("combined-format windows (timing false) give nulls for every p95", () => {
    const s = summariseLatency([row(1, false, { marketing: cls(100, null), api_other: cls(10, null) })], NOW);
    expect(s?.timing).toBe(false);
    expect(Object.values(s!.latency_p95_ms).every((v) => v === null)).toBe(true);
  });
});

describe("readLatencySummary", () => {
  it("reads from <root>/content/reports/latency.jsonl and never throws", async () => {
    const root = mkdtempSync(join(tmpdir(), "slo-"));
    expect(await readLatencySummary(root, NOW)).toBeNull();
    mkdirSync(join(root, "content", "reports"), { recursive: true });
    writeFileSync(join(root, "content", "reports", "latency.jsonl"), `{bad\n${JSON.stringify(row(2, true, { marketing: cls(9, 100) }))}\n`);
    expect((await readLatencySummary(root, NOW))?.latency_p95_ms.marketing).toBe(100);
  });
});
