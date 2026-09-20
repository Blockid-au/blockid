// G21 P1-A — the one data-access seam for claims / evidence_records /
// claim_versions (migration 0417). `supabaseClaimsDb()` is what the routes,
// the sync hook and the expiry cron use; `memoryClaimsDb()` is the fake the
// colocated tests and the backfill's --dry-run run against (same interface,
// same semantics — the pure logic in claims.ts / records.ts / expiry.ts never
// touches supabase-js directly).
//
// Every read is scope-blind: RLS is owner/service-role only and the viewer
// scope is applied in code (records.ts filterRecordsForViewer).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { HubEvidenceRowLike } from "./hub-rows";
import type { EvidenceState } from "./state-machine";
import type { Claim, ClaimVersion, EvidenceRecord, SviDimension } from "./types";

export type ClaimInsert = Omit<Claim, "id" | "created_at" | "updated_at">;
export type ClaimPatch = Partial<Omit<Claim, "id" | "project_id" | "created_at" | "updated_at">>;
export type EvidenceRecordInsert = Omit<EvidenceRecord, "id" | "created_at" | "updated_at" | "submitted_at"> & { submitted_at?: string };
export type EvidenceRecordPatch = Partial<Pick<EvidenceRecord, "status" | "claim_id" | "visibility" | "consent_scope" | "verified_by" | "verified_at" | "verification_level" | "expires_at">>;
export type ClaimVersionInsert = Omit<ClaimVersion, "id" | "changed_at"> & { changed_at?: string };

/** The Phase-3 `public.evidence` columns the expiry job touches (0210). */
export interface Phase3EvidenceRow {
  id: string;
  business_id: string;
  verification_state: EvidenceState;
  expires_at: string | null;
}

/** Hub rows as the sync reads them (HUB_EVIDENCE_COLUMNS + the verifier id). */
export type HubRowForSync = HubEvidenceRowLike & { id?: string | null; verified_by_user_id?: string | null };

export interface ClaimsDb {
  listClaims(projectId: string): Promise<Claim[]>;
  getClaim(id: string): Promise<Claim | null>;
  insertClaim(row: ClaimInsert): Promise<Claim>;
  updateClaim(id: string, patch: ClaimPatch): Promise<Claim | null>;

  listRecords(projectId: string, opts?: { dimension?: SviDimension | null }): Promise<EvidenceRecord[]>;
  listRecordsByClaimIds(claimIds: readonly string[]): Promise<EvidenceRecord[]>;
  insertRecord(row: EvidenceRecordInsert): Promise<EvidenceRecord>;
  updateRecord(id: string, patch: EvidenceRecordPatch): Promise<void>;
  /** Active records whose expires_at ≤ now, oldest first. */
  listExpiredActiveRecords(nowIso: string, limit: number): Promise<EvidenceRecord[]>;

  nextClaimVersion(claimId: string): Promise<number>;
  insertVersion(row: ClaimVersionInsert): Promise<ClaimVersion>;
  listVersions(claimId: string): Promise<ClaimVersion[]>;

  loadHubRows(projectId: string): Promise<HubRowForSync[]>;

  /** Phase-3 `public.evidence` rows past their expires_at that are still in an expirable state. */
  listExpirablePhase3Evidence(todayIso: string, limit: number): Promise<Phase3EvidenceRow[]>;
  updatePhase3EvidenceState(id: string, state: EvidenceState): Promise<void>;
}

/** Error the DB layer raises when 0417 has not been applied — callers stay fail-soft. */
export class ClaimsTableMissingError extends Error {
  constructor(table: string) {
    super(`${table} is missing — apply web/supabase/migrations/0417_claims_evidence_records.sql`);
    this.name = "ClaimsTableMissingError";
  }
}

export function isMissingTableError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : typeof err === "object" && err && "message" in err ? String((err as { message: unknown }).message) : String(err);
  return /does not exist|schema cache|relation .* not found/i.test(msg);
}

// ─── supabase ────────────────────────────────────────────────────────────────

const CLAIM_COLUMNS = "id, project_id, svi_dimension, category, claim_key, statement, founder_claimed_value, extracted_value, normalized_value, confidence, contradiction_status, assessment_status, source_report_id, created_by, created_at, updated_at";
const RECORD_COLUMNS = "id, project_id, claim_id, svi_dimension, evidence_type, source_type, source_uri, source_name, submitted_by, submitted_at, observed_at, confidence, verification_level, verified_by, verified_at, expires_at, hash, observed_value, visibility, consent_scope, status, created_at, updated_at";
const VERSION_COLUMNS = "id, claim_id, version, snapshot, note, changed_by, changed_at";
const HUB_SYNC_COLUMNS = "id, dimension, evidence_type, evidence_label, evidence_value_or_url, confidence_level, is_verified, verified_at, verified_by_user_id, review_status, created_at, updated_at";

function raise(table: string, error: { message: string; code?: string } | null): never {
  if (error && isMissingTableError(error)) throw new ClaimsTableMissingError(table);
  throw new Error(`${table}: ${error?.message ?? "unknown error"}`);
}

