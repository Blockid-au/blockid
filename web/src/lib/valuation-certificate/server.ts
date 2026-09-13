// Valuation certificate (S22-A) — the server half: gather the subject
// (score, dimensions, range, evidence) for a project scope, issue a
// certificate (freeze payload → hash → insert), and the register reads the
// routes and the verify page share.
//
// The subject is computed the way `/dashboard/valuation` shows it
// (GET /api/valuation/vc): `buildVcValuationReport` on the account's
// metrics + SVI signals, then the S17-B connected-revenue bridge on the
// blended range. The dimension sub-scores come from the project-scoped
// `svi_analyses.analysis_json` (SVIAnalysis.subs) — falling back to the
// latest `startup_score_history.svi_analysis` for the owner — so a
// certificate says what the founder's dashboard says on the issue date.
//
// S27-A: `annexes.ess` adds the ESS start-up concession annex (Div 83A) —
// the company facts the project already stores (project_grant_profiles:
// incorporated_at / listed / turnover_aud / entity_type / prior_raise_aud;
// cap table: shares on issue + ESOP pool) frozen into `payload.ess` with
// the s 83A-33 checklist built from them. Nothing is assumed: a fact that
// is not on file makes its row "not confirmed".
//
// Every DB access takes the admin client as an argument so the colocated
// suites drive it with `fakeSupabase`.

import "server-only";

import { randomBytes } from "crypto";
import { buildVcValuationReport, vcBenchmark, type VcValuationInput } from "@/lib/agents/cfo-valuation";
import { loadConnectedRevenueSignals } from "@/lib/connected-revenue";
import { applyConnectedRevenueBridge } from "@/lib/valuation-mrr-bridge";
import type { SVIAnalysis } from "@/lib/svi-analysis";
import { certificateContentHash, certificateNumber } from "./hash";
import {
  CERTIFICATE_VERSION,
  DIMENSION_KEYS,
  DIMENSION_LABELS,
  DIMENSION_WEIGHTS,
  buildEssAnnex,
  emptyEssFacts,
  formatAbn,
  verifyPathFor,
  type CertificateDimension,
  type CertificateEssFacts,
  type CertificateEvidenceSummary,
  type DimensionKey,
  type ValuationCertificateData,
} from "./types";

/** Minimal query-builder surface (Supabase admin client or the test fake). */
export interface CertificateDb {
  from(table: string): any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export interface ValuationCertificateRow {
  id: string;
  project_id: string;
  user_id: string;
  score_history_id: string | null;
  certificate_no: string;
  content_hash: string;
  payload: ValuationCertificateData;
  startup_name: string;
  svi_score: number;
  credits_charged: number;
  issued_at: string;
  revoked_at: string | null;
  revoked_reason: string | null;
}

export const CERTIFICATE_COLUMNS =
  "id, project_id, user_id, score_history_id, certificate_no, content_hash, payload, startup_name, svi_score, credits_charged, issued_at, revoked_at, revoked_reason";

export function siteBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.SITE_URL ?? "https://blockid.au";
  return raw.replace(/\/+$/, "");
}

/* ── Subject ──────────────────────────────────────────────────────────── */

export interface CertificateSubjectInput {
  db: CertificateDb;
  projectId: string;
  projectName: string;
  /** Owner's email — the key svi_accounts / svi_analyses rows are stored under. */
  dataEmail: string;
  ownerUserId: string;
  /** `svi_accounts.id` for (dataEmail, projectId); null → no analysis yet. */
  accountId: string | null;
  now?: Date;
  /** S27-A: optional annexes to freeze with the certificate. */
  annexes?: { ess?: boolean };
}

export type CertificateSubject = Omit<ValuationCertificateData, "version" | "certificateNo" | "issuedAt" | "verifyUrl">;

export type CertificateSubjectResult =
  | { ok: true; subject: CertificateSubject }
  | { ok: false; error: "no_svi_analysis" };

function inferSector(text?: string | null): string | undefined {
  if (!text) return undefined;
  const t = text.toLowerCase();
  if (t.includes("saas") || t.includes("software as a service")) return "saas";
  if (t.includes("fintech") || t.includes("financial")) return "fintech";
  if (t.includes("marketplace")) return "marketplace";
  if (t.includes("health") || t.includes("medtech")) return "healthtech";
  if (t.includes("ai ") || t.includes("artificial intelligence")) return "ai";
  if (t.includes("ecommerce") || t.includes("e-commerce")) return "ecommerce";
  return undefined;
}

