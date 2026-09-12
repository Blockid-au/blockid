import { describe, expect, it } from "vitest";
import { classifyBackupHealth } from "./backup-health";

const NOW = Date.parse("2026-09-12T12:00:00Z");
const h = (hoursAgo: number) => new Date(NOW - hoursAgo * 3600e3).toISOString();
const line = (job: string, status: string, ts: string) => JSON.stringify({ ts, job, status });

describe("classifyBackupHealth", () => {
  it("is missing with no rows / garbage / only failures", () => {
    expect(classifyBackupHealth([], NOW).status).toBe("missing");
    expect(classifyBackupHealth(["not json", "{"], NOW).status).toBe("missing");
    expect(classifyBackupHealth([line("db-backup", "fail", h(1))], NOW).status).toBe("missing");
  });

  it("is ok when backup < 26h and restore_test < 8d", () => {
    const r = classifyBackupHealth([line("db-backup", "ok", h(20)), line("restore_test", "ok", h(7 * 24))], NOW);
    expect(r.status).toBe("ok");
    expect(r.last_backup).toBe(h(20));
    expect(r.last_restore_test).toBe(h(7 * 24));
  });

  it("is stale when backup is 27h old, or restore_test is 9d old / absent", () => {
    expect(classifyBackupHealth([line("db-backup", "ok", h(27)), line("restore_test", "ok", h(24))], NOW).status).toBe("stale");
    expect(classifyBackupHealth([line("db-backup", "ok", h(1)), line("restore_test", "ok", h(9 * 24))], NOW).status).toBe("stale");
    expect(classifyBackupHealth([line("db-backup", "ok", h(1))], NOW).status).toBe("stale");
  });

  it("uses the newest successful row, ignoring later failures and legacy rows", () => {
    const rows = [
      line("db-backup", "ok", h(2)),
      line("db-backup", "fail", h(1)),
      line("restore_test", "ok", h(48)),
      line("restore_test", "fail", h(3)),
      JSON.stringify({ ts: h(0.5), db: { ok: true } }), // legacy backup-verify shape
    ];
    const r = classifyBackupHealth(rows, NOW);
    expect(r.status).toBe("ok");
    expect(r.last_backup).toBe(h(2));
  });
});
