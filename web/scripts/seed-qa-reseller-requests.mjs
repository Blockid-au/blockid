#!/usr/bin/env node
/**
 * QA reseller_requests companion seeder — per-run mint.
 *
 * Ships the six-variant workflow-row-set specified in
 * docs/plans/p10-temp-reseller-mint-fixture-design.md §2. Companion to
 * web/scripts/seed-qa-reseller.mjs (§1) — the reseller rows must exist
 * before this runs; the active_wholesale reseller (code QAPROBEWHOLESALEACTIVE)
 * is the parent for every request minted here.
 *
 * Why separate. reseller_requests carries terminal status transitions
 * (ck_credit_link, ck_promo_link, ck_status_transition) — once approved a
 * row cannot go back to pending. So instead of an "upsert then flip"
 * pattern, each run mints a *fresh* row per variant tagged with a
 * qa_run_id in the payload so parallel CI workers can clean up their own
 * rows without stomping each other.
 *
 * Prefix invariant: only touches reseller_requests rows attached to the
 * QAPROBE% reseller cohort. Cleanup joins reseller_id back to
 * `WHERE code LIKE 'QAPROBE%'` — no risk of touching real requests.
 *
 * Env:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  — required.
 *   QA_RESELLER_ADMIN_EMAIL                  — required. Resolves to the
 *     `requested_by` app_users id. Ship seed-test-users.mjs delta (§5)
 *     first so this user exists.
 *   QA_RESELLER_ATTRIBUTED_FOUNDER_EMAIL     — required for the
 *     `over_budget_pending` variant only (target_user_id).
 *
 * Flags:
 *   --dry-run              Print what would happen, do not touch DB.
 *   --reset                Delete every QA_PROBE row first (no mint).
 *   --reset-metadata qa_run_id=<id>
 *                          Delete rows whose payload.qa_run_id matches, then
 *                          continue to mint (per-CI-run cleanup).
 *   --variant <name>       Mint only the named variant.
 *   --qa-run-id <id>       Override the auto-generated qa_run_id (default:
 *                          random UUID). Stamped into every payload.
 *
 * Owner: Track A P10_hardening. Design source:
 * docs/plans/p10-temp-reseller-mint-fixture-design.md §2.
 */

import { createClient } from "@supabase/supabase-js";
import { argv, env, exit } from "node:process";
import { randomUUID } from "node:crypto";

const PARENT_RESELLER_CODE = "QAPROBEWHOLESALEACTIVE";

// -- variants ---------------------------------------------------------------
// Each entry describes one row to insert. `payload_for` is a function so we
// can inject qa_run_id + the resolved attributed founder user_id per run.
//
// Notes on design deviations from p10-temp-reseller-mint-fixture-design.md §2:
//   code_request_incomplete originally lists {tier_pct: "not-a-number"} — but
//   reseller_requests_pending_code_uniq casts payload->>'tier_pct' to int at
//   insert time via `((payload->>'tier_pct')::int)`, so a non-castable string
//   would raise `invalid input syntax for type integer` before the row lands.
//   We instead OMIT tier_pct entirely (partial-index NULL is allowed) so the
//   admin PATCH validator still returns `invalid_tier_pct` / payload_incomplete
//   when it processes the row, honouring the test's intent without breaking
//   the DB.
const VARIANTS = [
  {
    name: "code_request_pending_tier20",
    request_type: "code_request",
    status: "pending",
    payload_for: ({ qaRunId }) => ({
      tier_pct: 20,
      suggested_suffix: null,
      qa_run_id: qaRunId,
      qa_probe: true,
    }),
  },
  {
    name: "code_request_pending_tier0",
    request_type: "code_request",
    status: "pending",
    payload_for: ({ qaRunId }) => ({
      tier_pct: 0,
      qa_run_id: qaRunId,
      qa_probe: true,
    }),
  },
  {
    name: "code_request_incomplete",
    request_type: "code_request",
    status: "pending",
    payload_for: ({ qaRunId }) => ({
      // tier_pct intentionally omitted — see comment above.
      qa_run_id: qaRunId,
      qa_probe: true,
      qa_note: "tier_pct omitted so DB partial-unique cast does not fire",
    }),
  },
  {
    name: "over_budget_pending",
    request_type: "over_budget_approval",
    status: "pending",
    requires_attributed_user: true,
    payload_for: ({ qaRunId, attributedUserId }) => ({
      target_user_id: attributedUserId,
      requested_amount: 500,
      reason: "QA probe",
      qa_run_id: qaRunId,
      qa_probe: true,
    }),
  },
  {
    name: "already_approved",
    request_type: "code_request",
    status: "approved",
    requires_promotion_code: { tier_pct: 20 },
    decision: { reason: "QA probe pre-approved fixture row" },
    payload_for: ({ qaRunId }) => ({
      tier_pct: 20,
      qa_run_id: qaRunId,
      qa_probe: true,
    }),
  },
  {
    name: "already_denied",
    request_type: "code_request",
    status: "denied",
    decision: { reason: "QA probe" },
    payload_for: ({ qaRunId }) => ({
      tier_pct: 20,
      qa_run_id: qaRunId,
      qa_probe: true,
    }),
  },
];