function stageFromNumeric(n: number | null | undefined): string {
  if (n == null) return "pre-seed";
  if (n <= 1) return "pre-seed";
  if (n <= 4) return "seed";
  return "series-a";
}

/** The 8 dimensions from an SVIAnalysis, in canonical order; missing keys score 0. */
export function dimensionsFromAnalysis(analysis: Partial<SVIAnalysis> | null | undefined): CertificateDimension[] {
  const byKey = new Map<string, number>();
  for (const sub of analysis?.subs ?? []) {
    if (sub && typeof sub.key === "string" && Number.isFinite(sub.value)) byKey.set(sub.key.toLowerCase(), sub.value);
  }
  for (const [k, v] of Object.entries(analysis?.dimensionScores ?? {})) {
    if (!byKey.has(k.toLowerCase()) && Number.isFinite(v)) byKey.set(k.toLowerCase(), v as number);
  }
  return DIMENSION_KEYS.map((key) => ({
    key,
    label: DIMENSION_LABELS[key],
    score: Math.max(0, Math.min(100, Math.round(byKey.get(key) ?? 0))),
    weightPct: DIMENSION_WEIGHTS[key],
  }));
}

interface EvidenceRow {
  evidence_type?: string | null;
  dimension?: string | null;
  verified_at?: string | null;
}

/** Counts by category / dimension + newest verified_at. Pure; exported for the suite. */
export function summariseEvidence(rows: EvidenceRow[]): CertificateEvidenceSummary {
  const cat = new Map<string, number>();
  const dim = new Map<DimensionKey, number>();
  let verified = 0;
  let last: string | null = null;
  for (const r of rows) {
    const c = (r.evidence_type ?? "other").toString();
    cat.set(c, (cat.get(c) ?? 0) + 1);
    const d = (r.dimension ?? "").toString().toLowerCase() as DimensionKey;
    if ((DIMENSION_KEYS as readonly string[]).includes(d)) dim.set(d, (dim.get(d) ?? 0) + 1);
    if (r.verified_at) {
      verified++;
      if (!last || new Date(r.verified_at).getTime() > new Date(last).getTime()) last = r.verified_at;
    }
  }
  return {
    total: rows.length,
    verified,
    byCategory: [...cat.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([category, count]) => ({ category, count })),
    byDimension: DIMENSION_KEYS.filter((k) => dim.has(k)).map((dimension) => ({ dimension, count: dim.get(dimension) ?? 0 })),
    lastVerifiedAt: last,
  };
}

/* ── ESS annex facts (S27-A) ──────────────────────────────────────────── */

function numOrNull(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? n : null;
}

/**
 * The company facts the ESS checklist can be populated from — the project's
 * grant profile (founder-entered) and the OWNER's cap table for this
 * project. Every miss is null, never a default.
 */
export async function loadEssFacts(db: CertificateDb, scope: { projectId: string; ownerUserId: string }): Promise<CertificateEssFacts> {
  const facts = emptyEssFacts();

  const { data: profile } = await db
    .from("project_grant_profiles")
    .select("project_id, incorporated_at, listed, turnover_aud, entity_type, prior_raise_aud")
    .eq("project_id", scope.projectId)
    .maybeSingle();
  const p = (profile as { project_id?: string; incorporated_at?: string | null; listed?: boolean | null; turnover_aud?: unknown; entity_type?: string | null; prior_raise_aud?: unknown } | null) ?? null;
  if (p && (!p.project_id || p.project_id === scope.projectId)) {
    facts.incorporatedAt = typeof p.incorporated_at === "string" && p.incorporated_at ? p.incorporated_at.slice(0, 10) : null;
    facts.listed = typeof p.listed === "boolean" ? p.listed : null;
    facts.turnoverAud = numOrNull(p.turnover_aud);
    facts.entityType = typeof p.entity_type === "string" && p.entity_type ? p.entity_type : null;
    facts.priorRaiseAud = numOrNull(p.prior_raise_aud);
  }

  const [{ data: holders }, { data: pools }] = await Promise.all([
    db.from("shareholders").select("shares_held, project_id, account_id").eq("account_id", scope.ownerUserId),
    db.from("esop_pool").select("total_pool_shares, project_id, account_id").eq("account_id", scope.ownerUserId),
  ]);
  const holderRows = ((holders as Array<{ shares_held: unknown; project_id?: string | null; account_id?: string }> | null) ?? []).filter(
    (h) => h && h.account_id === scope.ownerUserId && (!h.project_id || h.project_id === scope.projectId),
  );
  if (holderRows.length > 0) {
    const issued = holderRows.reduce((sum, h) => sum + (numOrNull(h.shares_held) ?? 0), 0);
    facts.issuedShares = issued > 0 ? issued : null;
  }
  const pool = ((pools as Array<{ total_pool_shares: unknown; project_id?: string | null; account_id?: string }> | null) ?? []).find(
    (r) => r && r.account_id === scope.ownerUserId && (!r.project_id || r.project_id === scope.projectId),
  );
  facts.esopPoolShares = pool ? numOrNull(pool.total_pool_shares) : null;
  return facts;
}

