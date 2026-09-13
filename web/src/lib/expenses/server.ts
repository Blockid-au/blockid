// S28-C — server side of the expense categoriser: bank_transactions (0377)
// and expense_rules (0378) access for the /api/expenses/** routes, plus the
// "from bank CSV" figures the revenue dashboard / P&L consume.
//
// Every function takes the project id the ROUTE resolved through
// `projectScopeOrDeny` — never a caller-supplied id — and `db` is typed as
// the minimal `from()` surface so colocated tests use `fakeSupabase`.

import "server-only";
import { isExpenseCategory, gstDefaultFor, type ExpenseCategory, type GstTreatment } from "./categories";
import type { NormalisedTx } from "./bank-csv";
import {
  categoriseRows,
  categoriseWithAi,
  merchantKey,
  type AiFn,
  type CategoriseDecision,
  type CategoriseInput,
} from "./categorise";
import { summariseTransactions, type ExpenseSummary, type SummaryRow } from "./summary";

export interface ExpenseDb {
  from(table: string): any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export const TRANSACTIONS_TABLE = "bank_transactions";
export const RULES_TABLE = "expense_rules";
/** Rows a summary / list reads at most (a year of a busy startup is ~3k lines). */
export const MAX_ROWS = 5000;

export interface BankTransactionRow {
  id: string;
  project_id: string;
  statement_ref: string;
  occurred_on: string;
  description: string;
  amount_aud: number | string;
  counterparty: string | null;
  category: string;
  category_source: "rule" | "ai" | "manual" | null;
  confidence: number | string;
  needs_review: boolean;
  gst_treatment: string;
  hash: string;
  created_at: string;
  updated_at?: string;
}

export interface TransactionSummaryItem {
  id: string;
  occurredOn: string;
  description: string;
  amountAud: number;
  counterparty: string | null;
  category: ExpenseCategory;
  categorySource: "rule" | "ai" | "manual" | null;
  confidence: number;
  needsReview: boolean;
  gstTreatment: GstTreatment;
  statementRef: string;
  createdAt: string;
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function transactionSummary(row: BankTransactionRow): TransactionSummaryItem {
  const category: ExpenseCategory = isExpenseCategory(row.category) ? row.category : "other";
  const gst = row.gst_treatment;
  return {
    id: row.id,
    occurredOn: row.occurred_on,
    description: row.description,
    amountAud: num(row.amount_aud),
    counterparty: row.counterparty ?? null,
    category,
    categorySource: row.category_source ?? null,
    confidence: num(row.confidence),
    needsReview: Boolean(row.needs_review),
    gstTreatment: gst === "gst" || gst === "gst_free" || gst === "input_taxed" ? gst : "unknown",
    statementRef: row.statement_ref,
    createdAt: row.created_at,
  };
}

// ─── Learned rules ───────────────────────────────────────────────────────────

export async function loadLearnedRules(db: ExpenseDb, projectId: string): Promise<Map<string, ExpenseCategory>> {
  const out = new Map<string, ExpenseCategory>();
  const { data } = await db.from(RULES_TABLE).select("merchant_key, category").eq("project_id", projectId).limit(2000);
  for (const r of (data ?? []) as Array<{ merchant_key: string; category: string }>) {
    if (r.merchant_key && isExpenseCategory(r.category)) out.set(r.merchant_key, r.category);
  }
  return out;
}

/** Upsert the founder's decision for a merchant (PATCH /api/expenses/[id]). Skips the "unknown" key. */
export async function learnRule(db: ExpenseDb, projectId: string, description: string, category: ExpenseCategory): Promise<string | null> {
  const key = merchantKey(description);
  if (key === "unknown") return null;
  await db
    .from(RULES_TABLE)
    .upsert(
      { project_id: projectId, merchant_key: key, category, last_applied_at: new Date().toISOString() },
      { onConflict: "project_id,merchant_key" },
    );
  return key;
}

/**
 * Apply a learned rule to every OTHER un-reviewed line of the same merchant
 * in the project (the founder fixed one; the rest follow). Returns the count.
 */
export async function applyRuleToSiblings(
  db: ExpenseDb,
  projectId: string,
  merchant: string,
  category: ExpenseCategory,
  exceptId: string,
): Promise<number> {
  const { data } = await db
    .from(TRANSACTIONS_TABLE)
    .select("id, description, category_source")
    .eq("project_id", projectId)
    .eq("counterparty", merchant)
    .neq("id", exceptId)
    .limit(MAX_ROWS);
  const ids = ((data ?? []) as Array<{ id: string; category_source: string | null }>)
    .filter((r) => r.id !== exceptId && r.category_source !== "manual")
    .map((r) => r.id);
  if (ids.length === 0) return 0;
  await db
    .from(TRANSACTIONS_TABLE)
    .update({ category, category_source: "rule", confidence: 0.97, needs_review: false, gst_treatment: gstDefaultFor(category) })
    .in("id", ids);
  await db.from(RULES_TABLE).update({ hits: ids.length, last_applied_at: new Date().toISOString() }).eq("project_id", projectId).eq("merchant_key", merchant);
  return ids.length;
}

// ─── Import ──────────────────────────────────────────────────────────────────

export interface ImportResult {
  inserted: number;
  duplicates: number;
  ruleCategorised: number;
  needsAi: number;
  ids: string[];
}

function decisionToRow(d: CategoriseDecision) {
  return {
    counterparty: d.counterparty,
    category: d.category,
    category_source: d.source,
    confidence: d.confidence,
    needs_review: d.needsReview,
    gst_treatment: d.gstTreatment,
  };
}

/**
 * Store normalised lines for the project (dedupe on (project_id, hash) —
 * `ignoreDuplicates` makes a re-upload a no-op), run the rules layer on the
 * batch and stamp the decisions. Rows no rule placed stay `other` +
 * `needs_review` with `category_source` NULL — the AI queue.
 */
export async function importTransactions(
  db: ExpenseDb,
  projectId: string,
  statementRef: string,
  rows: readonly NormalisedTx[],
  learned: ReadonlyMap<string, ExpenseCategory>,
): Promise<ImportResult> {
  // Dedupe inside the upload too (the same line twice in one export).
  const seen = new Set<string>();
  const unique = rows.filter((r) => (seen.has(r.hash) ? false : (seen.add(r.hash), true)));
  const inputs: CategoriseInput[] = unique.map((r) => ({ id: r.hash, occurredOn: r.occurredOn, description: r.description, amountAud: r.amountAud }));
  const { decided, remaining } = categoriseRows(inputs, { learned });
  const byHash = new Map(decided.map((d) => [d.id, d]));

  const payload = unique.map((r) => {
    const d = byHash.get(r.hash);
    return {
      project_id: projectId,
      statement_ref: statementRef,
      occurred_on: r.occurredOn,
      description: r.description,
      amount_aud: r.amountAud,
      hash: r.hash,
      ...(d ? decisionToRow(d) : { counterparty: merchantKey(r.description), category: "other", category_source: null, confidence: 0, needs_review: true, gst_treatment: "unknown" }),
    };
  });

  let inserted = 0;
  const ids: string[] = [];
  for (let at = 0; at < payload.length; at += 500) {
    const chunk = payload.slice(at, at + 500);
    const { data, error } = await db
      .from(TRANSACTIONS_TABLE)
      .upsert(chunk, { onConflict: "project_id,hash", ignoreDuplicates: true })
      .select("id");
    if (error) throw new Error(`bank_transactions upsert failed: ${error.message ?? "unknown"}`);
    const got = (data ?? []) as Array<{ id: string }>;
    inserted += got.length;
    for (const g of got) if (g.id) ids.push(g.id);
  }
  const duplicates = Math.max(0, unique.length - inserted) + (rows.length - unique.length);
  return { inserted, duplicates, ruleCategorised: decided.length, needsAi: remaining.length, ids };
}

// ─── Queue / AI run ──────────────────────────────────────────────────────────

/** Rows still waiting for the model: nothing has decided them yet (`category_source` NULL). */
export async function loadAiQueue(db: ExpenseDb, projectId: string, limit = MAX_ROWS): Promise<BankTransactionRow[]> {
  const { data } = await db
    .from(TRANSACTIONS_TABLE)
    .select("*")
    .eq("project_id", projectId)
    .is("category_source", null)
    .order("occurred_on", { ascending: false })
    .limit(limit);
  return (data ?? []) as BankTransactionRow[];
}

export async function countAiQueue(db: ExpenseDb, projectId: string): Promise<number> {
  const { count } = await db
    .from(TRANSACTIONS_TABLE)
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .is("category_source", null);
  return typeof count === "number" ? count : 0;
}

export interface AiRunResult {
  categorised: number;
  accepted: number;
  needsReview: number;
  batches: number;
  failedBatches: number;
}

/** Run the model over the queue and write every decision back (accepted or `other` + review). */
export async function runAiOnQueue(db: ExpenseDb, projectId: string, rows: readonly BankTransactionRow[], ai: AiFn): Promise<AiRunResult> {
  const inputs: CategoriseInput[] = rows.map((r) => ({ id: r.id, occurredOn: r.occurred_on, description: r.description, amountAud: num(r.amount_aud) }));
  const res = await categoriseWithAi(inputs, { ai });
  let accepted = 0;
  let needsReview = 0;
  // Every batch failed (model down / unparseable) → write nothing: the rows
  // stay in the queue (`category_source` NULL) and the route refunds.
  if (res.batches > 0 && res.failedBatches === res.batches) {
    return { categorised: 0, accepted: 0, needsReview: 0, batches: res.batches, failedBatches: res.failedBatches };
  }
  for (const d of res.decisions) {
    if (d.needsReview) needsReview++;
    else accepted++;
    await db.from(TRANSACTIONS_TABLE).update(decisionToRow(d)).eq("id", d.id).eq("project_id", projectId);
  }
  return { categorised: res.decisions.length, accepted, needsReview, batches: res.batches, failedBatches: res.failedBatches };
}

// ─── Read ────────────────────────────────────────────────────────────────────

export async function loadTransactions(
  db: ExpenseDb,
  projectId: string,
  opts: { from?: string | null; to?: string | null; limit?: number } = {},
): Promise<BankTransactionRow[]> {
  let q = db.from(TRANSACTIONS_TABLE).select("*").eq("project_id", projectId);
  if (opts.from) q = q.gte("occurred_on", opts.from);
  if (opts.to) q = q.lte("occurred_on", opts.to);
  const { data } = await q.order("occurred_on", { ascending: false }).limit(opts.limit ?? MAX_ROWS);
  return (data ?? []) as BankTransactionRow[];
}

export async function getTransactionForProject(db: ExpenseDb, projectId: string, id: string): Promise<BankTransactionRow | null> {
  const { data } = await db.from(TRANSACTIONS_TABLE).select("*").eq("id", id).eq("project_id", projectId).maybeSingle();
  return (data as BankTransactionRow | null) ?? null;
}

export function toSummaryRows(rows: readonly BankTransactionRow[]): SummaryRow[] {
  return rows.map((r) => ({
    occurredOn: r.occurred_on,
    amountAud: num(r.amount_aud),
    category: r.category,
    counterparty: r.counterparty,
    gstTreatment: r.gst_treatment,
    needsReview: Boolean(r.needs_review),
  }));
}

export async function loadSummary(db: ExpenseDb, projectId: string, opts: { from?: string | null; to?: string | null } = {}): Promise<ExpenseSummary> {
  const rows = await loadTransactions(db, projectId, opts);
  return summariseTransactions(toSummaryRows(rows), opts);
}

// ─── Feed the platform ───────────────────────────────────────────────────────

export interface BankCsvFigures {
  /** Average monthly operating spend (the burn) over the months with data. */
  monthlyOpex: number;
  /** Average monthly income (revenue + grants) over the months with data. */
  monthlyIncome: number;
  /**
   * S28-review: average monthly `revenue`-category income ONLY (no
   * government grants) — the figure that may stand in for MRR. A grant is
   * income, not recurring revenue, and must not feed an ARR multiple.
   */
  monthlyRevenue: number;
  /** Income across the whole window. */
  income: number;
  monthsWithData: number;
  /** Latest import time (ISO) — the "from bank CSV, 3 Sep" label. */
  takenAt: string | null;
  needsReviewCount: number;
}

/**
 * The figures `lib/revenue/sources.ts` and the P&L read as the
 * "from bank CSV" fallback. `null` when the project has no categorised
 * lines (a missing table — migration not applied — also yields null, never
 * a throw, so the dashboard keeps working).
 */
export async function bankCsvFigures(
  db: ExpenseDb,
  projectId: string | null | undefined,
  opts: { months?: number; now?: Date } = {},
): Promise<BankCsvFigures | null> {
  if (!projectId) return null;
  const months = opts.months ?? 12;
  const now = opts.now ?? new Date();
  const fromDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months, 1));
  const from = fromDate.toISOString().slice(0, 10);
  try {
    const rows = await loadTransactions(db, projectId, { from });
    if (rows.length === 0) return null;
    const summary = summariseTransactions(toSummaryRows(rows));
    if (summary.monthsWithData === 0) return null;
    let takenAt: string | null = null;
    for (const r of rows) if (r.created_at && (!takenAt || r.created_at > takenAt)) takenAt = r.created_at;
    return {
      monthlyOpex: summary.burnRateAud,
      monthlyIncome: Math.round((summary.totals.income / summary.monthsWithData) * 100) / 100,
      monthlyRevenue: Math.round((Math.max(0, summary.totals.byCategory.revenue ?? 0) / summary.monthsWithData) * 100) / 100,
      income: summary.totals.income,
      monthsWithData: summary.monthsWithData,
      takenAt,
      needsReviewCount: summary.needsReviewCount,
    };
  } catch {
    return null;
  }
}

/** Burn-rate fallback for routes that read `startup_metrics.burn_rate_aud`: the bank-CSV burn when the metric is empty. */
export async function burnRateWithBankFallback(
  db: ExpenseDb,
  projectId: string | null | undefined,
  metricBurn: number | null | undefined,
): Promise<{ burnRate: number; source: "startup_metrics" | "bank_csv" | "none"; takenAt: string | null }> {
  const metric = Number(metricBurn ?? 0) || 0;
  if (metric > 0) return { burnRate: metric, source: "startup_metrics", takenAt: null };
  const bank = await bankCsvFigures(db, projectId);
  if (bank && bank.monthlyOpex > 0) return { burnRate: bank.monthlyOpex, source: "bank_csv", takenAt: bank.takenAt };
  return { burnRate: 0, source: "none", takenAt: null };
}
