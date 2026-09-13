// Board resolutions (S26-B) — the server half: resolve the referenced
// record for a project scope (share issue / dividend / ESOP pool), the
// founder's company block and the cap table's directors; generate + persist
// one frozen payload per (project, kind, record) — versioned since S27-A
// (migration 0361): a regenerate supersedes the current row and inserts
// version n+1, the old row stays as history; read the current version back
// for the PDF and the data-room save, or a named version for its PDF.
//
// The content hash reuses the score-proof primitives (`lib/proofs`) exactly
// like the dividend statements (S25-B). Every DB access takes the admin
// client as an argument so the colocated suites drive it with
// `fakeSupabase` (which ignores filters — hence the defensive re-checks on
// every row read).

import "server-only";

import { canonicalizeScore } from "@/lib/proofs/canonical-json";
import { hashScore } from "@/lib/proofs/hash";
import { getDividendRecordForScope, loadCompanyForScope, toStatementRecord, type DividendDb, type RecordScope } from "@/lib/dividends/server";
import {
  buildDividendResolution,
  buildEsopResolution,
  buildShareIssueResolution,
  type BoardResolutionPayload,
  type DividendResolutionRecord,
  type EsopPlanRecord,
  type ResolutionCompany,
  type ResolutionDirector,
  type ResolutionKind,
  type ShareIssueRecord,
} from "./build";

export type { RecordScope };

export interface BoardResolutionRow {
  id: string;
  project_id: string;
  user_id: string;
  kind: ResolutionKind;
  record_id: string;
  content_hash: string;
  payload: BoardResolutionPayload;
  credits_charged: number | string;
  issued_at: string;
  /** 1 for the first generation; n+1 per regenerate (0361). Older rows read as 1. */
  version?: number | null;
  /** NULL = the current version for (project, kind, record). */
  superseded_at?: string | null;
  superseded_by?: string | null;
}

export const RESOLUTION_COLUMNS = "id, project_id, user_id, kind, record_id, content_hash, payload, credits_charged, issued_at, version, superseded_at, superseded_by";

/** The row's version, 1 when the column is unset (rows written before 0361). */
export function resolutionVersion(row: Pick<BoardResolutionRow, "version">): number {
  const v = Number(row.version);
  return Number.isFinite(v) && v >= 1 ? Math.floor(v) : 1;
}

export function isCurrentResolution(row: Pick<BoardResolutionRow, "superseded_at">): boolean {
  return !row.superseded_at;
}

export function resolutionContentHash(payload: BoardResolutionPayload): string {
  return hashScore(canonicalizeScore(payload));
}

/**
 * Has the source record (or the company / director block, or the wording
 * format) changed since `stored` was generated? Compares the stored hash
 * with a fresh draft re-stamped with the stored `preparedAt`, so the
 * preparation time alone never reads as a change (S27-A, review P2-7).
 */
export function resolutionIsStale(stored: Pick<BoardResolutionRow, "content_hash" | "payload">, draft: BoardResolutionPayload): boolean {
  const preparedAt = stored.payload?.preparedAt ?? draft.preparedAt;
  return stored.content_hash !== resolutionContentHash({ ...draft, preparedAt });
}

function num(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? n : fallback;
}

/* ── Directors ────────────────────────────────────────────────────────── */

/** Cap-table rows whose role says "director" — the only place directors are stored today. */
export function directorsFromShareholders(rows: Array<{ name?: string | null; role?: string | null }>): ResolutionDirector[] {
  return rows
    .filter((r) => typeof r?.role === "string" && /director/i.test(r.role) && typeof r.name === "string" && r.name.trim())
    .map((r) => ({ name: (r.name as string).trim() }));
}

interface ShareholderRow {
  id: string;
  account_id: string;
  project_id: string | null;
  name: string | null;
  role: string | null;
  shares_held: number | string | null;
}

async function loadShareholderRows(db: DividendDb, scope: RecordScope): Promise<ShareholderRow[]> {
  const { data } = await db.from("shareholders").select("id, account_id, project_id, name, role, shares_held").eq("account_id", scope.ownerUserId);
  return ((data as ShareholderRow[] | null) ?? []).filter((h) => h && h.id && h.account_id === scope.ownerUserId && (!h.project_id || h.project_id === scope.projectId));
}

export async function loadDirectorsForScope(db: DividendDb, scope: RecordScope): Promise<ResolutionDirector[]> {
  return directorsFromShareholders(await loadShareholderRows(db, scope));
}

/* ── Records ──────────────────────────────────────────────────────────── */

interface ShareTransactionRow {
  id: string;
  account_id: string;
  project_id: string | null;
  transaction_type: string;
  to_shareholder_id: string | null;
  share_class_id: string | null;
  shares: number | string;
  price_per_share: number | string | null;
  total_value: number | string | null;
  round_name: string | null;
  notes: string | null;
  effective_date: string | null;
}

