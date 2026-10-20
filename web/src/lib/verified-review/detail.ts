// G35 Pricing v5 P4 — Admin › Verified Reviews data layer (plan §6.6).
//
//   loadVerifiedReviewQueue(db, now)   IN_REVIEW orders, overdue first, then
//                                      by sla_due_at (Sydney business days)
//   loadVerifiedReviewDetail(db, id)   one order: startup, buyer, SLA, the
//                                      report's evidence + claims with the
//                                      reviewer's decisions, review notes
//   recordClaimDecision(db, …)         per-claim accept / reject (+ note) →
//                                      report_review_claims; an Evidence Hub
//                                      row also goes through
//                                      lib/evidence/review.ts applyEvidenceReview
//                                      so svi_dimension_evidence.review_status
//                                      stays the single source
//   saveReviewNotes(db, …)             report_reviews.notes (admin-only table)
//
// Items under review (claim_ref, 0474 report_review_claims.claim_ref):
//   hub:<uuid>      svi_dimension_evidence row of the order's project
//   ev:<id>         evidence row the report itself cites (appendix register +
//                   chapter evidence; `missing` rows are gaps, not evidence)
//   claim:<uuid>    a G21 `claims` row (statement-level; recorded, not graded)
//
// Refund interplay: only IN_REVIEW orders are listed or decidable; a
// REFUNDED order drops out of the queue and every write refuses it.
//
// Every caller is admin-gated (page: isAdmin redirect; API: requireAdmin);
// reads go through the service-role client.

import type { SupabaseClient } from "@supabase/supabase-js";
import { applyEvidenceReview, REVIEW_NOTE_MAX, type ApplyReviewResult } from "@/lib/evidence/review";
import { DIMENSION_OWNERS, type DimKey } from "@/lib/report-pipeline/dimension-owners";
import { resolveOrderTier } from "@/lib/report-v2/order-tier";
import type { EvidenceRow, ReportAccessTier, ReportV2 } from "@/lib/report-v2/schema";
import { readAssembledReportJson, readAssembledReportPaygTier } from "@/lib/report-v2/storage";
import { describeSla, type SlaSummary } from "./sla";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ReviewDb = Pick<SupabaseClient<any, any, any>, "from">;
type Row = Record<string, unknown>;

export const REVIEW_NOTES_MAX = 5000;
export const ORDER_COLUMNS = "id, user_id, business_id, product_sku, tier, status, report_id, paid_at, created_at, sla_due_at, reviewed_at, reviewed_by, delivered_at";
const REVIEW_COLUMNS = "id, order_id, report_id, reviewer_id, notes, status, created_at, completed_at";
const HUB_COLUMNS = "id, project_id, dimension, evidence_type, evidence_label, evidence_value_or_url, confidence_level, is_verified, review_status, review_note, created_at";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
const isHttp = (v: unknown): v is string => typeof v === "string" && /^https?:\/\//i.test(v.trim());

function errCode(e: unknown): string | null {
  return e && typeof e === "object" && typeof (e as { code?: unknown }).code === "string" ? (e as { code: string }).code : null;
}
function errMessage(e: unknown): string {
  return e && typeof e === "object" && typeof (e as { message?: unknown }).message === "string" ? (e as { message: string }).message : "query_failed";
}
/** 42703 / PGRST204 = a 0474 column is unknown → the page shows "apply 0474"; 42P01 = table missing. */
function isSchemaMissing(e: unknown): boolean {
  const c = errCode(e);
  return c === "42703" || c === "PGRST204" || c === "42P01" || c === "PGRST205";
}

export function dimTitle(dim: string): string {
  return DIMENSION_OWNERS[dim as DimKey]?.title ?? dim.toUpperCase();
}

// ─── queue ────────────────────────────────────────────────────────────────

export interface VerifiedQueueRow {
  orderId: string;
  status: string;
  tier: ReportAccessTier;
  sku: string | null;
  projectId: string | null;
  startupName: string | null;
  buyerEmail: string | null;
  buyerName: string | null;
  paidAt: string | null;
  reportId: string | null;
  sla: SlaSummary;
  reviewStatus: string | null;
  decisions: number;
}

