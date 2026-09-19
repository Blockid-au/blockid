// G16-A — server readers for /admin/funnel.
//
//   readFunnelDaily(root)   → the last N validated rows of content/reports/funnel-daily.jsonl
//   readFunnelLatest(root)  → content/reports/funnel-latest.json (yesterday / 7 d / 28 d / last sign-ups)
//   liveTodayFunnel(client) → today's (UTC) counts straight from analytics_events, same reducer
//
// Files are read from the LIVE checkout (lib/status/jsonl.ts getStatusRoot) —
// on production process.cwd() is the release dir the cron never writes to.
// Every reader is fail-soft: a missing / malformed file or a failed query is
// reported as null + a warning string, never a throw and never a 0 that
// looks like a measurement.

import { getStatusRoot, readJsonFile, readJsonlTail, REPORTS_DIR } from "@/lib/status/jsonl";
import {
  FUNNEL_EVENT_NAMES,
  dayString,
  funnelDailyRowSchema,
  funnelLatestSchema,
  reduceFunnel,
  type FunnelCounts,
  type FunnelDailyRow,
  type FunnelEventRow,
  type FunnelLatest,
} from "./core";

export const FUNNEL_DAILY_FILE = "funnel-daily.jsonl";
export const FUNNEL_LATEST_FILE = `${REPORTS_DIR}/funnel-latest.json`;
/** The daily cron runs 02:50 UTC; a file older than 26 h means it stopped. */
export const FUNNEL_MAX_AGE_MS = 26 * 60 * 60 * 1000;

export type FunnelFileStatus = "ok" | "stale" | "missing";

export function funnelStatusFrom(latest: { generated_at?: unknown } | null, now: number = Date.now()): FunnelFileStatus {
  if (!latest || typeof latest !== "object") return "missing";
  const ts = typeof latest.generated_at === "string" ? Date.parse(latest.generated_at) : Number.NaN;
  if (!Number.isFinite(ts)) return "missing";
  return now - ts < FUNNEL_MAX_AGE_MS ? "ok" : "stale";
}

/** Validated daily rows, oldest first (invalid lines dropped). */
export async function readFunnelDaily(root: string = getStatusRoot(), maxRows = 60): Promise<FunnelDailyRow[]> {
  const raw = await readJsonlTail<Record<string, unknown>>(root, FUNNEL_DAILY_FILE, maxRows);
  const out: FunnelDailyRow[] = [];
  for (const r of raw) {
    const parsed = funnelDailyRowSchema.safeParse(r);
    if (parsed.success) out.push(parsed.data);
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** The latest rollup file, validated, or null. */
export async function readFunnelLatest(root: string = getStatusRoot()): Promise<{ latest: FunnelLatest | null; status: FunnelFileStatus; error: string | null }> {
  const raw = await readJsonFile<Record<string, unknown>>(root, FUNNEL_LATEST_FILE);
  if (!raw) return { latest: null, status: "missing", error: null };
  const parsed = funnelLatestSchema.safeParse(raw);
  if (!parsed.success) return { latest: null, status: funnelStatusFrom(raw), error: "funnel-latest.json does not match the current schema — re-run scripts/funnel-report.mjs" };
  return { latest: parsed.data, status: funnelStatusFrom(parsed.data), error: null };
}

/** The slice of supabase-js the live count needs (mockable). */
export interface FunnelLiveClient {
  from: (table: string) => {
    select: (cols: string) => {
      in: (col: string, v: readonly string[]) => {
        gte: (col: string, v: string) => {
          order: (col: string, opts: { ascending: boolean }) => {
            limit: (n: number) => PromiseLike<{ data: unknown[] | null; error: { message?: string } | null }>;
          };
        };
      };
    };
  };
}

export const LIVE_TODAY_LIMIT = 5000;

/** Narrow a supabase-js client to the slice above (mirrors asTractionClient — avoids TS2589 on the full generic type). */
export function asFunnelLiveClient(client: unknown): FunnelLiveClient | null {
  return client ? (client as FunnelLiveClient) : null;
}

/**
 * Today-so-far (UTC) funnel counts straight from analytics_events, through
 * the same reducer the cron uses. `null` + warning on any failure.
 */
export async function liveTodayFunnel(
  client: FunnelLiveClient | null,
  now: number = Date.now(),
): Promise<{ counts: FunnelCounts | null; date: string; warning: string | null }> {
  const date = dayString(now, 0);
  if (!client) return { counts: null, date, warning: "supabase not configured" };
  try {
    const { data, error } = await client
      .from("analytics_events")
      .select("event_id, event_name, user_id, session_id, params, ts, source")
      .in("event_name", FUNNEL_EVENT_NAMES)
      .gte("ts", `${date}T00:00:00.000Z`)
      .order("ts", { ascending: true })
      .limit(LIVE_TODAY_LIMIT);
    if (error) return { counts: null, date, warning: `analytics_events: ${error.message ?? "query failed"}` };
    const rows = (data ?? []) as FunnelEventRow[];
    const warning = rows.length >= LIVE_TODAY_LIMIT ? `analytics_events: today capped at ${LIVE_TODAY_LIMIT} rows` : null;
    return { counts: reduceFunnel(rows), date, warning };
  } catch (err) {
    return { counts: null, date, warning: `analytics_events: ${err instanceof Error ? err.message : String(err)}` };
  }
}
