#!/usr/bin/env npx tsx
/**
 * bq-export-events.ts — nightly sweep of analytics_events → BigQuery.
 *
 * Contract: see web/content/reports/cdo-review-v2.0.0-beta.6.md section 5.
 *
 *   - MERGE-on-event_id idempotency (Supabase already enforces
 *     analytics_events_event_id_uq; MERGE is defence-in-depth for reruns).
 *   - Partitioned on DATE(ts), clustered on event_name.
 *   - Region: australia-southeast1 (data-locality commitment).
 *   - Never installs @google-cloud/bigquery — checks at runtime. If the SDK
 *     is missing the script exits 0 so the cron doesn't red-flag. Track T-1010
 *     to add the dep once the pipeline is scheduled to actually ship rows.
 *
 * Env:
 *   BQ_PROJECT_ID           (required)
 *   BQ_DATASET              (default "analytics_blockid")
 *   BQ_TABLE                (default "analytics_events")
 *   BQ_REGION               (default "australia-southeast1")
 *   BQ_LOOKBACK_HOURS       (default 26)
 *   SUPABASE_URL            (required)
 *   SUPABASE_SERVICE_ROLE_KEY (required)
 *
 * Flags:
 *   --dry-run       — fetch from supabase, log rowcounts, never touch BQ.
 *   --full-refresh  — ignore BQ_LOOKBACK_HOURS; MERGE the last 30 days.
 *
 * Usage:
 *   npx tsx web/scripts/bq-export-events.ts
 *   npx tsx web/scripts/bq-export-events.ts --dry-run
 *   npx tsx web/scripts/bq-export-events.ts --full-refresh
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ── CLI flags ──────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes("--dry-run");
const FULL_REFRESH = argv.includes("--full-refresh");

// ── Config ─────────────────────────────────────────────────────────────

const BQ_PROJECT_ID = process.env.BQ_PROJECT_ID ?? "";
const BQ_DATASET = process.env.BQ_DATASET ?? "analytics_blockid";
const BQ_TABLE = process.env.BQ_TABLE ?? "analytics_events";
const BQ_REGION = process.env.BQ_REGION ?? "australia-southeast1";
const BQ_LOOKBACK_HOURS = Number(process.env.BQ_LOOKBACK_HOURS ?? 26);
const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const PAGE_SIZE = 5_000;
const FULL_REFRESH_HOURS = 30 * 24;

// ── Types ──────────────────────────────────────────────────────────────

interface AnalyticsEventRow {
  id: string;
  ts: string;
  event_id: string;
  event_name: string;
  user_id: string | null;
  session_id: string | null;
  params: Record<string, unknown> | null;
  consent_granted: boolean | null;
  source: string | null;
}

interface BqRow {
  event_id: string;
  ts: string;
  event_name: string;
  user_id: string | null;
  session_id: string | null;
  params: string | null; // JSON-encoded for BQ JSON column
  consent_granted: boolean;
  source: string;
  ingested_at: string;
}

// ── Env / SDK preflight ────────────────────────────────────────────────

function bailSdkMissing(err: unknown): never {
  const msg = err instanceof Error ? err.message : String(err);
  console.log(
    `[bq-export] SDK missing — skipping. Install @google-cloud/bigquery to enable (T-1010). Detail: ${msg}`,
  );
  process.exit(0);
}

function requireEnv(): void {
  const missing: string[] = [];
  if (!BQ_PROJECT_ID) missing.push("BQ_PROJECT_ID");
  if (!SUPABASE_URL) missing.push("SUPABASE_URL");
  if (!SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (missing.length > 0) {
    console.error(
      `[bq-export] missing required env: ${missing.join(", ")}`,
    );
    process.exit(1);
  }
  if (!Number.isFinite(BQ_LOOKBACK_HOURS) || BQ_LOOKBACK_HOURS <= 0) {
    console.error(
      `[bq-export] BQ_LOOKBACK_HOURS must be a positive number, got ${process.env.BQ_LOOKBACK_HOURS}`,
    );
    process.exit(1);
  }
}

// Wrapped in a function so we defer the require() until after the CLI has
// been parsed — a --dry-run against a machine without the SDK still works.
function loadBigQuery(): unknown {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("@google-cloud/bigquery");
  } catch (err) {
    bailSdkMissing(err);
  }
}

// ── Supabase fetch ─────────────────────────────────────────────────────

function makeSupabase(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "public" },
  });
}

async function fetchAllRows(
  supabase: SupabaseClient,
  sinceIso: string,
): Promise<AnalyticsEventRow[]> {
  const all: AnalyticsEventRow[] = [];
  let from = 0;
  // Order by ts asc so a partial failure can be resumed by lookback window
  // on the next tick without gaps.
  // The 25/1-style overlap referenced in the CDO spec is implicit in the
  // default BQ_LOOKBACK_HOURS=26 (25h + 1h overlap for clock skew).
  while (true) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from("analytics_events")
      .select(
        "id, ts, event_id, event_name, user_id, session_id, params, consent_granted, source",
      )
      .gte("ts", sinceIso)
      .order("ts", { ascending: true })
      .range(from, to);
    if (error) {
      throw new Error(`supabase read failed: ${error.message}`);
    }
    const rows = (data ?? []) as AnalyticsEventRow[];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return all;
}

function toBqRow(row: AnalyticsEventRow, ingestedAtIso: string): BqRow {
  return {
    event_id: row.event_id,
    ts: row.ts,
    event_name: row.event_name,
    user_id: row.user_id,
    session_id: row.session_id,
    params: row.params ? JSON.stringify(row.params) : null,
    consent_granted: row.consent_granted ?? false,
    source: row.source ?? "server",
    ingested_at: ingestedAtIso,
  };
}

// ── BigQuery: ensure table + MERGE per chunk ───────────────────────────

// Structural types describing just the slice of the BQ SDK we use — lets us
// keep --noEmit clean without pulling in the actual @google-cloud/bigquery
// types at build time.
interface BqQueryResult { 0: unknown[] }
interface BqTable {
  exists(): Promise<[boolean]>;
  insert(rows: unknown[], opts?: unknown): Promise<unknown>;
}
interface BqDataset {
  table(id: string): BqTable;
  createTable(id: string, opts: unknown): Promise<unknown>;
  get(opts?: { autoCreate?: boolean; location?: string }): Promise<unknown>;
}
interface BqClient {
  dataset(id: string): BqDataset;
  query(opts: { query: string; location?: string; params?: Record<string, unknown> }): Promise<BqQueryResult>;
}
interface BqCtor {
  new (opts: { projectId: string; location?: string }): BqClient;
}

async function ensureDatasetAndTable(bq: BqClient): Promise<void> {
  const dataset = bq.dataset(BQ_DATASET);
  await dataset.get({ autoCreate: true, location: BQ_REGION });

  const table = dataset.table(BQ_TABLE);
  const [exists] = await table.exists();
  if (exists) return;

  // Schema mirrors the Supabase analytics_events table (0077 migration) with
  // an added `ingested_at` audit column so pipeline latency is diffable.
  const schema = {
    fields: [
      { name: "event_id", type: "STRING", mode: "REQUIRED" },
      { name: "ts", type: "TIMESTAMP", mode: "REQUIRED" },
      { name: "event_name", type: "STRING", mode: "REQUIRED" },
      { name: "user_id", type: "STRING", mode: "NULLABLE" },
      { name: "session_id", type: "STRING", mode: "NULLABLE" },
      { name: "params", type: "JSON", mode: "NULLABLE" },
      { name: "consent_granted", type: "BOOL", mode: "REQUIRED" },
      { name: "source", type: "STRING", mode: "REQUIRED" },
      { name: "ingested_at", type: "TIMESTAMP", mode: "REQUIRED" },
    ],
  };

  await dataset.createTable(BQ_TABLE, {
    schema,
    location: BQ_REGION,
    timePartitioning: { type: "DAY", field: "ts" },
    clustering: { fields: ["event_name"] },
  });

  console.log(
    `[bq-export] created ${BQ_PROJECT_ID}.${BQ_DATASET}.${BQ_TABLE} (partitioned by DATE(ts), clustered by event_name)`,
  );
}

function stagingTableName(): string {
  // Distinct per-invocation so parallel exports (unlikely, but cheap to guard)
  // don't collide.
  const suffix = `${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
  return `_stg_${BQ_TABLE}_${suffix}`;
}

async function mergeChunk(
  bq: BqClient,
  chunk: BqRow[],
): Promise<void> {
  if (chunk.length === 0) return;
  const dataset = bq.dataset(BQ_DATASET);
  const stagingId = stagingTableName();

  // Load into a fresh staging table, then MERGE into target. Staging table
  // auto-expires so a MERGE failure does not leak storage.
  await dataset.createTable(stagingId, {
    location: BQ_REGION,
    schema: {
      fields: [
        { name: "event_id", type: "STRING", mode: "REQUIRED" },
        { name: "ts", type: "TIMESTAMP", mode: "REQUIRED" },
        { name: "event_name", type: "STRING", mode: "REQUIRED" },
        { name: "user_id", type: "STRING", mode: "NULLABLE" },
        { name: "session_id", type: "STRING", mode: "NULLABLE" },
        { name: "params", type: "JSON", mode: "NULLABLE" },
        { name: "consent_granted", type: "BOOL", mode: "REQUIRED" },
        { name: "source", type: "STRING", mode: "REQUIRED" },
        { name: "ingested_at", type: "TIMESTAMP", mode: "REQUIRED" },
      ],
    },
    // 4h expiry: enough time for MERGE to complete + a debug window.
    expirationTime: (Date.now() + 4 * 60 * 60 * 1000).toString(),
  });

  const staging = dataset.table(stagingId);
  try {
    await staging.insert(chunk, { skipInvalidRows: false, ignoreUnknownValues: false });

    const target = `\`${BQ_PROJECT_ID}.${BQ_DATASET}.${BQ_TABLE}\``;
    const src = `\`${BQ_PROJECT_ID}.${BQ_DATASET}.${stagingId}\``;
    // WHEN NOT MATCHED insert — MERGE key is event_id, which Supabase already
    // dedupes (analytics_events_event_id_uq). We also update ingested_at on
    // match so a full-refresh reruns are auditable.
    const mergeSql = `
      MERGE ${target} T
      USING (
        SELECT
          event_id, ts, event_name, user_id, session_id,
          params, consent_granted, source, ingested_at
        FROM ${src}
      ) S
      ON T.event_id = S.event_id
      WHEN NOT MATCHED THEN INSERT (
        event_id, ts, event_name, user_id, session_id,
        params, consent_granted, source, ingested_at
      ) VALUES (
        S.event_id, S.ts, S.event_name, S.user_id, S.session_id,
        S.params, S.consent_granted, S.source, S.ingested_at
      )
      WHEN MATCHED THEN UPDATE SET
        ingested_at = S.ingested_at
    `;
    await bq.query({ query: mergeSql, location: BQ_REGION });
  } finally {
    // Drop staging synchronously so we don't rely on expirationTime under
    // normal operation.
    try {
      await bq.query({
        query: `DROP TABLE IF EXISTS \`${BQ_PROJECT_ID}.${BQ_DATASET}.${stagingId}\``,
        location: BQ_REGION,
      });
    } catch (err) {
      console.warn(
        `[bq-export] staging drop failed for ${stagingId}: ${(err as Error).message}`,
      );
    }
  }
}

// ── Main ───────────────────────────────────────────────────────────────

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main(): Promise<void> {
  const startedAt = Date.now();
  requireEnv();

  const lookbackHours = FULL_REFRESH ? FULL_REFRESH_HOURS : BQ_LOOKBACK_HOURS;
  const sinceIso = new Date(startedAt - lookbackHours * 60 * 60 * 1000).toISOString();
  const ingestedAtIso = new Date(startedAt).toISOString();

  console.log(
    `[bq-export] window: ts >= ${sinceIso} (lookback ${lookbackHours}h; full_refresh=${FULL_REFRESH}; dry_run=${DRY_RUN})`,
  );

  const supabase = makeSupabase();
  const rows = await fetchAllRows(supabase, sinceIso);
  console.log(`[bq-export] fetched ${rows.length} rows from analytics_events`);

  if (DRY_RUN) {
    const byName = new Map<string, number>();
    for (const r of rows) byName.set(r.event_name, (byName.get(r.event_name) ?? 0) + 1);
    const top = Array.from(byName.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    console.log(
      `[bq-export] DRY-RUN — would ship ${rows.length} rows. Top event_names: ${JSON.stringify(top)}`,
    );
    console.log(`[bq-export] done in ${Date.now() - startedAt}ms`);
    return;
  }

  if (rows.length === 0) {
    console.log(`[bq-export] nothing to export; done in ${Date.now() - startedAt}ms`);
    return;
  }

  // Only pull the SDK once we know we actually have work to do — makes the
  // "SDK missing" bail deterministic on empty windows too.
  const mod = loadBigQuery() as { BigQuery: BqCtor };
  if (!mod || typeof mod.BigQuery !== "function") {
    bailSdkMissing(new Error("@google-cloud/bigquery has no BigQuery export"));
  }
  const bq = new mod.BigQuery({ projectId: BQ_PROJECT_ID, location: BQ_REGION });

  await ensureDatasetAndTable(bq);

  const chunks = chunkArray(rows.map((r) => toBqRow(r, ingestedAtIso)), PAGE_SIZE);
  let merged = 0;
  for (const [idx, chunk] of chunks.entries()) {
    const chunkStarted = Date.now();
    await mergeChunk(bq, chunk);
    merged += chunk.length;
    console.log(
      `[bq-export] merged chunk ${idx + 1}/${chunks.length} (${chunk.length} rows) in ${Date.now() - chunkStarted}ms`,
    );
  }

  console.log(
    `[bq-export] done: ${merged} rows merged into ${BQ_PROJECT_ID}.${BQ_DATASET}.${BQ_TABLE} (${BQ_REGION}) in ${Date.now() - startedAt}ms`,
  );
}

main().catch((err) => {
  console.error(`[bq-export] failed: ${(err as Error).stack ?? (err as Error).message}`);
  process.exit(1);
});
