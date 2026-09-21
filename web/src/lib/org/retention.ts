// Organisation retention (G21 P3-B) — the weekly cron body behind
// /api/cron/org-retention. For every `org_settings` row with
// `retention_days` set, the org's OWN artefacts older than the window are
// deleted; nothing a founder owns is ever touched (docs/ops/retention.md):
//
//   cohort_snapshots      batch_id ∈ the org's batches (lib/org/scope.ts:
//                         evaluation_batches.org_id = org ∪ owner-owned rows
//                         with no org_id — G22-B / 0433), taken_at < cutoff
//   assessment_overrides  batch_id ∈ the org's batches, created_at < cutoff
//   intake_submissions    intake_id ∈ the org's intakes (program_intakes.
//                         org_id = org ∪ owner-owned rows with no org_id),
//                         submitted_at < cutoff
//
// Never: projects, svi_analyses, svi_snapshots, evaluations, evidence,
// claims, audit_events (append-only), evaluation_batches themselves.
//
// Bounded: ≤ MAX_ROWS_PER_TABLE (500) rows per table per org per tick,
// oldest first; a long backlog drains over a few Sundays. One audit row per
// org per tick (`org.retention.applied`, counts + cutoff; `dry_run` when
// previewing). Fail-soft before 0428 / 0422 / 0423 / 0405.

import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";
import { appendAudit } from "@/lib/audit";
import { isMissingRelation } from "@/lib/investors/mandates";
import { loadOrgScope, type OrgScope } from "@/lib/org/scope";

type Row = Record<string, unknown>;
type Db = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

export const MAX_ROWS_PER_TABLE = 500;

export const ORG_RETENTION_TARGETS = Object.freeze([
  { table: "cohort_snapshots", column: "taken_at", via: "batch" },
  { table: "assessment_overrides", column: "created_at", via: "batch" },
  { table: "intake_submissions", column: "submitted_at", via: "intake" },
] as const);

export type RetentionTable = (typeof ORG_RETENTION_TARGETS)[number]["table"];

export interface OrgRetentionResult {
  org_id: string;
  retention_days: number;
  cutoff: string;
  /** Owner accounts in scope (0 | 1) — kept for the summary shape; the scope itself is `org_id`-based since 0433. */
  seats: number;
  batches: number;
  intakes: number;
  deleted: Record<RetentionTable, number>;
  more: boolean;
  dry_run: boolean;
  error?: string;
}

export interface OrgRetentionSummary {
  ok: boolean;
  error?: string;
  dry_run: boolean;
  now: string;
  orgs: OrgRetentionResult[];
  deleted_total: number;
}

