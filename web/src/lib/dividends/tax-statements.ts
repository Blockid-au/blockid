// Shareholder annual tax statements — the server half (S28-A): list / get
// the `shareholder_tax_statements` rows of a project (migration 0372),
// summarise a financial year from the live distribution statements, and
// generate one frozen statement per shareholder — idempotent per
// (project, FY, shareholder); `regenerate` supersedes the current version
// and inserts n+1 (the S27-A pattern of `board_resolutions`, 0361).
//
// The content hash reuses the score-proof primitives (`lib/proofs`) like
// the distribution statements. Every DB access takes the admin client as an
// argument so the colocated suites drive it with `fakeSupabase` (which
// ignores filters — hence the defensive re-checks on every row read).

import "server-only";

import { canonicalizeScore } from "@/lib/proofs/canonical-json";
import { hashScore } from "@/lib/proofs/hash";
import type { DividendDb, DividendStatementRow } from "./server";
import { buildShareholderTaxStatement, parseFy, summariseFinancialYear, taxStatementNumber, type FySummary, type ShareholderTaxStatementPayload } from "./fy-summary";
import type { StatementCompany } from "./statement";

export interface ShareholderTaxStatementRow {
  id: string;
  project_id: string;
  user_id: string;
  fy: string;
  shareholder_id: string | null;
  shareholder_key: string;
  statement_no: string;
  content_hash: string;
  totals: ShareholderTaxStatementPayload["totals"];
  payload: ShareholderTaxStatementPayload;
  credits_charged: number | string;
  version: number | null;
  issued_at: string;
  superseded_at: string | null;
  superseded_by: string | null;
}

export const TAX_STATEMENT_COLUMNS = "id, project_id, user_id, fy, shareholder_id, shareholder_key, statement_no, content_hash, totals, payload, credits_charged, version, issued_at, superseded_at, superseded_by";

export function taxStatementContentHash(payload: ShareholderTaxStatementPayload): string {
  return hashScore(canonicalizeScore(payload));
}

export function taxStatementVersion(row: Pick<ShareholderTaxStatementRow, "version">): number {
  const v = Number(row.version);
  return Number.isFinite(v) && v >= 1 ? Math.floor(v) : 1;
}

/* ── Reads ────────────────────────────────────────────────────────────── */

/** Every row (all versions) of the project, newest first. */
export async function listTaxStatementsForProject(db: DividendDb, projectId: string, limit = 1000): Promise<ShareholderTaxStatementRow[]> {
  const { data } = await db.from("shareholder_tax_statements").select(TAX_STATEMENT_COLUMNS).eq("project_id", projectId).order("issued_at", { ascending: false }).limit(limit);
  return ((data as ShareholderTaxStatementRow[] | null) ?? []).filter((r) => r && r.id && r.project_id === projectId);
}

/** Rows of one FY (all versions). */
export async function listTaxStatementsForFy(db: DividendDb, projectId: string, fy: string): Promise<ShareholderTaxStatementRow[]> {
  const { data } = await db.from("shareholder_tax_statements").select(TAX_STATEMENT_COLUMNS).eq("project_id", projectId).eq("fy", fy).order("issued_at", { ascending: false });
  return ((data as ShareholderTaxStatementRow[] | null) ?? []).filter((r) => r && r.id && r.project_id === projectId && r.fy === fy);
}

export function currentOnly(rows: ShareholderTaxStatementRow[]): ShareholderTaxStatementRow[] {
  return rows.filter((r) => !r.superseded_at);
}

/** A statement by id, scoped to the project the caller has a role on. Null when it is another project's. */
export async function getTaxStatementForProject(db: DividendDb, id: string, projectId: string): Promise<ShareholderTaxStatementRow | null> {
  const { data } = await db.from("shareholder_tax_statements").select(TAX_STATEMENT_COLUMNS).eq("id", id).eq("project_id", projectId).maybeSingle();
  const row = (data as ShareholderTaxStatementRow | null) ?? null;
  if (!row || row.id !== id || row.project_id !== projectId) return null;
  return row;
}

