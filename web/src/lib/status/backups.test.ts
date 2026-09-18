// G15-R2 — backups_detail reducer (lib/status/backups.ts) against the real
// backup-health.jsonl row shapes (db-backup / offsite / restore-drill) plus
// the aliases the R3 lane may write.

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readBackupsDetail, summariseBackups } from "./backups";

const NOW = Date.parse("2026-09-18T06:00:00.000Z");

describe("summariseBackups", () => {
  it("empty → nulls and offsite never", () => {
    expect(summariseBackups([], NOW)).toEqual({ local_last_ok_at: null, local_age_h: null, offsite_status: "never", offsite_last_at: null, restore_drill_last_ok_at: null });
  });
  it("picks the newest ok local backup, the newest offsite row's status, and the newest ok drill", () => {
    const rows = [
      { ts: "2026-09-16T02:20:05Z", job: "db-backup", status: "ok", file: "/data/backups/db-1.dump.gz", sizeBytes: 1 },
      { ts: "2026-09-17T02:20:05Z", job: "db-backup", status: "ok", file: "/data/backups/db-2.dump.gz", sizeBytes: 2 },
      { ts: "2026-09-18T02:20:05Z", job: "db-backup", status: "fail", error: "disk full" },
      { ts: "2026-09-16T02:40:04Z", job: "offsite", status: "ok" },
      { ts: "2026-09-17T02:40:05Z", job: "offsite", status: "fail", error: "Service account has no Drive quota …", offsite_status: "founder_action_required" },
      { ts: "2026-09-14T03:30:00Z", job: "restore-drill", status: "ok", tables: {} },
      { ts: "2026-09-15T03:30:00Z", job: "restore_test", status: "ok" },
      { ts: "2026-09-17T03:30:00Z", job: "restore-drill", status: "fail" },
      { ts: "bad", job: "db-backup", status: "ok" },
    ];
    const d = summariseBackups(rows, NOW);
    expect(d).toEqual({
      local_last_ok_at: "2026-09-17T02:20:05.000Z",
      local_age_h: 27.7,
      offsite_status: "founder_action_required",
      offsite_last_at: "2026-09-17T02:40:05.000Z",
      restore_drill_last_ok_at: "2026-09-15T03:30:00.000Z",
    });
    expect(JSON.stringify(d)).not.toContain("/data");
  });
  it("offsite without an explicit offsite_status falls back to ok|fail", () => {
    expect(summariseBackups([{ ts: "2026-09-18T02:40:00Z", job: "offsite", status: "fail", error: "x" }], NOW).offsite_status).toBe("fail");
    expect(summariseBackups([{ ts: "2026-09-18T02:40:00Z", job: "offsite", status: "ok" }], NOW).offsite_status).toBe("ok");
    expect(summariseBackups([{ ts: "2026-09-18T02:40:00Z", job: "local", status: "ok" }], NOW).local_age_h).toBe(3.3);
  });
});

describe("readBackupsDetail", () => {
  it("missing file → the empty shape, never throws", async () => {
    expect(await readBackupsDetail(mkdtempSync(join(tmpdir(), "b-")), NOW)).toMatchObject({ local_last_ok_at: null, offsite_status: "never" });
  });
});