/** Pure: the cutoff timestamp for a retention window. */
export function retentionCutoff(days: number, now: Date): string {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

export interface RetentionDeps {
  db?: Db | null;
  now?: () => Date;
  dryRun?: boolean;
  /** Rows per table per org (clamped to 1..500). */
  limit?: number;
  /** Injectable scope resolver (tests); default = `orgScope(db, orgId)`. */
  scopeOf?: (orgId: string) => Promise<OrgScope>;
}

async function candidates(db: Db, table: string, keyColumn: string, keys: string[], tsColumn: string, cutoff: string, limit: number): Promise<{ ids: string[]; missing: boolean }> {
  if (keys.length === 0) return { ids: [], missing: false };
  try {
    const { data, error } = await db.from(table).select("id").in(keyColumn, keys).lt(tsColumn, cutoff).order(tsColumn, { ascending: true }).limit(limit);
    if (error) return { ids: [], missing: isMissingRelation(error) };
    return { ids: ((data ?? []) as Row[]).map((r) => String(r.id)), missing: false };
  } catch {
    return { ids: [], missing: false };
  }
}

async function deleteIds(db: Db, table: string, rowIds: string[]): Promise<number> {
  if (rowIds.length === 0) return 0;
  const { data, error } = await db.from(table).delete().in("id", rowIds).select("id");
  if (error) {
    console.error(`[blockid:org-retention] delete ${table} failed`, { code: error.code, message: error.message });
    return 0;
  }
  return (data ?? []).length;
}

/**
 * Review P1 (2026-09-21) → G22-B (0433): the window applies to the
 * organisation's OWN artefacts — cohorts / intake links whose `org_id` is
 * the org (stamped at creation from the creator's acting org), plus rows the
 * owner account created that still carry no `org_id` (pre-0433, not yet
 * backfilled). A seat holder can sit in several organisations (and owns a
 * personal one), so a seat's rows are in scope only when they were created
 * while acting for THIS org — org A's window never deletes a shared
 * analyst's cohorts run for org B. Before 0433 the scope is owner-only.
 */
export async function orgScope(db: Db, orgId: string): Promise<OrgScope> {
  return loadOrgScope(db, orgId);
}

/** Apply one org's window. Never throws. */
export async function applyOrgRetention(db: Db, org: { org_id: string; retention_days: number }, deps: Required<Pick<RetentionDeps, "now" | "dryRun" | "limit" | "scopeOf">>): Promise<OrgRetentionResult> {
  const now = deps.now();
  const cutoff = retentionCutoff(org.retention_days, now);
  const result: OrgRetentionResult = { org_id: org.org_id, retention_days: org.retention_days, cutoff, seats: 0, batches: 0, intakes: 0, deleted: { cohort_snapshots: 0, assessment_overrides: 0, intake_submissions: 0 }, more: false, dry_run: deps.dryRun };
  const scope = await deps.scopeOf(org.org_id);
  result.seats = scope.ownerUserId ? 1 : 0;
  result.batches = scope.batchIds.length;
  result.intakes = scope.intakeIds.length;
  if (scope.batchIds.length === 0 && scope.intakeIds.length === 0) return result;

  for (const target of ORG_RETENTION_TARGETS) {
    const keys = target.via === "batch" ? scope.batchIds : scope.intakeIds;
    const keyColumn = target.via === "batch" ? "batch_id" : "intake_id";
    const found = await candidates(db, target.table, keyColumn, keys, target.column, cutoff, deps.limit);
    if (found.ids.length === 0) continue;
    if (found.ids.length >= deps.limit) result.more = true;
    result.deleted[target.table] = deps.dryRun ? found.ids.length : await deleteIds(db, target.table, found.ids);
  }
  return result;
}

/** Every org with a window → apply (or preview) → one audit row per org. */
export async function runOrgRetention(deps: RetentionDeps = {}): Promise<OrgRetentionSummary> {
  const now = deps.now ?? (() => new Date());
  const dryRun = deps.dryRun === true;
  const limit = Math.max(1, Math.min(MAX_ROWS_PER_TABLE, deps.limit ?? MAX_ROWS_PER_TABLE));
  const db = deps.db === undefined ? getSupabaseAdmin() : deps.db;
  const summary: OrgRetentionSummary = { ok: true, dry_run: dryRun, now: now().toISOString(), orgs: [], deleted_total: 0 };
  if (!db) return { ...summary, ok: false, error: "supabase_unavailable" };

  let rows: Row[];
  try {
    const { data, error } = await db.from("org_settings").select("org_id, retention_days").not("retention_days", "is", null).limit(500);
    if (error) return { ...summary, ok: false, error: isMissingRelation(error) ? "org_settings is missing — apply migration 0428" : error.message };
    rows = (data ?? []) as Row[];
  } catch (err) {
    return { ...summary, ok: false, error: err instanceof Error ? err.message : "read_failed" };
  }

  const scopeOf = deps.scopeOf ?? ((orgId: string) => orgScope(db, orgId));
  for (const r of rows) {
    const orgId = String(r.org_id ?? "");
    const days = Number(r.retention_days);
    if (!orgId || !Number.isInteger(days) || days < 30) continue;
    const result = await applyOrgRetention(db, { org_id: orgId, retention_days: days }, { now, dryRun, limit, scopeOf });
    summary.orgs.push(result);
    const deleted = Object.values(result.deleted).reduce((a, b) => a + b, 0);
    summary.deleted_total += deleted;
    if (!dryRun) {
      try {
        await appendAudit({
          user_id: null,
          actor: "cron",
          action: "org.retention.applied",
          resource_type: "investor_organisation",
          resource_id: orgId,
          detail: { retention_days: days, cutoff: result.cutoff, deleted: result.deleted, batches: result.batches, intakes: result.intakes, more: result.more },
        });
      } catch (err) {
        console.error("[blockid:org-retention] audit append failed", err instanceof Error ? err.message : err);
      }
    }
  }
  return summary;
}