/** A share ISSUE transaction by id for the scope (null when another project's, or not an issue). */
export async function getShareIssueForScope(db: DividendDb, transactionId: string, scope: RecordScope): Promise<ShareIssueRecord | null> {
  const { data } = await db
    .from("share_transactions")
    .select("id, account_id, project_id, transaction_type, to_shareholder_id, share_class_id, shares, price_per_share, total_value, round_name, notes, effective_date")
    .eq("id", transactionId)
    .eq("account_id", scope.ownerUserId)
    .maybeSingle();
  const row = (data as ShareTransactionRow | null) ?? null;
  if (!row || row.id !== transactionId || row.account_id !== scope.ownerUserId) return null;
  if (row.project_id && row.project_id !== scope.projectId) return null;
  if (row.transaction_type !== "issue") return null;

  const [holders, { data: classes }] = await Promise.all([
    loadShareholderRows(db, scope),
    db.from("share_classes").select("id, name").eq("account_id", scope.ownerUserId),
  ]);
  const holder = holders.find((h) => h.id === row.to_shareholder_id) ?? null;
  const cls = ((classes as Array<{ id: string; name: string }> | null) ?? []).find((c) => c?.id === row.share_class_id) ?? null;

  const price = row.price_per_share == null ? null : num(row.price_per_share, Number.NaN);
  const total = row.total_value == null ? null : num(row.total_value, Number.NaN);
  return {
    id: row.id,
    allotteeName: holder?.name?.trim() || "the allottee named in the share register",
    allotteeRole: holder?.role ?? null,
    shareClass: cls?.name ?? "Ordinary",
    shares: num(row.shares),
    pricePerShareAud: price != null && Number.isFinite(price) && price > 0 ? price : null,
    totalValueAud: total != null && Number.isFinite(total) && total > 0 ? total : null,
    roundName: row.round_name ?? null,
    effectiveDate: row.effective_date ?? null,
    notes: row.notes ?? null,
  };
}

/** The dividend record → resolution inputs (through the S25-B loader, so scope rules match). */
export async function getDividendForScope(db: DividendDb, recordId: string, scope: RecordScope): Promise<DividendResolutionRecord | null> {
  const row = await getDividendRecordForScope(db, recordId, scope);
  if (!row) return null;
  const r = toStatementRecord(row);
  const payouts = Array.isArray(row.payouts) ? row.payouts : [];
  return {
    id: row.id,
    period: r.period,
    totalDividendAud: r.totalDividendAud,
    perShareDividendAud: r.perShareDividendAud,
    frankingPct: r.frankingPct ?? 100,
    companyTaxRate: r.companyTaxRate,
    paidAt: r.paidAt ?? null,
    payoutCount: payouts.filter((p) => p && num(p.grossDividend) > 0).length,
  };
}

interface EsopPoolRow {
  id: string;
  account_id: string;
  project_id?: string | null;
  total_pool_shares: number | string;
  allocated_shares: number | string;
  pool_pct: number | string | null;
}

/**
 * The cap-table ESOP pool by id for the scope. Vesting defaults come from
 * the `esop_pools` configuration row (vesting_cliff_months /
 * vesting_total_months, written by api/esop/pool) when one exists for the
 * owner; otherwise null — the resolution then says "as set out in each
 * offer letter" rather than inventing a schedule.
 */
export async function getEsopPoolForScope(db: DividendDb, poolId: string, scope: RecordScope): Promise<EsopPlanRecord | null> {
  const { data } = await db.from("esop_pool").select("id, account_id, project_id, total_pool_shares, allocated_shares, pool_pct").eq("id", poolId).eq("account_id", scope.ownerUserId).maybeSingle();
  const row = (data as EsopPoolRow | null) ?? null;
  if (!row || row.id !== poolId || row.account_id !== scope.ownerUserId) return null;
  if (row.project_id && row.project_id !== scope.projectId) return null;

  let vestingMonths: number | null = null;
  let cliffMonths: number | null = null;
  try {
    const { data: cfg } = await db.from("esop_pools").select("account_id, vesting_cliff_months, vesting_total_months").eq("account_id", scope.ownerUserId).maybeSingle();
    const c = (cfg as { account_id?: string; vesting_cliff_months?: unknown; vesting_total_months?: unknown } | null) ?? null;
    if (c && c.account_id === scope.ownerUserId) {
      const v = num(c.vesting_total_months, Number.NaN);
      const k = num(c.vesting_cliff_months, Number.NaN);
      if (Number.isFinite(v) && v > 0) vestingMonths = v;
      if (Number.isFinite(k) && k >= 0) cliffMonths = k;
    }
  } catch {
    /* the config table is optional — no defaults is the honest fallback */
  }

  const holders = await loadShareholderRows(db, scope);
  const issued = holders.reduce((s, h) => s + num(h.shares_held), 0);
  const pool = num(row.total_pool_shares);
  return {
    id: row.id,
    totalPoolShares: pool,
    allocatedShares: num(row.allocated_shares),
    poolPct: row.pool_pct == null ? null : num(row.pool_pct, Number.NaN),
    vestingMonths,
    cliffMonths,
    fullyDilutedShares: issued + pool > 0 ? issued + pool : null,
  };
}