// -- flag parsing -----------------------------------------------------------
const args = argv.slice(2);
const DRY = args.includes("--dry-run");
const RESET = args.includes("--reset");
const varFlagIdx = args.indexOf("--variant");
const ONLY_VARIANT = varFlagIdx > -1 ? args[varFlagIdx + 1] : null;
const runIdFlagIdx = args.indexOf("--qa-run-id");
const QA_RUN_ID = runIdFlagIdx > -1 ? args[runIdFlagIdx + 1] : randomUUID();
const resetMetaIdx = args.indexOf("--reset-metadata");
const RESET_METADATA = resetMetaIdx > -1 ? args[resetMetaIdx + 1] : null;

if (ONLY_VARIANT && !VARIANTS.find((v) => v.name === ONLY_VARIANT)) {
  console.error(
    `[seed-requests] unknown --variant '${ONLY_VARIANT}'. Valid: ${VARIANTS.map((v) => v.name).join(", ")}`,
  );
  exit(2);
}

if (RESET_METADATA && !RESET_METADATA.startsWith("qa_run_id=")) {
  console.error(
    `[seed-requests] --reset-metadata expects 'qa_run_id=<value>' (got '${RESET_METADATA}')`,
  );
  exit(2);
}

function need(name) {
  const v = env[name];
  if (!v) {
    console.error(`[seed-requests] missing env ${name}`);
    exit(2);
  }
  return v;
}

