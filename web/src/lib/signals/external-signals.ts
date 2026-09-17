/**
 * Register-derived signals → evidence rows + register cohort (G14-S40).
 *
 *   signalsForAbn(abn, db)         external_signals rows for one ABN →
 *                                  EvidenceRow[] (LCO / IRI / TRE) with
 *                                  origin "connector" (S36 cap → the rows
 *                                  land at `connected_source`, never higher)
 *   cohortFromRegisters(db, q)     register cohort (entity age / GST /
 *                                  grants / R&DTI per ABN) — the second
 *                                  cohort source computeCohortPercentile
 *                                  uses when svi_index_snapshots has < 20
 *                                  rows for the stage (flag "register_cohort")
 *
 * What the mapping claims and what it never claims:
 *   grant_award        → IRI  "Grant award — <program> (<agency>)", the
 *                             register's value, approval date.
 *   rdti_registration  → TRE  an R&D-expenditure BAND (proxy for R&D
 *                             intensity) + the register's own figure and
 *                             income year. No dollar figure beyond the
 *                             register is ever derived.
 *   abr_entity         → LCO  ABN status, entity type, GST registration,
 *                             entity age from ABNStatusFromDate.
 *
 * Every reader is 42P01-guarded: a missing table (0410 pending), a mocked
 * client without `from`, or a DB error reads as "no signals" — the report
 * pipeline and the percentile never depend on this module.
 *
 * Pure helpers (mapSignalsToEvidence, registerMaturityScore,
 * percentileWithinCohort, bandRdSpend) take data in and give data out so
 * the colocated test needs no client.
 */

import { capConfidence, type ConfidenceLevel, type EvidenceOrigin } from "@/lib/evidence/confidence-cap";
import { normalizeAbn, validateAbnChecksum } from "@/lib/compliance/abn";
import { evidenceIdFor } from "@/lib/report-pipeline/evidence-ids";
import type { DimKey } from "@/lib/report-pipeline/dimension-owners";
import type { EvidenceRow, EvidenceStatus } from "@/lib/report-v2/schema";

// ── Row shapes ──────────────────────────────────────────────────────────────

export type ExternalSignalType = "abr_entity" | "grant_award" | "rdti_registration";

export const EXTERNAL_SIGNAL_TYPES: readonly ExternalSignalType[] = ["abr_entity", "grant_award", "rdti_registration"];

export interface ExternalSignalRow {
  id?: string;
  source_id: string;
  entity_abn: string | null;
  entity_acn?: string | null;
  entity_name?: string | null;
  signal_type: ExternalSignalType | string;
  value: Record<string, unknown>;
  as_of: string;
  fetched_at?: string;
  source_url?: string | null;
  match_confidence?: "high" | "low";
}

/** An EvidenceRow plus the provenance the S36 ladder and the appendix need. */
export interface ExternalEvidenceRow extends EvidenceRow {
  origin: EvidenceOrigin;
  confidence: ConfidenceLevel;
  signal_type: string;
  source_id: string;
  source_url: string | null;
  as_of: string;
  /** high = matched on ABN; low = name-only match (never counted as evidenced). */
  match_confidence: "high" | "low";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SignalsDb = { from(table: string): any };

const DB_MISSING = new Set(["42P01", "PGRST205", "PGRST204", "PGRST202"]);

/** The origin every register row carries — capConfidence() lands it at connected_source. */
export const EXTERNAL_SIGNAL_ORIGIN: EvidenceOrigin = "connector";

/** Register rows ask for `connected_source`; the cap keeps them there. */
export function externalSignalConfidence(): ConfidenceLevel {
  return capConfidence({ requested: "connected_source", origin: EXTERNAL_SIGNAL_ORIGIN }).level;
}

// ── Pure helpers ────────────────────────────────────────────────────────────

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null);
const num = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) && v.trim() !== "" ? n : null;
  }
  return null;
};

const AUD = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });

export function formatAud(n: number): string {
  return AUD.format(Math.round(n));
}

/** R&D expenditure band — the only R&D-intensity claim the report makes from the register. */
export type RdSpendBand = "under_100k" | "100k_500k" | "500k_2m" | "2m_10m" | "over_10m";

export const RD_SPEND_BAND_LABEL: Record<RdSpendBand, string> = {
  under_100k: "under A$100k",
  "100k_500k": "A$100k–500k",
  "500k_2m": "A$500k–2M",
  "2m_10m": "A$2M–10M",
  over_10m: "over A$10M",
};

export function bandRdSpend(aud: number): RdSpendBand {
  if (aud < 100_000) return "under_100k";
  if (aud < 500_000) return "100k_500k";
  if (aud < 2_000_000) return "500k_2m";
  if (aud < 10_000_000) return "2m_10m";
  return "over_10m";
}

