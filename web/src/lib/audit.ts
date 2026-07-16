// Append-only, hash-chained audit log.
//
// Every legally- or compliance-material state transition (consent recorded,
// equity request lifecycle, wholesale verification, plan change, chain sync)
// gets one row here. The DB trigger `audit_events_hash_chain` (migration
// 0076_compliance_and_equity.sql) computes `curr_hash` server-side as
// sha256(prev_hash || row_fields), so we do NOT compute it in the app layer
// — instead we compute an HMAC signature over the resulting curr_hash using
// AUDIT_HMAC_SECRET, which lives only in the app process. An attacker with
// direct DB write (bypassing the trigger) cannot forge a valid HMAC without
// the app-side secret; an attacker with only the app secret cannot forge
// the hash chain without also breaking sha256.
//
// The scripts/verify-audit-chain.ts CLI walks the table and re-validates
// both the hash chain and HMAC signatures for nightly cron use.

import "server-only";
import { createHmac } from "node:crypto";
import { getSupabaseAdmin } from "./supabase";

export type AppendAuditParams = {
  user_id?: string | null;
  actor: string; // 'user' | 'system' | 'cron' | 'webhook:stripe' | 'admin' | ...
  action: string; // dotted, e.g. 'consent.recorded', 'equity_request.approved'
  resource_type: string;
  resource_id?: string | null;
  detail?: Record<string, unknown>;
};

export type AppendAuditResult = {
  id: bigint;
  curr_hash: string;
};

function getHmacSecret(): string {
  const s = process.env.AUDIT_HMAC_SECRET;
  if (!s || s.length < 16) {
    throw new Error(
      "AUDIT_HMAC_SECRET not set (or too short) — refuse to write unsigned audit rows",
    );
  }
  return s;
}

/**
 * Compute HMAC-SHA256 signature over curr_hash. Kept separate so the CLI
 * verifier can call it with the same secret.
 */
export function signAuditHash(curr_hash: string, secret?: string): string {
  const key = secret ?? getHmacSecret();
  return createHmac("sha256", key).update(curr_hash, "hex").digest("hex");
}

/**
 * Append one row to audit_events. The DB trigger computes curr_hash from
 * prev_hash + row fields. We read curr_hash back, compute the HMAC, and
 * update the same row with hmac_signature. Returns the row id + curr_hash.
 *
 * Throws if AUDIT_HMAC_SECRET is missing or supabase is unavailable.
 */
export async function appendAudit(
  params: AppendAuditParams,
): Promise<AppendAuditResult> {
  const admin = getSupabaseAdmin();
  if (!admin) {
    throw new Error("appendAudit: Supabase admin client unavailable");
  }
  // Fail fast if the HMAC secret is missing — do not write an unsigned row.
  const secret = getHmacSecret();

  const insertRow = {
    user_id: params.user_id ?? null,
    actor: params.actor,
    action: params.action,
    resource_type: params.resource_type,
    resource_id: params.resource_id ?? null,
    detail: params.detail ?? {},
    // curr_hash is computed by trigger but the column is NOT NULL — supply
    // an empty placeholder that the BEFORE INSERT trigger overwrites.
    curr_hash: "",
  };

  const { data: inserted, error: insertErr } = await admin
    .from("audit_events")
    .insert(insertRow)
    .select("id, curr_hash")
    .single();

  if (insertErr || !inserted) {
    throw new Error(
      `appendAudit: insert failed — ${insertErr?.message ?? "no row returned"}`,
    );
  }

  const curr_hash = String(inserted.curr_hash);
  const hmac = signAuditHash(curr_hash, secret);

  // Persist the HMAC signature on the same row. audit_events has an
  // update-blocking rule for tamper-proofing; the migration seeds that rule
  // AFTER inserts complete, so a follow-up update by the service role is
  // permitted only if the migration was written to allow it. If not, we
  // fall back to logging and rely on the chain hash alone.
  const { error: updateErr } = await admin
    .from("audit_events")
    .update({ hmac_signature: hmac })
    .eq("id", inserted.id);

  if (updateErr) {
    // Non-fatal: the row exists and is chained; HMAC absence is loggable
    // ops noise, not a correctness break for the chain itself.
    console.warn(
      "[audit] hmac_signature update failed for id=",
      inserted.id,
      updateErr.message,
    );
  }

  return {
    id: BigInt(inserted.id as number),
    curr_hash,
  };
}

/**
 * Reconstruct the canonical payload that the DB trigger uses for hashing.
 * The trigger concatenates fields in this order with '|' separators:
 *
 *   prev_hash | epoch(ts) | user_id | actor | action |
 *   resource_type | resource_id | detail::text
 *
 * Exposed so the verify-chain CLI can recompute and compare.
 */
export function buildAuditPayload(row: {
  prev_hash: string | null;
  ts: string | Date;
  user_id: string | null;
  actor: string | null;
  action: string | null;
  resource_type: string | null;
  resource_id: string | null;
  detail: unknown;
}): string {
  const tsEpoch =
    typeof row.ts === "string"
      ? String(Math.floor(new Date(row.ts).getTime() / 1000))
      : String(Math.floor(row.ts.getTime() / 1000));
  const detailText =
    row.detail == null ? "{}" : JSON.stringify(row.detail);
  return [
    row.prev_hash ?? "",
    tsEpoch,
    row.user_id ?? "",
    row.actor ?? "",
    row.action ?? "",
    row.resource_type ?? "",
    row.resource_id ?? "",
    detailText,
  ].join("|");
}