export interface VerifiedQueue {
  rows: VerifiedQueueRow[];
  counts: { total: number; overdue: number; dueSoon: number; onTrack: number };
  /** "migration_pending" when 0474 is not applied; otherwise a DB message. */
  error: string | null;
  generatedAt: string;
}

const STATE_RANK: Record<SlaSummary["state"], number> = { overdue: 0, due_soon: 1, on_track: 2, no_sla: 3 };

/** Overdue first (most overdue first), then the earliest deadline; no SLA last (oldest payment first). */
export function compareQueueRows(a: Pick<VerifiedQueueRow, "sla" | "paidAt" | "orderId">, b: Pick<VerifiedQueueRow, "sla" | "paidAt" | "orderId">): number {
  const r = STATE_RANK[a.sla.state] - STATE_RANK[b.sla.state];
  if (r !== 0) return r;
  if (a.sla.state === "overdue" && a.sla.overdueMs !== b.sla.overdueMs) return b.sla.overdueMs - a.sla.overdueMs;
  const da = a.sla.dueAt ?? "";
  const dbb = b.sla.dueAt ?? "";
  if (da !== dbb) return da < dbb ? -1 : 1;
  const pa = a.paidAt ?? "";
  const pb = b.paidAt ?? "";
  if (pa !== pb) return pa < pb ? -1 : 1;
  return a.orderId < b.orderId ? -1 : a.orderId > b.orderId ? 1 : 0;
}

async function namesFor(db: ReviewDb, projectIds: string[], userIds: string[]) {
  const projects = new Map<string, { name: string | null; abn: string | null; verificationLevel: number | null }>();
  const users = new Map<string, { email: string | null; name: string | null }>();
  if (projectIds.length) {
    try {
      const { data } = await db.from("projects").select("id, name").in("id", projectIds);
      for (const p of (data ?? []) as Row[]) projects.set(String(p.id), { name: str(p.name), abn: null, verificationLevel: null });
    } catch {
      /* names are decoration */
    }
  }
  if (userIds.length) {
    try {
      const { data } = await db.from("app_users").select("id, email, display_name").in("id", userIds);
      for (const u of (data ?? []) as Row[]) users.set(String(u.id), { email: str(u.email), name: str(u.display_name) });
    } catch {
      /* decoration */
    }
  }
  return { projects, users };
}

