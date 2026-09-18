// G15-R2 — /api/status.errors_1h from content/reports/error-digest.jsonl
// (written every 10 min by scripts/error-digest.mjs). Sums the windows that
// fall inside the last hour and returns the top-5 classes. `null` when the
// digest has never run — the route must not invent zeros.

import { readJsonlTail, withinLast } from "./jsonl";

export const ERROR_DIGEST_FILE = "error-digest.jsonl";
export const ERRORS_WINDOW_MS = 60 * 60 * 1000;
export const ERRORS_TOP_N = 5;

export type ErrorClass = { tag: string; msg: string; count: number };
export type Errors1h = { total: number; classes: ErrorClass[]; windows: number; last_ts: string };

type DigestRow = { ts?: unknown; total?: unknown; classes?: unknown };

/** Pure reducer — exported for tests. */
export function summariseErrors(rows: DigestRow[], now: number = Date.now()): Errors1h | null {
  if (rows.length === 0) return null;
  const merged = new Map<string, ErrorClass>();
  let total = 0;
  let windows = 0;
  let last = "";
  for (const row of rows) {
    if (!withinLast(row.ts, ERRORS_WINDOW_MS, now)) continue;
    windows += 1;
    if (typeof row.ts === "string" && row.ts > last) last = row.ts;
    total += typeof row.total === "number" && Number.isFinite(row.total) ? row.total : 0;
    if (!Array.isArray(row.classes)) continue;
    for (const c of row.classes as Array<Record<string, unknown>>) {
      if (!c || typeof c !== "object") continue;
      const tag = typeof c.tag === "string" ? c.tag : "untagged";
      const msg = typeof c.msg === "string" ? c.msg : "";
      const count = typeof c.count === "number" && Number.isFinite(c.count) ? c.count : 0;
      const key = `${tag}|${msg}`;
      const cur = merged.get(key);
      if (cur) cur.count += count;
      else merged.set(key, { tag, msg, count });
    }
  }
  if (windows === 0) return { total: 0, classes: [], windows: 0, last_ts: "" };
  const classes = [...merged.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag)).slice(0, ERRORS_TOP_N);
  return { total, classes, windows, last_ts: last };
}

export async function readErrors1h(root: string = process.cwd(), now: number = Date.now()): Promise<Errors1h | null> {
  try {
    const rows = await readJsonlTail<DigestRow>(root, ERROR_DIGEST_FILE, 12);
    return summariseErrors(rows, now);
  } catch {
    return null;
  }
}
