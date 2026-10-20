// O1 / L1-10 — rotate-runtime-jsonl: keep 30 days / 5 MB, archive the rest gzipped.
import { appendFileSync, chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { main, needsRotation, partition, rotateFile, rowTime, TARGETS } from "./rotate-runtime-jsonl.mjs";

const NOW = Date.parse("2026-10-20T04:25:00Z");
const DAY = 86_400_000;
const row = (msAgo, extra = {}) => JSON.stringify({ ts: new Date(NOW - msAgo).toISOString(), ...extra });

let dir = "";
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "rotate-jsonl-")); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("rowTime", () => {
  it("reads ts / timestamp / checked_at (ISO or epoch) and rejects junk", () => {
    expect(rowTime('{"ts":"2026-10-01T00:00:00Z"}')).toBe(Date.parse("2026-10-01T00:00:00Z"));
    expect(rowTime('{"timestamp":"2026-10-01T00:00:00Z"}')).toBe(Date.parse("2026-10-01T00:00:00Z"));
    expect(rowTime('{"checked_at":"2026-10-01 00:00:00+00"}')).not.toBeNull();
    expect(rowTime('{"at":1790000000}')).toBe(1790000000 * 1000);
    expect(rowTime("not json")).toBeNull();
    expect(rowTime('{"no":"time"}')).toBeNull();
  });
});

describe("partition", () => {
  it("keeps rows within 30 days (and undated rows), archives older, preserves order", () => {
    const lines = [row(40 * DAY, { n: 1 }), row(31 * DAY, { n: 2 }), '{"undated":true}', row(29 * DAY, { n: 3 }), row(DAY, { n: 4 }), ""];
    const { keep, archive } = partition(lines, NOW);
    expect(archive.map((l) => JSON.parse(l).n)).toEqual([1, 2]);
    expect(keep.map((l) => JSON.parse(l).n ?? "u")).toEqual(["u", 3, 4]);
  });
  it("caps the kept part to the newest maxBytes", () => {
    const lines = Array.from({ length: 10 }, (_, i) => row((10 - i) * 60_000, { pad: "x".repeat(80), i }));
    const one = Buffer.byteLength(lines[0]) + 1;
    const { keep, archive } = partition(lines, NOW, { maxBytes: one * 3 + 1 });
    expect(keep.map((l) => JSON.parse(l).i)).toEqual([7, 8, 9]);
    expect(archive).toHaveLength(7);
  });
});

describe("rotateFile", () => {
  it("leaves a small, fresh file alone", () => {
    const f = join(dir, "x.jsonl");
    writeFileSync(f, `${row(DAY)}\n${row(0)}\n`);
    expect(rotateFile(f, { nowMs: NOW, archiveDir: join(dir, "archive") })).toMatchObject({ rotated: false, reason: "fresh" });
    expect(existsSync(join(dir, "archive"))).toBe(false);
  });
  it("archives old rows gzipped, keeps new rows, keeps a trailing partial line, keeps the mode", () => {
    const f = join(dir, "cron-health.jsonl");
    writeFileSync(f, `${row(45 * DAY, { n: 1 })}\n${row(35 * DAY, { n: 2 })}\n${row(2 * DAY, { n: 3 })}\n{"ts":"2026-10-20T04:2`);
    chmodSync(f, 0o664);
    const r = rotateFile(f, { nowMs: NOW, archiveDir: join(dir, "archive") });
    expect(r).toMatchObject({ rotated: true, reason: "age", kept_rows: 1, archived_rows: 2 });
    const kept = readFileSync(f, "utf8");
    expect(kept.split("\n")[0]).toContain('"n":3');
    expect(kept.endsWith('{"ts":"2026-10-20T04:2')).toBe(true); // partial row carried over untouched
    expect(statSync(f).mode & 0o777).toBe(0o664);
    const archived = readdirSync(join(dir, "archive"));
    expect(archived).toEqual(["cron-health.20261020T0425Z.jsonl.gz"]);
    const restored = gunzipSync(readFileSync(join(dir, "archive", archived[0]))).toString("utf8").trim().split("\n");
    expect(restored.map((l) => JSON.parse(l).n)).toEqual([1, 2]);
  });
  it("rotates on size even when every row is fresh, and a 2nd run the same minute appends to the same archive", () => {
    const f = join(dir, "big.jsonl");
    const lines = Array.from({ length: 50 }, (_, i) => row((50 - i) * 1000, { i, pad: "y".repeat(200) }));
    writeFileSync(f, `${lines.join("\n")}\n`);
    const r = rotateFile(f, { nowMs: NOW, archiveDir: join(dir, "a"), maxBytes: 2000 });
    expect(r.rotated).toBe(true);
    expect(statSync(f).size).toBeLessThanOrEqual(2000);
    appendFileSync(f, `${lines.join("\n")}\n`);
    rotateFile(f, { nowMs: NOW, archiveDir: join(dir, "a"), maxBytes: 2000 });
    const gz = readFileSync(join(dir, "a", "big.20261020T0425Z.jsonl.gz"));
    expect(gunzipSync(gz).toString("utf8").trim().split("\n").length).toBeGreaterThan(50); // both members readable
  });
  it("dry-run reports but changes nothing", () => {
    const f = join(dir, "d.jsonl");
    const body = `${row(60 * DAY)}\n${row(0)}\n`;
    writeFileSync(f, body);
    expect(rotateFile(f, { nowMs: NOW, archiveDir: join(dir, "a"), dryRun: true })).toMatchObject({ dry_run: true, archived_rows: 1 });
    expect(readFileSync(f, "utf8")).toBe(body);
    expect(existsSync(join(dir, "a"))).toBe(false);
  });
  it("missing file is a no-op", () => {
    expect(needsRotation(join(dir, "nope.jsonl"), NOW)).toEqual({ needed: false, reason: "missing" });
  });
});

describe("main + allowlist", () => {
  it("never rotates evidence / queue / history ledgers", () => {
    for (const keep of ["erasure-history.jsonl", "svi-backtest-history.jsonl", "traction-history.jsonl", "grants-review-queue.jsonl", "migration-audit.jsonl", "retention-history.jsonl"]) {
      expect(TARGETS.some((t) => t.endsWith(`/${keep}`))).toBe(false);
    }
  });
  it("runs over the targets under a web dir", () => {
    const web = join(dir, "web");
    const f = join(web, "content", "reports", "cron-health.jsonl");
    mkdirSync(join(web, "content", "reports"), { recursive: true });
    writeFileSync(f, `${row(40 * DAY)}\n${row(0)}\n`);
    const out = main(["--json"], { webDir: web, nowMs: NOW, log: () => {}, archiveDir: join(dir, "arch"), lockFile: join(dir, "lock") });
    expect(out.rows.find((x) => x.file === f)).toMatchObject({ rotated: true, archived_rows: 1, kept_rows: 1 });
    expect(out.rows.filter((x) => x.error)).toEqual([]);
  });
});
