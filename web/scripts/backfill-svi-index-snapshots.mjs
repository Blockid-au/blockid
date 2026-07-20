#!/usr/bin/env node
/**
 * One-shot backfill for svi_index_snapshots.
 *
 * Verification report bc83e2b caught this table completely empty, which is
 * why /api/index/svi + /dataset were returning zeros. This script walks
 * every row in svi_analyses in stable (created_at asc, id asc) order and
 * lands an anonymised snapshot for each one.
 *
 * Idempotent: duplicates are dropped both by a per-row pre-check and by
 * the UNIQUE(account_id, snapshot_date) constraint from 0052. Safe to
 * re-run any number of times.
 *
 * Uses `@supabase/supabase-js` directly (matches every other web/scripts
 * .mjs seed) because the TS `svi-index-populator` module is `server-only`
 * and can't be imported at runtime here. The extractor logic is kept in
 * sync with `src/lib/svi-index-populator.ts` — behavioural changes should
 * be made in both places until a shared JS/TS extraction lib exists.
 *
 * Env:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (read from web/.env)
 *
 * Run:
 *   node scripts/backfill-svi-index-snapshots.mjs
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_DIR = resolve(__dirname, "..");

const env = Object.fromEntries(
  readFileSync(resolve(WEB_DIR, ".env"), "utf8")
    .split("\n")
    .map((l) => l.match(/^([A-Z_]+)=(.*)/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
);

const url = (env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL).replace(
  "supabase-kong",
  "localhost",
);
const supabase = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY);

const BATCH_LIMIT = 500;

// ─── Helpers (mirror src/lib/svi-index-populator.ts) ──────────────────────

const isRecord = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
const pickString = (v) => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
};
const pickNumber = (v) => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
};
const pickStage = (v) => {
  const n = pickNumber(v);
  if (n === null) return null;
  const r = Math.round(n);
  if (r < 0 || r > 7) return null;
  return r;
};

function extractSnapshot(analysis) {
  const svi = isRecord(analysis) ? pickNumber(analysis.totalSVI) : null;
  const safeSvi = svi ?? 0;

  let sector = null;
  if (isRecord(analysis)) {
    sector = pickString(analysis.sector);
  }

  let stage = isRecord(analysis) ? pickStage(analysis.stage) : null;

  let runway = null;
  let burn = null;
  if (isRecord(analysis)) {
    const dims = isRecord(analysis.dimensions) ? analysis.dimensions : null;
    const financials =
      dims && isRecord(dims.financials) ? dims.financials : null;
    if (financials) {
      runway =
        pickNumber(financials.runway_months) ??
        pickNumber(financials.runwayMonths);
      burn =
        pickNumber(financials.burn_rate) ??
        pickNumber(financials.burnRate);
    }
    if (runway === null) {
      runway =
        pickNumber(analysis.runway_months) ??
        pickNumber(analysis.runwayMonths);
    }
    if (burn === null) {
      burn = pickNumber(analysis.burn_rate) ?? pickNumber(analysis.burnRate);
    }
  }

  return {
    svi: safeSvi,
    sector,
    stage,
    runway_months: runway === null ? null : Math.round(runway),
    burn_rate: burn,
  };
}

// findOrCreateSVIAccount inlined — mirrors src/lib/projects.ts semantics
// for the (email, project_id = null) branch (the branch the guest snapshot
// path uses).
const accountCache = new Map();
async function findOrCreateAccount(email) {
  const cached = accountCache.get(email);
  if (cached !== undefined) return cached;

  const { data: existing } = await supabase
    .from("svi_accounts")
    .select("id")
    .eq("email", email)
    .is("project_id", null)
    .maybeSingle();

  if (existing?.id) {
    accountCache.set(email, existing.id);
    return existing.id;
  }

  const { data: created, error } = await supabase
    .from("svi_accounts")
    .insert({
      email,
      project_id: null,
      last_active_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !created) {
    console.warn(`  ! svi_accounts insert failed for ${email}:`, error?.message);
    accountCache.set(email, null);
    return null;
  }
  accountCache.set(email, created.id);
  return created.id;
}

// ─── Batch loop ───────────────────────────────────────────────────────────

async function processBatch(sinceCreatedAt, sinceId) {
  let query = supabase
    .from("svi_analyses")
    .select("id, email, created_at, analysis_json, total_svi")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(BATCH_LIMIT);

  if (sinceCreatedAt) {
    query = query.or(
      `created_at.gt.${sinceCreatedAt},and(created_at.eq.${sinceCreatedAt},id.gt.${sinceId})`,
    );
  }

  const { data, error } = await query;
  if (error) throw error;
  const rows = data ?? [];

  let inserted = 0;
  let skipped = 0;
  let failed = 0;
  let lastId = sinceId;
  let lastCreatedAt = sinceCreatedAt;

  for (const row of rows) {
    lastId = row.id;
    lastCreatedAt = row.created_at;

    try {
      const accountId = await findOrCreateAccount(row.email);
      if (!accountId) {
        failed += 1;
        continue;
      }

      const snapshotDate = (row.created_at ?? new Date().toISOString()).slice(
        0,
        10,
      );

      const { data: existing } = await supabase
        .from("svi_index_snapshots")
        .select("id")
        .eq("account_id", accountId)
        .eq("snapshot_date", snapshotDate)
        .maybeSingle();

      if (existing) {
        skipped += 1;
        continue;
      }

      const snap = extractSnapshot(row.analysis_json);
      const totalSvi = snap.svi || row.total_svi || 0;

      const { error: insertError } = await supabase
        .from("svi_index_snapshots")
        .insert({
          account_id: accountId,
          svi: totalSvi,
          revenue_estimate: null,
          runway_months: snap.runway_months,
          burn_rate: snap.burn_rate,
          cap_table_entries: null,
          sector: snap.sector,
          state: null,
          stage: snap.stage === null ? null : String(snap.stage),
          snapshot_date: snapshotDate,
        });

      if (insertError) {
        if (insertError.code === "23505") {
          skipped += 1;
        } else {
          failed += 1;
          console.warn(`  ! insert failed for ${row.id}:`, insertError.message);
        }
        continue;
      }

      inserted += 1;
    } catch (err) {
      failed += 1;
      console.warn(`  ! row ${row.id} threw:`, err?.message ?? err);
    }
  }

  return {
    scanned: rows.length,
    inserted,
    skipped,
    failed,
    lastId,
    lastCreatedAt,
  };
}

async function main() {
  console.log("Backfilling svi_index_snapshots from svi_analyses…");
  console.log(`Batch size: ${BATCH_LIMIT}`);

  let sinceCreatedAt = null;
  let sinceId = null;
  let totalScanned = 0;
  let totalInserted = 0;
  let totalSkipped = 0;
  let totalFailed = 0;
  let batchNum = 0;

  // Loop until a batch either scans nothing or scans a partial batch
  // (partial => we've reached the end of the table).
  while (true) {
    batchNum += 1;
    const result = await processBatch(sinceCreatedAt, sinceId);

    totalScanned += result.scanned;
    totalInserted += result.inserted;
    totalSkipped += result.skipped;
    totalFailed += result.failed;

    console.log(
      `  batch ${String(batchNum).padStart(3, "0")}: scanned=${result.scanned} inserted=${result.inserted} skipped=${result.skipped} failed=${result.failed} lastId=${result.lastId ?? "-"}`,
    );

    if (result.scanned === 0) break;
    if (result.scanned < BATCH_LIMIT) {
      sinceCreatedAt = result.lastCreatedAt;
      sinceId = result.lastId;
      // Run one more empty check to confirm we're drained, then exit.
      const tail = await processBatch(sinceCreatedAt, sinceId);
      totalScanned += tail.scanned;
      totalInserted += tail.inserted;
      totalSkipped += tail.skipped;
      totalFailed += tail.failed;
      console.log(
        `  tail-check: scanned=${tail.scanned} inserted=${tail.inserted}`,
      );
      break;
    }

    sinceCreatedAt = result.lastCreatedAt;
    sinceId = result.lastId;
  }

  console.log("");
  console.log("Done.");
  console.log(`  total scanned : ${totalScanned}`);
  console.log(`  total inserted: ${totalInserted}`);
  console.log(`  total skipped : ${totalSkipped}`);
  console.log(`  total failed  : ${totalFailed}`);

  // Advance the cron checkpoint so the ongoing populator starts from
  // where the backfill left off.
  if (sinceId) {
    const { error: stateError } = await supabase
      .from("svi_index_populate_state")
      .update({
        last_populated_analysis_id: sinceId,
        last_populated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);
    if (stateError) {
      console.warn("  ! failed to update populate_state:", stateError.message);
    } else {
      console.log(`  checkpoint advanced to ${sinceId}`);
    }
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
