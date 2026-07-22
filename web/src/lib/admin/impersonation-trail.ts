// Pure builder for the P12.8 Impersonation trail tab on /admin/affiliate.
//
// Given a batch of audit_events rows (already filtered by actor='admin' and
// resource_type='app_users' with a resource_id inside the attribution set)
// plus a users lookup, groupImpersonationTrail() folds each row into a
// UI-ready shape sorted newest-first per target user. The Impersonation
// tab lifts admin.role.changed + admin.credits.granted (per goal file
// P12.8 action) plus the sibling admin.* actions that share the same
// audit shape (admin.plan.changed, admin.permissions.granted/revoked,
// admin.user.created) so a single OR filter surfaces the full admin
// touch history for each attributed user in one pass.

export const IMPERSONATION_ACTIONS = [
  "admin.role.changed",
  "admin.credits.granted",
  "admin.plan.changed",
  "admin.permissions.granted",
  "admin.permissions.revoked",
  "admin.user.created",
] as const;

export type ImpersonationAction = (typeof IMPERSONATION_ACTIONS)[number];

const ACTION_SET: ReadonlySet<string> = new Set(IMPERSONATION_ACTIONS);

export function isImpersonationAction(v: unknown): v is ImpersonationAction {
  return typeof v === "string" && ACTION_SET.has(v);
}

export interface AuditEventRow {
  id: number | string | bigint;
  ts: string;
  actor: string | null;
  action: string | null;
  resource_id: string | null;
  detail: unknown;
  user_id: string | null;
}

export interface ImpersonationEvent {
  id: string;
  ts_iso: string;
  action: ImpersonationAction;
  target_user_id: string;
  target_email_masked: string;
  actor_email: string | null;
  summary: string;
}

export interface ImpersonationGroup {
  target_user_id: string;
  target_email_masked: string;
  target_display_name: string | null;
  events: ImpersonationEvent[];
}

export interface UserLookupRow {
  id: string;
  email: string | null;
  display_name: string | null;
}

function toEpoch(ts: string): number {
  const n = new Date(ts).getTime();
  return Number.isFinite(n) ? n : 0;
}

function maskEmailPlain(email: string | null | undefined): string {
  if (!email) return "—";
  const at = email.indexOf("@");
  if (at <= 0) return "—";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const head = local.length <= 2 ? local : `${local.slice(0, 2)}`;
  return `${head}***@${domain}`;
}

function readString(detail: unknown, key: string): string | null {
  if (!detail || typeof detail !== "object") return null;
  const v = (detail as Record<string, unknown>)[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

function readNumber(detail: unknown, key: string): number | null {
  if (!detail || typeof detail !== "object") return null;
  const v = (detail as Record<string, unknown>)[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function summariseEvent(
  action: ImpersonationAction,
  detail: unknown,
): string {
  switch (action) {
    case "admin.role.changed": {
      const prev = readString(detail, "previous_role");
      const next = readString(detail, "new_role");
      if (prev && next) return `Role ${prev} → ${next}`;
      if (next) return `Role set to ${next}`;
      return "Role changed";
    }
    case "admin.credits.granted": {
      const amount = readNumber(detail, "amount");
      const reason = readString(detail, "reason");
      if (amount != null && reason) return `Granted ${amount} credits (${reason})`;
      if (amount != null) return `Granted ${amount} credits`;
      return "Credits granted";
    }
    case "admin.plan.changed": {
      const prev = readString(detail, "previous_plan");
      const next = readString(detail, "new_plan");
      const granted = readNumber(detail, "credits_granted");
      const base =
        prev && next ? `Plan ${prev} → ${next}` : next ? `Plan set to ${next}` : "Plan changed";
      return granted && granted > 0 ? `${base} (+${granted} credits)` : base;
    }
    case "admin.permissions.granted": {
      const perm = readString(detail, "permission");
      return perm ? `Granted permission ${perm}` : "Permission granted";
    }
    case "admin.permissions.revoked": {
      const perm = readString(detail, "permission");
      return perm ? `Revoked permission ${perm}` : "Permission revoked";
    }
    case "admin.user.created": {
      const seg = readString(detail, "segment");
      const at = readString(detail, "account_type");
      if (seg && at) return `Created user (${seg} / ${at})`;
      if (at) return `Created user (${at})`;
      return "Created user";
    }
  }
}

/**
 * Fold raw audit_events rows into per-target-user groups. Rows whose action
 * is not in IMPERSONATION_ACTIONS or whose resource_id is not in the
 * allowed-user set are skipped. Groups + events are sorted newest-first;
 * groups whose latest event is newest come first so an admin scrolling the
 * tab sees the most recent activity at the top without paging.
 */
export function buildImpersonationTrail(params: {
  events: AuditEventRow[];
  allowedUserIds: ReadonlySet<string>;
  users: ReadonlyMap<string, UserLookupRow>;
}): ImpersonationGroup[] {
  const { events, allowedUserIds, users } = params;
  const byTarget = new Map<string, ImpersonationEvent[]>();

  for (const row of events) {
    if (row.actor !== "admin") continue;
    if (!isImpersonationAction(row.action)) continue;
    const targetId = row.resource_id;
    if (!targetId || !allowedUserIds.has(targetId)) continue;

    const user = users.get(targetId) ?? null;
    const targetEmail = readString(row.detail, "target_email") ?? user?.email ?? null;
    const actorEmail = readString(row.detail, "actor_email");

    const bucket = byTarget.get(targetId) ?? [];
    bucket.push({
      id: String(row.id),
      ts_iso: row.ts,
      action: row.action,
      target_user_id: targetId,
      target_email_masked: maskEmailPlain(targetEmail),
      actor_email: actorEmail,
      summary: summariseEvent(row.action, row.detail),
    });
    byTarget.set(targetId, bucket);
  }

  const groups: ImpersonationGroup[] = [];
  for (const [targetId, evs] of byTarget) {
    evs.sort((a, b) => toEpoch(b.ts_iso) - toEpoch(a.ts_iso));
    const user = users.get(targetId) ?? null;
    groups.push({
      target_user_id: targetId,
      target_email_masked: maskEmailPlain(user?.email ?? null),
      target_display_name: user?.display_name ?? null,
      events: evs,
    });
  }

  groups.sort((a, b) => {
    const aLatest = a.events[0] ? toEpoch(a.events[0].ts_iso) : 0;
    const bLatest = b.events[0] ? toEpoch(b.events[0].ts_iso) : 0;
    return bLatest - aLatest;
  });

  return groups;
}

/**
 * Flatten trail groups into a single newest-first list — useful when the
 * UI wants a chronological stream rather than a per-user grouping.
 */
export function flattenImpersonationTrail(
  groups: ImpersonationGroup[],
): ImpersonationEvent[] {
  const out: ImpersonationEvent[] = [];
  for (const g of groups) {
    for (const e of g.events) out.push(e);
  }
  out.sort((a, b) => toEpoch(b.ts_iso) - toEpoch(a.ts_iso));
  return out;
}
