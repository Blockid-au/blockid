#!/usr/bin/env node
/**
 * QA reseller-reports Storage seeder — §4 of the P10 temp-reseller mint
 * fixture design (docs/plans/p10-temp-reseller-mint-fixture-design.md §4).
 *
 * Ships the artefact that makes the /api/reseller/reports/[month]/signed-url
 * happy-path Playwright row (design §Rows 3) executable end-to-end:
 * a real Content-Type: text/csv blob under
 * `reseller-reports/<reseller_id>/<month_key>.csv`, plus the
 * reseller_report_files metadata row that the signed-URL route reads before
 * minting a URL.
 *
 * Depends on §1 (web/scripts/seed-qa-reseller.mjs) having run first — this
 * seeder resolves the parent reseller row by looking up
 * `resellers.code = 'QAPROBEWHOLESALEACTIVE'` at runtime, so no --dry-run
 * output-scraping is needed. When the parent row is missing this seeder
 * exits with a clear pointer at §1.
 *
 * Prefix invariant: only touches storage objects + metadata rows attached
 * to the QAPROBE% reseller cohort. Cleanup joins reseller_id back to
 * `WHERE code LIKE 'QAPROBE%'` so a stray real reseller_id can never be
 * targeted by --reset.
 *
 * Idempotent: storage upload uses upsert:true; metadata upsert is keyed on
 * (reseller_id, month_key) which is the UNIQUE constraint from migration
 * 0097. Re-run against unchanged state is a no-op stamp bump.
 *
 * Env:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  — required.
 *
 * Flags:
 *   --dry-run              Print what would happen, do not touch DB/Storage.
 *   --reset                Delete every metadata row + storage object for the
 *                          QAPROBE% cohort first (no mint).
 *   --month <YYYY-MM>      Override the month key. Defaults to current UTC
 *                          month. Accepts a single month per invocation.
 *   --reseller-code <code> Override the parent reseller code. Defaults to
 *                          QAPROBEWHOLESALEACTIVE (from §1's active_wholesale
 *                          variant). Only QAPROBE% codes are accepted so the
 *                          fixture invariant holds.
 *
 * Owner: Track A P10_hardening. Design source:
 * docs/plans/p10-temp-reseller-mint-fixture-design.md §4.
 */

import { createClient } from "@supabase/supabase-js";
import { argv, env, exit } from "node:process";

const REPORT_BUCKET = "reseller-reports";
const DEFAULT_PARENT_CODE = "QAPROBEWHOLESALEACTIVE";
const QA_PROBE_PREFIX = "QAPROBE";

// CSV_HEADER mirrors web/src/lib/reseller/monthly-report.ts CSV_HEADER so
// the fixture blob is shape-compatible with what the /api/reseller/reports/
// [month]/signed-url route hands back to the reseller. If monthly-report.ts
// grows a column, this seeder must add the same column (the Playwright happy
// path asserts a Content-Type header + a well-formed CSV body, not a
// column-by-column diff, but keeping them in sync stops future divergence).
const CSV_HEADER = [
  "reseller_id",
  "reseller_display_name",
  "month",
  "new_signups",
  "active_customers_eom",
  "attributed_mrr_aud",
  "churned_customers",
  "blockid_gross_revenue_aud",
  "blockid_net_revenue_aud",
  "commission_pct_effective",
  "commission_owed_aud",
  "ai_credits_granted",
  "ai_credits_over_budget_count",
];

// -- flag parsing -----------------------------------------------------------
const args = argv.slice(2);
const flag = (name) => args.includes(name);
const valueFor = (name) => {
  const i = args.indexOf(name);
  return i > -1 ? args[i + 1] : null;
};

const DRY = flag("--dry-run");
const RESET = flag("--reset");
const monthOverride = valueFor("--month");
const parentCodeOverride = valueFor("--reseller-code");

function need(name) {
  const v = env[name];
  if (!v) {
    console.error(`[seed-storage] missing env ${name}`);
    exit(2);
  }
  return v;
}

