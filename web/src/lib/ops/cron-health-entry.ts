// G33-T03 — one shape for cron-health.jsonl rows, shared by the watchdog route.

export interface CronHealthEntry {
  ts: string;
  endpoint: string;
  status: string;
  duration_ms: number;
  detail: string;
}

/**
 * G33-T03: cron-health.jsonl is appended by several writers. One of them
 * (ga4-daily-pull) wrote `{ cron, ok, at }` instead of `{ endpoint, status, ts }`,
 * and a single such row crashed this watchdog every night from 23/09 on. Map
 * the legacy shape and drop rows that still lack a string ts / endpoint.
 */
export function normaliseCronEntry(raw: unknown): CronHealthEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const ts = typeof r.ts === "string" ? r.ts : typeof r.at === "string" ? r.at : null;
  const endpoint = typeof r.endpoint === "string" ? r.endpoint : typeof r.cron === "string" ? r.cron : null;
  if (!ts || !endpoint) return null;
  const status = typeof r.status === "string" ? r.status : typeof r.ok === "boolean" ? (r.ok ? "ok" : "fail") : "unknown";
  return {
    ts,
    endpoint,
    status,
    duration_ms: typeof r.duration_ms === "number" ? r.duration_ms : 0,
    detail: typeof r.detail === "string" ? r.detail : typeof r.note === "string" ? r.note : "",
  };
}
