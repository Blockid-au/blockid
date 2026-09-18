// Colocated tests for the restore-drill verdict (G15-R3). The docker /
// pg_restore plumbing lives in restore-drill.sh and is exercised by the real
// weekly run; everything that decides PASS / FAIL is here and pure.

import { describe, expect, it } from "vitest";
import {
  DRILL_TABLES,
  MIN_PCT,
  checkAuditHead,
  classifyRestoreErrors,
  compareCounts,
  evaluateDrill,
} from "./restore-drill-core.mjs";

const full = (n) => Object.fromEntries(DRILL_TABLES.map((t) => [t, n]));
const goodInput = (over = {}) => ({
  dump: "/data/backups/db-20260918T022001Z.dump.gz",
  dump_age_h: 6.2,
  duration_ms: 12034,
  pg_restore_exit: 1,
  pg_restore_error_lines: ['pg_restore: error: could not execute query: ERROR:  schema "public" already exists'],
  live: full(100),
  drill: full(98),
  audit: { rows: 6480, prev_hash_present: true, curr_hash_present: true },
  ...over,
});

describe("DRILL_TABLES", () => {
  it("pins the 12 tables from the G15 spec", () => {
    expect(DRILL_TABLES).toHaveLength(12);
    expect(DRILL_TABLES).toContain("audit_events");
    expect(DRILL_TABLES).toContain("schema_migrations");
    expect(MIN_PCT).toBe(95);
  });
});

describe("compareCounts", () => {
  it("passes when every drill count is ≥ 95 % of live and reports pct per table", () => {
    const r = compareCounts(full(1000), { ...full(1000), projects: 950 });
    expect(r.ok).toBe(true);
    expect(r.tables.projects).toEqual({ live: 1000, drill: 950, pct: 95 });
    expect(r.tables.app_users.pct).toBe(100);
  });

  it("fails a table under the threshold and names it", () => {
    const r = compareCounts(full(1000), { ...full(1000), evaluations: 949 });
    expect(r.ok).toBe(false);
    expect(r.failures).toEqual(["evaluations: drill=949 live=1000 (94.9% < 95%)"]);
  });

  it("treats live=0 as 100 % (rows deleted since the dump are not a restore fault)", () => {
    const r = compareCounts({ ...full(10), webhook_endpoints: 0 }, { ...full(10), webhook_endpoints: 3 });
    expect(r.ok).toBe(true);
    expect(r.tables.webhook_endpoints.pct).toBe(100);
  });

  it("fails when a count is missing or unreadable on either side", () => {
    const missingDrill = compareCounts(full(10), { ...full(10), external_signals: null });
    expect(missingDrill.ok).toBe(false);
    expect(missingDrill.failures[0]).toMatch(/external_signals: drill count unreadable/);
    const missingLive = compareCounts({ ...full(10), projects: "n/a" }, full(10));
    expect(missingLive.failures[0]).toMatch(/projects: live count unreadable/);
    expect(missingLive.tables.projects).toEqual({ live: null, drill: 10, pct: null });
  });

  it("accepts psql string output for counts", () => {
    const r = compareCounts({ ...full("12"), projects: " 7\n" }, { ...full("12"), projects: "7" });
    expect(r.ok).toBe(true);
    expect(r.tables.projects).toEqual({ live: 7, drill: 7, pct: 100 });
  });
});

describe("classifyRestoreErrors", () => {
  it("allow-lists the known Supabase same-cluster noise and flags everything else", () => {
    const r = classifyRestoreErrors([
      'pg_restore: error: could not execute query: ERROR:  schema "extensions" already exists',
      "pg_restore: error: could not execute query: ERROR:  must be owner of event trigger issue_pg_net_access",
      'pg_restore: error: could not execute query: ERROR:  permission denied for schema supabase_vault',
      "pg_restore: error: could not execute query: ERROR:  relation \"public.projects\" does not exist",
      "pg_restore: warning: errors ignored on restore: 4",
      'pg_restore: error: COPY failed for table "projects": ERROR:  invalid input syntax for type uuid',
    ]);
    expect(r.total).toBe(5);
    // Review 2026-09-18: a missing relation is a REAL failure (lost object /
    // ordering), only role/schema/extension/event-trigger kinds are benign.
    expect(r.benign).toHaveLength(3);
    expect(r.fatal).toEqual([
      "pg_restore: error: could not execute query: ERROR:  relation \"public.projects\" does not exist",
      'pg_restore: error: COPY failed for table "projects": ERROR:  invalid input syntax for type uuid',
    ]);
  });

  it("is empty for a clean restore", () => {
    expect(classifyRestoreErrors([])).toEqual({ total: 0, benign: [], fatal: [] });
    expect(classifyRestoreErrors(undefined).total).toBe(0);
  });
});