/**
 * Has this (project, FY) already been paid for? The per-run charge is
 * stamped as `credits_charged` on every row the charged call inserts, so a
 * retry after a partial insert failure is free (same rule as the
 * distribution statements, S25-review-2 P2). A regenerate is a NEW run —
 * it looks at the rows of the version it is about to create, so the marker
 * on the old version does not apply (the caller passes only current rows
 * when not regenerating, and none when regenerating).
 */
export function fyAlreadyCharged(rows: Array<Pick<ShareholderTaxStatementRow, "credits_charged">>): boolean {
  return rows.some((r) => Number(r?.credits_charged ?? 0) > 0);
}

/* ── Summary ──────────────────────────────────────────────────────────── */

/** The FY summary from the project's distribution statements (live rows paid inside the FY). */
export function summariseFyFromStatements(fy: string, statements: DividendStatementRow[]): FySummary | null {
  return summariseFinancialYear({
    fy,
    statements: statements.map((s) => ({ id: s.id, statementNo: s.statement_no, payload: s.payload, voidedAt: s.voided_at })),
  });
}

/* ── Generate ─────────────────────────────────────────────────────────── */

export interface GenerateTaxStatementsInput {
  db: DividendDb;
  projectId: string;
  userId: string;
  company: StatementCompany;
  fy: string;
  /** The project's distribution statements (all — the summary filters). */
  statements: DividendStatementRow[];
  /** Existing rows of the FY (all versions) — read by the route for the preview, passed in so the run and the preview agree. */
  existingRows: ShareholderTaxStatementRow[];
  regenerate: boolean;
  creditsCharged: number;
  now?: Date;
}

export interface GenerateTaxStatementsResult {
  ok: true;
  fy: string;
  /** Newly inserted this call. */
  generated: ShareholderTaxStatementRow[];
  /** Current rows kept as-is (idempotent no-op — not regenerating). */
  existing: ShareholderTaxStatementRow[];
  /** Rows superseded by this call (regenerate). */
  superseded: ShareholderTaxStatementRow[];
  /** Shareholder names whose row could not be inserted. */
  failed: string[];
  /** Shareholders in the FY summary. */
  shareholderCount: number;
}

/**
 * Generate the FY statements. Without `regenerate`, a shareholder who
 * already holds a CURRENT row for the FY is returned as `existing` and
 * nothing is inserted for them. With `regenerate`, every shareholder of the
 * summary gets version n+1 and the previous current row is superseded
 * (never deleted). Statement numbers continue the per-project FY sequence
 * (`TS-<FY>-<n>`), retried on a unique collision.
 */
