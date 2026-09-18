// G15-R2 — crons_failed_24h reducer (lib/status/crons.ts) + detail redaction.

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readCronFailures24h, redactDetail, summariseCronFailures } from "./crons";

const NOW = Date.parse("2026-09-18T06:00:00.000Z");
const at = (minAgo: number) => new Date(NOW - minAgo * 60_000).toISOString();

describe("redactDetail", () => {
  it("removes urls, paths and token-looking strings, trims", () => {
    expect(redactDetail("run scripts/db-backup-offsite-auth.mjs once (see /home/dovanlong/blockid.au/web/.env) at https://drive.google.com/x?y=1")).toBe("run scripts/db-backup-offsite-auth.mjs once (see <path>) at <url>");
    expect(redactDetail("Bearer abcdefghijklmnopqrstuvwxyz failed")).toBe("<redacted> failed");
    expect(redactDetail(42)).toBe("");
    expect(redactDetail("x".repeat(500))).toHaveLength(160);
  });
});

describe("summariseCronFailures", () => {
  it("groups failures in 24 h per endpoint with the newest detail, ignores ok rows and old rows", () => {
    const rows = [
      { ts: at(30), endpoint: "db-backup-offsite", status: "fail", duration_ms: 2464, detail: "Service account has no Drive quota — see /home/x/y" },
      { ts: at(90), endpoint: "db-backup-offsite", status: "fail", detail: "older" },
      { ts: at(10), endpoint: "agent-guardian", status: "ok", detail: "{}" },
      { ts: at(20), cron: "ga4-sync", ok: false, detail: "quota" },
      { ts: "2026-09-10T00:00:00Z", endpoint: "db-backup-offsite", status: "fail", detail: "ancient" },
      { ts: at(5), status: "fail" },
    ];
    expect(summariseCronFailures(rows, NOW)).toEqual([
      { endpoint: "db-backup-offsite", count: 2, last_ts: at(30), last_error: "Service account has no Drive quota — see <path>" },
      { endpoint: "ga4-sync", count: 1, last_ts: at(20), last_error: "quota" },
    ]);
  });
  it("empty when nothing failed", () => {
    expect(summariseCronFailures([{ ts: at(1), endpoint: "x", status: "ok" }], NOW)).toEqual([]);
  });
});

describe("readCronFailures24h", () => {
  it("missing file → [] and never throws", async () => {
    expect(await readCronFailures24h(mkdtempSync(join(tmpdir(), "c-")), NOW)).toEqual([]);
  });
});
