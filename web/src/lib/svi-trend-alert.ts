// svi_trend_alert writer (T0246, plan §4h "Valuation refresh").
//
// The `svi_trend_alert` notification kind has existed since Wave 27C with
// no writer. The weekly svi-snapshot cron computes each account's delta vs
// its prior snapshot; this helper turns a delta of at least
// SVI_TREND_ALERT_THRESHOLD points (either direction) into one
// `founder_notifications` row per (project, snapshot day) via the
// dedupeKey `svi_trend:<project|account>:<snapshot_date>` + a one-week
// throttle, so a re-run of the cron on the same day writes nothing.
//
// Pure decision (`sviTrendAlertDecision`) + a thin writer that takes the
// notification sink so the cron route and the tests share the same code.
// Colocated tests: svi-trend-alert.test.ts.

import "server-only";
import { insertNotification } from "@/lib/notifications";

/** |delta| at or above this fires the alert. */
export const SVI_TREND_ALERT_THRESHOLD = 5;
/** One alert per (project, snapshot_date); re-runs inside a week are absorbed. */
export const SVI_TREND_ALERT_THROTTLE_MS = 7 * 24 * 60 * 60 * 1000;

export interface SviTrendAlertInput {
  userId: string | null | undefined;
  projectId: string | null | undefined;
  /** Fallback scope for the dedupe key when there is no project. */
  accountId: string;
  /** Points vs the prior snapshot; null on the first snapshot. */
  delta: number | null | undefined;
  sviTotal: number;
  /** ISO day (YYYY-MM-DD). */
  snapshotDate: string;
}

export interface SviTrendAlertPlan {
  userId: string;
  projectId: string | null;
  kind: "svi_trend_alert";
  payload: { delta: number; svi_total: number; snapshot_date: string; direction: "up" | "down" };
  dedupeKey: string;
  throttleMs: number;
}

export function sviTrendDedupeKey(scope: string, snapshotDate: string): string {
  return `svi_trend:${scope}:${snapshotDate}`;
}

/** Null when nothing should be written (no user, no prior, below threshold). */
export function sviTrendAlertDecision(input: SviTrendAlertInput, threshold = SVI_TREND_ALERT_THRESHOLD): SviTrendAlertPlan | null {
  if (!input.userId) return null;
  const delta = input.delta;
  if (typeof delta !== "number" || !Number.isFinite(delta)) return null;
  if (Math.abs(delta) < threshold) return null;
  const rounded = Math.round(delta * 10) / 10;
  return {
    userId: input.userId,
    projectId: input.projectId ?? null,
    kind: "svi_trend_alert",
    payload: {
      delta: rounded,
      svi_total: input.sviTotal,
      snapshot_date: input.snapshotDate,
      direction: rounded > 0 ? "up" : "down",
    },
    dedupeKey: sviTrendDedupeKey(input.projectId ?? input.accountId, input.snapshotDate),
    throttleMs: SVI_TREND_ALERT_THROTTLE_MS,
  };
}

export type NotificationSink = (args: SviTrendAlertPlan) => Promise<void>;

/**
 * Write the alert when warranted. Returns true when a row was attempted.
 * `insertNotification` is fail-open, so this never throws into the cron.
 */
export async function maybeWriteSviTrendAlert(
  input: SviTrendAlertInput,
  sink: NotificationSink = (args) => insertNotification(args),
): Promise<boolean> {
  const plan = sviTrendAlertDecision(input);
  if (!plan) return false;
  await sink(plan);
  return true;
}
