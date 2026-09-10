// Human review queue for the AU funding catalogue (T0243, plan §4d).
//
// The weekly refresh cron never flips a row to `closed` on its own; anything
// that disagrees with the stored row, any page that blocked the bot, and any
// GrantConnect item that does not match an existing grant becomes one JSON
// line in `web/content/reports/grants-review-queue.jsonl` (gitignored —
// listed explicitly in the root .gitignore because that block is literal
// filenames, not a glob; see plan §9-pre G11-3). /admin/funding renders the
// last N lines read-only; the IR daily brief counts them.
//
// Pure helpers (`serializeReviewEntry`, `parseReviewQueue`) are separated
// from the fs wrappers so tests need no disk.

import * as fs from "fs";
import * as path from "path";

export type ReviewKind = "grant" | "program" | "new";

export type ReviewReason =
  | "blocked"
  | "unreachable"
  | "status_mismatch"
  | "closes_at_mismatch"
  | "status_closes_mismatch"
  | "flipped_open"
  | "possible_new_grant"
  | "feed_empty";

export interface ReviewQueueEntry {
  /** ISO timestamp of the run that queued it. */
  ts: string;
  kind: ReviewKind;
  /** au_grants.id / au_programs.id — absent for kind "new". */
  id?: string;
  url: string;
  reason: ReviewReason;
  /** What the source said (hint fields, HTTP status, feed title …). */
  hint: Record<string, unknown>;
  /** What the table currently holds (null for kind "new"). */
  current: Record<string, unknown> | null;
}

const WEB_DIR = process.env.BLOCKID_WEB_DIR ?? "/home/dovanlong/blockid.au/web";

/** Absolute path of the queue file (same dir as the other cron JSONLs). */
export const REVIEW_QUEUE_PATH = path.join(WEB_DIR, "content", "reports", "grants-review-queue.jsonl");

export function serializeReviewEntry(entry: ReviewQueueEntry): string {
  return JSON.stringify(entry);
}

/** Parse JSONL text → entries, newest last; malformed lines are skipped. */
export function parseReviewQueue(text: string): ReviewQueueEntry[] {
  const out: ReviewQueueEntry[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    try {
      const obj = JSON.parse(line) as Partial<ReviewQueueEntry>;
      if (!obj || typeof obj !== "object" || typeof obj.ts !== "string" || typeof obj.url !== "string" || !obj.kind || !obj.reason) continue;
      out.push({
        ts: obj.ts,
        kind: obj.kind,
        id: typeof obj.id === "string" ? obj.id : undefined,
        url: obj.url,
        reason: obj.reason,
        hint: obj.hint && typeof obj.hint === "object" ? obj.hint : {},
        current: obj.current && typeof obj.current === "object" ? obj.current : null,
      });
    } catch {
      /* skip malformed line */
    }
  }
  return out;
}

/** Append entries (one JSON per line). Creates the reports dir if needed. */
export function appendReviewEntries(entries: ReviewQueueEntry[], filePath: string = REVIEW_QUEUE_PATH): number {
  if (entries.length === 0) return 0;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, entries.map(serializeReviewEntry).join("\n") + "\n", "utf8");
  return entries.length;
}

/**
 * Last `limit` entries, newest first. Missing file → []. Reads the whole
 * file (it is small: a few hundred lines per year — the weekly disk cleanup
 * prunes JSONL state).
 */
export function readReviewQueue(limit = 200, filePath: string = REVIEW_QUEUE_PATH): ReviewQueueEntry[] {
  let text: string;
  try {
    text = fs.readFileSync(filePath, "utf8");
  } catch {
    return [];
  }
  const all = parseReviewQueue(text);
  return all.slice(-limit).reverse();
}

/** Entries queued in the last `days` days (default 7) — the "needs review" count for briefs. */
export function countRecentReviewEntries(days = 7, now: Date = new Date(), filePath: string = REVIEW_QUEUE_PATH): number {
  const cutoff = now.getTime() - days * 24 * 60 * 60 * 1000;
  return readReviewQueue(5000, filePath).filter((e) => {
    const t = Date.parse(e.ts);
    return Number.isFinite(t) && t >= cutoff;
  }).length;
}
