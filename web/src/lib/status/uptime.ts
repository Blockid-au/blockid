// G15 follow-up (2026-09-18) — uptime from the 2-minute guardian probe.
//
// `slo.uptime_pct_24h` used to be the mean ok-rate of the cron catalogue,
// which reports 97.5 % on a day the guardian measured ≈ 99.4 %: cron
// failures (a Drive-quota backup, an agent timeout) are not downtime.
// The guardian writes one row per probe (`healthy` 1/0, `http_local`), so
// 24 h ≈ 720 rows; fewer than 60 rows (2 h) is too thin to publish.
import { readJsonlTail, getStatusRoot, withinLast } from "./jsonl";

export const UPTIME_GUARDIAN_FILE = "uptime-guardian.jsonl";
export const UPTIME_MIN_ROWS = 60;

type Row = { ts?: unknown; healthy?: unknown };

export type UptimeSummary = { uptime_pct_24h: number; probes_24h: number; unhealthy_24h: number; source: "guardian" };

/** Pure reducer — exported for tests. */
export function summariseUptime(rows: Row[], now: number): UptimeSummary | null {
  const recent = rows.filter((r) => typeof r.ts === "string" && withinLast(r.ts, 24 * 60 * 60 * 1000, now));
  if (recent.length < UPTIME_MIN_ROWS) return null;
  const unhealthy = recent.filter((r) => Number(r.healthy) !== 1).length;
  const pct = Math.round(((recent.length - unhealthy) / recent.length) * 1000) / 10;
  return { uptime_pct_24h: pct, probes_24h: recent.length, unhealthy_24h: unhealthy, source: "guardian" };
}

export async function readUptimeSummary(root: string = getStatusRoot(), now: number = Date.now()): Promise<UptimeSummary | null> {
  try {
    const rows = await readJsonlTail<Row>(root, UPTIME_GUARDIAN_FILE, 800);
    return summariseUptime(rows, now);
  } catch {
    return null;
  }
}
