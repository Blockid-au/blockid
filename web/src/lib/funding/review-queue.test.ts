// Colocated vitest for the grants review-queue JSONL helpers (T0243).

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  REVIEW_QUEUE_PATH,
  appendReviewEntries,
  countRecentReviewEntries,
  parseReviewQueue,
  readReviewQueue,
  serializeReviewEntry,
  type ReviewQueueEntry,
} from "./review-queue";

const tmpDirs: string[] = [];
function tmpQueue(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "grants-queue-"));
  tmpDirs.push(dir);
  return path.join(dir, "nested", "grants-review-queue.jsonl");
}
afterEach(() => {
  for (const d of tmpDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

const entry = (over: Partial<ReviewQueueEntry> = {}): ReviewQueueEntry => ({
  ts: "2026-09-13T04:00:00.000Z",
  kind: "grant",
  id: "rdti",
  url: "https://business.gov.au/x",
  reason: "status_mismatch",
  hint: { status: "closed", confidence: "medium" },
  current: { status: "open", closes_at: null },
  ...over,
});

describe("review-queue", () => {
  it("path is the gitignored reports file", () => {
    expect(REVIEW_QUEUE_PATH.endsWith(path.join("content", "reports", "grants-review-queue.jsonl"))).toBe(true);
  });

  it("serialize → parse round-trips and skips malformed / incomplete lines", () => {
    const lines = [serializeReviewEntry(entry()), "not json", '{"ts":"x"}', "", serializeReviewEntry(entry({ kind: "new", id: undefined, reason: "possible_new_grant", current: null }))];
    const parsed = parseReviewQueue(lines.join("\n"));
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toEqual(entry());
    expect(parsed[1]).toMatchObject({ kind: "new", reason: "possible_new_grant", current: null });
    expect(parsed[1].id).toBeUndefined();
  });

  it("append creates the directory, read returns newest-first limited, missing file → []", () => {
    const file = tmpQueue();
    expect(readReviewQueue(200, file)).toEqual([]);
    expect(appendReviewEntries([], file)).toBe(0);
    expect(fs.existsSync(file)).toBe(false);

    appendReviewEntries([entry({ id: "a" }), entry({ id: "b" })], file);
    appendReviewEntries([entry({ id: "c" })], file);
    expect(fs.readFileSync(file, "utf8").split("\n").filter(Boolean)).toHaveLength(3);
    expect(readReviewQueue(2, file).map((e) => e.id)).toEqual(["c", "b"]);
    expect(readReviewQueue(200, file).map((e) => e.id)).toEqual(["c", "b", "a"]);
  });

  it("countRecentReviewEntries counts only the last N days", () => {
    const file = tmpQueue();
    appendReviewEntries(
      [entry({ ts: "2026-09-01T00:00:00Z" }), entry({ ts: "2026-09-09T00:00:00Z" }), entry({ ts: "2026-09-10T01:00:00Z" })],
      file,
    );
    expect(countRecentReviewEntries(7, new Date("2026-09-10T12:00:00Z"), file)).toBe(2);
    expect(countRecentReviewEntries(30, new Date("2026-09-10T12:00:00Z"), file)).toBe(3);
  });
});
