import { describe, expect, it } from "vitest";
import { summariseUptime, UPTIME_MIN_ROWS } from "./uptime";

const NOW = Date.parse("2026-09-18T08:00:00Z");
const row = (minAgo: number, healthy: number) => ({ ts: new Date(NOW - minAgo * 60_000).toISOString(), healthy });

describe("summariseUptime (G15 follow-up: guardian probes, not cron ok-rates)", () => {
  it("returns null under 60 probes", () => {
    expect(summariseUptime(Array.from({ length: UPTIME_MIN_ROWS - 1 }, (_, i) => row(i * 2, 1)), NOW)).toBeNull();
  });
  it("counts unhealthy probes inside 24 h only, one decimal", () => {
    const rows = Array.from({ length: 720 }, (_, i) => row(i * 2, i < 4 ? 0 : 1)); // 4 bad of 720
    rows.push(row(30 * 60, 0)); // 30 h ago — outside the window
    const s = summariseUptime(rows, NOW);
    expect(s).toEqual({ uptime_pct_24h: 99.4, probes_24h: 720, unhealthy_24h: 4, source: "guardian" });
  });
  it("treats a missing/odd healthy field as unhealthy and ignores rows without ts", () => {
    const rows = [...Array.from({ length: 100 }, (_, i) => row(i, 1)), { ts: row(1, 1).ts, healthy: "1" }, { healthy: 1 }, { ts: row(2, 1).ts }];
    const s = summariseUptime(rows, NOW)!;
    expect(s.probes_24h).toBe(102);
    expect(s.unhealthy_24h).toBe(1);
  });
});