export function monthsBetween(fromIso: string, nowMs: number): number | null {
  const t = Date.parse(fromIso);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((nowMs - t) / (30.4375 * 24 * 60 * 60 * 1000)));
}

function evidenceId(signal: ExternalSignalRow): string {
  return evidenceIdFor(`external|${signal.source_id}|${signal.entity_abn ?? ""}|${signal.signal_type}|${signal.as_of}`);
}

function base(signal: ExternalSignalRow, label: string, status: EvidenceStatus, dims: DimKey[], value: string): ExternalEvidenceRow {
  const match = signal.match_confidence === "low" ? "low" : "high";
  return {
    evidence_id: evidenceId(signal),
    source: "external",
    label,
    status: match === "low" && status === "evidenced" ? "partial" : status,
    observedAt: signal.as_of,
    value,
    dims: [...dims],
    origin: EXTERNAL_SIGNAL_ORIGIN,
    confidence: externalSignalConfidence(),
    signal_type: String(signal.signal_type),
    source_id: signal.source_id,
    source_url: signal.source_url ?? null,
    as_of: signal.as_of,
    match_confidence: match,
  };
}

/** Rows older than this read as `stale` (the ABR extract is weekly; a year-old row means the ingest stopped). */
export const EXTERNAL_SIGNAL_STALE_DAYS = 400;

/**
 * Map register rows to evidence rows. Unknown signal types are dropped
 * (never invented). Order: LCO (entity) → IRI (grants, newest first) → TRE.
 */
export function mapSignalsToEvidence(rows: readonly ExternalSignalRow[], opts: { now?: number } = {}): ExternalEvidenceRow[] {
  const now = opts.now ?? Date.now();
  const out: ExternalEvidenceRow[] = [];
  const staleMs = EXTERNAL_SIGNAL_STALE_DAYS * 24 * 60 * 60 * 1000;

  const sorted = [...rows].sort((a, b) => (a.as_of < b.as_of ? 1 : a.as_of > b.as_of ? -1 : 0));

  for (const s of sorted) {
    const v = s.value ?? {};
    if (s.signal_type === "abr_entity") {
      const status = str(v.abn_status) ?? "unknown";
      const from = str(v.abn_status_from);
      const age = from ? monthsBetween(from, now) : null;
      const gst = str(v.gst_status);
      const gstFrom = str(v.gst_from);
      const entityType = str(v.entity_type) ?? str(v.entity_type_code) ?? "entity";
      const state = str(v.state);
      const fetched = s.fetched_at ? Date.parse(s.fetched_at) : Date.parse(s.as_of);
      const stale = Number.isFinite(fetched) && now - fetched > staleMs;
      const parts = [
        `ABN ${status === "ACT" ? "active" : status === "CAN" ? "cancelled" : status}${from ? ` since ${from}` : ""}`,
        entityType,
        state ? `${state}` : null,
        age != null ? `entity age ${age} months` : null,
        gst === "ACT" ? `GST registered${gstFrom ? ` since ${gstFrom}` : ""}` : gst === "CAN" ? "GST cancelled" : "not GST registered",
      ].filter(Boolean);
      out.push(base(s, "Australian Business Register — entity record", stale ? "stale" : status === "ACT" ? "evidenced" : "partial", ["lco"], parts.join(" · ")));
      continue;
    }
    if (s.signal_type === "grant_award") {
      const program = str(v.program) ?? str(v.grant_program) ?? "grant";
      const agency = str(v.agency);
      const amount = num(v.amount_aud);
      const date = str(v.approval_date) ?? s.as_of;
      const gaId = str(v.ga_id);
      const value = [amount != null ? formatAud(amount) : "amount not disclosed", `approved ${date}`, gaId ? `ref ${gaId}` : null].filter(Boolean).join(" · ");
      out.push(base(s, `Grant award — ${program}${agency ? ` (${agency})` : ""}`, "evidenced", ["iri", "cgh"], value));
      continue;
    }
    if (s.signal_type === "rdti_registration") {
      const spend = num(v.rd_expenditure_aud);
      const amended = num(v.amended_rd_expenditure_aud);
      const figure = amended ?? spend;
      const year = str(v.income_year) ?? s.as_of.slice(0, 4);
      if (figure == null) {
        out.push(base(s, `R&D Tax Incentive register — ${year}`, "partial", ["tre"], "registered R&D entity (expenditure not published)"));
        continue;
      }
      const band = bandRdSpend(figure);
      out.push(
        base(
          s,
          `R&D Tax Incentive register — ${year}`,
          "evidenced",
          ["tre"],
          `R&D expenditure band ${RD_SPEND_BAND_LABEL[band]} (register: ${formatAud(figure)} total R&D expenditure, income year ${year}${amended != null ? ", amended" : ""})`,
        ),
      );
      continue;
    }
    // unknown signal_type → dropped, never guessed
  }
  return out;
}

