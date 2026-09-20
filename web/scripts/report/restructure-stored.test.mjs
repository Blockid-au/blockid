// G19-S47 — `scripts/report/restructure-stored.mjs` core with a fake db:
// a pre-S47 stored report (BlockID showcase shape: markdown thesis, score
// restatements in strengths / gaps, no structured block) gets its sections
// and card-derived bullets; the write is validated; a second run is a
// no-op; --dry-run never writes; --force rebuilds; a missing row is reported.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { makeSupabaseRestructureDb, restructureReportV2, restructureStoredReport } from "./restructure-core.mjs";
import { executiveFromChapters } from "../../src/lib/report-v2/adapter";
import { hasValidExecutiveStructured, structureExecutive } from "../../src/lib/report-v2/executive-structure";
import { demoReportV2 } from "../../src/lib/report-v2/fixtures";
import { assertReportV2, executiveStructuredSchema } from "../../src/lib/report-v2/schema";

const lib = { structureExecutive, executiveFromChapters, hasValidExecutiveStructured, assertReportV2 };
const BLOCKID = readFileSync(path.join(process.cwd(), "test-fixtures", "report-v2", "blockid-executive-2026-09-20.md"), "utf8");
const SNAPSHOT = "ba680de6-f1db-4027-b37c-1003c47d97cb";

/** A stored row as the showcase had it before S47. */
function preS47Row() {
  const r = demoReportV2();
  r.cover.startupName = "BlockID.au";
  r.executive.thesis = BLOCKID;
  r.executive.strengths = ["Founder & Team Value 100/100 (strong).", "Product & Tech Depth 100/100 (strong)."];
  r.executive.gaps = ["Traction & Revenue Evidence 46/100 — 24 below the strong band."];
  delete r.executive.structured;
  return r;
}

function fakeDb(initial) {
  const rows = new Map(initial);
  const writes = [];
  return {
    writes,
    rows,
    async readReportV2(id) {
      return rows.get(id) ?? null;
    },
    async writeReportV2(id, report) {
      writes.push({ id, report });
      rows.set(id, report);
    },
  };
}

describe("restructureReportV2 (pure)", () => {
  it("adds the structured block from the stored thesis and replaces the score restatements with card bullets; the result validates", () => {
    const { report, changed, changes } = restructureReportV2(preS47Row(), lib);
    expect(changed).toBe(true);
    expect(changes).toEqual(["strengths", "gaps", "structured"]);
    expect(executiveStructuredSchema.safeParse(report.executive.structured).success).toBe(true);
    expect(report.executive.structured.headline).toBe("BlockID.au: The Audit-Grade Valuation Engine for Australia's Startup Ecosystem");
    expect(report.executive.structured.verdict).toEqual({ label: "back_with_conditions", condition: "With a revenue milestone condition.", confidence: 0.65 });
    expect(report.executive.structured.actions).toHaveLength(5);
    for (const line of [...report.executive.strengths, ...report.executive.gaps]) expect(line).not.toMatch(/\d{1,3}\/100|below the strong band/);
    expect(report.executive.strengths).toHaveLength(3);
    expect(() => assertReportV2(report)).not.toThrow();
    // The thesis stays (back-compat) — only the derived fields move.
    expect(report.executive.thesis).toBe(BLOCKID);
  });

  it("is idempotent: a structured row without restatements changes nothing; --force rebuilds", () => {
    const first = restructureReportV2(preS47Row(), lib).report;
    const second = restructureReportV2(first, lib);
    expect(second.changed).toBe(false);
    expect(second.changes).toEqual([]);
    const forced = restructureReportV2(first, lib, { force: true });
    expect(forced.changed).toBe(true);
    expect(forced.changes).toEqual(["strengths", "gaps", "structured"]);
    expect(forced.report.executive.structured).toEqual(first.executive.structured);
  });

  it("throws on a missing document", () => {
    expect(() => restructureReportV2(null, lib)).toThrow(/no report_v2/);
  });
});

describe("restructureStoredReport (fake db)", () => {
  it("reads, restructures and writes once; the second run reads and writes nothing", async () => {
    const db = fakeDb([[SNAPSHOT, preS47Row()]]);
    const logs = [];
    const first = await restructureStoredReport({ db, lib, snapshotId: SNAPSHOT, log: (l) => logs.push(l) });
    expect(first).toMatchObject({ snapshotId: SNAPSHOT, found: true, changed: true, written: true });
    expect(db.writes).toHaveLength(1);
    expect(db.writes[0].id).toBe(SNAPSHOT);
    expect(hasValidExecutiveStructured(db.rows.get(SNAPSHOT))).toBe(true);
    expect(logs.some((l) => l.includes("verdict back_with_conditions (65%)"))).toBe(true);
    const second = await restructureStoredReport({ db, lib, snapshotId: SNAPSHOT });
    expect(second).toMatchObject({ found: true, changed: false, written: false });
    expect(db.writes).toHaveLength(1);
  });

  it("--dry-run reports the change and never writes; an unknown snapshot is found:false", async () => {
    const db = fakeDb([[SNAPSHOT, preS47Row()]]);
    const dry = await restructureStoredReport({ db, lib, snapshotId: SNAPSHOT, dryRun: true });
    expect(dry).toMatchObject({ found: true, changed: true, written: false });
    expect(db.writes).toHaveLength(0);
    const missing = await restructureStoredReport({ db, lib, snapshotId: "00000000-0000-0000-0000-000000000000" });
    expect(missing).toMatchObject({ found: false, changed: false, written: false });
  });

  it("the Supabase adapter maps select / update onto svi_snapshots.report_v2 and surfaces errors", async () => {
    const calls = [];
    const sb = {
      from(table) {
        calls.push(table);
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: SNAPSHOT, report_v2: { ok: true } }, error: null }) }) }),
          update: (patch) => ({ eq: async (col, id) => (calls.push(`update:${col}=${id}:${Object.keys(patch).join(",")}`), { error: null }) }),
        };
      },
    };
    const db = makeSupabaseRestructureDb(sb);
    expect(await db.readReportV2(SNAPSHOT)).toEqual({ ok: true });
    await db.writeReportV2(SNAPSHOT, { ok: 2 });
    expect(calls).toEqual(["svi_snapshots", "svi_snapshots", `update:id=${SNAPSHOT}:report_v2`]);
    const failing = makeSupabaseRestructureDb({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: "boom" } }) }) }) }) });
    await expect(failing.readReportV2(SNAPSHOT)).rejects.toThrow(/boom/);
  });
});