export async function generateTaxStatementsForFy(input: GenerateTaxStatementsInput): Promise<GenerateTaxStatementsResult> {
  const now = input.now ?? new Date();
  const fy = parseFy(input.fy);
  if (!fy) return { ok: true, fy: input.fy, generated: [], existing: [], superseded: [], failed: [], shareholderCount: 0 };
  const summary = summariseFyFromStatements(fy.label, input.statements);
  const shareholders = summary?.shareholders ?? [];

  const rows = input.existingRows.filter((r) => r.fy === fy.label && r.project_id === input.projectId);
  const currentByKey = new Map(currentOnly(rows).map((r) => [r.shareholder_key, r]));
  const versionByKey = new Map<string, number>();
  for (const r of rows) versionByKey.set(r.shareholder_key, Math.max(versionByKey.get(r.shareholder_key) ?? 0, taxStatementVersion(r)));
  // Next sequence number = highest existing n + 1 (all versions count).
  let seq = rows.reduce((max, r) => {
    const m = /-(\d{1,6})$/.exec(r.statement_no ?? "");
    return Math.max(max, m ? Number(m[1]) : 0);
  }, 0);

  const generated: ShareholderTaxStatementRow[] = [];
  const existing: ShareholderTaxStatementRow[] = [];
  const superseded: ShareholderTaxStatementRow[] = [];
  const failed: string[] = [];

  for (const sh of shareholders) {
    const current = currentByKey.get(sh.shareholderKey) ?? null;
    if (current && !input.regenerate) {
      existing.push(current);
      continue;
    }
    const version = (versionByKey.get(sh.shareholderKey) ?? 0) + 1;
    let inserted: ShareholderTaxStatementRow | null = null;
    for (let attempt = 0; attempt < 3 && !inserted; attempt++) {
      seq += 1;
      const statementNo = taxStatementNumber(fy.label, seq);
      const payload = buildShareholderTaxStatement({ company: input.company, summary: sh, fy, now }, statementNo);
      const contentHash = taxStatementContentHash(payload);
      const { data, error } = await input.db
        .from("shareholder_tax_statements")
        .insert({
          project_id: input.projectId,
          user_id: input.userId,
          fy: fy.label,
          shareholder_id: sh.shareholderId,
          shareholder_key: sh.shareholderKey,
          statement_no: statementNo,
          content_hash: contentHash,
          totals: payload.totals,
          payload,
          credits_charged: input.creditsCharged,
          version,
          issued_at: payload.statementDate,
        })
        .select(TAX_STATEMENT_COLUMNS)
        .single();
      if (!error && data) {
        inserted = data as ShareholderTaxStatementRow;
        break;
      }
      const msg = String((error as { message?: string } | null)?.message ?? "");
      const code = String((error as { code?: string } | null)?.code ?? "");
      const unique = code === "23505" || /duplicate key|unique/i.test(msg);
      if (!unique) {
        console.error("[dividends:tax-statements] insert failed", { project: input.projectId, fy: fy.label, key: sh.shareholderKey, error });
        break;
      }
      // Either the statement number collided (→ next n) or a concurrent run
      // landed a current row for this shareholder (→ treat as existing).
      if (current || !input.regenerate) {
        const again = (await listTaxStatementsForFy(input.db, input.projectId, fy.label)).find((r) => !r.superseded_at && r.shareholder_key === sh.shareholderKey && r.id !== current?.id);
        if (again) {
          existing.push(again);
          inserted = again;
          break;
        }
      }
    }
    if (!inserted) {
      failed.push(sh.name);
      continue;
    }
    if (existing.includes(inserted)) continue;
    generated.push(inserted);
    if (current && input.regenerate) {
      const { error } = await input.db
        .from("shareholder_tax_statements")
        .update({ superseded_at: now.toISOString(), superseded_by: inserted.id ?? null })
        .eq("id", current.id)
        .eq("project_id", input.projectId)
        .is("superseded_at", null);
      if (error) console.error("[dividends:tax-statements] supersede failed", { id: current.id, error });
      else superseded.push({ ...current, superseded_at: now.toISOString(), superseded_by: inserted.id ?? null });
    }
  }
  return { ok: true, fy: fy.label, generated, existing, superseded, failed, shareholderCount: shareholders.length };
}

/* ── Projections ──────────────────────────────────────────────────────── */

export function taxStatementSummary(row: ShareholderTaxStatementRow) {
  const t = row.payload?.totals ?? row.totals;
  return {
    id: row.id,
    statementNo: row.statement_no,
    contentHash: row.content_hash,
    fy: row.fy,
    version: taxStatementVersion(row),
    current: !row.superseded_at,
    supersededAt: row.superseded_at ?? null,
    shareholderId: row.shareholder_id,
    shareholderName: row.payload?.shareholder?.name ?? "",
    role: row.payload?.shareholder?.role ?? "",
    tfnOnFile: Boolean(row.payload?.shareholder?.tfnOnFile),
    distributions: t?.distributions ?? 0,
    grossAud: t?.grossAud ?? 0,
    frankedAud: t?.frankedAud ?? 0,
    unfrankedAud: t?.unfrankedAud ?? 0,
    frankingCreditAud: t?.frankingCreditAud ?? 0,
    tfnWithheldAud: t?.tfnWithheldAud ?? 0,
    netPaidAud: t?.netPaidAud ?? 0,
    grossedUpAud: t?.grossedUpAud ?? 0,
    dripShares: t?.dripShares ?? 0,
    creditsCharged: Number(row.credits_charged ?? 0),
    issuedAt: row.issued_at,
    pdfUrl: `/api/dividends/tax-statements/${row.id}/pdf`,
  };
}

export type TaxStatementSummary = ReturnType<typeof taxStatementSummary>;