/* ── Generate ─────────────────────────────────────────────────────────── */

export type ResolutionRecord = { kind: "share-issue"; record: ShareIssueRecord } | { kind: "dividend"; record: DividendResolutionRecord } | { kind: "esop"; record: EsopPlanRecord };

/** Load the referenced record for `kind` — null when it is not this project's. */
export async function loadResolutionRecord(db: DividendDb, kind: ResolutionKind, recordId: string, scope: RecordScope): Promise<ResolutionRecord | null> {
  switch (kind) {
    case "share-issue": {
      const record = await getShareIssueForScope(db, recordId, scope);
      return record ? { kind, record } : null;
    }
    case "dividend": {
      const record = await getDividendForScope(db, recordId, scope);
      return record ? { kind, record } : null;
    }
    case "esop": {
      const record = await getEsopPoolForScope(db, recordId, scope);
      return record ? { kind, record } : null;
    }
  }
}

export function buildResolution(input: ResolutionRecord, company: ResolutionCompany, directors: ResolutionDirector[], now = new Date()): BoardResolutionPayload {
  switch (input.kind) {
    case "share-issue":
      return buildShareIssueResolution({ company, record: input.record, directors, now });
    case "dividend":
      return buildDividendResolution({ company, record: input.record, directors, now });
    case "esop":
      return buildEsopResolution({ company, record: input.record, directors, now });
  }
}

/** Everything a resolution needs, loaded once (company + directors + record). */
export async function loadResolutionInputs(db: DividendDb, kind: ResolutionKind, recordId: string, scope: RecordScope) {
  const [record, company, directors] = await Promise.all([loadResolutionRecord(db, kind, recordId, scope), loadCompanyForScope(db, scope), loadDirectorsForScope(db, scope)]);
  if (!record) return null;
  return { record, company: { name: company.name, acn: company.acn, abn: company.abn, address: company.address } as ResolutionCompany, directors };
}

/** Every version generated for the record, newest version first (the current one first when present). */
export async function listResolutionVersions(db: DividendDb, kind: ResolutionKind, recordId: string, projectId: string): Promise<BoardResolutionRow[]> {
  const { data } = await db.from("board_resolutions").select(RESOLUTION_COLUMNS).eq("project_id", projectId).eq("kind", kind).eq("record_id", recordId).order("version", { ascending: false });
  return ((data as BoardResolutionRow[] | null) ?? [])
    .filter((r) => r && r.id && r.project_id === projectId && r.kind === kind && r.record_id === recordId)
    .sort((a, b) => resolutionVersion(b) - resolutionVersion(a));
}

/** The CURRENT (not superseded) resolution for the record, or null. */
export async function getResolution(db: DividendDb, kind: ResolutionKind, recordId: string, projectId: string): Promise<BoardResolutionRow | null> {
  const versions = await listResolutionVersions(db, kind, recordId, projectId);
  return versions.find(isCurrentResolution) ?? null;
}

/** A named version of the record's resolution (current or superseded), or null. */
export async function getResolutionVersion(db: DividendDb, kind: ResolutionKind, recordId: string, projectId: string, version: number): Promise<BoardResolutionRow | null> {
  const versions = await listResolutionVersions(db, kind, recordId, projectId);
  return versions.find((r) => resolutionVersion(r) === version) ?? null;
}

/** Current resolutions of a project (superseded versions excluded), newest first. */
export async function listResolutionsForProject(db: DividendDb, projectId: string, limit = 200): Promise<BoardResolutionRow[]> {
  const { data } = await db.from("board_resolutions").select(RESOLUTION_COLUMNS).eq("project_id", projectId).is("superseded_at", null).order("issued_at", { ascending: false }).limit(limit);
  return ((data as BoardResolutionRow[] | null) ?? []).filter((r) => r && r.id && r.project_id === projectId && isCurrentResolution(r));
}

export type IssueResolutionResult =
  | { ok: true; row: BoardResolutionRow; existing: boolean; superseded: BoardResolutionRow | null }
  | { ok: false; error: "insert_failed" | "supersede_conflict" };

