// DRIP — the server half (S28-A): elections CRUD for a project scope and
// the allocation record written when the S25-B issue flow
// (`issueStatementsForRecord`, lib/dividends/server.ts) allots DRIP shares.
//
// The cap-table write follows the SAME path as the cap-table "Issue
// shares" action (api/cap-table/route.ts `issue_shares`): a
// `share_transactions` row (transaction_type 'issue', round_name
// 'DRIP <period>') + `shareholders.shares_held` incremented. That path has
// no approval step — shares land on the register immediately — so the
// allocation is recorded as `recorded`, and the S26-B share-issue board
// resolution (kind 'share-issue', record_id = share_transactions.id) is
// what the directors sign afterwards; the panel says so.
//
// Every DB access takes the admin client as an argument so the colocated
// suites drive it with `fakeSupabase` (which ignores filters — hence the
// defensive re-checks on every row read). No import from ./server.ts, so
// server.ts can import this module without a cycle.

import "server-only";

import { computeDripAllocation, electionPrice, type DripAllocation, type DripPriceBasis } from "./drip";
import { periodEndDate, roundCents, type StatementDrip, type StatementShareholder } from "./statement";

/** Minimal query-builder surface (Supabase admin client or the test fake). */
export interface DripDb {
  from(table: string): any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export interface DripElectionRow {
  id: string;
  project_id: string;
  user_id: string;
  shareholder_id: string;
  participation_pct: number | string;
  price_basis: DripPriceBasis;
  manual_price_aud: number | string | null;
  elected_at: string;
  revoked_at: string | null;
  created_at: string;
}

export interface DripAllocationRow {
  id: string;
  project_id: string;
  dividend_record_id: string;
  dividend_statement_id: string | null;
  election_id: string | null;
  shareholder_id: string | null;
  shareholder_key: string;
  share_transaction_id: string | null;
  status: "recorded" | "skipped";
  skip_reason: string | null;
  participation_pct: number | string;
  price_basis: DripPriceBasis;
  net_cash_aud: number | string;
  price_aud: number | string;
  shares: number | string;
  reinvested_aud: number | string;
  residual_aud: number | string;
  created_at: string;
}

export const ELECTION_COLUMNS = "id, project_id, user_id, shareholder_id, participation_pct, price_basis, manual_price_aud, elected_at, revoked_at, created_at";
export const ALLOCATION_COLUMNS =
  "id, project_id, dividend_record_id, dividend_statement_id, election_id, shareholder_id, shareholder_key, share_transaction_id, status, skip_reason, participation_pct, price_basis, net_cash_aud, price_aud, shares, reinvested_aud, residual_aud, created_at";

function num(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? n : fallback;
}

/* ── Elections ────────────────────────────────────────────────────────── */

export interface DripElection {
  id: string;
  shareholderId: string;
  participationPct: number;
  priceBasis: DripPriceBasis;
  manualPriceAud: number | null;
  electedAt: string;
  revokedAt: string | null;
}

export function toElection(row: DripElectionRow): DripElection {
  const manual = row.manual_price_aud == null ? null : num(row.manual_price_aud, Number.NaN);
  return {
    id: row.id,
    shareholderId: row.shareholder_id,
    participationPct: num(row.participation_pct),
    priceBasis: row.price_basis === "manual" ? "manual" : "share_price_mid",
    manualPriceAud: manual != null && Number.isFinite(manual) && manual > 0 ? manual : null,
    electedAt: row.elected_at,
    revokedAt: row.revoked_at ?? null,
  };
}

/** Every election of the project (active first, newest first). */
export async function listElectionsForProject(db: DripDb, projectId: string, limit = 200): Promise<DripElection[]> {
  const { data } = await db.from("drip_elections").select(ELECTION_COLUMNS).eq("project_id", projectId).order("elected_at", { ascending: false }).limit(limit);
  return ((data as DripElectionRow[] | null) ?? [])
    .filter((r) => r && r.id && r.project_id === projectId)
    .map(toElection)
    .sort((a, b) => Number(Boolean(a.revokedAt)) - Number(Boolean(b.revokedAt)) || b.electedAt.localeCompare(a.electedAt));
}

export async function listActiveElections(db: DripDb, projectId: string): Promise<DripElection[]> {
  return (await listElectionsForProject(db, projectId)).filter((e) => !e.revokedAt);
}

export type UpsertElectionResult = { ok: true; election: DripElection; replaced: boolean } | { ok: false; error: "insert_failed" };

/**
 * Record an election for a shareholder. An existing ACTIVE election for the
 * same shareholder is revoked first (one active row per shareholder —
 * `uq_drip_elections_active`), so "edit" is revoke + insert and the old row
 * stays for the allocations that reference it.
 */
export async function upsertElection(
  db: DripDb,
  input: { projectId: string; userId: string; shareholderId: string; participationPct: number; priceBasis: DripPriceBasis; manualPriceAud: number | null; now?: Date },
): Promise<UpsertElectionResult> {
  const now = input.now ?? new Date();
  const active = (await listActiveElections(db, input.projectId)).find((e) => e.shareholderId === input.shareholderId);
  if (active) {
    await db.from("drip_elections").update({ revoked_at: now.toISOString() }).eq("id", active.id).eq("project_id", input.projectId).is("revoked_at", null);
  }
  const { data, error } = await db
    .from("drip_elections")
    .insert({
      project_id: input.projectId,
      user_id: input.userId,
      shareholder_id: input.shareholderId,
      participation_pct: input.participationPct,
      price_basis: input.priceBasis,
      manual_price_aud: input.priceBasis === "manual" ? input.manualPriceAud : null,
      elected_at: now.toISOString(),
    })
    .select(ELECTION_COLUMNS)
    .single();
  if (error || !data) {
    console.error("[dividends:drip] election insert failed", { project: input.projectId, shareholder: input.shareholderId, error });
    return { ok: false, error: "insert_failed" };
  }
  const row = data as Partial<DripElectionRow>;
  return {
    ok: true,
    replaced: Boolean(active),
    election: toElection({
      id: row.id ?? "",
      project_id: input.projectId,
      user_id: input.userId,
      shareholder_id: input.shareholderId,
      participation_pct: row.participation_pct ?? input.participationPct,
      price_basis: (row.price_basis as DripPriceBasis | undefined) ?? input.priceBasis,
      manual_price_aud: row.manual_price_aud ?? (input.priceBasis === "manual" ? input.manualPriceAud : null),
      elected_at: row.elected_at ?? now.toISOString(),
      revoked_at: null,
      created_at: row.created_at ?? now.toISOString(),
    }),
  };
}

export type RevokeElectionResult = { ok: true; election: DripElection } | { ok: false; error: "not_found" | "already_revoked" | "update_failed" };

export async function revokeElection(db: DripDb, id: string, projectId: string, now = new Date()): Promise<RevokeElectionResult> {
  const existing = (await listElectionsForProject(db, projectId)).find((e) => e.id === id);
  if (!existing) return { ok: false, error: "not_found" };
  if (existing.revokedAt) return { ok: false, error: "already_revoked" };
  const { error } = await db.from("drip_elections").update({ revoked_at: now.toISOString() }).eq("id", id).eq("project_id", projectId).is("revoked_at", null);
  if (error) return { ok: false, error: "update_failed" };
  return { ok: true, election: { ...existing, revokedAt: now.toISOString() } };
}

/* ── Allocations ──────────────────────────────────────────────────────── */

/** Allocations already made for a dividend record, by shareholder key (a re-issue after a void reuses them). */
export async function listAllocationsForRecord(db: DripDb, recordId: string, projectId: string): Promise<DripAllocationRow[]> {
  const { data } = await db.from("drip_allocations").select(ALLOCATION_COLUMNS).eq("dividend_record_id", recordId).eq("project_id", projectId);
  return ((data as DripAllocationRow[] | null) ?? []).filter((r) => r && r.id && r.dividend_record_id === recordId && r.project_id === projectId);
}

export async function listAllocationsForProject(db: DripDb, projectId: string, limit = 500): Promise<DripAllocationRow[]> {
  const { data } = await db.from("drip_allocations").select(ALLOCATION_COLUMNS).eq("project_id", projectId).order("created_at", { ascending: false }).limit(limit);
  return ((data as DripAllocationRow[] | null) ?? []).filter((r) => r && r.id && r.project_id === projectId);
}

/** The frozen statement line from a stored allocation row. */
export function allocationToStatementDrip(row: DripAllocationRow): StatementDrip {
  const net = roundCents(num(row.net_cash_aud));
  const reinvested = roundCents(num(row.reinvested_aud));
  return {
    electionId: row.election_id,
    participationPct: num(row.participation_pct),
    priceBasis: row.price_basis,
    priceAud: num(row.price_aud),
    shares: Math.floor(num(row.shares)),
    reinvestedAud: reinvested,
    residualAud: roundCents(num(row.residual_aud)),
    cashPaidAud: roundCents(net - reinvested),
    skipped: row.status === "skipped" ? row.skip_reason ?? "skipped" : null,
  };
}

export function allocationToStatementDripFromMaths(a: DripAllocation, election: Pick<DripElection, "id" | "priceBasis">): StatementDrip {
  return {
    electionId: election.id,
    participationPct: a.participationPct,
    priceBasis: election.priceBasis,
    priceAud: a.priceAud,
    shares: a.shares,
    reinvestedAud: a.reinvestedAud,
    residualAud: a.residualAud,
    cashPaidAud: a.cashPaidAud,
    skipped: a.ok ? null : a.reason,
  };
}

/** The DRIP context the issue flow carries (built by the route). */
export interface IssueDripContext {
  /** ACTIVE elections of the project. */
  elections: DripElection[];
  /** S26-B blended price per share (mid) — null when no valuation / no shares. */
  marketPriceAud: number | null;
  /** `share_transactions.account_id` — the project OWNER's user id. */
  ownerUserId: string;
  /** First ordinary share class id of the owner's cap table — the fallback class for the DRIP issue. */
  defaultShareClassId: string | null;
}

/** The owner's ordinary share class (else the first class) — the DRIP issue class for a shareholder with no class of their own. */
export async function loadDefaultShareClassId(db: DripDb, ownerUserId: string): Promise<string | null> {
  const { data } = await db.from("share_classes").select("id, account_id, class_type, created_at").eq("account_id", ownerUserId).order("created_at", { ascending: true });
  const rows = ((data as Array<{ id: string; account_id?: string; class_type?: string | null }> | null) ?? []).filter((c) => c && c.id && (!c.account_id || c.account_id === ownerUserId));
  return rows.find((c) => (c.class_type ?? "ordinary") === "ordinary")?.id ?? rows[0]?.id ?? null;
}

/** Plan the allocation for one shareholder (pure apart from the lookup); null when the shareholder has no active election. */
export function planDripForShareholder(ctx: IssueDripContext, shareholder: StatementShareholder, netPaidAud: number): { election: DripElection; allocation: DripAllocation } | null {
  if (!shareholder.id) return null;
  const election = ctx.elections.find((e) => !e.revokedAt && e.shareholderId === shareholder.id);
  if (!election) return null;
  const price = electionPrice(election, ctx.marketPriceAud);
  return { election, allocation: computeDripAllocation({ netCashAud: netPaidAud, participationPct: election.participationPct, priceAud: price }) };
}

export interface RecordDripAllocationInput {
  db: DripDb;
  projectId: string;
  ctx: IssueDripContext;
  record: { id: string; period: string; paidAt: string | null };
  statement: { id: string | null; statementNo: string };
  shareholder: StatementShareholder & { shareClassId?: string | null };
  shareholderKey: string;
  election: DripElection;
  allocation: DripAllocation;
}

export interface RecordDripAllocationResult {
  allocationId: string | null;
  shareTransactionId: string | null;
  status: "recorded" | "skipped";
}

/**
 * Persist the allocation for one issued statement:
 *   1. `share_transactions` issue row (round_name `DRIP <period>`) and
 *      `shareholders.shares_held += shares` — the cap-table issue path — when
 *      at least one share is allotted;
 *   2. the `drip_allocations` row (status recorded / skipped).
 * A cap-table write failure leaves the allocation `skipped` so the
 * statement is never out of step with the register.
 */
export async function recordDripAllocation(input: RecordDripAllocationInput): Promise<RecordDripAllocationResult> {
  const { db, allocation: a, election } = input;
  let shareTransactionId: string | null = null;
  let status: "recorded" | "skipped" = a.ok && a.shares > 0 ? "recorded" : "skipped";
  let skipReason: string | null = a.ok ? null : a.reason;

  if (status === "recorded" && input.shareholder.id) {
    const effectiveDate = input.record.paidAt || periodEndDate(input.record.period);
    const { data: tx, error: txError } = await db
      .from("share_transactions")
      .insert({
        account_id: input.ctx.ownerUserId,
        project_id: input.projectId,
        transaction_type: "issue",
        to_shareholder_id: input.shareholder.id,
        share_class_id: input.shareholder.shareClassId ?? input.ctx.defaultShareClassId,
        shares: a.shares,
        price_per_share: a.priceAud,
        total_value: a.reinvestedAud,
        round_name: `DRIP ${input.record.period}`,
        notes: `Dividend reinvestment plan — statement ${input.statement.statementNo}: ${a.participationPct}% of the net dividend reinvested (A$${a.reinvestedAud.toFixed(2)} at A$${a.priceAud} per share); residual A$${a.residualAud.toFixed(2)} paid in cash.`,
        effective_date: effectiveDate,
      })
      .select("id")
      .single();
    if (txError || !tx) {
      console.error("[dividends:drip] share_transactions insert failed", { record: input.record.id, shareholder: input.shareholder.id, error: txError });
      status = "skipped";
      skipReason = "cap_table_write_failed";
    } else {
      shareTransactionId = (tx as { id?: string }).id ?? null;
      const { error: upError } = await db
        .from("shareholders")
        .update({ shares_held: Math.floor(input.shareholder.sharesHeld) + a.shares })
        .eq("id", input.shareholder.id)
        .eq("account_id", input.ctx.ownerUserId);
      if (upError) console.error("[dividends:drip] shares_held update failed — transaction row stands", { shareholder: input.shareholder.id, error: upError });
    }
  }

  const { data, error } = await db
    .from("drip_allocations")
    .insert({
      project_id: input.projectId,
      dividend_record_id: input.record.id,
      dividend_statement_id: input.statement.id,
      election_id: election.id,
      shareholder_id: input.shareholder.id,
      shareholder_key: input.shareholderKey,
      share_transaction_id: shareTransactionId,
      status,
      skip_reason: skipReason,
      participation_pct: a.participationPct,
      price_basis: election.priceBasis,
      net_cash_aud: a.netCashAud,
      price_aud: a.priceAud,
      shares: status === "recorded" ? a.shares : 0,
      reinvested_aud: status === "recorded" ? a.reinvestedAud : 0,
      residual_aud: status === "recorded" ? a.residualAud : 0,
    })
    .select("id")
    .single();
  if (error) console.error("[dividends:drip] drip_allocations insert failed", { record: input.record.id, key: input.shareholderKey, error });
  return { allocationId: ((data as { id?: string } | null) ?? null)?.id ?? null, shareTransactionId, status };
}

/* ── Projections ──────────────────────────────────────────────────────── */

export function electionSummary(e: DripElection, shareholder: { name: string; role: string | null; sharesHeld: number } | null) {
  return {
    id: e.id,
    shareholderId: e.shareholderId,
    shareholderName: shareholder?.name ?? "—",
    role: shareholder?.role ?? null,
    sharesHeld: shareholder?.sharesHeld ?? 0,
    participationPct: e.participationPct,
    priceBasis: e.priceBasis,
    manualPriceAud: e.manualPriceAud,
    electedAt: e.electedAt,
    revokedAt: e.revokedAt,
    active: !e.revokedAt,
  };
}

export type ElectionSummary = ReturnType<typeof electionSummary>;

export function allocationSummary(row: DripAllocationRow, shareholderName: string | null) {
  return {
    id: row.id,
    recordId: row.dividend_record_id,
    statementId: row.dividend_statement_id,
    shareholderId: row.shareholder_id,
    shareholderName: shareholderName ?? row.shareholder_key.replace(/^name:/, ""),
    status: row.status,
    skipReason: row.skip_reason,
    participationPct: num(row.participation_pct),
    priceBasis: row.price_basis,
    netCashAud: num(row.net_cash_aud),
    priceAud: num(row.price_aud),
    shares: Math.floor(num(row.shares)),
    reinvestedAud: num(row.reinvested_aud),
    residualAud: num(row.residual_aud),
    shareTransactionId: row.share_transaction_id,
    resolutionUrl: row.share_transaction_id ? `/api/board-resolutions/share-issue/${row.share_transaction_id}` : null,
    createdAt: row.created_at,
  };
}

export type AllocationSummary = ReturnType<typeof allocationSummary>;
