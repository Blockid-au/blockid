// Privacy retention sweep (S15-A, 2026-09-11).
//
// Mechanises the retention periods the Privacy Policy v2.2 states in clause
// 4 (`content/legal/privacy-v2.mdx`, "## 4. Retention (APP 11.2)") for the
// tables migrations 0311–0327 added. `RETENTION_RULES` is the declarative
// mirror of that table — one entry per policy row that carries a fixed
// period — and `retention.test.ts` parses the MDX table and asserts the days
// per row so the policy and this file cannot drift in either direction.
//
// Principles (APP 11.2 — destroy or de-identify when no longer needed):
//   • Bounded. Every rule touches at most `MAX_BATCH_ROWS` (500) rows per
//     tick, oldest first; the weekly cron catches up over a few ticks after
//     a long gap rather than locking a table.
//   • Never a live subscription. `funding_matches` of a user whose Founder
//     Radar is active (plan flag, entitlement grant, timed grant, or A$3
//     buyer inside the sweep's 90-day window — exactly the audience
//     `createSupabaseRadarStore().listSubscribers()` computes) are left
//     alone; `funding_reports` with `user_id` set (members) never age out —
//     only GUEST rows do; the `radar_setup*` drip rows that enforce the
//     "at most twice" activation cap are kept while the subscriber is live.
//   • Anonymise where the policy says so. A guest Money Finder report keeps
//     its Stripe identifiers, intake, and narrative for the 7-year financial
//     period; only the email address and the access link die at 12 months.
//   • Fail closed. If the active-subscriber set cannot be computed, the
//     rules that depend on it are skipped for the tick (recorded as an
//     error in the audit line) instead of deleting a live user's rows.
//   • Auditable. One JSON line per rule per tick goes to
//     `content/reports/retention-history.jsonl` (gitignored) unless dry-run.
//
// Route: /api/cron/privacy-retention (Bearer CRON_SECRET, `?dry=1`).
// Crontab: `15 3 * * 1` — Monday after the Sunday funding crons.

import "server-only";
import fs from "node:fs";
import path from "node:path";

export type RetentionMode = "delete" | "anonymise" | "expire";

export interface RetentionRule {
  /** Stable slug used in audit lines and the route summary. */
  id: string;
  table: string;
  /** Timestamp column the age is measured from. */
  column: string;
  /** Retention period in days, as the policy states it (12 months = 365). */
  days: number;
  /**
   * delete    — the row is removed.
   * anonymise — personal columns are nulled, the row (revenue / audit) stays.
   * expire    — a secret on the row is nulled, the row stays.
   */
  mode: RetentionMode;
  /** Human-readable scope; the applier below enforces the same predicate. */
  where?: string;
  /** Substring that uniquely identifies the policy row's "Data class" cell. */
  policyRow: string;
  note: string;
}

export const MAX_BATCH_ROWS = 500;
export const DEFAULT_BATCH_ROWS = 500;

/** Policy rows with a fixed period that are NOT database tables — outside this sweep. */
export const NON_SWEEP_POLICY_ROWS: readonly { policyRow: string; handledBy: string }[] = [
  { policyRow: "Financial records", handledBy: "Kept for 7 years — never swept; Stripe + credit_transactions are the record." },
  { policyRow: "Application, security, and access logs", handledBy: "nginx / journald logrotate (30 d) — not a database table." },
];