/**
 * Build the certificate subject for a project. Returns `no_svi_analysis`
 * when neither a project-scoped svi_analyses row nor an owner
 * startup_score_history row exists — a certificate needs a score to seal.
 */
export async function loadCertificateSubject(input: CertificateSubjectInput): Promise<CertificateSubjectResult> {
  const { db, projectId, dataEmail, ownerUserId, accountId } = input;

  // 1. Project-scoped SVI analysis (the dashboard's own source).
  const analysisQuery = db.from("svi_analyses").select("id, analysis_json, total_svi, raw_input, created_at").eq("email", dataEmail);
  analysisQuery.eq("project_id", projectId);
  const { data: analysisRow } = await analysisQuery.order("created_at", { ascending: false }).limit(1).maybeSingle();

  // 2. Owner's latest score-history snapshot — provenance + ABN + fallback dims.
  const { data: historyRow } = await db
    .from("startup_score_history")
    .select("id, startup_name, inputs, svi_analysis, total_score, score_version, created_at")
    .eq("user_id", ownerUserId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const analysis = ((analysisRow?.analysis_json as SVIAnalysis | null | undefined) ??
    (historyRow?.svi_analysis as SVIAnalysis | null | undefined)) ?? null;
  if (!analysisRow && !historyRow) return { ok: false, error: "no_svi_analysis" };

  // Score-history row is only provenance when it describes THIS startup.
  const historyMatches =
    historyRow &&
    typeof historyRow.startup_name === "string" &&
    historyRow.startup_name.trim().toLowerCase() === input.projectName.trim().toLowerCase();

  // 3. Account metrics + snapshot for the VC report input.
  let metrics: Record<string, unknown> | null = null;
  let snapshot: Record<string, unknown> | null = null;
  let account: Record<string, unknown> | null = null;
  if (accountId) {
    const [m, s, a] = await Promise.all([
      db
        .from("startup_metrics")
        .select("mrr_aud, arr_aud, revenue_growth_pct, monthly_churn_pct, burn_rate_aud, runway_months, cac_aud, ltv_aud, mau")
        .eq("account_id", accountId)
        .order("metric_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
      db.from("svi_snapshots").select("dimension_scores, input_text").eq("account_id", accountId).order("snapshot_date", { ascending: false }).limit(1).maybeSingle(),
      db.from("svi_accounts").select("id, current_svi, current_stage").eq("id", accountId).maybeSingle(),
    ]);
    metrics = (m?.data as Record<string, unknown> | null) ?? null;
    snapshot = (s?.data as Record<string, unknown> | null) ?? null;
    account = (a?.data as Record<string, unknown> | null) ?? null;
  }

  const sector =
    (typeof analysis?.sector === "string" && analysis.sector) ||
    inferSector(analysisRow?.raw_input as string | null) ||
    inferSector(snapshot?.input_text as string | null) ||
    undefined;

  const stage = stageFromNumeric(analysis?.stage ?? (account?.current_stage as number | null));
  const sviScore =
    (account?.current_svi as number | null) ??
    (analysisRow?.total_svi as number | null) ??
    analysis?.totalSVI ??
    (historyRow?.total_score as number | null) ??
    100;

  const tamAud =
    analysis?.signals?.marketSize === "large"
      ? 5_000_000_000
      : analysis?.signals?.marketSize === "medium"
        ? 500_000_000
        : analysis?.signals?.marketSize === "small"
          ? 50_000_000
          : undefined;

  const vcInput: VcValuationInput = {
    sector,
    stage,
    mrrAud: (metrics?.mrr_aud as number | null) ?? undefined,
    monthlyGrowthRatePct: (metrics?.revenue_growth_pct as number | null) ?? undefined,
    monthlyOpexAud: (metrics?.burn_rate_aud as number | null) ?? undefined,
    monthlyChurnPct: (metrics?.monthly_churn_pct as number | null) ?? undefined,
    cacAud: (metrics?.cac_aud as number | null) ?? undefined,
    customers: (metrics?.mau as number | null) ?? undefined,
    tamAud,
  };
  const report = buildVcValuationReport(vcInput);

  // 4. Connected-revenue cross-check (S17-B) — same call as the dashboard.
  const signals = accountId
    ? await loadConnectedRevenueSignals(db as never, { userId: ownerUserId, projectId, accountId })
    : [];
  const bridged = applyConnectedRevenueBridge(report.blended, signals, { sector, now: input.now });
  const bm = vcBenchmark(sector ?? "default");

  // 5. Evidence summary.
  const evidenceRows: EvidenceRow[] = accountId
    ? (((await db.from("svi_evidence").select("evidence_type, dimension, verified_at").eq("account_id", accountId)).data as EvidenceRow[] | null) ?? [])
    : [];

  const inputs = (historyMatches ? (historyRow?.inputs as Record<string, unknown> | null) : null) ?? null;
  const abn = formatAbn(typeof inputs?.abn === "string" ? inputs.abn : null);

  const valuation = {
    lowAud: bridged.lowAud,
    midAud: bridged.midAud,
    highAud: bridged.highAud,
    method: bridged.valuationMethod,
    methodNote: bridged.methodNote,
  };

  // 6. ESS annex (S27-A) — only when asked for; the age row is re-stamped at issue.
  const ess = input.annexes?.ess ? buildEssAnnex(await loadEssFacts(db, { projectId, ownerUserId }), valuation, (input.now ?? new Date()).toISOString()) : null;

  return {
    ok: true,
    subject: {
      startupName: input.projectName,
      abn,
      stageLabel: typeof analysis?.stageLabel === "string" ? analysis.stageLabel : null,
      sviScore: Math.round(sviScore),
      sviVersion: (typeof analysis?.version === "string" ? analysis.version : null) ?? (historyRow?.score_version as string | null) ?? null,
      valuation,
      connectedRevenue: bridged.connectedRevenue
        ? {
            provider: bridged.connectedRevenue.provider,
            mrrAud: bridged.connectedRevenue.mrrAud,
            arrAud: bridged.connectedRevenue.arrAud,
            capturedAt: bridged.connectedRevenue.capturedAt,
            label: bridged.connectedRevenue.label,
          }
        : null,
      sectorMultiple: {
        sector: bm.sector,
        low: bm.arrMultiple.low,
        mid: bm.arrMultiple.mid,
        high: bm.arrMultiple.high,
        source: bm.source,
      },
      dimensions: dimensionsFromAnalysis(analysis),
      evidence: summariseEvidence(evidenceRows),
      scoreHistoryId: historyMatches ? (historyRow?.id as string) : null,
      ...(ess ? { ess } : {}),
    },
  };
}

/* ── Issue ────────────────────────────────────────────────────────────── */

export interface IssueCertificateInput {
  db: CertificateDb;
  projectId: string;
  userId: string;
  subject: CertificateSubject;
  creditsCharged: number;
  now?: Date;
  baseUrl?: string;
}

export type IssueCertificateResult =
  | { ok: true; row: ValuationCertificateRow }
  | { ok: false; error: "insert_failed" };

/** Freeze the payload, number + hash it, insert. Retries the number on a unique collision. */
export async function issueCertificate(input: IssueCertificateInput): Promise<IssueCertificateResult> {
  const now = input.now ?? new Date();
  const issuedAt = now.toISOString();
  const base = (input.baseUrl ?? siteBaseUrl()).replace(/\/+$/, "");

  for (let attempt = 0; attempt < 3; attempt++) {
    const certificateNo = certificateNumber(`${input.projectId}|${issuedAt}|${attempt}`, randomBytes(16));
    const payload: ValuationCertificateData = {
      version: CERTIFICATE_VERSION,
      certificateNo,
      issuedAt,
      verifyUrl: `${base}${verifyPathFor(certificateNo)}`,
      ...input.subject,
      // The annex's company-age row is measured at the issue date — rebuild it from the frozen facts now.
      ...(input.subject.ess ? { ess: buildEssAnnex(input.subject.ess.facts, input.subject.valuation, issuedAt) } : {}),
    };
    const contentHash = certificateContentHash(payload);
    const { data, error } = await input.db
      .from("valuation_certificates")
      .insert({
        project_id: input.projectId,
        user_id: input.userId,
        score_history_id: input.subject.scoreHistoryId,
        certificate_no: certificateNo,
        content_hash: contentHash,
        payload,
        startup_name: input.subject.startupName,
        svi_score: input.subject.sviScore,
        credits_charged: input.creditsCharged,
        issued_at: issuedAt,
      })
      .select(CERTIFICATE_COLUMNS)
      .single();
    if (!error && data) return { ok: true, row: data as ValuationCertificateRow };
    const msg = String((error as { message?: string; code?: string } | null)?.message ?? "");
    const code = String((error as { code?: string } | null)?.code ?? "");
    if (code === "23505" || /duplicate key|unique/i.test(msg)) continue; // collision → new number
    console.error("[valuation:certificate] insert failed", error);
    return { ok: false, error: "insert_failed" };
  }
  return { ok: false, error: "insert_failed" };
}

/* ── Register reads ───────────────────────────────────────────────────── */

export async function listCertificates(db: CertificateDb, projectId: string, limit = 50): Promise<ValuationCertificateRow[]> {
  const { data } = await db
    .from("valuation_certificates")
    .select(CERTIFICATE_COLUMNS)
    .eq("project_id", projectId)
    .order("issued_at", { ascending: false })
    .limit(limit);
  return ((data as ValuationCertificateRow[] | null) ?? []).filter((r) => r && r.id);
}

/** A certificate by id, scoped to the project the caller has a role on. Null when it is another project's. */
export async function getCertificateForProject(db: CertificateDb, id: string, projectId: string): Promise<ValuationCertificateRow | null> {
  const { data } = await db.from("valuation_certificates").select(CERTIFICATE_COLUMNS).eq("id", id).eq("project_id", projectId).maybeSingle();
  const row = (data as ValuationCertificateRow | null) ?? null;
  // The fake and a misconfigured query both return the first row — pin the scope here too.
  if (!row || row.id !== id || row.project_id !== projectId) return null;
  return row;
}

/** Public: a certificate by its number (verify page). */
export async function findCertificateByNo(db: CertificateDb, certificateNo: string): Promise<ValuationCertificateRow | null> {
  const { data } = await db.from("valuation_certificates").select(CERTIFICATE_COLUMNS).eq("certificate_no", certificateNo).maybeSingle();
  const row = (data as ValuationCertificateRow | null) ?? null;
  if (!row || row.certificate_no !== certificateNo) return null;
  return row;
}

export type RevokeResult = { ok: true; row: ValuationCertificateRow } | { ok: false; error: "not_found" | "already_revoked" | "update_failed" };

export async function revokeCertificate(db: CertificateDb, id: string, projectId: string, reason: string, now = new Date()): Promise<RevokeResult> {
  const existing = await getCertificateForProject(db, id, projectId);
  if (!existing) return { ok: false, error: "not_found" };
  if (existing.revoked_at) return { ok: false, error: "already_revoked" };
  const { data, error } = await db
    .from("valuation_certificates")
    .update({ revoked_at: now.toISOString(), revoked_reason: reason })
    .eq("id", id)
    .eq("project_id", projectId)
    .is("revoked_at", null)
    .select(CERTIFICATE_COLUMNS)
    .maybeSingle();
  if (error || !data) return { ok: false, error: "update_failed" };
  return { ok: true, row: data as ValuationCertificateRow };
}

/** Public projection for the dashboard list / API — never the payload's internals beyond the headline. */
export function certificateSummary(row: ValuationCertificateRow, baseUrl = siteBaseUrl()) {
  return {
    id: row.id,
    certificateNo: row.certificate_no,
    contentHash: row.content_hash,
    startupName: row.startup_name,
    sviScore: row.svi_score,
    valuation: row.payload?.valuation ?? null,
    method: row.payload?.valuation?.method ?? null,
    creditsCharged: Number(row.credits_charged ?? 0),
    issuedAt: row.issued_at,
    revokedAt: row.revoked_at,
    revokedReason: row.revoked_reason,
    verifyUrl: `${baseUrl}${verifyPathFor(row.certificate_no)}`,
    pdfUrl: `/api/valuation/certificate/${row.id}/pdf`,
    /** S27-A: Annex A (ESS start-up concession) frozen with this certificate. */
    annexes: { ess: Boolean(row.payload?.ess) },
  };
}

export type CertificateSummary = ReturnType<typeof certificateSummary>;