export async function loadVerifiedReviewQueue(db: ReviewDb, opts: { now?: Date } = {}): Promise<VerifiedQueue> {
  const now = opts.now ?? new Date();
  const empty: VerifiedQueue = { rows: [], counts: { total: 0, overdue: 0, dueSoon: 0, onTrack: 0 }, error: null, generatedAt: now.toISOString() };
  try {
    const { data, error } = await db.from("report_orders").select(ORDER_COLUMNS).eq("status", "IN_REVIEW").order("sla_due_at", { ascending: true }).limit(500);
    if (error) return { ...empty, error: isSchemaMissing(error) ? "migration_pending" : errMessage(error) };
    const orders = (data ?? []) as Row[];
    const { projects, users } = await namesFor(
      db,
      [...new Set(orders.map((o) => str(o.business_id)).filter((v): v is string => !!v))],
      [...new Set(orders.map((o) => str(o.user_id)).filter((v): v is string => !!v))],
    );
    const reviews = new Map<string, { id: string; status: string }>();
    const decisionCounts = new Map<string, number>();
    const orderIds = orders.map((o) => String(o.id));
    if (orderIds.length) {
      try {
        const { data: rv } = await db.from("report_reviews").select("id, order_id, status").in("order_id", orderIds).in("status", ["open", "in_progress"]);
        for (const r of (rv ?? []) as Row[]) reviews.set(String(r.order_id), { id: String(r.id), status: String(r.status) });
        const reviewIds = [...reviews.values()].map((r) => r.id);
        if (reviewIds.length) {
          const { data: cl } = await db.from("report_review_claims").select("review_id").in("review_id", reviewIds);
          for (const c of (cl ?? []) as Row[]) decisionCounts.set(String(c.review_id), (decisionCounts.get(String(c.review_id)) ?? 0) + 1);
        }
      } catch {
        /* progress is decoration */
      }
    }
    const rows: VerifiedQueueRow[] = orders.map((o) => {
      const orderId = String(o.id);
      const projectId = str(o.business_id);
      const userId = str(o.user_id);
      const review = reviews.get(orderId);
      return {
        orderId,
        status: String(o.status ?? ""),
        tier: resolveOrderTier({ product_sku: o.product_sku, tier: o.tier }),
        sku: str(o.product_sku),
        projectId,
        startupName: projectId ? (projects.get(projectId)?.name ?? null) : null,
        buyerEmail: userId ? (users.get(userId)?.email ?? null) : null,
        buyerName: userId ? (users.get(userId)?.name ?? null) : null,
        paidAt: str(o.paid_at) ?? str(o.created_at),
        reportId: str(o.report_id),
        sla: describeSla(o.sla_due_at, now),
        reviewStatus: review?.status ?? null,
        decisions: review ? (decisionCounts.get(review.id) ?? 0) : 0,
      };
    });
    rows.sort(compareQueueRows);
    return {
      rows,
      counts: {
        total: rows.length,
        overdue: rows.filter((r) => r.sla.state === "overdue").length,
        dueSoon: rows.filter((r) => r.sla.state === "due_soon").length,
        onTrack: rows.filter((r) => r.sla.state === "on_track" || r.sla.state === "no_sla").length,
      },
      error: null,
      generatedAt: now.toISOString(),
    };
  } catch (e) {
    return { ...empty, error: e instanceof Error ? e.message : "query_failed" };
  }
}

// ─── detail ───────────────────────────────────────────────────────────────

export type ReviewItemKind = "hub" | "report" | "claim";

export interface ReviewItem {
  ref: string;
  kind: ReviewItemKind;
  dims: string[];
  title: string;
  detail: string | null;
  /** External proof link (http/https only). */
  href: string | null;
  /** Ladder rung (self_declared … third_party_verified) when known. */
  level: string | null;
  /** Source status: hub review_status / report evidence status / claim assessment_status. */
  status: string | null;
  source: string | null;
  decision: "accept" | "reject" | null;
  note: string | null;
  decidedAt: string | null;
}

export interface ReviewOrder {
  id: string;
  userId: string | null;
  projectId: string | null;
  sku: string | null;
  tier: ReportAccessTier;
  status: string;
  reportId: string | null;
  paidAt: string | null;
  slaDueAt: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  deliveredAt: string | null;
}

export interface ReviewRecord {
  id: string;
  status: string;
  notes: string | null;
  reviewerId: string | null;
  createdAt: string | null;
  completedAt: string | null;
}

export interface ReportSummary {
  sviTotal: number | null;
  band: string | null;
  generatedAt: string | null;
  groundedShare: number | null;
  dims: Array<{ dim: string; title: string; score: number | null; band: string | null }>;
}

export interface VerifiedReviewDetail {
  order: ReviewOrder;
  sla: SlaSummary;
  startup: { id: string | null; name: string | null; verificationLevel: number | null };
  buyer: { email: string | null; name: string | null };
  review: ReviewRecord | null;
  items: ReviewItem[];
  report: ReportSummary | null;
  counts: { items: number; accepted: number; rejected: number; undecided: number };
  /** True only while the order is IN_REVIEW (refunded / delivered orders are read-only). */
  canDecide: boolean;
}

export type DetailError = "not_found" | "migration_pending" | "db_error";

export function toReviewOrder(o: Row, paygTier?: unknown): ReviewOrder {
  return {
    id: String(o.id),
    userId: str(o.user_id),
    projectId: str(o.business_id),
    sku: str(o.product_sku),
    tier: resolveOrderTier({ product_sku: o.product_sku, tier: o.tier }, paygTier),
    status: String(o.status ?? ""),
    reportId: o.report_id == null ? null : String(o.report_id),
    paidAt: str(o.paid_at) ?? str(o.created_at),
    slaDueAt: str(o.sla_due_at),
    reviewedAt: str(o.reviewed_at),
    reviewedBy: str(o.reviewed_by),
    deliveredAt: str(o.delivered_at),
  };
}

