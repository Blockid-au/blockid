// G35 Pricing v5 P4 — Verified review SLA breach alerts (plan §6.6:
// "cron notifications kiểm IN_REVIEW quá sla_due_at → cảnh báo admin (email
// ops, dedup)"). Driven by /api/cron/verified-review-sla every 30 minutes.
//
// For every IN_REVIEW order with an SLA:
//   overdue   now > sla_due_at
//   due_soon  ≤ 4 business hours (09:00–17:00 Sydney, business days) left
// each (order, level) pair alerts the admin ONCE:
//   * a `founder_notifications` row for the platform admin (kind
//     `verified_review_sla`, payload.dedupeKey `verified_sla:<level>:<order>`)
//     — that row IS the dedupe record (looked up without a time window);
//   * one ops e-mail per run (lib/ops-alert-email.ts, T-class "ops-alert")
//     listing only the pairs that alerted for the first time this run.
// No admin app_user → nothing can be deduped → nothing is sent (reported as
// `no_admin_user` so cron-health shows it). A refunded order is no longer
// IN_REVIEW, so it is never alerted.

import type { SupabaseClient } from "@supabase/supabase-js";
import { describeSla, type SlaSummary } from "./sla";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = Pick<SupabaseClient<any, any, any>, "from">;
type Row = Record<string, unknown>;

export const SLA_ALERT_KIND = "verified_review_sla" as const;
export type SlaAlertLevel = "overdue" | "due_soon";

export function slaAlertKey(level: SlaAlertLevel, orderId: string): string {
  return `verified_sla:${level}:${orderId}`;
}

export interface SlaAlert {
  orderId: string;
  level: SlaAlertLevel;
  startupName: string | null;
  sla: SlaSummary;
}

export interface SlaAlertDeps {
  now?: () => Date;
  adminUserId?: () => Promise<string | null>;
  notify?: (args: { userId: string; projectId: string | null; payload: Record<string, unknown>; dedupeKey: string }) => Promise<boolean>;
  sendOpsEmail?: (args: { to: string; subject: string; text: string }) => Promise<boolean>;
  track?: (name: string, params: Record<string, unknown>) => Promise<unknown>;
  alertTo?: () => string;
  siteUrl?: () => string;
}

export interface SlaAlertRun {
  ok: boolean;
  dry: boolean;
  checked: number;
  overdue: number;
  dueSoon: number;
  alerted: SlaAlert[];
  /** Pairs skipped because they had already alerted. */
  deduped: number;
  emailed: boolean;
  reason?: "migration_pending" | "no_admin_user" | "db_error";
}

const TEN_YEARS_MS = 10 * 365 * 24 * 3_600_000;

async function defaultAdminUserId(db: Db): Promise<string | null> {
  try {
    const email = (process.env.ADMIN_EMAIL ?? "admin@blockid.au").trim().toLowerCase();
    const { data } = await db.from("app_users").select("id").eq("email", email).maybeSingle();
    return ((data as Row | null)?.id as string | undefined) ?? null;
  } catch {
    return null;
  }
}

async function alreadyAlerted(db: Db, adminId: string, key: string): Promise<boolean> {
  try {
    const { data } = await db
      .from("founder_notifications")
      .select("id")
      .eq("user_id", adminId)
      .eq("kind", SLA_ALERT_KIND)
      .contains("payload", { dedupeKey: key })
      .limit(1)
      .maybeSingle();
    return Boolean(data);
  } catch {
    // Unreadable dedupe store: treat as alerted so a broken read never spams.
    return true;
  }
}

/** Pure: which (order, level) pairs are alert-worthy right now. */
export function slaAlertCandidates(orders: readonly Row[], now: Date, names: ReadonlyMap<string, string> = new Map()): SlaAlert[] {
  const out: SlaAlert[] = [];
  for (const o of orders) {
    if (o.status !== "IN_REVIEW") continue;
    const sla = describeSla(o.sla_due_at, now);
    if (sla.state !== "overdue" && sla.state !== "due_soon") continue;
    const projectId = typeof o.business_id === "string" ? o.business_id : null;
    out.push({ orderId: String(o.id), level: sla.state, startupName: projectId ? (names.get(projectId) ?? null) : null, sla });
  }
  // Overdue first, most overdue first; then soonest deadline.
  return out.sort((a, b) => (a.level === b.level ? (a.level === "overdue" ? b.sla.overdueMs - a.sla.overdueMs : (a.sla.dueAt ?? "").localeCompare(b.sla.dueAt ?? "")) : a.level === "overdue" ? -1 : 1));
}

