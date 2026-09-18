// G15-R2 — /api/status.crons_failed_24h from content/reports/cron-health.jsonl
// (E8: failures only reached Telegram). One row per endpoint that failed in
// the last 24 h: how often and the newest error detail (trimmed, redacted of
// anything that looks like a path, URL or bearer). The existing `crons`
// catalogue (per-job ok-rate) is untouched — this is the failure view.

import { readJsonlTail, tsMs, withinLast, getStatusRoot } from "./jsonl";

export const CRON_HEALTH_FILE = "cron-health.jsonl";
export const CRON_FAILED_MAX_ROWS = 20;

export type CronFailure = { endpoint: string; count: number; last_ts: string; last_error: string };

type Row = { ts?: unknown; endpoint?: unknown; cron?: unknown; status?: unknown; ok?: unknown; detail?: unknown };

/** Strip paths / URLs / tokens from free-text error detail before it leaves the box. */
export function redactDetail(s: unknown, max = 160): string {
  if (typeof s !== "string") return "";
  return s
    .replace(/https?:\/\/[^\s"']+/g, "<url>")
    .replace(/(?:\/[\w.@-]+){2,}/g, "<path>")
    .replace(/\b(?:Bearer|token|secret|key)\s*[:=]?\s*[A-Za-z0-9_\-.]{12,}/gi, "<redacted>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/** Pure reducer — exported for tests. */
export function summariseCronFailures(rows: Row[], now: number = Date.now()): CronFailure[] {
  const map = new Map<string, CronFailure & { last_ms: number }>();
  for (const r of rows) {
    const name = String(r.endpoint ?? r.cron ?? "").trim();
    if (!name || !withinLast(r.ts, 24 * 60 * 60 * 1000, now)) continue;
    const ok = typeof r.ok === "boolean" ? r.ok : String(r.status ?? "").toLowerCase() === "ok";
    if (ok) continue;
    const t = tsMs(r.ts);
    const cur = map.get(name);
    if (cur) {
      cur.count += 1;
      if (t >= cur.last_ms) {
        cur.last_ms = t;
        cur.last_ts = String(r.ts);
        cur.last_error = redactDetail(r.detail);
      }
    } else {
      map.set(name, { endpoint: name, count: 1, last_ts: String(r.ts), last_ms: t, last_error: redactDetail(r.detail) });
    }
  }
  return [...map.values()]
    .sort((a, b) => b.count - a.count || b.last_ms - a.last_ms)
    .slice(0, CRON_FAILED_MAX_ROWS)
    .map(({ endpoint, count, last_ts, last_error }) => ({ endpoint, count, last_ts, last_error }));
}

export async function readCronFailures24h(root: string = getStatusRoot(), now: number = Date.now()): Promise<CronFailure[]> {
  try {
    const rows = await readJsonlTail<Row>(root, CRON_HEALTH_FILE, 2500);
    return summariseCronFailures(rows, now);
  } catch {
    return [];
  }
}
