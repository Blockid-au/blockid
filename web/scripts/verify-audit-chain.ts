#!/usr/bin/env npx tsx
/**
 * verify-audit-chain.ts
 *
 * Walk audit_events ORDER BY id ASC and verify:
 *   1. Each row's `prev_hash` matches the previous row's `curr_hash`
 *      (or is empty string for the very first row).
 *   2. Each row's `curr_hash` equals sha256(canonical payload) where the
 *      payload is built from the same fields the DB trigger uses.
 *   3. Each row's `hmac_signature` (when present) equals
 *      HMAC-SHA256(AUDIT_HMAC_SECRET, curr_hash).
 *
 * Exit code:
 *   0 — chain intact and all HMACs valid (or absent for legacy rows)
 *   1 — chain broken; the failing row id + reason are printed to stderr
 *
 * Intended to be invoked nightly by cron and by ops on-demand.
 *
 * Usage:
 *   AUDIT_HMAC_SECRET=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     npx tsx scripts/verify-audit-chain.ts
 */

import { createClient } from "@supabase/supabase-js";
import { createHash, createHmac } from "node:crypto";

const BATCH_SIZE = 1000;

type AuditRow = {
  id: number;
  ts: string;
  user_id: string | null;
  actor: string | null;
  action: string | null;
  resource_type: string | null;
  resource_id: string | null;
  prev_hash: string | null;
  curr_hash: string;
  hmac_signature: string | null;
  detail: unknown;
};

function fail(msg: string): never {
  process.stderr.write(`FAIL: ${msg}\n`);
  process.exit(1);
}

function buildPayload(row: AuditRow): string {
  const tsEpoch = String(Math.floor(new Date(row.ts).getTime() / 1000));
  const detailText = row.detail == null ? "{}" : JSON.stringify(row.detail);
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

function sha256Hex(payload: string): string {
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

function hmacHex(secret: string, msgHex: string): string {
  return createHmac("sha256", secret).update(msgHex, "hex").digest("hex");
}

async function main(): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const hmacSecret = process.env.AUDIT_HMAC_SECRET;

  if (!url || !key) fail("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  if (!hmacSecret || hmacSecret.length < 16) {
    fail("AUDIT_HMAC_SECRET missing or too short (< 16 chars)");
  }

  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let cursorId = 0;
  let expectedPrev = ""; // empty string for the very first row
  let checked = 0;
  let hmacMissing = 0;

  for (;;) {
    const { data, error } = await admin
      .from("audit_events")
      .select("id,ts,user_id,actor,action,resource_type,resource_id,prev_hash,curr_hash,hmac_signature,detail")
      .gt("id", cursorId)
      .order("id", { ascending: true })
      .limit(BATCH_SIZE);

    if (error) fail(`select failed: ${error.message}`);
    if (!data || data.length === 0) break;

    for (const rawRow of data) {
      const row = rawRow as AuditRow;

      // 1. Chain continuity.
      const prev = row.prev_hash ?? "";
      if (prev !== expectedPrev) {
        fail(
          `chain break at id=${row.id}: prev_hash='${prev}' expected='${expectedPrev}'`,
        );
      }

      // 2. curr_hash matches payload.
      const recomputed = sha256Hex(buildPayload(row));
      if (recomputed !== row.curr_hash) {
        fail(
          `curr_hash mismatch at id=${row.id}: db='${row.curr_hash}' recomputed='${recomputed}'`,
        );
      }

      // 3. HMAC (soft — legacy rows may be null; count and warn).
      if (row.hmac_signature) {
        const expectedHmac = hmacHex(hmacSecret, row.curr_hash);
        if (expectedHmac !== row.hmac_signature) {
          fail(
            `hmac_signature mismatch at id=${row.id}: db='${row.hmac_signature}' expected='${expectedHmac}'`,
          );
        }
      } else {
        hmacMissing += 1;
      }

      expectedPrev = row.curr_hash;
      cursorId = row.id;
      checked += 1;
    }

    if (data.length < BATCH_SIZE) break;
  }

  process.stdout.write(
    `OK: verified ${checked} audit rows; hmac_signature missing on ${hmacMissing}\n`,
  );
  process.exit(0);
}

main().catch((e) => {
  fail(`unexpected error: ${e instanceof Error ? e.message : String(e)}`);
});