const supabase = createClient(need("SUPABASE_URL"), need("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

// -- helpers ----------------------------------------------------------------
function currentMonthKeyUtc() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function isValidMonthKey(value) {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

function buildCsvFixture(resellerId, displayName, monthKey) {
  const row = [
    resellerId,
    displayName,
    monthKey,
    0, // new_signups
    0, // active_customers_eom
    "0.00", // attributed_mrr_aud
    0, // churned_customers
    "0.00", // blockid_gross_revenue_aud
    "0.00", // blockid_net_revenue_aud
    "0.00", // commission_pct_effective
    "0.00", // commission_owed_aud
    0, // ai_credits_granted
    0, // ai_credits_over_budget_count
  ];
  const lines = [
    `# BlockID reseller monthly KPI report — ${monthKey} (QA fixture blob)`,
    CSV_HEADER.join(","),
    row.map(String).join(","),
  ];
  return lines.join("\n") + "\n";
}

async function findReseller(code) {
  const { data, error } = await supabase
    .from("resellers")
    .select("id, code, display_name")
    .eq("code", code)
    .maybeSingle();
  if (error) {
    console.error(`[seed-storage] resellers lookup failed for ${code}: ${error.message}`);
    exit(1);
  }
  return data;
}

async function upsertMetadataRow({ resellerId, monthKey, storagePath, sizeBytes }) {
  const { data: existing, error: fetchErr } = await supabase
    .from("reseller_report_files")
    .select("id")
    .eq("reseller_id", resellerId)
    .eq("month_key", monthKey)
    .maybeSingle();
  if (fetchErr) {
    console.warn(`[seed-storage] reseller_report_files lookup: ${fetchErr.message}`);
  }

  const rowShape = {
    reseller_id: resellerId,
    month_key: monthKey,
    storage_bucket: REPORT_BUCKET,
    storage_path: storagePath,
    size_bytes: sizeBytes,
    row_count: 1, // fixture body has one KPI row per §4
  };

  if (existing) {
    if (DRY) {
      console.log(`  [dry] update reseller_report_files (${monthKey}) size_bytes=${sizeBytes}`);
      return;
    }
    const { error } = await supabase
      .from("reseller_report_files")
      .update({
        storage_bucket: REPORT_BUCKET,
        storage_path: storagePath,
        size_bytes: sizeBytes,
        row_count: rowShape.row_count,
        generated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    if (error) console.warn(`  ! reseller_report_files update: ${error.message}`);
    else console.log(`  = updated reseller_report_files (${monthKey})`);
    return;
  }

  if (DRY) {
    console.log(`  [dry] insert reseller_report_files (${monthKey}) size_bytes=${sizeBytes}`);
    return;
  }

  const { error } = await supabase.from("reseller_report_files").insert(rowShape);
  if (error) console.warn(`  ! reseller_report_files insert: ${error.message}`);
  else console.log(`  + inserted reseller_report_files (${monthKey})`);
}

// -- reset ------------------------------------------------------------------
async function resetQaStorage() {
  console.log("[seed-storage] --reset: cascading delete of QAPROBE% storage + metadata");
  const { data: rows, error } = await supabase
    .from("resellers")
    .select("id, code")
    .like("code", `${QA_PROBE_PREFIX}%`);
  if (error) {
    console.error("[seed-storage] --reset: failed to list QAPROBE resellers", error.message);
    exit(1);
  }
  if (!rows || rows.length === 0) {
    console.log("[seed-storage] --reset: no QAPROBE resellers → nothing to clean up");
    return;
  }
  const ids = rows.map((r) => r.id);

  const { data: files, error: fErr } = await supabase
    .from("reseller_report_files")
    .select("id, reseller_id, month_key, storage_path")
    .in("reseller_id", ids);
  if (fErr) {
    console.warn(`[seed-storage] --reset: reseller_report_files list: ${fErr.message}`);
  }
  const paths = (files ?? []).map((f) => f.storage_path);

  if (DRY) {
    console.log(`[seed-storage] --reset: --dry-run set, would purge ${paths.length} object(s) + row(s)`);
    return;
  }

  if (paths.length > 0) {
    const { error: sErr } = await supabase.storage.from(REPORT_BUCKET).remove(paths);
    if (sErr) console.warn(`[seed-storage] --reset: storage.remove: ${sErr.message}`);
    else console.log(`[seed-storage] --reset: removed ${paths.length} storage object(s)`);
  }
  const { error: dErr } = await supabase
    .from("reseller_report_files")
    .delete()
    .in("reseller_id", ids);
  if (dErr) console.warn(`[seed-storage] --reset: reseller_report_files delete: ${dErr.message}`);
  else console.log(`[seed-storage] --reset: removed metadata rows for ${ids.length} reseller(s)`);
}

// -- main -------------------------------------------------------------------
async function main() {
  const parentCode = parentCodeOverride || DEFAULT_PARENT_CODE;
  if (!parentCode.startsWith(QA_PROBE_PREFIX)) {
    console.error(
      `[seed-storage] --reseller-code must start with '${QA_PROBE_PREFIX}' (fixture invariant); got '${parentCode}'.`,
    );
    exit(2);
  }

  const monthKey = monthOverride ?? currentMonthKeyUtc();
  if (!isValidMonthKey(monthKey)) {
    console.error(`[seed-storage] --month must be YYYY-MM; got '${monthKey}'.`);
    exit(2);
  }

  console.log(
    `[seed-storage] mode=${DRY ? "dry-run" : "live"} reset=${RESET} parent=${parentCode} month=${monthKey}`,
  );

  if (RESET) {
    await resetQaStorage();
    return;
  }

  const reseller = await findReseller(parentCode);
  if (!reseller) {
    console.error(
      `[seed-storage] parent reseller '${parentCode}' not found — run web/scripts/seed-qa-reseller.mjs (§1) first.`,
    );
    exit(1);
  }
  console.log(`[seed-storage] resolved reseller_id=${reseller.id.slice(0, 8)} display='${reseller.display_name}'`);

  const csv = buildCsvFixture(reseller.id, reseller.display_name, monthKey);
  const sizeBytes = Buffer.byteLength(csv, "utf8");
  const storagePath = `${reseller.id}/${monthKey}.csv`;

  if (DRY) {
    console.log(`  [dry] upload ${REPORT_BUCKET}/${storagePath} (${sizeBytes} bytes)`);
  } else {
    const { error } = await supabase.storage.from(REPORT_BUCKET).upload(storagePath, csv, {
      contentType: "text/csv",
      upsert: true,
    });
    if (error) {
      console.error(`  ! storage.upload ${storagePath}: ${error.message}`);
      exit(1);
    }
    console.log(`  + uploaded ${REPORT_BUCKET}/${storagePath} (${sizeBytes} bytes)`);
  }

  await upsertMetadataRow({
    resellerId: reseller.id,
    monthKey,
    storagePath,
    sizeBytes,
  });

  console.log(`\n[seed-storage] done: ${DRY ? "dry-run" : "live"} for ${parentCode} ${monthKey}`);
}

main().catch((e) => {
  console.error("[seed-storage] fatal", e);
  exit(1);
});
