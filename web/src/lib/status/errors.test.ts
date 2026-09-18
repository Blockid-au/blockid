// G15-R2 — errors_1h reducer + reader (lib/status/errors.ts).

import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readErrors1h, summariseErrors } from "./errors";

const NOW = Date.parse("2026-09-18T06:00:00.000Z");
const row = (minAgo: number, total: number, classes: Array<{ tag: string; msg: string; count: number }>) => ({
  ts: new Date(NOW - minAgo * 60_000).toISOString(),
  window_min: 10,
  total,
  classes,
});

describe("summariseErrors", () => {
  it("returns null when the digest never ran", () => {
    expect(summariseErrors([], NOW)).toBeNull();
  });
  it("sums only the windows inside the last hour and merges classes, top 5 by count", () => {
    const rows = [
      row(90, 50, [{ tag: "old", msg: "x", count: 50 }]), // outside
      row(50, 4, [{ tag: "ai-client", msg: "gateway <n>", count: 3 }, { tag: "svi", msg: "boom", count: 1 }]),
      row(10, 8, [{ tag: "ai-client", msg: "gateway <n>", count: 2 }, { tag: "a", msg: "1", count: 1 }, { tag: "b", msg: "2", count: 1 }, { tag: "c", msg: "3", count: 1 }, { tag: "d", msg: "4", count: 1 }, { tag: "e", msg: "5", count: 1 }, { tag: "f", msg: "6", count: 1 }]),
    ];
    const s = summariseErrors(rows, NOW);
    expect(s).not.toBeNull();
    expect(s!.total).toBe(12);
    expect(s!.windows).toBe(2);
    expect(s!.last_ts).toBe(new Date(NOW - 10 * 60_000).toISOString());
    expect(s!.classes).toHaveLength(5);
    expect(s!.classes[0]).toEqual({ tag: "ai-client", msg: "gateway <n>", count: 5 });
  });
  it("digest exists but nothing in the last hour → zero, not null", () => {
    expect(summariseErrors([row(120, 3, [])], NOW)).toEqual({ total: 0, classes: [], windows: 0, last_ts: "" });
  });
  it("tolerates malformed rows", () => {
    const s = summariseErrors([{ ts: new Date(NOW).toISOString(), total: "x", classes: [null, 3, { count: 2 }] } as never], NOW);
    expect(s).toEqual({ total: 0, classes: [{ tag: "untagged", msg: "", count: 2 }], windows: 1, last_ts: new Date(NOW).toISOString() });
  });
});

describe("readErrors1h", () => {
  it("reads the jsonl tail from <root>/content/reports and never throws", async () => {
    const root = mkdtempSync(join(tmpdir(), "st-"));
    expect(await readErrors1h(root, NOW)).toBeNull();
    mkdirSync(join(root, "content", "reports"), { recursive: true });
    writeFileSync(join(root, "content", "reports", "error-digest.jsonl"), `${JSON.stringify(row(5, 2, [{ tag: "t", msg: "m", count: 2 }]))}\nnot json\n`);
    expect(await readErrors1h(root, NOW)).toMatchObject({ total: 2, classes: [{ tag: "t", msg: "m", count: 2 }] });
  });
});