// ── Readers (42P01-guarded) ─────────────────────────────────────────────────

/** Rows for one ABN (checksum-validated first; an invalid ABN reads as []). */
export async function loadSignalsForAbn(db: SignalsDb | null | undefined, abn: string | null | undefined, limit = 200): Promise<ExternalSignalRow[]> {
  const clean = normalizeAbn(abn);
  if (!db || !clean || !validateAbnChecksum(clean)) return [];
  try {
    const { data, error } = await db
      .from("external_signals")
      .select("id,source_id,entity_abn,entity_acn,entity_name,signal_type,value,as_of,fetched_at,source_url,match_confidence")
      .eq("entity_abn", clean)
      .order("as_of", { ascending: false })
      .limit(limit);
    if (error) {
      if (!DB_MISSING.has(String(error.code))) console.warn("[external-signals] read failed", { code: error.code, message: error.message });
      return [];
    }
    return (data ?? []) as ExternalSignalRow[];
  } catch {
    return [];
  }
}

/** Evidence rows for one ABN — the GATHER hook. */
export async function signalsForAbn(abn: string | null | undefined, db: SignalsDb | null | undefined, opts: { now?: number } = {}): Promise<ExternalEvidenceRow[]> {
  const rows = await loadSignalsForAbn(db, abn);
  return mapSignalsToEvidence(rows, opts);
}

/** `projects.abn` for a project (null before 0410 or when the founder never verified). */
export async function loadProjectAbn(db: SignalsDb | null | undefined, projectId: string | null | undefined): Promise<string | null> {
  if (!db || !projectId) return null;
  try {
    const { data, error } = await db.from("projects").select("abn").eq("id", projectId).maybeSingle();
    if (error || !data) return null;
    const clean = normalizeAbn((data as { abn?: unknown }).abn as string | null);
    return clean && validateAbnChecksum(clean) ? clean : null;
  } catch {
    return null;
  }
}

// ── Register cohort ─────────────────────────────────────────────────────────

/** One entity's register facts, aggregated over its signals. */
export interface RegisterEntity {
  abn: string;
  ageMonths: number | null;
  abnActive: boolean;
  gstActive: boolean;
  state: string | null;
  grants: number;
  rdti: boolean;
}

export interface RegisterCohortQuery {
  state?: string | null;
  /** Registers carry no industry; accepted for the call signature, reported back as `industryMatched: false`. */
  industry?: string | null;
  ageMonths?: number | null;
  /** The project's own ABN — when its register facts exist they beat `ageMonths`. */
  abn?: string | null;
}

export interface RegisterCohort {
  source: "register_cohort";
  n: number;
  stateMatched: boolean;
  industryMatched: false;
  ageBands: Record<AgeBand, number>;
  medianAgeMonths: number | null;
  gstShare: number;
  grantShare: number;
  rdtiShare: number;
  /** Maturity scores (0–100) of every entity in the cohort, ascending. */
  scores: number[];
  /** The project's own score when it could be computed (ABN facts or ageMonths). */
  subjectScore: number | null;
  subjectFromRegister: boolean;
}

export type AgeBand = "lt_1y" | "1_3y" | "3_7y" | "gt_7y";

export function ageBand(months: number): AgeBand {
  if (months < 12) return "lt_1y";
  if (months < 36) return "1_3y";
  if (months < 84) return "3_7y";
  return "gt_7y";
}

/**
 * Register maturity score 0–100 — transparent, documented on
 * docs/ops/data-sources.md. Age (≤ 60: 10 years = 60) + ABN active 5 + GST
 * active 10 + grants (10 first, 5 each extra, ≤ 15) + R&DTI 10.
 */
export function registerMaturityScore(e: Pick<RegisterEntity, "ageMonths" | "abnActive" | "gstActive" | "grants" | "rdti">): number {
  const age = e.ageMonths == null ? 0 : Math.min(60, (e.ageMonths / 120) * 60);
  const grants = e.grants > 0 ? Math.min(15, 10 + 5 * (e.grants - 1)) : 0;
  return Math.round(age + (e.abnActive ? 5 : 0) + (e.gstActive ? 10 : 0) + grants + (e.rdti ? 10 : 0));
}