export async function readOrder(db: ReviewDb, orderId: string): Promise<{ ok: true; row: Row } | { ok: false; error: DetailError }> {
  if (!isUuid(orderId)) return { ok: false, error: "not_found" };
  try {
    const { data, error } = await db.from("report_orders").select(ORDER_COLUMNS).eq("id", orderId).maybeSingle();
    if (error) return { ok: false, error: isSchemaMissing(error) ? "migration_pending" : "db_error" };
    if (!data) return { ok: false, error: "not_found" };
    return { ok: true, row: data as Row };
  } catch {
    return { ok: false, error: "db_error" };
  }
}

function toReview(r: Row): ReviewRecord {
  return { id: String(r.id), status: String(r.status ?? "open"), notes: str(r.notes), reviewerId: str(r.reviewer_id), createdAt: str(r.created_at), completedAt: str(r.completed_at) };
}

/** The live (open / in_progress) review of an order, else the latest one; null when none / table missing. */
export async function readReview(db: ReviewDb, orderId: string): Promise<ReviewRecord | null> {
  try {
    const { data, error } = await db.from("report_reviews").select(REVIEW_COLUMNS).eq("order_id", orderId).order("created_at", { ascending: false }).limit(5);
    if (error || !data) return null;
    const rows = data as Row[];
    const live = rows.find((r) => r.status === "open" || r.status === "in_progress");
    return live ? toReview(live) : rows[0] ? toReview(rows[0]) : null;
  } catch {
    return null;
  }
}

/**
 * The review row for an order, creating it on first use (the webhook only
 * moves the order to IN_REVIEW). Unique index `report_reviews_order_open_uniq`
 * makes a concurrent double-create collapse to one row (23505 → re-read).
 */
export async function ensureReview(db: ReviewDb, order: Pick<ReviewOrder, "id" | "reportId">): Promise<{ ok: true; review: ReviewRecord } | { ok: false; error: DetailError }> {
  const existing = await readReview(db, order.id);
  if (existing && (existing.status === "open" || existing.status === "in_progress")) return { ok: true, review: existing };
  try {
    const { data, error } = await db
      .from("report_reviews")
      .insert({ order_id: order.id, report_id: order.reportId, status: "open" })
      .select(REVIEW_COLUMNS)
      .single();
    if (error) {
      if (errCode(error) === "23505") {
        const again = await readReview(db, order.id);
        if (again) return { ok: true, review: again };
      }
      return { ok: false, error: isSchemaMissing(error) ? "migration_pending" : "db_error" };
    }
    return { ok: true, review: toReview(data as Row) };
  } catch {
    return { ok: false, error: "db_error" };
  }
}

async function readDecisions(db: ReviewDb, reviewId: string | null): Promise<Map<string, { decision: "accept" | "reject"; note: string | null; decidedAt: string | null }>> {
  const out = new Map<string, { decision: "accept" | "reject"; note: string | null; decidedAt: string | null }>();
  if (!reviewId) return out;
  try {
    const { data } = await db.from("report_review_claims").select("claim_ref, decision, note, decided_at").eq("review_id", reviewId);
    for (const r of (data ?? []) as Row[]) {
      if (r.decision === "accept" || r.decision === "reject") out.set(String(r.claim_ref), { decision: r.decision, note: str(r.note), decidedAt: str(r.decided_at) });
    }
  } catch {
    /* decisions read best-effort */
  }
  return out;
}

