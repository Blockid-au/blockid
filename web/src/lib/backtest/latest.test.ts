// G14-S39 — /api/status `svi_backtest` reducer + the page's file reader.
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  SVI_BACKTEST_FILE,
  SVI_BACKTEST_MAX_AGE_MS,
  isBacktestReport,
  readSviBacktestLatest,
  readSviBacktestStatus,
  sviBacktestStatusFrom,
} from "./latest";
import { runBacktest } from "./run-backtest";

const NOW = Date.parse("2026-09-16T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();

function tmpRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), "svi-backtest-"));
  mkdirSync(path.join(root, "content", "reports"), { recursive: true });
  return root;
}

describe("sviBacktestStatusFrom (pure)", () => {
  it("missing for null / non-object / no generated_at / garbage ts", () => {
    expect(sviBacktestStatusFrom(null, NOW)).toBe("missing");
    expect(sviBacktestStatusFrom({}, NOW)).toBe("missing");
    expect(sviBacktestStatusFrom({ generated_at: "nope" }, NOW)).toBe("missing");
    expect(sviBacktestStatusFrom({ generated_at: 42 }, NOW)).toBe("missing");
  });

  it("ok under 8 days, stale at/after 8 days", () => {
    expect(sviBacktestStatusFrom({ generated_at: ago(1_000) }, NOW)).toBe("ok");
    expect(sviBacktestStatusFrom({ generated_at: ago(7 * 24 * 3600e3) }, NOW)).toBe("ok");
    expect(sviBacktestStatusFrom({ generated_at: ago(SVI_BACKTEST_MAX_AGE_MS) }, NOW)).toBe("stale");
    expect(sviBacktestStatusFrom({ generated_at: ago(30 * 24 * 3600e3) }, NOW)).toBe("stale");
  });
});

describe("readSviBacktestStatus (file)", () => {
  it("missing when the file is absent, unparsable, or an array", async () => {
    const root = tmpRoot();
    expect(await readSviBacktestStatus(root, NOW)).toBe("missing");
    writeFileSync(path.join(root, SVI_BACKTEST_FILE), "{ nope");
    expect(await readSviBacktestStatus(root, NOW)).toBe("missing");
    writeFileSync(path.join(root, SVI_BACKTEST_FILE), "[]");
    expect(await readSviBacktestStatus(root, NOW)).toBe("missing");
  });

  it("ok / stale from the persisted generated_at", async () => {
    const root = tmpRoot();
    writeFileSync(path.join(root, SVI_BACKTEST_FILE), JSON.stringify({ generated_at: ago(3600e3) }));
    expect(await readSviBacktestStatus(root, NOW)).toBe("ok");
    writeFileSync(path.join(root, SVI_BACKTEST_FILE), JSON.stringify({ generated_at: ago(9 * 24 * 3600e3) }));
    expect(await readSviBacktestStatus(root, NOW)).toBe("stale");
  });
});

describe("readSviBacktestLatest + isBacktestReport", () => {
  it("null when absent or not a report; the full report when it is", async () => {
    const root = tmpRoot();
    expect(await readSviBacktestLatest(root)).toBeNull();
    writeFileSync(path.join(root, SVI_BACKTEST_FILE), JSON.stringify({ generated_at: ago(1) }));
    expect(await readSviBacktestLatest(root)).toBeNull();
    const report = runBacktest({ rows: [], now: new Date(NOW), gitSha: "abc" });
    writeFileSync(path.join(root, SVI_BACKTEST_FILE), JSON.stringify(report));
    const back = await readSviBacktestLatest(root);
    expect(back).not.toBeNull();
    expect(back!.git_sha).toBe("abc");
    expect(back!.n).toBe(0);
  });

  it("isBacktestReport rejects partial shapes", () => {
    expect(isBacktestReport(null)).toBe(false);
    expect(isBacktestReport([])).toBe(false);
    expect(isBacktestReport({ generated_at: "x", svi_version: "1", n: 1 })).toBe(false);
    expect(isBacktestReport(runBacktest({ rows: [], gitSha: "x" }))).toBe(true);
  });
});
