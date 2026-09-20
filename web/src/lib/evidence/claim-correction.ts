// G21 P1-A — a founder's correction to a claim (PATCH /api/claims/[id]).
//
// Appended, never overwritten silently (§3 data rule 3): the claim row's
// previous state is snapshotted into claim_versions (version n+1, the
// founder's note, who changed it) BEFORE the row is updated, then the claim
// is re-graded — a founder value that disagrees with the analysis extraction
// beyond the tolerance flags the claim `conflicting` (detectContradictions),
// which P1-C's correction workflow resolves. One `claim.corrected` audit row
// per call plus the usual `claim.status_changed` when the status moves.
//
// Pure validation (`parseClaimCorrection`) + a DI'd persister so the route
// test and the memory db share one arithmetic.

import { z } from "zod";
import { regradeClaims, type AuditFn } from "./claims";
import type { ClaimsDb } from "./claims-db";
import type { Claim, ClaimVersion } from "./types";

export const CLAIM_NOTE_MAX = 1000;
export const CLAIM_STATEMENT_MAX = 2000;
export const CLAIM_VALUE_MAX_BYTES = 4 * 1024;

const jsonValue = z.unknown().refine((v) => v !== undefined && JSON.stringify(v ?? null).length <= CLAIM_VALUE_MAX_BYTES, { message: `founder_claimed_value must serialise to ≤ ${CLAIM_VALUE_MAX_BYTES} bytes` });

export const claimCorrectionSchema = z
  .object({
    founder_claimed_value: jsonValue.optional(),
    statement: z.string().trim().min(1).max(CLAIM_STATEMENT_MAX).optional(),
    note: z.string().trim().min(1).max(CLAIM_NOTE_MAX),
  })
  .strict()
  .refine((b) => b.founder_claimed_value !== undefined || b.statement !== undefined, { message: "founder_claimed_value or statement is required" });

export type ClaimCorrection = z.infer<typeof claimCorrectionSchema>;

export type ParseResult = { ok: true; value: ClaimCorrection } | { ok: false; issues: Array<{ path: string; message: string }> };

export function parseClaimCorrection(body: unknown): ParseResult {
  const parsed = claimCorrectionSchema.safeParse(body);
  if (parsed.success) return { ok: true, value: parsed.data };
  return { ok: false, issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) };
}

export interface CorrectClaimArgs {
  claim: Claim;
  correction: ClaimCorrection;
  userId: string;
  db: ClaimsDb;
  audit?: AuditFn | null;
  now?: Date;
}

export interface CorrectClaimResult {
  claim: Claim;
  version: ClaimVersion;
  status_changed: boolean;
}

export async function correctClaim(args: CorrectClaimArgs): Promise<CorrectClaimResult> {
  const { claim, correction, db } = args;
  const now = args.now ?? new Date();
  const patch: Partial<Pick<Claim, "founder_claimed_value" | "statement">> = {};
  if (correction.founder_claimed_value !== undefined) patch.founder_claimed_value = correction.founder_claimed_value ?? null;
  if (correction.statement !== undefined) patch.statement = correction.statement;

  const version = await db.insertVersion({
    claim_id: claim.id,
    version: await db.nextClaimVersion(claim.id),
    snapshot: {
      before: {
        statement: claim.statement,
        founder_claimed_value: claim.founder_claimed_value ?? null,
        extracted_value: claim.extracted_value ?? null,
        normalized_value: claim.normalized_value ?? null,
        assessment_status: claim.assessment_status,
        contradiction_status: claim.contradiction_status,
        confidence: claim.confidence,
      },
      patch,
    },
    note: correction.note,
    changed_by: args.userId,
    changed_at: now.toISOString(),
  });

  const updated = (await db.updateClaim(claim.id, patch)) ?? { ...claim, ...patch };
  const records = await db.listRecordsByClaimIds([claim.id]);
  const graded = await regradeClaims({ claims: [updated], records, db, audit: args.audit, actor: "user", actorUserId: args.userId, reason: "founder_correction" });
  const after = (await db.getClaim(claim.id)) ?? updated;

  if (args.audit) {
    try {
      await args.audit({
        user_id: args.userId,
        actor: "user",
        action: "claim.corrected",
        resource_type: "claim",
        resource_id: claim.id,
        detail: { project_id: claim.project_id, claim_key: claim.claim_key, version: version.version, fields: Object.keys(patch), note_length: correction.note.length, status: after.assessment_status, contradiction: after.contradiction_status },
      });
    } catch (err) {
      console.warn("[blockid:claims] audit claim.corrected failed", err instanceof Error ? err.message : err);
    }
  }
  return { claim: after, version, status_changed: graded.status_changes > 0 };
}