/** Every evidence row the report cites (register + chapters), deduped, gaps (`missing`) dropped. */
export function reportEvidenceRows(report: ReportV2 | null): EvidenceRow[] {
  if (!report) return [];
  const seen = new Map<string, EvidenceRow>();
  const add = (r: EvidenceRow | undefined) => {
    if (!r || typeof r.evidence_id !== "string" || !r.evidence_id || r.status === "missing") return;
    const prev = seen.get(r.evidence_id);
    if (!prev) seen.set(r.evidence_id, { ...r, dims: [...(r.dims ?? [])] });
    else for (const d of r.dims ?? []) if (!prev.dims.includes(d)) prev.dims.push(d);
  };
  for (const r of report.appendix?.evidenceRegister ?? []) add(r);
  for (const ch of report.dimensions ?? []) for (const r of ch.evidence ?? []) add(r);
  return [...seen.values()];
}

/** Pure: the reviewable items for an order (hub rows first, then the report's own evidence, then claims). */
export function buildReviewItems(input: {
  hubRows: readonly Row[];
  report: ReportV2 | null;
  claims: readonly Row[];
  decisions: ReadonlyMap<string, { decision: "accept" | "reject"; note: string | null; decidedAt: string | null }>;
}): ReviewItem[] {
  const decided = (ref: string) => input.decisions.get(ref) ?? null;
  const items: ReviewItem[] = [];
  const hubIds = new Set<string>();
  for (const h of input.hubRows) {
    const id = String(h.id ?? "");
    if (!id) continue;
    hubIds.add(id);
    const ref = `hub:${id}`;
    const d = decided(ref);
    const value = str(h.evidence_value_or_url);
    items.push({
      ref,
      kind: "hub",
      dims: [String(h.dimension ?? "").toLowerCase()].filter(Boolean),
      title: str(h.evidence_label) ?? str(h.evidence_type) ?? "Evidence Hub row",
      detail: value && !isHttp(value) ? value : str(h.evidence_type),
      href: isHttp(value) ? value!.trim() : null,
      level: str(h.confidence_level),
      status: str(h.review_status) ?? "none",
      source: "evidence_hub",
      decision: d?.decision ?? null,
      note: d?.note ?? null,
      decidedAt: d?.decidedAt ?? null,
    });
  }
  for (const r of reportEvidenceRows(input.report)) {
    if (hubIds.has(r.evidence_id)) continue; // the hub row above IS this evidence
    const ref = `ev:${r.evidence_id}`;
    const d = decided(ref);
    items.push({
      ref,
      kind: "report",
      dims: (r.dims ?? []).map((x) => String(x).toLowerCase()),
      title: r.label || r.evidence_id,
      detail: r.value && !isHttp(r.value) ? r.value : null,
      href: isHttp(r.value) ? r.value!.trim() : null,
      level: r.confidence ?? null,
      status: r.status ?? null,
      source: r.source ?? null,
      decision: d?.decision ?? null,
      note: d?.note ?? null,
      decidedAt: d?.decidedAt ?? null,
    });
  }
  for (const c of input.claims) {
    const id = String(c.id ?? "");
    if (!id) continue;
    const ref = `claim:${id}`;
    const d = decided(ref);
    const value = c.founder_claimed_value ?? c.extracted_value;
    items.push({
      ref,
      kind: "claim",
      dims: [String(c.svi_dimension ?? "").toLowerCase()].filter(Boolean),
      title: str(c.statement) ?? str(c.claim_key) ?? "Claim",
      detail: value === null || value === undefined ? null : typeof value === "string" ? value : JSON.stringify(value),
      href: null,
      level: null,
      status: str(c.assessment_status),
      source: "claim",
      decision: d?.decision ?? null,
      note: d?.note ?? null,
      decidedAt: d?.decidedAt ?? null,
    });
  }
  return items;
}

function reportSummary(report: ReportV2 | null): ReportSummary | null {
  if (!report) return null;
  return {
    sviTotal: typeof report.cover?.svi?.total === "number" ? report.cover.svi.total : null,
    band: report.cover?.svi?.band ?? null,
    generatedAt: report.generatedAt ?? null,
    groundedShare: typeof report.quality?.groundedShare === "number" ? report.quality.groundedShare : null,
    dims: (report.dimensions ?? []).map((ch) => ({ dim: ch.dim, title: ch.title || dimTitle(ch.dim), score: typeof ch.score === "number" ? ch.score : null, band: ch.band ?? null })),
  };
}

