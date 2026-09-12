// Dividend statements (S25-B) — the server half: load a dividend record for
// a project scope with its payouts, cap-table shareholders and the founder's
// company details; issue statements idempotently (one live row per
// (record, shareholder)); list / get / void; build the register.
//
// The statement number + content hash reuse the score-proof primitives
// (`lib/proofs`) exactly like the valuation certificate (S22-A) so a
// statement hash reads the same everywhere.
//
// Every DB access takes the admin client as an argument so the colocated
// suites drive it with `fakeSupabase`.

import "server-only";

import { createHash, randomBytes } from "crypto";
import { canonicalizeScore } from "@/lib/proofs/canonical-json";
import { hashScore } from "@/lib/proofs/hash";
import type { DividendPayout } from "@/lib/dividends";
import {
  buildDividendRegister,
  buildDividendStatement,
  formatAbn,
  formatAcn,
  shareholderKey,
  type DividendRegisterPayload,
  type DividendStatementPayload,
  type StatementCompany,
  type StatementDividendRecord,
  type StatementShareholder,
} from "./statement";

/** Minimal query-builder surface (Supabase admin client or the test fake). */
export interface DividendDb {
  from(table: string): any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export const STATEMENT_NO_RE = /^DS-[0-9A-HJ-NP-Z]{5}-[0-9A-HJ-NP-Z]{5}$/;
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** `DS-XXXXX-XXXXX` — SHA-256 of `seed` + fresh randomness; uniqueness is the DB's job (route retries). */
export function statementNumber(seed: string, entropy: Buffer = randomBytes(16)): string {
  const digest = createHash("sha256").update(seed, "utf8").update(entropy).digest();
  let out = "";
  for (let i = 0; i < 10; i++) out += ALPHABET[digest[i] % ALPHABET.length];
  return `DS-${out.slice(0, 5)}-${out.slice(5, 10)}`;
}

/** `blockid:v1:<sha256 hex>` of the canonical payload. */
export function statementContentHash(payload: DividendStatementPayload): string {
  return hashScore(canonicalizeScore(payload));
}

export function statementHashMatches(payload: DividendStatementPayload, storedHash: string): boolean {
  return statementContentHash(payload) === storedHash;
}

/* ── Rows ─────────────────────────────────────────────────────────────── */

export interface DividendRecordRow {
  id: string;
  account_id: string;
  project_id: string | null;
  period: string;
  net_income: number | string;
  distribution_pct: number | string;
  total_dividend: number | string;
  per_share_dividend: number | string | null;
  retained_earnings: number | string | null;
  franking_rate: number | string | null;
  franking_pct?: number | string | null;
  tfn_withholding_rate?: number | string | null;
  paid_at?: string | null;
  payouts: DividendPayout[] | null;
  created_at: string;
}

export interface DividendStatementRow {
  id: string;
  project_id: string;
  user_id: string;
  dividend_record_id: string;
  shareholder_id: string | null;
  shareholder_key: string;
  statement_no: string;
  content_hash: string;
  payload: DividendStatementPayload;
  credits_charged: number;
  issued_at: string;
  voided_at: string | null;
  void_reason: string | null;
}

export const RECORD_COLUMNS =
  "id, account_id, project_id, period, net_income, distribution_pct, total_dividend, per_share_dividend, retained_earnings, franking_rate, franking_pct, tfn_withholding_rate, paid_at, payouts, created_at";

export const STATEMENT_COLUMNS =
  "id, project_id, user_id, dividend_record_id, shareholder_id, shareholder_key, statement_no, content_hash, payload, credits_charged, issued_at, voided_at, void_reason";

function num(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? n : fallback;
}

/** `dividend_records` row → the pure builder's record shape. */
export function toStatementRecord(row: DividendRecordRow): StatementDividendRecord {
  const rate = num(row.franking_rate, 0.25);
  return {
    id: row.id,
    period: row.period,
    createdAt: row.created_at,
    paidAt: row.paid_at ?? null,
    totalDividendAud: num(row.total_dividend),
    perShareDividendAud: num(row.per_share_dividend),
    companyTaxRate: rate > 0 && rate < 1 ? rate : 0.25,
    frankingPct: row.franking_pct == null ? 100 : num(row.franking_pct, 100),
    tfnWithholdingRate: num(row.tfn_withholding_rate, 0),
  };
}

/* ── Scope ────────────────────────────────────────────────────────────── */

export interface RecordScope {
  projectId: string;
  /** `dividend_records.account_id` — the project OWNER's user id. */
  ownerUserId: string;
  projectName: string;
}

/**
 * A dividend record by id for the scope. Rows are keyed on the owner's
 * account_id; a row stamped with another project's id is not this project's
 * (null — never 403, the id must not become an oracle).
 */
export async function getDividendRecordForScope(db: DividendDb, recordId: string, scope: RecordScope): Promise<DividendRecordRow | null> {
  const { data } = await db.from("dividend_records").select(RECORD_COLUMNS).eq("id", recordId).eq("account_id", scope.ownerUserId).maybeSingle();
  const row = (data as DividendRecordRow | null) ?? null;
  if (!row || row.id !== recordId || row.account_id !== scope.ownerUserId) return null;
  if (row.project_id && row.project_id !== scope.projectId) return null;
  return row;
}

/** Newest-first dividend records for the scope (project-stamped or legacy unstamped). */
export async function listDividendRecordsForScope(db: DividendDb, scope: RecordScope, limit = 50): Promise<DividendRecordRow[]> {
  const { data } = await db.from("dividend_records").select(RECORD_COLUMNS).eq("account_id", scope.ownerUserId).order("created_at", { ascending: false }).limit(limit);
  return ((data as DividendRecordRow[] | null) ?? []).filter((r) => r && r.id && (!r.project_id || r.project_id === scope.projectId));
}

interface ShareholderRow {
  id: string;
  account_id: string;
  project_id: string | null;
  name: string;
  role: string | null;
  shares_held: number | string;
  tfn_on_file?: boolean | null;
  share_class_id?: string | null;
}

interface ShareClassRow {
  id: string;
  name: string;
}

/** Cap-table shareholders for the scope, with their share class name. */
export async function loadShareholdersForScope(db: DividendDb, scope: RecordScope): Promise<StatementShareholder[]> {
  const [{ data: holders }, { data: classes }] = await Promise.all([
    db.from("shareholders").select("id, account_id, project_id, name, role, shares_held, tfn_on_file, share_class_id").eq("account_id", scope.ownerUserId),
    db.from("share_classes").select("id, name").eq("account_id", scope.ownerUserId),
  ]);
  const classById = new Map<string, string>();
  for (const c of ((classes as ShareClassRow[] | null) ?? [])) if (c?.id) classById.set(c.id, c.name);
  return (((holders as ShareholderRow[] | null) ?? []) as ShareholderRow[])
    .filter((h) => h && h.id && (!h.project_id || h.project_id === scope.projectId))
    .map((h) => ({
      id: h.id,
      name: h.name ?? "",
      role: h.role ?? "shareholder",
      shareClass: h.share_class_id ? (classById.get(h.share_class_id) ?? null) : null,
      sharesHeld: num(h.shares_held),
      tfnOnFile: h.tfn_on_file === true,
    }));
}

/**
 * The paying entity — the FOUNDER's company, never BlockID's: project name +
 * ABN/ACN from `project_grant_profiles` (G11), falling back to the ABN the
 * founder typed into the SVI form (`startup_score_history.inputs.abn`).
 */
export async function loadCompanyForScope(db: DividendDb, scope: RecordScope): Promise<StatementCompany> {
  const { data: profile } = await db.from("project_grant_profiles").select("abn, acn, city, state").eq("project_id", scope.projectId).maybeSingle();
  const p = (profile as { abn?: string | null; acn?: string | null; city?: string | null; state?: string | null } | null) ?? null;
  let abn = formatAbn(p?.abn ?? null);
  if (!abn) {
    const { data: history } = await db
      .from("startup_score_history")
      .select("startup_name, inputs")
      .eq("user_id", scope.ownerUserId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const h = (history as { startup_name?: string | null; inputs?: { abn?: unknown } | null } | null) ?? null;
    const matches = typeof h?.startup_name === "string" && h.startup_name.trim().toLowerCase() === scope.projectName.trim().toLowerCase();
    if (matches && typeof h?.inputs?.abn === "string") abn = formatAbn(h.inputs.abn);
  }
  const address = [p?.city, p?.state].filter((x): x is string => typeof x === "string" && x.trim().length > 0).join(" ");
  return { name: scope.projectName, abn, acn: formatAcn(p?.acn ?? null), address: address || null };
}

/* ── Matching payouts to shareholders ─────────────────────────────────── */

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Match each payout (keyed by name on the record) to a cap-table row; unmatched → a name-keyed shareholder. */
export function matchPayouts(payouts: DividendPayout[], shareholders: StatementShareholder[]): Array<{ payout: DividendPayout; shareholder: StatementShareholder; key: string }> {
  const byName = new Map<string, StatementShareholder>();
  for (const s of shareholders) if (!byName.has(norm(s.name))) byName.set(norm(s.name), s);
  const seen = new Set<string>();
  const out: Array<{ payout: DividendPayout; shareholder: StatementShareholder; key: string }> = [];
  for (const payout of payouts) {
    if (!payout || typeof payout.name !== "string" || !(num(payout.grossDividend) > 0)) continue;
    const matched = byName.get(norm(payout.name));
    const shareholder: StatementShareholder = matched ?? {
      id: null,
      name: payout.name,
      role: payout.role ?? "shareholder",
      shareClass: null,
      sharesHeld: num(payout.shares),
      tfnOnFile: false,
    };
    const key = shareholderKey(shareholder);
    if (seen.has(key)) continue; // duplicate payout name → one statement
    seen.add(key);
    out.push({ payout, shareholder, key });
  }
  return out;
}

/* ── Register reads ───────────────────────────────────────────────────── */

export async function listStatementsForRecord(db: DividendDb, recordId: string, projectId: string): Promise<DividendStatementRow[]> {
  const { data } = await db.from("dividend_statements").select(STATEMENT_COLUMNS).eq("dividend_record_id", recordId).eq("project_id", projectId).order("issued_at", { ascending: true });
  return ((data as DividendStatementRow[] | null) ?? []).filter((r) => r && r.id && r.dividend_record_id === recordId && r.project_id === projectId);
}

export async function listStatementsForProject(db: DividendDb, projectId: string, limit = 500): Promise<DividendStatementRow[]> {
  const { data } = await db.from("dividend_statements").select(STATEMENT_COLUMNS).eq("project_id", projectId).order("issued_at", { ascending: false }).limit(limit);
  return ((data as DividendStatementRow[] | null) ?? []).filter((r) => r && r.id && r.project_id === projectId);
}

/** A statement by id, scoped to the project the caller has a role on. Null when it is another project's. */
export async function getStatementForProject(db: DividendDb, id: string, projectId: string): Promise<DividendStatementRow | null> {
  const { data } = await db.from("dividend_statements").select(STATEMENT_COLUMNS).eq("id", id).eq("project_id", projectId).maybeSingle();
  const row = (data as DividendStatementRow | null) ?? null;
  if (!row || row.id !== id || row.project_id !== projectId) return null;
  return row;
}

/* ── Issue ────────────────────────────────────────────────────────────── */

export interface IssueStatementsInput {
  db: DividendDb;
  projectId: string;
  userId: string;
  company: StatementCompany;
  record: DividendRecordRow;
  shareholders: StatementShareholder[];
  creditsCharged: number;
  now?: Date;
}

export interface IssueStatementsResult {
  ok: true;
  /** Newly inserted this call. */
  issued: DividendStatementRow[];
  /** Already live before this call (idempotent no-op). */
  existing: DividendStatementRow[];
  /** Payout names that could not be inserted (unique collision after retries / DB error). */
  failed: string[];
}

/**
 * Issue one statement per payout, skipping shareholders that already hold a
 * LIVE statement for the record. Safe to call twice: the second call inserts
 * nothing. A voided statement is re-issued with a new number.
 */
export async function issueStatementsForRecord(input: IssueStatementsInput): Promise<IssueStatementsResult> {
  const now = input.now ?? new Date();
  const live = (await listStatementsForRecord(input.db, input.record.id, input.projectId)).filter((s) => !s.voided_at);
  const liveByKey = new Map(live.map((s) => [s.shareholder_key, s]));
  const record = toStatementRecord(input.record);
  const matches = matchPayouts(input.record.payouts ?? [], input.shareholders);

  const issued: DividendStatementRow[] = [];
  const existing: DividendStatementRow[] = [];
  const failed: string[] = [];

  for (const m of matches) {
    const have = liveByKey.get(m.key);
    if (have) {
      existing.push(have);
      continue;
    }
    let inserted: DividendStatementRow | null = null;
    for (let attempt = 0; attempt < 3 && !inserted; attempt++) {
      const statementNo = statementNumber(`${input.record.id}|${m.key}|${now.toISOString()}|${attempt}`);
      const payload = buildDividendStatement({ company: input.company, record, payout: m.payout, shareholder: m.shareholder, now }, statementNo);
      const contentHash = statementContentHash(payload);
      const { data, error } = await input.db
        .from("dividend_statements")
        .insert({
          project_id: input.projectId,
          user_id: input.userId,
          dividend_record_id: input.record.id,
          shareholder_id: m.shareholder.id,
          shareholder_key: m.key,
          statement_no: statementNo,
          content_hash: contentHash,
          payload,
          credits_charged: input.creditsCharged,
          issued_at: payload.statementDate,
        })
        .select(STATEMENT_COLUMNS)
        .single();
      if (!error && data) {
        inserted = data as DividendStatementRow;
        break;
      }
      const msg = String((error as { message?: string } | null)?.message ?? "");
      const code = String((error as { code?: string } | null)?.code ?? "");
      const unique = code === "23505" || /duplicate key|unique/i.test(msg);
      if (!unique) {
        console.error("[dividends:statements] insert failed", { record: input.record.id, key: m.key, error });
        break;
      }
      // A unique hit on the LIVE index means a concurrent issue landed first — treat as existing.
      const again = (await listStatementsForRecord(input.db, input.record.id, input.projectId)).find((s) => !s.voided_at && s.shareholder_key === m.key);
      if (again) {
        existing.push(again);
        inserted = again;
        break;
      }
      // otherwise the statement_no collided → new number on the next attempt
    }
    if (!inserted) failed.push(m.payout.name);
    else if (!existing.includes(inserted)) issued.push(inserted);
  }
  return { ok: true, issued, existing, failed };
}

/* ── Void ─────────────────────────────────────────────────────────────── */

export type VoidResult = { ok: true; row: DividendStatementRow } | { ok: false; error: "not_found" | "already_voided" | "update_failed" };

export async function voidStatement(db: DividendDb, id: string, projectId: string, reason: string, now = new Date()): Promise<VoidResult> {
  const existing = await getStatementForProject(db, id, projectId);
  if (!existing) return { ok: false, error: "not_found" };
  if (existing.voided_at) return { ok: false, error: "already_voided" };
  const { data, error } = await db
    .from("dividend_statements")
    .update({ voided_at: now.toISOString(), void_reason: reason })
    .eq("id", id)
    .eq("project_id", projectId)
    .is("voided_at", null)
    .select(STATEMENT_COLUMNS)
    .maybeSingle();
  if (error || !data) return { ok: false, error: "update_failed" };
  return { ok: true, row: data as DividendStatementRow };
}

/* ── Register ─────────────────────────────────────────────────────────── */

export function registerForRecord(company: StatementCompany, record: DividendRecordRow, statements: DividendStatementRow[], now = new Date()): DividendRegisterPayload {
  return buildDividendRegister({
    company,
    record: toStatementRecord(record),
    statements: statements.map((s) => ({ payload: s.payload, statementNo: s.statement_no, voidedAt: s.voided_at })),
    now,
  });
}

/* ── Projections ──────────────────────────────────────────────────────── */

/** Public projection for the dashboard list / API. */
export function statementSummary(row: DividendStatementRow) {
  const a = row.payload?.amounts;
  return {
    id: row.id,
    statementNo: row.statement_no,
    contentHash: row.content_hash,
    recordId: row.dividend_record_id,
    shareholderId: row.shareholder_id,
    shareholderName: row.payload?.shareholder?.name ?? "",
    role: row.payload?.shareholder?.role ?? "",
    sharesHeld: row.payload?.shareholder?.sharesHeld ?? 0,
    grossAud: a?.grossAud ?? 0,
    frankingCreditAud: a?.frankingCreditAud ?? 0,
    tfnWithheldAud: a?.tfnWithheldAud ?? 0,
    netPaidAud: a?.netPaidAud ?? 0,
    frankingPct: a?.frankingPct ?? 100,
    creditsCharged: Number(row.credits_charged ?? 0),
    issuedAt: row.issued_at,
    voidedAt: row.voided_at,
    voidReason: row.void_reason,
    pdfUrl: `/api/dividends/statements/${row.id}/pdf`,
  };
}

export type StatementSummary = ReturnType<typeof statementSummary>;

export function recordSummary(row: DividendRecordRow) {
  const payouts = Array.isArray(row.payouts) ? row.payouts : [];
  return {
    id: row.id,
    period: row.period,
    createdAt: row.created_at,
    paidAt: row.paid_at ?? null,
    netIncomeAud: num(row.net_income),
    distributionPct: num(row.distribution_pct),
    totalDividendAud: num(row.total_dividend),
    perShareAud: num(row.per_share_dividend),
    companyTaxRate: num(row.franking_rate, 0.25),
    frankingPct: row.franking_pct == null ? 100 : num(row.franking_pct, 100),
    payoutCount: payouts.filter((p) => p && num(p.grossDividend) > 0).length,
    registerUrl: `/api/dividends/${row.id}/register.pdf`,
  };
}

export type RecordSummary = ReturnType<typeof recordSummary>;