export function slaAlertEmail(alerts: readonly SlaAlert[], siteUrl: string): { subject: string; text: string } {
  const overdue = alerts.filter((a) => a.level === "overdue").length;
  const soon = alerts.length - overdue;
  const head = [overdue ? `${overdue} overdue` : null, soon ? `${soon} due soon` : null].filter(Boolean).join(", ");
  const lines = alerts.map((a) => {
    const tag = a.level === "overdue" ? "OVERDUE " : "DUE SOON";
    return `${tag}  ${a.startupName ?? "(unnamed startup)"} — ${a.sla.line} · due ${a.sla.dueLabel ?? "?"}\n          ${siteUrl}/admin/verified-reviews/${a.orderId}`;
  });
  return {
    subject: `Verified review SLA: ${head}`,
    text: [`Verified report reviews need attention (${head}).`, "", ...lines, "", `Queue: ${siteUrl}/admin/verified-reviews`, "SLA: 2 Sydney business days (NSW holidays excluded). Each order alerts once per level."].join("\n"),
  };
}

export async function runVerifiedReviewSlaAlerts(db: Db, opts: { dry?: boolean } = {}, deps: SlaAlertDeps = {}): Promise<SlaAlertRun> {
  const now = (deps.now ?? (() => new Date()))();
  const dry = Boolean(opts.dry);
  const base: SlaAlertRun = { ok: true, dry, checked: 0, overdue: 0, dueSoon: 0, alerted: [], deduped: 0, emailed: false };

  let orders: Row[];
  try {
    const { data, error } = await db.from("report_orders").select("id, business_id, status, sla_due_at").eq("status", "IN_REVIEW").limit(500);
    if (error) {
      const code = (error as { code?: string }).code;
      return { ...base, ok: code === "42703" || code === "PGRST204", reason: code === "42703" || code === "PGRST204" ? "migration_pending" : "db_error" };
    }
    orders = (data ?? []) as Row[];
  } catch {
    return { ...base, ok: false, reason: "db_error" };
  }

  const names = new Map<string, string>();
  const projectIds = [...new Set(orders.map((o) => (typeof o.business_id === "string" ? o.business_id : null)).filter((v): v is string => !!v))];
  if (projectIds.length) {
    try {
      const { data } = await db.from("projects").select("id, name").in("id", projectIds);
      for (const p of (data ?? []) as Row[]) if (typeof p.name === "string") names.set(String(p.id), p.name);
    } catch {
      /* names are decoration */
    }
  }

  const candidates = slaAlertCandidates(orders, now, names);
  const run: SlaAlertRun = {
    ...base,
    checked: orders.length,
    overdue: candidates.filter((c) => c.level === "overdue").length,
    dueSoon: candidates.filter((c) => c.level === "due_soon").length,
  };
  if (candidates.length === 0) return run;

  const adminId = await (deps.adminUserId ?? (() => defaultAdminUserId(db)))();
  if (!adminId) return { ...run, reason: "no_admin_user" };

  const notify =
    deps.notify ??
    (async (a: { userId: string; projectId: string | null; payload: Record<string, unknown>; dedupeKey: string }) => {
      const { insertNotification } = await import("@/lib/notifications");
      return insertNotification({ userId: a.userId, projectId: a.projectId, kind: SLA_ALERT_KIND, payload: a.payload, dedupeKey: a.dedupeKey, throttleMs: TEN_YEARS_MS });
    });

  for (const c of candidates) {
    const key = slaAlertKey(c.level, c.orderId);
    if (await alreadyAlerted(db, adminId, key)) {
      run.deduped++;
      continue;
    }
    if (dry) {
      run.alerted.push(c);
      continue;
    }
    const order = orders.find((o) => String(o.id) === c.orderId);
    const written = await notify({
      userId: adminId,
      projectId: null, // the admin's feed row; the startup is named in the payload
      dedupeKey: key,
      payload: { level: c.level, order_id: c.orderId, startup: c.startupName, due_at: c.sla.dueAt, due_label: c.sla.dueLabel, line: c.sla.line, project_id: typeof order?.business_id === "string" ? order.business_id : null },
    });
    if (written) run.alerted.push(c);
    else run.deduped++;
  }

  if (!dry && run.alerted.length > 0) {
    const site = (deps.siteUrl ?? (() => (process.env.NEXT_PUBLIC_SITE_URL || "https://blockid.au").replace(/\/$/, "")))();
    const mail = slaAlertEmail(run.alerted, site);
    const to = (deps.alertTo ?? (() => process.env.ALERT_EMAIL || process.env.ADMIN_EMAIL || "admin@blockid.au"))();
    try {
      const send = deps.sendOpsEmail ?? (async (a) => (await import("@/lib/ops-alert-email")).sendOpsAlertEmail(a));
      run.emailed = await send({ to, subject: mail.subject, text: mail.text });
    } catch {
      run.emailed = false;
    }
    const track = deps.track ?? (async (name: string, params: Record<string, unknown>) => (await import("@/lib/analytics/events")).trackEvent(name as never, params as never, { eventId: `${name}:${params.level}:${params.order_id}` }));
    for (const a of run.alerted) {
      try {
        await track("payg_verified_sla_alert", { order_id: a.orderId, level: a.level, overdue_ms: a.sla.overdueMs, business_ms_left: a.sla.businessMsLeft });
      } catch {
        /* analytics never blocks */
      }
    }
  }
  return run;
}