export async function loadVerifiedReviewDetail(
  db: ReviewDb,
  orderId: string,
  opts: { now?: Date } = {},
): Promise<{ ok: true; detail: VerifiedReviewDetail; report: ReportV2 | null } | { ok: false; error: DetailError }> {
  const now = opts.now ?? new Date();
  const read = await readOrder(db, orderId);
  if (!read.ok) return read;
  const o = read.row;
  const reportId = o.report_id == null ? null : String(o.report_id);
  const [paygTier, report] = await Promise.all([
    reportId ? readAssembledReportPaygTier(db as never, reportId).catch(() => null) : Promise.resolve(null),
    reportId ? readAssembledReportJson(db as never, reportId).catch(() => null) : Promise.resolve(null),
  ]);
  const order = toReviewOrder(o, paygTier);

  let startupName: string | null = null;
  let verificationLevel: number | null = null;
  let hubRows: Row[] = [];
  let claims: Row[] = [];
  if (order.projectId) {
    try {
      const { data } = await db.from("projects").select("id, name, verification_level").eq("id", order.projectId).maybeSingle();
      startupName = str((data as Row | null)?.name);
      const lvl = (data as Row | null)?.verification_level;
      verificationLevel = typeof lvl === "number" ? lvl : null;
    } catch {
      /* decoration */
    }
    try {
      const { data } = await db.from("svi_dimension_evidence").select(HUB_COLUMNS).eq("project_id", order.projectId).order("created_at", { ascending: false }).limit(200);
      hubRows = (data ?? []) as Row[];
    } catch {
      hubRows = [];
    }
    try {
      const { data, error } = await db.from("claims").select("id, svi_dimension, claim_key, statement, founder_claimed_value, extracted_value, assessment_status").eq("project_id", order.projectId).order("created_at", { ascending: true }).limit(200);
      claims = error ? [] : ((data ?? []) as Row[]);
    } catch {
      claims = [];
    }
  }
  let buyer = { email: null as string | null, name: null as string | null };
  if (order.userId) {
    try {
      const { data } = await db.from("app_users").select("email, display_name").eq("id", order.userId).maybeSingle();
      buyer = { email: str((data as Row | null)?.email), name: str((data as Row | null)?.display_name) };
    } catch {
      /* decoration */
    }
  }
  const review = await readReview(db, order.id);
  const decisions = await readDecisions(db, review?.id ?? null);
  const items = buildReviewItems({ hubRows, report, claims, decisions });
  const accepted = items.filter((i) => i.decision === "accept").length;
  const rejected = items.filter((i) => i.decision === "reject").length;
  return {
    ok: true,
    report,
    detail: {
      order,
      sla: describeSla(order.slaDueAt, now),
      startup: { id: order.projectId, name: startupName, verificationLevel },
      buyer,
      review,
      items,
      report: reportSummary(report),
      counts: { items: items.length, accepted, rejected, undecided: items.length - accepted - rejected },
      canDecide: order.status === "IN_REVIEW",
    },
  };
}

// ─── writes ───────────────────────────────────────────────────────────────

export type WriteError =
  | DetailError
  | "refunded"
  | "not_in_review"
  | "unknown_claim"
  | "bad_decision"
  | "note_required"
  | "note_too_long"
  | "evidence_review_failed";

/** Gate shared by every write: the order exists and is still in review (a refund drops it). */
export function writeGate(status: string): WriteError | null {
  if (status === "REFUNDED") return "refunded";
  if (status !== "IN_REVIEW") return "not_in_review";
  return null;
}