const supabase = createClient(
  need("SUPABASE_URL"),
  need("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const QA_ADMIN_EMAIL = env.QA_RESELLER_ADMIN_EMAIL || null;
const QA_ATTRIBUTED_EMAIL = env.QA_RESELLER_ATTRIBUTED_FOUNDER_EMAIL || null;

// -- lookups ----------------------------------------------------------------
async function findAppUserByEmail(email) {
  if (!email) return null;
  const { data, error } = await supabase
    .from("app_users")
    .select("id, email")
    .eq("email", email)
    .maybeSingle();
  if (error) {
    console.warn(`[seed-requests] app_users lookup for ${email}: ${error.message}`);
    return null;
  }
  return data;
}

async function findParentReseller() {
  const { data, error } = await supabase
    .from("resellers")
    .select("id, code, can_grant_credits, allowed_tiers")
    .eq("code", PARENT_RESELLER_CODE)
    .maybeSingle();
  if (error) {
    console.error(`[seed-requests] parent reseller lookup failed: ${error.message}`);
    return null;
  }
  if (!data) {
    console.error(
      `[seed-requests] parent reseller '${PARENT_RESELLER_CODE}' not found — run seed-qa-reseller.mjs first`,
    );
    return null;
  }
  return data;
}

async function findPromotionCode(resellerId, tierPct) {
  const { data, error } = await supabase
    .from("reseller_promotion_codes")
    .select("id, tier_pct, code")
    .eq("reseller_id", resellerId)
    .eq("tier_pct", tierPct)
    .maybeSingle();
  if (error) {
    console.warn(
      `[seed-requests] promotion_code lookup for tier ${tierPct} failed: ${error.message}`,
    );
    return null;
  }
  return data;
}

// -- reset ------------------------------------------------------------------
async function resetAllQaRequests() {
  const { data: resellers, error } = await supabase
    .from("resellers")
    .select("id, code")
    .like("code", "QAPROBE%");
  if (error) {
    console.error(`[seed-requests] --reset: list failed: ${error.message}`);
    exit(1);
  }
  if (!resellers || resellers.length === 0) {
    console.log("[seed-requests] --reset: no QAPROBE resellers found; nothing to clean up");
    return;
  }
  const ids = resellers.map((r) => r.id);
  console.log(
    `[seed-requests] --reset: deleting reseller_requests rows on ${resellers.length} QAPROBE reseller(s)`,
  );
  if (DRY) {
    console.log("[seed-requests] --reset: --dry-run set, skipping DELETE");
    return;
  }
  const { error: delErr, count } = await supabase
    .from("reseller_requests")
    .delete({ count: "exact" })
    .in("reseller_id", ids);
  if (delErr) {
    console.error(`[seed-requests] --reset: DELETE failed: ${delErr.message}`);
    exit(1);
  }
  console.log(`[seed-requests] --reset: removed ${count ?? 0} request row(s)`);
}

async function resetByQaRunId(qaRunId) {
  const { data: resellers, error } = await supabase
    .from("resellers")
    .select("id")
    .like("code", "QAPROBE%");
  if (error) {
    console.error(`[seed-requests] --reset-metadata: list failed: ${error.message}`);
    exit(1);
  }
  if (!resellers || resellers.length === 0) return;
  const ids = resellers.map((r) => r.id);
  console.log(
    `[seed-requests] --reset-metadata: deleting rows with payload.qa_run_id='${qaRunId}'`,
  );
  if (DRY) {
    console.log("[seed-requests] --reset-metadata: --dry-run set, skipping DELETE");
    return;
  }
  const { error: delErr, count } = await supabase
    .from("reseller_requests")
    .delete({ count: "exact" })
    .in("reseller_id", ids)
    .eq("payload->>qa_run_id", qaRunId);
  if (delErr) {
    console.error(`[seed-requests] --reset-metadata: DELETE failed: ${delErr.message}`);
    exit(1);
  }
  console.log(`[seed-requests] --reset-metadata: removed ${count ?? 0} row(s)`);
}

// -- insert one variant -----------------------------------------------------
async function insertVariant(variant, ctx) {
  if (variant.requires_attributed_user && !ctx.attributedUserId) {
    console.log(
      `  ~ skipping ${variant.name}: QA_RESELLER_ATTRIBUTED_FOUNDER_EMAIL unresolved`,
    );
    return { variant: variant.name, status: "skipped_no_attributed_user" };
  }

  let linkedPromotionCodeId = null;
  if (variant.requires_promotion_code) {
    const promo = await findPromotionCode(
      ctx.resellerId,
      variant.requires_promotion_code.tier_pct,
    );
    if (!promo) {
      console.log(
        `  ~ skipping ${variant.name}: promotion_code tier_pct=${variant.requires_promotion_code.tier_pct} not found; run seed-qa-reseller.mjs first`,
      );
      return { variant: variant.name, status: "skipped_no_promotion_code" };
    }
    linkedPromotionCodeId = promo.id;
  }

  const payload = variant.payload_for({
    qaRunId: ctx.qaRunId,
    attributedUserId: ctx.attributedUserId,
  });

  const row = {
    reseller_id: ctx.resellerId,
    requested_by: ctx.adminUserId,
    request_type: variant.request_type,
    status: variant.status,
    payload,
  };

  if (variant.status !== "pending") {
    // ck_decision_shape: decision_at must be non-null on non-pending rows.
    row.decision_at = new Date().toISOString();
    row.decision_by = ctx.adminUserId;
    if (variant.decision?.reason) row.decision_reason = variant.decision.reason;
    if (linkedPromotionCodeId) row.linked_promotion_code_id = linkedPromotionCodeId;
  }

  if (DRY) {
    console.log(
      `  [dry] insert reseller_requests variant=${variant.name} request_type=${variant.request_type} status=${variant.status}`,
    );
    return { variant: variant.name, status: "dry" };
  }

  const { data, error } = await supabase
    .from("reseller_requests")
    .insert(row)
    .select("id")
    .single();
  if (error) {
    console.error(`  ! insert ${variant.name}: ${error.message}`);
    return { variant: variant.name, status: "failed" };
  }
  console.log(
    `  + inserted reseller_requests variant=${variant.name} (id ${data.id.slice(0, 8)})`,
  );
  return { variant: variant.name, status: "ok", id: data.id };
}

// -- main -------------------------------------------------------------------
async function main() {
  console.log(
    `[seed-requests] mode=${DRY ? "dry-run" : "live"} reset=${RESET} resetMetadata=${RESET_METADATA ?? "no"} onlyVariant=${ONLY_VARIANT ?? "*"} qaRunId=${QA_RUN_ID}`,
  );

  if (RESET) {
    await resetAllQaRequests();
    console.log("[seed-requests] --reset done; not minting new rows this pass");
    return;
  }
  if (RESET_METADATA) {
    const [, qaRunId] = RESET_METADATA.split("=");
    await resetByQaRunId(qaRunId);
  }

  const parent = await findParentReseller();
  if (!parent) exit(1);

  const adminUser = await findAppUserByEmail(QA_ADMIN_EMAIL);
  if (!adminUser) {
    console.error(
      `[seed-requests] QA_RESELLER_ADMIN_EMAIL='${QA_ADMIN_EMAIL}' not found — ship seed-test-users.mjs delta (§5) first`,
    );
    exit(1);
  }
  const attributedUser = await findAppUserByEmail(QA_ATTRIBUTED_EMAIL);
  if (QA_ATTRIBUTED_EMAIL && !attributedUser) {
    console.log(
      `[seed-requests] QA_RESELLER_ATTRIBUTED_FOUNDER_EMAIL='${QA_ATTRIBUTED_EMAIL}' not found — over_budget_pending will be skipped`,
    );
  }

  const ctx = {
    resellerId: parent.id,
    adminUserId: adminUser.id,
    attributedUserId: attributedUser?.id ?? null,
    qaRunId: QA_RUN_ID,
  };

  const summary = [];
  for (const variant of VARIANTS) {
    if (ONLY_VARIANT && variant.name !== ONLY_VARIANT) continue;
    console.log(`\n[seed-requests] variant=${variant.name}`);
    summary.push(await insertVariant(variant, ctx));
  }

  console.log("\n[seed-requests] summary");
  console.log("variant".padEnd(32), "status");
  for (const s of summary) console.log(s.variant.padEnd(32), s.status);
  const failed = summary.filter((s) => s.status === "failed").length;
  console.log(`\n[seed-requests] qa_run_id=${QA_RUN_ID}`);
  if (failed > 0) {
    console.error(`\n[seed-requests] ${failed} variant(s) failed`);
    exit(1);
  }
  console.log(`[seed-requests] done: ${summary.length} variant(s) processed`);
}

main().catch((e) => {
  console.error("[seed-requests] fatal", e);
  exit(1);
});
