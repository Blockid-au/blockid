// G15-R2 — /api/status v2 extras, assembled here so app/api/status/route.ts
// only spreads one object into each payload (keeps the R1 merge trivial).
//
//   readStatusExtras(root)   full detail, cached 60 s in module scope, every
//                            section null-safe (a missing / malformed report
//                            file can never throw out of here)
//   publicStatusExtras(x)    the subset + redaction the anonymous payload and
//                            the /status page get: counts, states and
//                            timestamps only — no error text that could carry
//                            a path or host, no cron error detail

import { readAiStatus, type AiStatus } from "./ai";
import { readBackupsDetail, type BackupsDetail } from "./backups";
import { readCronFailures24h, type CronFailure } from "./crons";
import { readErrors1h, type Errors1h } from "./errors";
import { readQueues, type Queues } from "./queues";
import { readLatencySummary, type LatencySummary } from "./slo";

export const STATUS_EXTRAS_TTL_MS = 60 * 1000;

export type StatusExtras = {
  errors_1h: Errors1h | null;
  ai: AiStatus | null;
  queues: Queues;
  backups_detail: BackupsDetail;
  latency: LatencySummary | null;
  crons_failed_24h: CronFailure[];
};

export type PublicStatusExtras = {
  errors_1h: { total: number; classes: Array<{ tag: string; msg: string; count: number }> } | null;
  ai: { providers: Array<{ name: string; state: string }> | null; budget_exhausted_1h: number | null; models_healthy: number | null; models_total: number | null; fully_degraded_24h: number } | null;
  queues: Queues;
  backups_detail: BackupsDetail;
  latency_p95_ms: LatencySummary["latency_p95_ms"] | null;
  crons_failed_24h: Array<{ endpoint: string; count: number }>;
};

const NULL_QUEUES: Queues = { email_queued: null, email_failed_24h: null, webhook_failed_24h: null, report_orders_pending: null };
const NULL_BACKUPS: BackupsDetail = { local_last_ok_at: null, local_age_h: null, offsite_status: "never", offsite_last_at: null, restore_drill_last_ok_at: null };

let cache: { at: number; value: StatusExtras } | null = null;

export function _resetStatusExtrasCache(): void {
  cache = null;
}

async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch {
    return fallback;
  }
}

export async function readStatusExtras(root: string = process.cwd(), now: number = Date.now(), opts: { force?: boolean } = {}): Promise<StatusExtras> {
  if (!opts.force && cache && now - cache.at < STATUS_EXTRAS_TTL_MS) return cache.value;
  const [errors_1h, ai, queues, backups_detail, latency, crons_failed_24h] = await Promise.all([
    safe(readErrors1h(root, now), null),
    safe(readAiStatus(root, now), null),
    safe(readQueues(root, now), NULL_QUEUES),
    safe(readBackupsDetail(root, now), NULL_BACKUPS),
    safe(readLatencySummary(root, now), null),
    safe(readCronFailures24h(root, now), []),
  ]);
  const value: StatusExtras = { errors_1h, ai, queues, backups_detail, latency, crons_failed_24h };
  cache = { at: now, value };
  return value;
}

/** Error-class text with anything path/host/url-like removed (public payload + /status page). */
export function redactMessage(msg: string, max = 100): string {
  return msg
    .replace(/https?:\/\/[^\s"']+/g, "<url>")
    .replace(/(?:\/[\w.@<>-]+){2,}/g, "<path>")
    .replace(/\b[\w-]+(?:\.[\w-]+)*:\d{2,5}\b/g, "<host>") // host:port (docker-compose names, localhost:4001)
    .replace(/\b[\w-]+(?:\.[\w-]+){2,}\b/g, "<host>") // dotted internal hostnames
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function publicStatusExtras(x: StatusExtras): PublicStatusExtras {
  return {
    errors_1h: x.errors_1h ? { total: x.errors_1h.total, classes: x.errors_1h.classes.map((c) => ({ tag: c.tag, msg: redactMessage(c.msg), count: c.count })) } : null,
    ai: x.ai
      ? {
          providers: x.ai.providers ? x.ai.providers.map((p) => ({ name: p.name, state: p.state })) : null,
          budget_exhausted_1h: x.ai.budget_exhausted_1h,
          models_healthy: x.ai.model_health ? x.ai.model_health.healthy : null,
          models_total: x.ai.model_health ? x.ai.model_health.total : null,
          fully_degraded_24h: x.ai.fully_degraded_24h,
        }
      : null,
    queues: x.queues,
    backups_detail: x.backups_detail,
    latency_p95_ms: x.latency ? x.latency.latency_p95_ms : null,
    crons_failed_24h: x.crons_failed_24h.map((c) => ({ endpoint: c.endpoint, count: c.count })),
  };
}
