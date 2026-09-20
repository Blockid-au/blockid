// G21 P1-A — the daily evidence-expiry job (/api/cron/evidence-expiry,
// crontab 02:35 UTC).
//
//   1. evidence_records: every `active` row whose expires_at ≤ now →
//      `expired`; the claims those rows backed are re-graded
//      (deriveAssessmentStatus + recordsConfidence) so a claim whose only
//      proof lapsed drops back to `claimed`; `evidence.expired` audit row per
//      record, `claim.status_changed` per claim that moved.
//   2. Phase-3 `public.evidence` (0210): rows past their expires_at still in
//      an expirable state go through state-machine.ts `expire` — the
//      transition table decides, not us (a rejected / archived row is left
//      alone). This is the first caller of that transition.
//
// Dimension confidence is NOT stored anywhere the cron could lower: the
// engine computes it at render time from the ladder (svi-analysis
// EVIDENCE_CONFIDENCE) and the claims' `confidence` column is re-derived
// here through the same ladder (recordsConfidence), which is what the
// Assessment Card (P1-B) reads. A snapshot's frozen dim_results is a report
// artefact and stays as issued.
//
// `dry` reports the plan and writes nothing.

import type { AuditFn } from "./claims";
import { regradeClaims } from "./claims";
import { defaultClaimsDb, type ClaimsDb } from "./claims-db";
import { nextEvidenceState } from "./state-machine";
import type { Claim } from "./types";

export interface EvidenceExpiryOptions {
  dry?: boolean;
  now?: Date;
  db?: ClaimsDb | null;
  audit?: AuditFn | null;
  /** Rows per run (both tables) — the cron runs daily, a backlog drains over days. */
  limit?: number;
}

export interface EvidenceExpiryResult {
  ok: true;
  dry: boolean;
  at: string;
  records_expired: number;
  claims_regraded: number;
  claim_status_changes: number;
  phase3_expired: number;
  projects: string[];
  warnings: string[];
}

async function defaultAudit(params: Parameters<AuditFn>[0]): Promise<unknown> {
  const { appendAudit } = await import("@/lib/audit");
  return appendAudit(params);
}

export async function runEvidenceExpiry(opts: EvidenceExpiryOptions = {}): Promise<EvidenceExpiryResult> {
  const now = opts.now ?? new Date();
  const nowIso = now.toISOString();
  const dry = opts.dry === true;
  const limit = Math.max(1, Math.min(opts.limit ?? 500, 5000));
  const db = opts.db === undefined ? await defaultClaimsDb() : opts.db;
  if (!db) throw new Error("evidence-expiry: database unavailable");
  const audit = dry ? null : opts.audit === undefined ? defaultAudit : opts.audit;
  const warnings: string[] = [];
  const result: EvidenceExpiryResult = { ok: true, dry, at: nowIso, records_expired: 0, claims_regraded: 0, claim_status_changes: 0, phase3_expired: 0, projects: [], warnings };

  // ── 1. evidence_records ────────────────────────────────────────────────
  const expired = await db.listExpiredActiveRecords(nowIso, limit);
  const projects = new Set<string>();
  for (const r of expired) {
    projects.add(r.project_id);
    if (dry) continue;
    await db.updateRecord(r.id, { status: "expired" });
    if (audit) {
      try {
        await audit({
          user_id: null,
          actor: "cron",
          action: "evidence.expired",
          resource_type: "evidence_record",
          resource_id: r.id,
          detail: { project_id: r.project_id, claim_id: r.claim_id, evidence_type: r.evidence_type, source_type: r.source_type, expires_at: r.expires_at },
        });
      } catch (err) {
        warnings.push(`audit evidence.expired ${r.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
  result.records_expired = expired.length;
  result.projects = [...projects];

  // re-grade every claim of every touched project (cheap; keeps confidence honest)
  if (!dry) {
    for (const projectId of projects) {
      const claims: Claim[] = await db.listClaims(projectId);
      const records = await db.listRecords(projectId);
      const graded = await regradeClaims({ claims, records, db, audit, actor: "cron", reason: "evidence_expired" });
      result.claims_regraded += claims.length;
      result.claim_status_changes += graded.status_changes;
    }
  }

  // ── 2. Phase-3 public.evidence via the state machine ───────────────────
  const today = nowIso.slice(0, 10);
  let phase3: Awaited<ReturnType<ClaimsDb["listExpirablePhase3Evidence"]>> = [];
  try {
    phase3 = await db.listExpirablePhase3Evidence(today, limit);
  } catch (err) {
    warnings.push(`phase3 evidence read: ${err instanceof Error ? err.message : String(err)}`);
  }
  for (const row of phase3) {
    const next = nextEvidenceState(row.verification_state, "expire");
    if (!next) continue; // terminal state — the transition table says no
    result.phase3_expired += 1;
    if (dry) continue;
    await db.updatePhase3EvidenceState(row.id, next);
    if (audit) {
      try {
        await audit({
          user_id: null,
          actor: "cron",
          action: "evidence.expired",
          resource_type: "evidence",
          resource_id: row.id,
          detail: { project_id: row.business_id, from: row.verification_state, to: next, expires_at: row.expires_at },
        });
      } catch (err) {
        warnings.push(`audit evidence.expired ${row.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  return result;
}