export const RETENTION_RULES: readonly RetentionRule[] = Object.freeze([
  {
    id: "guest_funding_reports",
    table: "funding_reports",
    column: "created_at",
    days: 365,
    mode: "anonymise",
    where: "user_id is null and guest_email is not null",
    policyRow: "Money Finder reports (guest, A$3)",
    note:
      "Guest A$3 report: 12 months from purchase the access link is disabled (access_token → null) and the email removed (guest_email → null). stripe_session_id / meta payment ids, intake, and narrative stay for the 7-year financial period. Member rows (user_id set) never age out.",
  },
  {
    id: "radar_matches",
    table: "funding_matches",
    column: "last_seen_at",
    days: 90,
    mode: "delete",
    where: "user_id not in (active Founder Radar subscribers)",
    policyRow: "Founder Radar matches",
    note:
      "Radar active + 90 days: the weekly sweep re-stamps last_seen_at for every live subscriber, so a row older than 90 days belongs to a lapsed subscriber or a match that dropped. Rows of a currently active subscriber are never deleted here.",
  },
  {
    id: "email_drips",
    table: "email_drips",
    column: "sent_at",
    days: 90,
    mode: "delete",
    where: "status <> 'pending' (send date = coalesce(sent_at, scheduled_for)); radar_setup* rows of active subscribers kept",
    policyRow: "Radar and onboarding email records",
    note:
      "90 days after the send date. Pending (not yet sent) rows are never touched; cancelled / expired / failed rows use scheduled_for as the send date. The two radar_setup drips enforce the 'at most twice' activation cap and are kept while the subscriber's Radar is active.",
  },
  {
    id: "evaluator_claim_tokens",
    table: "evaluations",
    column: "invited_at",
    days: 90,
    mode: "expire",
    where: "invite_token is not null",
    policyRow: "Evaluator invitation and claim tokens",
    note:
      "Claim link dies 90 days after issue (invite_token → null); the evaluation row itself lives with the evaluator's account (clause 2C). A claimed link is already single-use via founder_user_id.",
  },
]);

export function ruleById(id: string): RetentionRule | undefined {
  return RETENTION_RULES.find((r) => r.id === id);
}

/** `now - days`, ISO. Exported for the colocated test. */
export function cutoffIso(now: Date, days: number): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString();
}

// ─── Supabase surface ────────────────────────────────────────────────────────