export async function recordClaimDecision(
  db: ReviewDb,
  input: { orderId: string; ref: string; decision: unknown; note?: unknown; reviewerId: string; now?: Date },
): Promise<{ ok: true; item: ReviewItem; evidence: ApplyReviewResult | null; reviewId: string } | { ok: false; error: WriteError }> {
  const decision = input.decision;
  if (decision !== "accept" && decision !== "reject") return { ok: false, error: "bad_decision" };
  const note = typeof input.note === "string" ? input.note.trim() : "";
  if (note.length > REVIEW_NOTE_MAX) return { ok: false, error: "note_too_long" };
  if (decision === "reject" && !note) return { ok: false, error: "note_required" };

  const loaded = await loadVerifiedReviewDetail(db, input.orderId, { now: input.now });
  if (!loaded.ok) return loaded;
  const { detail } = loaded;
  const gate = writeGate(detail.order.status);
  if (gate) return { ok: false, error: gate };
  const item = detail.items.find((i) => i.ref === input.ref);
  if (!item) return { ok: false, error: "unknown_claim" };

  // Evidence Hub rows: the existing approval path first (single source of
  // review_status / third_party_verified). A failed write records nothing.
  let evidence: ApplyReviewResult | null = null;
  if (item.kind === "hub" && detail.order.projectId) {
    const res = await applyEvidenceReview(db, {
      evidenceId: item.ref.slice("hub:".length),
      decision: decision === "accept" ? "approve" : "reject",
      reviewerUserId: input.reviewerId,
      note: note || null,
      now: input.now,
      scope: { kind: "verified_order", projectId: detail.order.projectId },
    });
    if (!res.ok) return { ok: false, error: res.error === "not_found" ? "unknown_claim" : "evidence_review_failed" };
    evidence = res;
  }

  const ensured = await ensureReview(db, detail.order);
  if (!ensured.ok) return ensured;
  const decidedAt = (input.now ?? new Date()).toISOString();
  try {
    const { error } = await db
      .from("report_review_claims")
      .upsert({ review_id: ensured.review.id, claim_ref: item.ref, decision, note: note || null, decided_at: decidedAt }, { onConflict: "review_id,claim_ref" });
    if (error) return { ok: false, error: isSchemaMissing(error) ? "migration_pending" : "db_error" };
    if (ensured.review.status === "open" || ensured.review.reviewerId !== input.reviewerId) {
      await db.from("report_reviews").update({ status: "in_progress", reviewer_id: input.reviewerId }).eq("id", ensured.review.id);
    }
  } catch {
    return { ok: false, error: "db_error" };
  }
  const level = evidence ? evidence.row.confidence_level : item.level;
  const status = evidence ? evidence.row.review_status : item.status;
  return { ok: true, reviewId: ensured.review.id, evidence, item: { ...item, decision, note: note || null, decidedAt, level, status } };
}

export async function saveReviewNotes(
  db: ReviewDb,
  input: { orderId: string; notes: unknown; reviewerId: string },
): Promise<{ ok: true; reviewId: string; notes: string | null } | { ok: false; error: WriteError }> {
  if (input.notes !== null && typeof input.notes !== "string") return { ok: false, error: "bad_decision" };
  const notes = typeof input.notes === "string" ? input.notes.trim() : "";
  if (notes.length > REVIEW_NOTES_MAX) return { ok: false, error: "note_too_long" };
  const read = await readOrder(db, input.orderId);
  if (!read.ok) return read;
  const order = toReviewOrder(read.row);
  const gate = writeGate(order.status);
  if (gate) return { ok: false, error: gate };
  const ensured = await ensureReview(db, order);
  if (!ensured.ok) return ensured;
  try {
    const patch: Row = { notes: notes || null, reviewer_id: input.reviewerId };
    if (ensured.review.status === "open") patch.status = "in_progress";
    const { error } = await db.from("report_reviews").update(patch).eq("id", ensured.review.id);
    if (error) return { ok: false, error: "db_error" };
  } catch {
    return { ok: false, error: "db_error" };
  }
  return { ok: true, reviewId: ensured.review.id, notes: notes || null };
}

/** HTTP status for a write error (API routes). */
export function httpStatusFor(error: WriteError | "forbidden" | "not_verified" | "no_report"): number {
  switch (error) {
    case "not_found":
    case "unknown_claim":
      return 404;
    case "refunded":
    case "not_in_review":
    case "not_verified":
    case "no_report":
      return 409;
    case "bad_decision":
    case "note_required":
    case "note_too_long":
      return 400;
    case "forbidden":
      return 403;
    case "migration_pending":
      return 503;
    default:
      return 500;
  }
}
