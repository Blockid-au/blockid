// G21-P1-B — svi_snapshots writers carry evidence_confidence and fail soft when the column is absent.

import { describe, expect, it } from "vitest";
import { computeSVI, extractSignals } from "@/lib/svi-analysis";
import { evidenceConfidenceFromAnalysis } from "./evidence-confidence";
import { EVIDENCE_CONFIDENCE_COLUMN, insertSviSnapshot, isMissingColumnError, updateSviSnapshot, upsertSviSnapshot, withEvidenceConfidence } from "./snapshot-evidence-confidence";

type Row = Record<string, unknown>;

/** A tiny query recorder: `failMissing` makes the first write with the column fail like Postgres 42703. */
function fakeDb(opts: { failMissing?: boolean; failAlways?: boolean } = {}) {
  const writes: Array<{ op: string; row: Row; select?: string }> = [];
  const respond = (row: Row) => {
    if (opts.failAlways) return { data: null, error: { code: "XX000", message: "boom" } };
    if (opts.failMissing && EVIDENCE_CONFIDENCE_COLUMN in row) return { data: null, error: { code: "42703", message: `column "${EVIDENCE_CONFIDENCE_COLUMN}" of relation "svi_snapshots" does not exist` } };
    return { data: { id: "snap-1", ...row }, error: null };
  };
  const db = {
    from(_table: string) {
      return {
        insert(row: Row) {
          const w = { op: "insert", row, select: undefined as string | undefined };
          writes.push(w);
          const p = Promise.resolve(respond(row));
          return Object.assign(p, {
            select(cols: string) {
              w.select = cols;
              return { single: () => Promise.resolve(respond(row)) };
            },
          });
        },
        update(row: Row) {
          writes.push({ op: "update", row });
          return { eq: () => Promise.resolve(respond(row)) };
        },
        upsert(row: Row) {
          writes.push({ op: "upsert", row });
          return Promise.resolve(respond(row));
        },
      };
    },
  };
  return { db: db as never, writes };
}

const analysis = computeSVI(extractSignals({ rawText: "Serial founder. MRR A$5,000 with 12 customers. ABN registered." }));

describe("withEvidenceConfidence", () => {
  it("adds the 0–100 value from the analysis and leaves the row alone without one", () => {
    const row = withEvidenceConfidence({ svi_total: 80 }, analysis);
    expect(row.evidence_confidence).toBe(evidenceConfidenceFromAnalysis(analysis));
    expect(withEvidenceConfidence({ svi_total: 80 }, null)).toEqual({ svi_total: 80 });
  });

  it("isMissingColumnError recognises 42703 / PGRST204 / the column name in the message", () => {
    expect(isMissingColumnError({ code: "42703" })).toBe(true);
    expect(isMissingColumnError({ code: "PGRST204", message: "x" })).toBe(true);
    expect(isMissingColumnError({ code: "XX", message: "Could not find the 'evidence_confidence' column of 'svi_snapshots' in the schema cache" })).toBe(true);
    expect(isMissingColumnError({ code: "23505", message: "duplicate key" })).toBe(false);
    expect(isMissingColumnError(null)).toBe(false);
  });
});

describe("insertSviSnapshot", () => {
  it("writes the column and returns the selected row", async () => {
    const { db, writes } = fakeDb();
    const r = await insertSviSnapshot<{ id: string }>(db, { account_id: "a" }, { analysis, select: "id" });
    expect(r.error).toBeNull();
    expect(r.data?.id).toBe("snap-1");
    expect(writes).toHaveLength(1);
    expect(writes[0].row).toHaveProperty(EVIDENCE_CONFIDENCE_COLUMN);
    expect(writes[0].select).toBe("id");
  });

  it("retries once without the column when the database lacks it (fail-soft)", async () => {
    const { db, writes } = fakeDb({ failMissing: true });
    const r = await insertSviSnapshot(db, { account_id: "a", svi_total: 80 }, { analysis });
    expect(r.error).toBeNull();
    expect(writes).toHaveLength(2);
    expect(writes[0].row).toHaveProperty(EVIDENCE_CONFIDENCE_COLUMN);
    expect(writes[1].row).not.toHaveProperty(EVIDENCE_CONFIDENCE_COLUMN);
    expect(writes[1].row).toMatchObject({ account_id: "a", svi_total: 80 });
  });

  it("does not retry on an unrelated error, and never retries when the column was not in the payload", async () => {
    const { db, writes } = fakeDb({ failAlways: true });
    const r = await insertSviSnapshot(db, { account_id: "a" }, { analysis });
    expect(r.error?.code).toBe("XX000");
    expect(writes).toHaveLength(1);
    const plain = fakeDb({ failMissing: true });
    await insertSviSnapshot(plain.db, { account_id: "a" });
    expect(plain.writes).toHaveLength(1);
  });
});

describe("updateSviSnapshot / upsertSviSnapshot", () => {
  it("both add the column and fall back without it", async () => {
    const ok = fakeDb();
    expect((await updateSviSnapshot(ok.db, "snap-1", { svi_total: 81 }, { analysis })).error).toBeNull();
    expect(ok.writes[0].row).toHaveProperty(EVIDENCE_CONFIDENCE_COLUMN);
    const missing = fakeDb({ failMissing: true });
    expect((await updateSviSnapshot(missing.db, "snap-1", { svi_total: 81 }, { analysis })).error).toBeNull();
    expect(missing.writes).toHaveLength(2);
    expect(missing.writes[1].row).not.toHaveProperty(EVIDENCE_CONFIDENCE_COLUMN);
    const up = fakeDb({ failMissing: true });
    expect((await upsertSviSnapshot(up.db, { account_id: "a" }, { analysis })).error).toBeNull();
    expect(up.writes.map((w) => w.op)).toEqual(["upsert", "upsert"]);
  });
});