/** Strict percentile: share of the cohort scoring strictly below `score`. */
export function percentileWithinCohort(score: number, ascendingScores: readonly number[]): number {
  if (!ascendingScores.length) return 0;
  let below = 0;
  for (const s of ascendingScores) {
    if (s < score) below += 1;
    else break;
  }
  return Math.round((below / ascendingScores.length) * 100);
}

/** Fold raw rows into one RegisterEntity per ABN. Rows without an ABN are ignored. */
export function aggregateRegisterEntities(rows: readonly ExternalSignalRow[], now: number): Map<string, RegisterEntity> {
  const out = new Map<string, RegisterEntity>();
  for (const r of rows) {
    const abn = normalizeAbn(r.entity_abn);
    if (!abn) continue;
    let e = out.get(abn);
    if (!e) {
      e = { abn, ageMonths: null, abnActive: false, gstActive: false, state: null, grants: 0, rdti: false };
      out.set(abn, e);
    }
    const v = r.value ?? {};
    if (r.signal_type === "abr_entity") {
      e.abnActive = str(v.abn_status) === "ACT";
      e.gstActive = str(v.gst_status) === "ACT";
      const from = str(v.abn_status_from);
      const age = from ? monthsBetween(from, now) : null;
      if (age != null) e.ageMonths = age;
      e.state = str(v.state) ?? e.state;
    } else if (r.signal_type === "grant_award") {
      e.grants += 1;
      e.state = e.state ?? str(v.state);
    } else if (r.signal_type === "rdti_registration") {
      e.rdti = true;
    }
  }
  return out;
}

/** Pure cohort builder (the reader below feeds it). Entities with no ABR age are excluded — age is the anchor. */
export function buildRegisterCohort(entities: Iterable<RegisterEntity>, q: RegisterCohortQuery): RegisterCohort {
  const state = q.state?.trim().toUpperCase() || null;
  const subjectAbn = normalizeAbn(q.abn);
  let subject: RegisterEntity | null = null;
  const members: RegisterEntity[] = [];
  for (const e of entities) {
    if (subjectAbn && e.abn === subjectAbn) subject = e;
    if (e.ageMonths == null) continue;
    if (state && e.state && e.state !== state) continue;
    members.push(e);
  }
  const ageBands: Record<AgeBand, number> = { lt_1y: 0, "1_3y": 0, "3_7y": 0, gt_7y: 0 };
  for (const m of members) ageBands[ageBand(m.ageMonths as number)] += 1;
  const ages = members.map((m) => m.ageMonths as number).sort((a, b) => a - b);
  const scores = members.map(registerMaturityScore).sort((a, b) => a - b);
  const n = members.length;
  const share = (pred: (m: RegisterEntity) => boolean) => (n ? Math.round((members.filter(pred).length / n) * 100) / 100 : 0);

  let subjectScore: number | null = null;
  let subjectFromRegister = false;
  if (subject && subject.ageMonths != null) {
    subjectScore = registerMaturityScore(subject);
    subjectFromRegister = true;
  } else if (typeof q.ageMonths === "number" && Number.isFinite(q.ageMonths)) {
    subjectScore = registerMaturityScore({ ageMonths: q.ageMonths, abnActive: true, gstActive: false, grants: subject?.grants ?? 0, rdti: subject?.rdti ?? false });
  }

  return {
    source: "register_cohort",
    n,
    stateMatched: Boolean(state),
    industryMatched: false,
    ageBands,
    medianAgeMonths: ages.length ? ages[Math.floor(ages.length / 2)] : null,
    gstShare: share((m) => m.gstActive),
    grantShare: share((m) => m.grants > 0),
    rdtiShare: share((m) => m.rdti),
    scores,
    subjectScore,
    subjectFromRegister,
  };
}

/** Register cohort from `external_signals` (≤ 5,000 rows scanned). null when the table is unreadable. */
export async function cohortFromRegisters(db: SignalsDb | null | undefined, q: RegisterCohortQuery, opts: { now?: number; limit?: number } = {}): Promise<RegisterCohort | null> {
  if (!db) return null;
  const now = opts.now ?? Date.now();
  try {
    const { data, error } = await db
      .from("external_signals")
      .select("source_id,entity_abn,signal_type,value,as_of")
      .in("signal_type", [...EXTERNAL_SIGNAL_TYPES])
      .not("entity_abn", "is", null)
      .order("as_of", { ascending: false })
      .limit(opts.limit ?? 5000);
    if (error) {
      if (!DB_MISSING.has(String(error.code))) console.warn("[external-signals] cohort read failed", { code: error.code, message: error.message });
      return null;
    }
    const entities = aggregateRegisterEntities((data ?? []) as ExternalSignalRow[], now);
    return buildRegisterCohort(entities.values(), q);
  } catch {
    return null;
  }
}