const num = (v: unknown): number | null => (v == null ? null : typeof v === "number" ? v : Number.isFinite(Number(v)) ? Number(v) : null);

function mapClaim(row: Record<string, unknown>): Claim {
  return { ...(row as unknown as Claim), confidence: num(row.confidence) };
}
function mapRecord(row: Record<string, unknown>): EvidenceRecord {
  return { ...(row as unknown as EvidenceRecord), confidence: num(row.confidence), consent_scope: (row.consent_scope as EvidenceRecord["consent_scope"]) ?? {} };
}

export function supabaseClaimsDb(client: SupabaseClient): ClaimsDb {
  return {
    async listClaims(projectId) {
      const { data, error } = await client.from("claims").select(CLAIM_COLUMNS).eq("project_id", projectId).order("created_at", { ascending: true }).limit(2000);
      if (error) raise("claims", error);
      return (data ?? []).map((r) => mapClaim(r as Record<string, unknown>));
    },
    async getClaim(id) {
      const { data, error } = await client.from("claims").select(CLAIM_COLUMNS).eq("id", id).maybeSingle();
      if (error) raise("claims", error);
      return data ? mapClaim(data as Record<string, unknown>) : null;
    },
    async insertClaim(row) {
      const { data, error } = await client.from("claims").insert(row).select(CLAIM_COLUMNS).single();
      if (error || !data) raise("claims", error);
      return mapClaim(data as Record<string, unknown>);
    },
    async updateClaim(id, patch) {
      const { data, error } = await client.from("claims").update(patch).eq("id", id).select(CLAIM_COLUMNS).maybeSingle();
      if (error) raise("claims", error);
      return data ? mapClaim(data as Record<string, unknown>) : null;
    },

    async listRecords(projectId, opts) {
      let q = client.from("evidence_records").select(RECORD_COLUMNS).eq("project_id", projectId);
      if (opts?.dimension) q = q.eq("svi_dimension", opts.dimension);
      const { data, error } = await q.order("submitted_at", { ascending: false }).limit(5000);
      if (error) raise("evidence_records", error);
      return (data ?? []).map((r) => mapRecord(r as Record<string, unknown>));
    },
    async listRecordsByClaimIds(claimIds) {
      if (claimIds.length === 0) return [];
      const { data, error } = await client.from("evidence_records").select(RECORD_COLUMNS).in("claim_id", [...claimIds]).limit(5000);
      if (error) raise("evidence_records", error);
      return (data ?? []).map((r) => mapRecord(r as Record<string, unknown>));
    },
    async insertRecord(row) {
      const { data, error } = await client.from("evidence_records").insert(row).select(RECORD_COLUMNS).single();
      if (error || !data) raise("evidence_records", error);
      return mapRecord(data as Record<string, unknown>);
    },
    async updateRecord(id, patch) {
      const { error } = await client.from("evidence_records").update(patch).eq("id", id);
      if (error) raise("evidence_records", error);
    },
    async listExpiredActiveRecords(nowIso, limit) {
      const { data, error } = await client
        .from("evidence_records")
        .select(RECORD_COLUMNS)
        .eq("status", "active")
        .not("expires_at", "is", null)
        .lte("expires_at", nowIso)
        .order("expires_at", { ascending: true })
        .limit(limit);
      if (error) raise("evidence_records", error);
      return (data ?? []).map((r) => mapRecord(r as Record<string, unknown>));
    },

    async nextClaimVersion(claimId) {
      const { data, error } = await client.from("claim_versions").select("version").eq("claim_id", claimId).order("version", { ascending: false }).limit(1).maybeSingle();
      if (error) raise("claim_versions", error);
      const last = data ? num((data as { version: unknown }).version) : null;
      return (last ?? 0) + 1;
    },
    async insertVersion(row) {
      const { data, error } = await client.from("claim_versions").insert(row).select(VERSION_COLUMNS).single();
      if (error || !data) raise("claim_versions", error);
      return data as unknown as ClaimVersion;
    },
    async listVersions(claimId) {
      const { data, error } = await client.from("claim_versions").select(VERSION_COLUMNS).eq("claim_id", claimId).order("version", { ascending: true }).limit(500);
      if (error) raise("claim_versions", error);
      return (data ?? []) as unknown as ClaimVersion[];
    },

    async loadHubRows(projectId) {
      const { data, error } = await client.from("svi_dimension_evidence").select(HUB_SYNC_COLUMNS).eq("project_id", projectId).order("created_at", { ascending: false }).limit(500);
      if (error) raise("svi_dimension_evidence", error);
      return (data ?? []) as unknown as HubRowForSync[];
    },

    async listExpirablePhase3Evidence(todayIso, limit) {
      const { data, error } = await client
        .from("evidence")
        .select("id, business_id, verification_state, expires_at")
        .not("expires_at", "is", null)
        .lt("expires_at", todayIso)
        .in("verification_state", ["uploaded", "processing", "classified", "validation_required", "verified"])
        .order("expires_at", { ascending: true })
        .limit(limit);
      if (error) raise("evidence", error);
      return (data ?? []) as unknown as Phase3EvidenceRow[];
    },
    async updatePhase3EvidenceState(id, state) {
      const { error } = await client.from("evidence").update({ verification_state: state, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) raise("evidence", error);
    },
  };
}

// ─── in-memory fake (tests, --dry-run) ───────────────────────────────────────

export interface MemoryClaimsDb extends ClaimsDb {
  claims: Claim[];
  records: EvidenceRecord[];
  versions: ClaimVersion[];
  hubRows: Map<string, HubRowForSync[]>;
  phase3: Phase3EvidenceRow[];
}

export function memoryClaimsDb(seed: { claims?: Claim[]; records?: EvidenceRecord[]; hubRows?: Record<string, HubRowForSync[]>; phase3?: Phase3EvidenceRow[]; now?: () => Date } = {}): MemoryClaimsDb {
  const now = seed.now ?? (() => new Date());
  let seq = 0;
  const id = (p: string) => `${p}-${++seq}`;
  const db: MemoryClaimsDb = {
    claims: [...(seed.claims ?? [])],
    records: [...(seed.records ?? [])],
    versions: [],
    hubRows: new Map(Object.entries(seed.hubRows ?? {})),
    phase3: [...(seed.phase3 ?? [])],

    async listClaims(projectId) {
      return db.claims.filter((c) => c.project_id === projectId).map((c) => ({ ...c }));
    },
    async getClaim(claimId) {
      const c = db.claims.find((x) => x.id === claimId);
      return c ? { ...c } : null;
    },
    async insertClaim(row) {
      if (row.claim_key && db.claims.some((c) => c.project_id === row.project_id && c.claim_key === row.claim_key)) {
        throw Object.assign(new Error("duplicate key value violates unique constraint claims_project_claim_key_uidx"), { code: "23505" });
      }
      const at = now().toISOString();
      const claim: Claim = { ...row, id: id("claim"), created_at: at, updated_at: at };
      db.claims.push(claim);
      return { ...claim };
    },
    async updateClaim(claimId, patch) {
      const i = db.claims.findIndex((x) => x.id === claimId);
      if (i < 0) return null;
      db.claims[i] = { ...db.claims[i], ...patch, updated_at: now().toISOString() };
      return { ...db.claims[i] };
    },

    async listRecords(projectId, opts) {
      return db.records.filter((r) => r.project_id === projectId && (!opts?.dimension || r.svi_dimension === opts.dimension)).map((r) => ({ ...r }));
    },
    async listRecordsByClaimIds(claimIds) {
      return db.records.filter((r) => r.claim_id && claimIds.includes(r.claim_id)).map((r) => ({ ...r }));
    },
    async insertRecord(row) {
      const at = now().toISOString();
      const rec: EvidenceRecord = { ...row, submitted_at: row.submitted_at ?? at, id: id("rec"), created_at: at, updated_at: at };
      db.records.push(rec);
      return { ...rec };
    },
    async updateRecord(recId, patch) {
      const i = db.records.findIndex((x) => x.id === recId);
      if (i >= 0) db.records[i] = { ...db.records[i], ...patch, updated_at: now().toISOString() };
    },
    async listExpiredActiveRecords(nowIso, limit) {
      return db.records
        .filter((r) => r.status === "active" && r.expires_at && r.expires_at <= nowIso)
        .sort((a, b) => (a.expires_at! < b.expires_at! ? -1 : 1))
        .slice(0, limit)
        .map((r) => ({ ...r }));
    },

    async nextClaimVersion(claimId) {
      return db.versions.filter((v) => v.claim_id === claimId).reduce((m, v) => Math.max(m, v.version), 0) + 1;
    },
    async insertVersion(row) {
      const v: ClaimVersion = { ...row, changed_at: row.changed_at ?? now().toISOString(), id: id("ver") };
      db.versions.push(v);
      return { ...v };
    },
    async listVersions(claimId) {
      return db.versions.filter((v) => v.claim_id === claimId).sort((a, b) => a.version - b.version).map((v) => ({ ...v }));
    },

    async loadHubRows(projectId) {
      return [...(db.hubRows.get(projectId) ?? [])];
    },

    async listExpirablePhase3Evidence(todayIso, limit) {
      const expirable = new Set(["uploaded", "processing", "classified", "validation_required", "verified"]);
      return db.phase3.filter((r) => r.expires_at && r.expires_at < todayIso && expirable.has(r.verification_state)).slice(0, limit).map((r) => ({ ...r }));
    },
    async updatePhase3EvidenceState(rowId, state) {
      const i = db.phase3.findIndex((x) => x.id === rowId);
      if (i >= 0) db.phase3[i] = { ...db.phase3[i], verification_state: state };
    },
  };
  return db;
}

/** The production db, or null when Supabase is not configured. Lazy so the pure modules stay importable in tests. */
export async function defaultClaimsDb(): Promise<ClaimsDb | null> {
  const { getSupabaseAdmin } = await import("@/lib/supabase");
  const client = getSupabaseAdmin();
  return client ? supabaseClaimsDb(client) : null;
}