export interface RetentionDb {
  from(table: string): any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

type Row = Record<string, unknown>;

interface ApplierContext {
  now: Date;
  cutoff: string;
  /** User ids whose Founder Radar is active; `null` when it could not be computed. */
  activeRadar: ReadonlySet<string> | null;
}

interface Applier {
  /** Columns the candidate select needs (`id` + whatever `keep` reads). */
  columns: string;
  /** Rules that need the active-subscriber set skip the tick when it is null. */
  needsActiveRadar?: boolean;
  /** Extra scope filters on top of `<column> < cutoff`. */
  scope(q: any): any; // eslint-disable-line @typescript-eslint/no-explicit-any
  /** `false` → the row is protected and counted, not acted on. */
  keep?(row: Row, ctx: ApplierContext): boolean;
  act(db: RetentionDb, ids: string[]): Promise<{ error: unknown }>;
}

const APPLIERS: Readonly<Record<string, Applier>> = {
  guest_funding_reports: {
    columns: "id, created_at",
    scope: (q) => q.is("user_id", null).not("guest_email", "is", null),
    act: (db, ids) => db.from("funding_reports").update({ guest_email: null, access_token: null }).in("id", ids),
  },
  radar_matches: {
    columns: "id, user_id, last_seen_at",
    needsActiveRadar: true,
    scope: (q) => q,
    keep: (row, ctx) => !(typeof row.user_id === "string" && ctx.activeRadar?.has(row.user_id)),
    act: (db, ids) => db.from("funding_matches").delete().in("id", ids),
  },
  email_drips: {
    columns: "id, user_id, campaign, status, sent_at, scheduled_for",
    needsActiveRadar: true,
    // The DB pre-filter pages on scheduled_for (sent_at >= scheduled_for by
    // construction: the nurture cron sends once due); `keep` applies the
    // policy's send date and the activation-cap protection.
    scope: (q) => q.neq("status", "pending"),
    keep: (row, ctx) => {
      const sentAt = typeof row.sent_at === "string" ? row.sent_at : null;
      const scheduled = typeof row.scheduled_for === "string" ? row.scheduled_for : null;
      const sendDate = sentAt ?? scheduled;
      if (!sendDate || sendDate >= ctx.cutoff) return false;
      const campaign = typeof row.campaign === "string" ? row.campaign : "";
      if (campaign.startsWith("radar_setup") && typeof row.user_id === "string" && ctx.activeRadar?.has(row.user_id)) return false;
      return true;
    },
    act: (db, ids) => db.from("email_drips").delete().in("id", ids),
  },
  evaluator_claim_tokens: {
    columns: "id, invited_at",
    scope: (q) => q.not("invite_token", "is", null),
    act: (db, ids) => db.from("evaluations").update({ invite_token: null }).in("id", ids),
  },
};

/** The column the candidate query pages on (differs from `rule.column` for drips). */
export function pageColumn(rule: RetentionRule): string {
  return rule.id === "email_drips" ? "scheduled_for" : rule.column;
}

/** Exported so the test can assert every rule has an applier. */
export function hasApplier(ruleId: string): boolean {
  return Object.prototype.hasOwnProperty.call(APPLIERS, ruleId);
}

// ─── Sweep ───────────────────────────────────────────────────────────────────

export interface RuleResult {
  rule: string;
  table: string;
  column: string;
  days: number;
  mode: RetentionMode;
  cutoff: string;
  /** Rows the DB returned as older than the cutoff (inside the page budget). */
  candidates: number;
  /** Candidates left alone: a live subscription references them, or (drips) the send date is still inside the period. */
  protected: number;
  /** Rows deleted / anonymised / expired (0 on dry-run — see `would_affect`). */
  affected: number;
  /** Rows the tick would act on (equals `affected` on a wet run). */
  would_affect: number;
  /** True when the batch filled — more rows are waiting for the next tick. */
  more: boolean;
  batch_limit: number;
  dry_run: boolean;
  error?: string;
}

export interface RetentionSweepSummary {
  ok: boolean;
  error?: string;
  dryRun: boolean;
  now: string;
  rules: RuleResult[];
  affected_total: number;
  protected_total: number;
}

export interface RetentionSweepOptions {
  db: RetentionDb | null | undefined;
  now?: Date;
  dryRun?: boolean;
  /** Max rows acted on per rule per tick; clamped to 1..MAX_BATCH_ROWS. */
  limit?: number;
  /** Active Founder Radar user ids. Default: the money-radar-sweep audience. */
  activeRadarUserIds?: (db: RetentionDb, now: Date) => Promise<ReadonlySet<string>>;
  /** Audit file; `null` disables the write. Default: content/reports/retention-history.jsonl. */
  historyFile?: string | null;
  rules?: readonly RetentionRule[];
}

export const RETENTION_HISTORY_FILE = path.join(process.cwd(), "content", "reports", "retention-history.jsonl");

/** How many candidate pages a rule may read while hunting for `limit` unprotected rows. */
export const MAX_PAGES_PER_RULE = 8;

export function clampBatch(limit: number | undefined): number {
  if (typeof limit !== "number" || !Number.isFinite(limit) || limit < 1) return DEFAULT_BATCH_ROWS;
  return Math.min(Math.floor(limit), MAX_BATCH_ROWS);
}

/** Default audience: exactly who the Money Radar sweep emails / notifies. */
export async function defaultActiveRadarUserIds(db: RetentionDb, now: Date): Promise<ReadonlySet<string>> {
  const { createSupabaseRadarStore } = await import("@/lib/funding/radar-sweep");
  const subs = await createSupabaseRadarStore(db).listSubscribers(now);
  return new Set(subs.map((s) => s.userId).filter((id): id is string => typeof id === "string" && id.length > 0));
}

function errorMessage(e: unknown): string {
  if (e && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string") {
    return (e as { message: string }).message;
  }
  return String(e);
}

/**
 * Collect up to `limit` rows older than the cutoff that `keep` accepts,
 * paging by the rule's timestamp column so protected rows cannot starve the
 * batch. Strict `gt` paging means a tie group straddling a page edge waits
 * for the next tick — acceptable for a weekly sweep.
 */
async function collectCandidates(
  db: RetentionDb,
  rule: RetentionRule,
  applier: Applier,
  ctx: ApplierContext,
  limit: number,
): Promise<{ ids: string[]; candidates: number; protectedCount: number; more: boolean; error?: string }> {
  const col = pageColumn(rule);
  const ids: string[] = [];
  let candidates = 0;
  let protectedCount = 0;
  let after: string | null = null;
  let more = false;

  for (let page = 0; page < MAX_PAGES_PER_RULE && ids.length < limit; page++) {
    let q = applier.scope(db.from(rule.table).select(applier.columns)).lt(col, ctx.cutoff);
    if (after) q = q.gt(col, after);
    const { data, error } = (await q.order(col, { ascending: true }).limit(limit)) as { data: Row[] | null; error: unknown };
    if (error) return { ids, candidates, protectedCount, more, error: errorMessage(error) };
    const rows = data ?? [];
    for (const row of rows) {
      if (ids.length >= limit) {
        more = true;
        break;
      }
      candidates++;
      const id = typeof row.id === "string" ? row.id : null;
      if (!id) continue;
      if (applier.keep && !applier.keep(row, ctx)) {
        protectedCount++;
        continue;
      }
      ids.push(id);
    }
    if (rows.length < limit) break; // exhausted
    const last = rows[rows.length - 1]?.[col];
    if (typeof last !== "string" || last === after) break;
    after = last;
    if (ids.length >= limit) more = true;
  }
  return { ids, candidates, protectedCount, more };
}

function appendAudit(file: string | null | undefined, line: Record<string, unknown>): void {
  if (!file) return;
  try {
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) return;
    fs.appendFileSync(file, JSON.stringify(line) + "\n", "utf8");
  } catch {
    /* audit must never break the sweep */
  }
}