/**
 * Persist the payload as the CURRENT resolution for (project, kind, record).
 *
 * First generation (`supersedes` absent): a unique hit on the partial index
 * means a concurrent press landed first — that row is returned as
 * `existing`, nothing new is written.
 *
 * Regenerate (`supersedes` = the current row, S27-A): the old row is marked
 * superseded FIRST (the partial unique index admits one current row), then
 * version n+1 is inserted; the old row is then pointed at the new one. If
 * the insert fails the old row is restored as current. If the old row was
 * already superseded by someone else the mark lands on nothing →
 * `supersede_conflict` (the route refunds).
 */
export async function issueResolution(input: {
  db: DividendDb;
  projectId: string;
  userId: string;
  kind: ResolutionKind;
  recordId: string;
  payload: BoardResolutionPayload;
  creditsCharged: number;
  supersedes?: BoardResolutionRow | null;
}): Promise<IssueResolutionResult> {
  const contentHash = resolutionContentHash(input.payload);
  const prior = input.supersedes ?? null;
  const version = prior ? resolutionVersion(prior) + 1 : 1;
  const now = input.payload.preparedAt;

  if (prior) {
    const { data: marked, error: markError } = await input.db
      .from("board_resolutions")
      .update({ superseded_at: now })
      .eq("id", prior.id)
      .eq("project_id", input.projectId)
      .is("superseded_at", null)
      .select("id");
    // The real client answers a filtered update + select with the matched rows ([] = someone else
    // superseded it first). A non-array shape (the test fake echoes the patch) is not a miss.
    const rows = Array.isArray(marked) ? (marked as Array<{ id?: string }>) : null;
    const missed = rows !== null && !rows.some((m) => m?.id === prior.id);
    if (markError || missed) {
      console.error("[board-resolutions] supersede did not land", { kind: input.kind, record: input.recordId, prior: prior.id, error: markError });
      return { ok: false, error: "supersede_conflict" };
    }
  }

  const { data, error } = await input.db
    .from("board_resolutions")
    .insert({
      project_id: input.projectId,
      user_id: input.userId,
      kind: input.kind,
      record_id: input.recordId,
      content_hash: contentHash,
      payload: input.payload,
      credits_charged: input.creditsCharged,
      issued_at: now,
      version,
    })
    .select(RESOLUTION_COLUMNS)
    .single();
  if (!error && data) {
    const row = data as BoardResolutionRow;
    if (prior) {
      const { error: linkError } = await input.db.from("board_resolutions").update({ superseded_by: row.id }).eq("id", prior.id).eq("project_id", input.projectId);
      if (linkError) console.error("[board-resolutions] superseded_by link failed", { prior: prior.id, next: row.id, error: linkError });
      return { ok: true, row, existing: false, superseded: { ...prior, superseded_at: now, superseded_by: row.id } };
    }
    return { ok: true, row, existing: false, superseded: null };
  }

  if (prior) {
    // Put the old version back as current — the founder must never lose the only resolution they had.
    const { error: restoreError } = await input.db.from("board_resolutions").update({ superseded_at: null, superseded_by: null }).eq("id", prior.id).eq("project_id", input.projectId);
    if (restoreError) console.error("[board-resolutions] restore after failed regenerate did not land", { prior: prior.id, error: restoreError });
    console.error("[board-resolutions] regenerate insert failed", { kind: input.kind, record: input.recordId, error });
    return { ok: false, error: "insert_failed" };
  }

  const msg = String((error as { message?: string } | null)?.message ?? "");
  const code = String((error as { code?: string } | null)?.code ?? "");
  if (code === "23505" || /duplicate key|unique/i.test(msg)) {
    const again = await getResolution(input.db, input.kind, input.recordId, input.projectId);
    if (again) return { ok: true, row: again, existing: true, superseded: null };
  }
  console.error("[board-resolutions] insert failed", { kind: input.kind, record: input.recordId, error });
  return { ok: false, error: "insert_failed" };
}

/** Public projection for the panel / API. A superseded version's `pdfUrl` names its version. */
export function resolutionRowSummary(row: BoardResolutionRow) {
  const version = resolutionVersion(row);
  const current = isCurrentResolution(row);
  const base = `/api/board-resolutions/${row.kind}/${row.record_id}/pdf`;
  return {
    id: row.id,
    kind: row.kind,
    recordId: row.record_id,
    title: row.payload?.title ?? "",
    contentHash: row.content_hash,
    issuedAt: row.issued_at,
    creditsCharged: Number(row.credits_charged ?? 0),
    version,
    current,
    supersededAt: row.superseded_at ?? null,
    supersededBy: row.superseded_by ?? null,
    pdfUrl: current ? base : `${base}?version=${version}`,
  };
}

export type ResolutionRowSummary = ReturnType<typeof resolutionRowSummary>;
