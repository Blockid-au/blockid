// G15-R2 — /api/status.slo.latency_p95_ms from content/reports/latency.jsonl
// (scripts/latency-sample.mjs, every 10 min). Takes the newest window that is
// not older than 30 min (three missed ticks = stale) and reports p95 per route
// class; a class with no timing data (nginx still on the combined log_format)
// or fewer than MIN_N requests is null. `null` overall when the sampler has
// never run or the newest row is stale.

import { readJsonlTail, withinLast, getStatusRoot } from "./jsonl";

export const LATENCY_FILE = "latency.jsonl";
export const LATENCY_STALE_MS = 30 * 60 * 1000;
export const LATENCY_MIN_N = 5;
export const LATENCY_CLASSES = ["marketing", "workspace", "api_ai", "api_other", "tbr"] as const;
export type LatencyClass = (typeof LATENCY_CLASSES)[number];

export type LatencyP95 = Record<LatencyClass, number | null>;
export type LatencySummary = {
  ts: string;
  latency_p95_ms: LatencyP95;
  err_rate_5xx: Record<LatencyClass, number | null>;
  requests: number;
  timing: boolean;
};

type Row = { ts?: unknown; timing?: unknown; classes?: unknown };
type ClassRow = { n?: unknown; p95_ms?: unknown; err_rate_5xx?: unknown };

/** Pure reducer — exported for tests. */
export function summariseLatency(rows: Row[], now: number = Date.now()): LatencySummary | null {
  let newest: Row | null = null;
  for (const r of rows) {
    if (!withinLast(r.ts, LATENCY_STALE_MS, now)) continue;
    if (!newest || String(r.ts) > String(newest.ts)) newest = r;
  }
  if (!newest || !newest.classes || typeof newest.classes !== "object") return null;
  const classes = newest.classes as Record<string, ClassRow>;
  const p95 = {} as LatencyP95;
  const err = {} as Record<LatencyClass, number | null>;
  let requests = 0;
  for (const name of LATENCY_CLASSES) {
    const c = classes[name];
    const n = c && typeof c.n === "number" ? c.n : 0;
    requests += n;
    const enough = n >= LATENCY_MIN_N;
    p95[name] = enough && c && typeof c.p95_ms === "number" && Number.isFinite(c.p95_ms) ? Math.round(c.p95_ms) : null;
    err[name] = enough && c && typeof c.err_rate_5xx === "number" && Number.isFinite(c.err_rate_5xx) ? c.err_rate_5xx : null;
  }
  return { ts: String(newest.ts), latency_p95_ms: p95, err_rate_5xx: err, requests, timing: newest.timing === true };
}

export async function readLatencySummary(root: string = getStatusRoot(), now: number = Date.now()): Promise<LatencySummary | null> {
  try {
    const rows = await readJsonlTail<Row>(root, LATENCY_FILE, 6);
    return summariseLatency(rows, now);
  } catch {
    return null;
  }
}