export async function runRetentionSweep(opts: RetentionSweepOptions): Promise<RetentionSweepSummary> {
  const now = opts.now ?? new Date();
  const dryRun = Boolean(opts.dryRun);
  const limit = clampBatch(opts.limit);
  const rules = opts.rules ?? RETENTION_RULES;
  const historyFile = opts.historyFile === undefined ? RETENTION_HISTORY_FILE : opts.historyFile;
  const base: RetentionSweepSummary = { ok: true, dryRun, now: now.toISOString(), rules: [], affected_total: 0, protected_total: 0 };

  const db = opts.db;
  if (!db) return { ...base, ok: false, error: "supabase_unavailable" };

  let activeRadar: ReadonlySet<string> | null = null;
  let activeRadarError: string | undefined;
  if (rules.some((r) => APPLIERS[r.id]?.needsActiveRadar)) {
    try {
      activeRadar = await (opts.activeRadarUserIds ?? defaultActiveRadarUserIds)(db, now);
    } catch (e) {
      activeRadar = null;
      activeRadarError = `active_subscribers_unavailable: ${errorMessage(e)}`;
    }
  }

  for (const rule of rules) {
    const cutoff = cutoffIso(now, rule.days);
    const result: RuleResult = {
      rule: rule.id,
      table: rule.table,
      column: rule.column,
      days: rule.days,
      mode: rule.mode,
      cutoff,
      candidates: 0,
      protected: 0,
      affected: 0,
      would_affect: 0,
      more: false,
      batch_limit: limit,
      dry_run: dryRun,
    };
    const applier = APPLIERS[rule.id];
    if (!applier) {
      result.error = "no_applier";
    } else if (applier.needsActiveRadar && !activeRadar) {
      result.error = activeRadarError ?? "active_subscribers_unavailable";
    } else {
      const ctx: ApplierContext = { now, cutoff, activeRadar };
      const found = await collectCandidates(db, rule, applier, ctx, limit);
      result.candidates = found.candidates;
      result.protected = found.protectedCount;
      result.would_affect = found.ids.length;
      result.more = found.more;
      if (found.error) {
        result.error = found.error;
      } else if (!dryRun && found.ids.length > 0) {
        try {
          const { error } = await applier.act(db, found.ids);
          if (error) result.error = errorMessage(error);
          else result.affected = found.ids.length;
        } catch (e) {
          result.error = errorMessage(e);
        }
      }
    }
    base.rules.push(result);
    base.affected_total += result.affected;
    base.protected_total += result.protected;
    if (!dryRun) appendAudit(historyFile, { ts: now.toISOString(), ...result });
  }

  base.ok = base.rules.every((r) => !r.error);
  if (!base.ok) base.error = "retention_rule_failed";
  return base;
}