describe("checkAuditHead", () => {
  it("requires prev_hash and curr_hash on the newest row when the table has rows", () => {
    expect(checkAuditHead({ rows: 5, prev_hash_present: true, curr_hash_present: true }).ok).toBe(true);
    expect(checkAuditHead({ rows: 5, prev_hash_present: false, curr_hash_present: true })).toEqual({ ok: false, reason: "audit chain head has null prev_hash" });
    expect(checkAuditHead({ rows: 5, prev_hash_present: true, curr_hash_present: false }).reason).toMatch(/curr_hash/);
  });
  it("passes an empty table and fails an unreadable one", () => {
    expect(checkAuditHead({ rows: 0 }).ok).toBe(true);
    expect(checkAuditHead({ rows: null }).ok).toBe(false);
    expect(checkAuditHead(undefined).ok).toBe(false);
  });
});

describe("evaluateDrill", () => {
  it("produces an ok row in the backup-health shape", () => {
    const now = new Date("2026-09-20T03:30:12.345Z");
    const { status, row, failures } = evaluateDrill(goodInput(), { now });
    expect(status).toBe("ok");
    expect(failures).toEqual([]);
    expect(row.ts).toBe("2026-09-20T03:30:12Z");
    expect(row.job).toBe("restore-drill");
    expect(row.status).toBe("ok");
    expect(row.dump).toBe("/data/backups/db-20260918T022001Z.dump.gz");
    expect(row.file).toBe(row.dump); // legacy readers key on `file`
    expect(row.dump_age_h).toBe(6.2);
    expect(row.duration_ms).toBe(12034);
    expect(row.pg_restore_errors).toBe(1);
    expect(row.pg_restore_benign).toBe(1);
    expect(row.audit_chain_head).toBe("ok");
    expect(Object.keys(row.tables)).toEqual([...DRILL_TABLES]);
    expect(row.tables.projects).toEqual({ live: 100, drill: 98, pct: 98 });
    expect(row.error).toBeUndefined();
    expect(() => JSON.parse(JSON.stringify(row))).not.toThrow();
  });

  it("fails on a parity miss and carries every reason in `error`", () => {
    const { status, row } = evaluateDrill(goodInput({ drill: { ...full(98), audit_events: 10 }, audit: { rows: 10, prev_hash_present: false, curr_hash_present: true } }));
    expect(status).toBe("fail");
    expect(row.status).toBe("fail");
    expect(row.error).toMatch(/audit_events: drill=10 live=100 \(10% < 95%\)/);
    expect(row.error).toMatch(/null prev_hash/);
    expect(row.audit_chain_head).toBe("fail");
  });

  it("fails on a stale dump, a fatal pg_restore error, or a non-zero exit with no error lines", () => {
    expect(evaluateDrill(goodInput({ dump_age_h: 40 })).failures[0]).toMatch(/40\.0 h old/);
    expect(evaluateDrill(goodInput({ pg_restore_error_lines: ["pg_restore: error: COPY failed for table \"app_users\": disk full"] })).failures[0]).toMatch(/non-benign/);
    expect(evaluateDrill(goodInput({ pg_restore_exit: 2, pg_restore_error_lines: [] })).failures[0]).toMatch(/exit 2 with no error lines/);
    expect(evaluateDrill(goodInput({ dump: "" })).failures[0]).toBe("no dump file");
  });
});
