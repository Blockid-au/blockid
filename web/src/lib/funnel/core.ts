// G16-A — typed façade over the ONE funnel reducer (scripts/lib/funnel-core.mjs).
//
// The reducer is plain ESM so the daily cron runs it without a build; this
// file gives the TypeScript callers (traction snapshot, /admin/funnel live
// count) the same functions with explicit types + zod schemas for the files
// the cron writes. Nothing is re-implemented here — one source of truth.

import { z } from "zod";
import * as core from "../../../scripts/lib/funnel-core.mjs";

export interface FunnelEventRow {
  event_id?: string | null;
  event_name: string | null;
  user_id?: string | null;
  session_id?: string | null;
  params?: Record<string, unknown> | null;
  ts?: string | null;
  source?: string | null;
}

export const CONVERSION_KEYS = ["signup_to_analysis", "analysis_to_report", "report_to_paywall", "paywall_to_checkout", "checkout_to_paid"] as const;
export type ConversionKey = (typeof CONVERSION_KEYS)[number];

const nInt = z.number().int().nonnegative();

export const funnelCountsSchema = z.object({
  signups: nInt,
  analyses: nInt,
  first_analyses: nInt,
  report_views: nInt,
  paywall_views: nInt,
  checkouts: nInt,
  paid: nInt,
  gate_hits: z.record(z.string(), nInt),
  conv: z.object({
    signup_to_analysis: z.number().nullable(),
    analysis_to_report: z.number().nullable(),
    report_to_paywall: z.number().nullable(),
    paywall_to_checkout: z.number().nullable(),
    checkout_to_paid: z.number().nullable(),
  }),
  events: nInt,
  qa_excluded: nInt,
});
export type FunnelCounts = z.infer<typeof funnelCountsSchema>;

export const funnelDailyRowSchema = funnelCountsSchema.extend({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });
export type FunnelDailyRow = z.infer<typeof funnelDailyRowSchema>;

export const lastSignupSchema = z.object({
  user_prefix: z.string(),
  persona: z.string().nullable(),
  method: z.string().nullable(),
  ts: z.string().nullable(),
  furthest_step: z.string(),
});
export type LastSignup = z.infer<typeof lastSignupSchema>;

export const funnelLatestSchema = z.object({
  schema_version: z.literal(1),
  generated_at: z.string(),
  days: nInt,
  window: z.object({ from: z.string(), to: z.string() }),
  yesterday: funnelDailyRowSchema,
  d7: funnelCountsSchema,
  prev7: funnelCountsSchema,
  d28: funnelCountsSchema,
  last_signups: z.array(lastSignupSchema),
  // G21 P0-D — optional per-event tallies of the institutional catalogue (older files lack them).
  fi_events_28d: z.record(z.string(), nInt).optional(),
  fi_events_7d: z.record(z.string(), nInt).optional(),
});
export type FunnelLatest = z.infer<typeof funnelLatestSchema>;

/** Event names the funnel reads — the DB filter for the live "today" count. */
export const FUNNEL_EVENT_NAMES: readonly string[] = core.FUNNEL_EVENT_NAMES;
export const FUNNEL_STEPS: ReadonlyArray<{ key: keyof Pick<FunnelCounts, "signups" | "analyses" | "report_views" | "paywall_views" | "checkouts" | "paid">; event: string }> =
  core.FUNNEL_STEPS as never;

export const reduceFunnel = core.reduceFunnel as (rows: readonly FunnelEventRow[]) => FunnelCounts;
export const reduceDaily = core.reduceDaily as (rows: readonly FunnelEventRow[], opts: { days: number; now?: number | Date; includeToday?: boolean }) => FunnelDailyRow[];
export const rowsInWindow = core.rowsInWindow as (rows: readonly FunnelEventRow[], opts: { days: number; now?: number | Date; includeToday?: boolean; shift?: number }) => FunnelEventRow[];
export const lastSignups = core.lastSignups as (rows: readonly FunnelEventRow[], n?: number) => LastSignup[];
export const emptyCounts = core.emptyCounts as () => FunnelCounts;
export const dayString = core.dayString as (now: number | Date, daysAgo?: number) => string;
export const isQaRow = core.isQaRow as (row: FunnelEventRow) => boolean;
