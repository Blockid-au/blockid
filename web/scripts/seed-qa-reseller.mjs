#!/usr/bin/env node
/**
 * QA temp-reseller mint script — idempotent.
 *
 * Ships the seven-variant reseller row-set specified in
 * docs/plans/p10-temp-reseller-mint-fixture-design.md §1. Stand-alone
 * artefact: the Playwright fixture wiring (§3), storage bucket seeder (§4),
 * QA account seeder delta (§5), and requests companion (§2) all remain to
 * ship in follow-up ticks. Landing this script first lets the human review
 * layer inspect the concrete row-set before the fixture consumes it.
 *
 * Prefix invariant: every reseller code stored here normalises to `QAPROBE%`
 * (via normaliseResellerCode's `[^A-Z0-9]` strip). No real reseller code
 * starts with `QAPROBE`, so `WHERE code LIKE 'QAPROBE%'` is the fixture's
 * blast-radius guard for both mint and cleanup.
 *
 * Idempotency: every insert uses `ON CONFLICT DO NOTHING` or a lookup-first
 * pattern. Re-run is a no-op on unchanged state.
 *
 * Env:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  — required.
 *   QA_RESELLER_ADMIN_EMAIL                  — optional; single-admin fallback
 *     mode (P10 §5 tick 132 contract). When the user already exists in
 *     app_users, mirrors reseller_admins on every variant. Kept for hosts
 *     that have not yet flipped to the multi-admin cohort.
 *   QA_RESELLER_ATTRIBUTED_FOUNDER_EMAIL     — optional; when the user
 *     already exists, seeds a reseller_attributions row on the
 *     active_wholesale variant.
 *   QA_RESELLER_MULTI_ADMIN                  — optional; "1" enables P10
 *     Option A cohort (docs/plans/p10-temp-reseller-admin-scope-collision-
 *     finding.md §Resolution options → A). One distinct admin app_users.id
 *     mirrored per variant, avoiding scopedReseller() .maybeSingle() PGRST116
 *     collision when the same user is a member of MORE THAN ONE variant.
 *   QA_RESELLER_ADMIN_EMAIL_<VARIANT>        — optional; per-variant override
 *     for the multi-admin cohort. Slots: ACTIVE_WHOLESALE, ACTIVE_RETAIL,
 *     PAUSED, TERMINATED, NO_CAPABILITY, TIER_ONLY_ZERO, NO_BUDGET.
 *
 * Flags:
 *   --dry-run              Print what would happen, do not touch DB.
 *   --reset                Delete every QAPROBE-prefixed row first.
 *   --variant <name>       Seed only the named variant.
 *   --reseller-multi-admin Enable P10 Option A multi-admin cohort (equivalent
 *                          to QA_RESELLER_MULTI_ADMIN=1).
 *
 * Owner: Track A P10_hardening. Consumed by web/tests/e2e/fixtures/reseller.ts
 * once the fixture wiring ships. Design source: docs/plans/p10-temp-reseller-
 * mint-fixture-design.md and docs/plans/p10-temp-reseller-admin-scope-
 * collision-finding.md.
 */

import { createClient } from "@supabase/supabase-js";
import { argv, env, exit } from "node:process";

// -- variants ---------------------------------------------------------------
// Column values map straight onto the resellers CHECK constraints in
// migration 0091. wholesale variants set gst_registered=true + a placeholder
// ABN that matches `^\d{2} \d{3} \d{3} \d{3}$` to satisfy ck_wholesale_gst_required.
const QA_ABN = "11 111 111 111"; // format-valid placeholder; not a real ABN.

const VARIANTS = [
  {
    name: "active_wholesale",
    code: "QAPROBEWHOLESALEACTIVE",
    display_name: "QA Probe Wholesale (Active)",
    billing_model: "wholesale",
    can_create_startups: true,
    can_grant_credits: true,
    status: "active",
    allowed_tiers: [0, 10, 20, 30, 40],
    monthly_credit_budget: 20000,
    gst_registered: true,
    abn: QA_ABN,
  },
  {
    // can_create_startups is intentionally TRUE here even though this variant
    // is retail — the variant's job is to probe the billing_model_not_wholesale
    // branch of decideCreateStartup(), which sits AFTER the capability_disabled
    // gate. Setting can_create_startups=false would collapse this variant into
    // no_capability (below) rather than isolating the retail-vs-wholesale
    // decision. See docs/plans/p10-wave1-preflight-finding.md (tick 141).
    name: "active_retail",
    code: "QAPROBERETAILACTIVE",
    display_name: "QA Probe Retail (Active)",
    billing_model: "retail",
    can_create_startups: true,
    can_grant_credits: false,
    status: "active",
    allowed_tiers: [0, 10, 20, 30, 40],
    monthly_credit_budget: 0,
    gst_registered: false,
    abn: null,
  },
  {
    name: "paused",
    code: "QAPROBEPAUSED",
    display_name: "QA Probe (Paused)",
    billing_model: "wholesale",
    can_create_startups: true,
    can_grant_credits: true,
    status: "paused",
    allowed_tiers: [0, 10, 20, 30, 40],
    monthly_credit_budget: 20000,
    gst_registered: true,
    abn: QA_ABN,
  },
  {
    name: "terminated",
    code: "QAPROBETERMINATED",
    display_name: "QA Probe (Terminated)",
    billing_model: "wholesale",
    can_create_startups: true,
    can_grant_credits: true,
    status: "terminated",
    allowed_tiers: [0, 10, 20, 30, 40],
    monthly_credit_budget: 20000,
    gst_registered: true,
    abn: QA_ABN,
  },
  {
    name: "no_capability",
    code: "QAPROBENOCAP",
    display_name: "QA Probe (No Capability)",
    billing_model: "wholesale",
    can_create_startups: false,
    can_grant_credits: false,
    status: "active",
    allowed_tiers: [0, 10, 20, 30, 40],
    monthly_credit_budget: 20000,
    gst_registered: true,
    abn: QA_ABN,
  },
  {
    name: "tier_only_zero",
    code: "QAPROBETIERONLY0",
    display_name: "QA Probe (Tier 0 Only)",
    billing_model: "wholesale",
    can_create_startups: true,
    can_grant_credits: true,
    status: "active",
    allowed_tiers: [0],
    monthly_credit_budget: 20000,
    gst_registered: true,
    abn: QA_ABN,
  },
  {
    name: "no_budget",
    code: "QAPROBENOBUDGET",
    display_name: "QA Probe (No Budget)",
    billing_model: "wholesale",
    can_create_startups: true,
    can_grant_credits: true,
    status: "active",
    allowed_tiers: [0, 10, 20, 30, 40],
    monthly_credit_budget: 100,
    gst_registered: true,
    abn: QA_ABN,
  },
];

// Promotion codes minted on the active_wholesale variant. Tier 0 skipped —
// ck_stripe_objects_by_tier forbids Stripe IDs at tier 0 and the fixture
// consumers that need tier 0 use the reseller row's allowed_tiers directly.
const ACTIVE_WHOLESALE_PROMO_TIERS = [
  { tier_pct: 20, stripe_coupon_id: "qa_probe_wholesale_active_t20", stripe_promotion_code_id: "promo_qa_probe_wholesale_active_t20" },
  { tier_pct: 40, stripe_coupon_id: "qa_probe_wholesale_active_t40", stripe_promotion_code_id: "promo_qa_probe_wholesale_active_t40" },
];

// -- flag parsing -----------------------------------------------------------
const args = new Set(argv.slice(2));
const DRY = args.has("--dry-run");
const RESET = args.has("--reset");
const varFlagIdx = argv.indexOf("--variant");
const ONLY_VARIANT = varFlagIdx > -1 ? argv[varFlagIdx + 1] : null;
// P10 Option A gate — off by default so the tick 132 single-admin contract
// stays intact until the fixture flips (mirrors seed-test-users.mjs semantics).
const MULTI_ADMIN =
  args.has("--reseller-multi-admin") || env.QA_RESELLER_MULTI_ADMIN === "1";

if (ONLY_VARIANT && !VARIANTS.find((v) => v.name === ONLY_VARIANT)) {
  console.error(`[seed] unknown --variant '${ONLY_VARIANT}'. Valid: ${VARIANTS.map((v) => v.name).join(", ")}`);
  exit(2);
}

function need(name) {
  const v = env[name];
  if (!v) {
    console.error(`[seed] missing env ${name}`);
    exit(2);
  }
  return v;
}

const supabase = createClient(need("SUPABASE_URL"), need("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const QA_ADMIN_EMAIL = env.QA_RESELLER_ADMIN_EMAIL || null;
const QA_ATTRIBUTED_EMAIL = env.QA_RESELLER_ATTRIBUTED_FOUNDER_EMAIL || null;

// P10 Option A multi-admin cohort — one admin app_users row per variant.
// Mirrors MULTI_ADMIN_EMAILS in web/scripts/seed-test-users.mjs so the two
// seeders bind to the same seven emails without a shared import. Per-slot
// override via QA_RESELLER_ADMIN_EMAIL_<VARIANT> (upper-snake). Falls back to
// QA_ADMIN_EMAIL when the multi-admin gate is OFF.
const MULTI_ADMIN_EMAILS = {
  active_wholesale:
    env.QA_RESELLER_ADMIN_EMAIL_ACTIVE_WHOLESALE ||
    "qa-reseller-wholesale-active@blockid.au",
  active_retail:
    env.QA_RESELLER_ADMIN_EMAIL_ACTIVE_RETAIL ||
    "qa-reseller-retail-active@blockid.au",
  paused:
    env.QA_RESELLER_ADMIN_EMAIL_PAUSED || "qa-reseller-paused@blockid.au",
  terminated:
    env.QA_RESELLER_ADMIN_EMAIL_TERMINATED ||
    "qa-reseller-terminated@blockid.au",
  no_capability:
    env.QA_RESELLER_ADMIN_EMAIL_NO_CAPABILITY ||
    "qa-reseller-no-cap@blockid.au",
  tier_only_zero:
    env.QA_RESELLER_ADMIN_EMAIL_TIER_ONLY_ZERO ||
    "qa-reseller-tier-zero@blockid.au",
  no_budget:
    env.QA_RESELLER_ADMIN_EMAIL_NO_BUDGET ||
    "qa-reseller-no-budget@blockid.au",
};

// Cache for per-email app_users lookups so the multi-admin loop makes at
// most one DB round-trip per distinct email even when several variants
// share the same address.
const adminUserCache = new Map();
async function resolveAdminUser(email) {
  if (!email) return null;
  if (adminUserCache.has(email)) return adminUserCache.get(email);
  const user = await findAppUserByEmail(email);
  adminUserCache.set(email, user);
  return user;
}

// -- reset ------------------------------------------------------------------
async function resetQaResellers() {
  console.log("[seed] --reset: cascading delete of QAPROBE-prefixed rows");
  const { data: rows, error } = await supabase
    .from("resellers")
    .select("id, code")
    .like("code", "QAPROBE%");
  if (error) {
    console.error("[seed] --reset: failed to list QAPROBE resellers", error.message);
    exit(1);
  }
  if (!rows || rows.length === 0) {
    console.log("[seed] --reset: no QAPROBE rows to clean up");
    return;
  }
  const ids = rows.map((r) => r.id);
  console.log(`[seed] --reset: cascading through ${rows.length} reseller row(s):`, rows.map((r) => r.code).join(", "));

  if (DRY) {
    console.log("[seed] --reset: --dry-run set, skipping DELETEs");
    return;
  }

  // Order matters: FK RESTRICT on downstream tables → delete child rows first.
  const tables = [
    "reseller_report_files",
    "reseller_credit_grants",
    "reseller_requests",
    "reseller_attributions",
    "reseller_promotion_codes",
    "reseller_admins",
  ];
  for (const table of tables) {
    const { error: dErr } = await supabase.from(table).delete().in("reseller_id", ids);
    if (dErr) {
      console.warn(`[seed] --reset: ${table} delete warning:`, dErr.message);
    }
  }
  const { error: rErr } = await supabase.from("resellers").delete().in("id", ids);
  if (rErr) {
    console.error("[seed] --reset: resellers delete failed:", rErr.message);
    exit(1);
  }
  console.log(`[seed] --reset: removed ${rows.length} reseller row(s)`);
}

// -- reseller upsert --------------------------------------------------------
async function upsertReseller(variant) {
  const { data: existing, error: fetchErr } = await supabase
    .from("resellers")
    .select("id, code, display_name")
    .eq("code", variant.code)
    .maybeSingle();
  if (fetchErr) {
    console.warn(`[seed] ${variant.name}: lookup failed: ${fetchErr.message}`);
    return null;
  }
  if (existing) {
    if (DRY) console.log(`  [dry] kept resellers.${variant.code} (id ${existing.id.slice(0, 8)})`);
    else console.log(`  = kept resellers.${variant.code} (id ${existing.id.slice(0, 8)})`);
    return existing.id;
  }

  const row = {
    code: variant.code,
    display_name: variant.display_name,
    billing_model: variant.billing_model,
    allowed_tiers: variant.allowed_tiers,
    can_create_startups: variant.can_create_startups,
    can_grant_credits: variant.can_grant_credits,
    monthly_credit_budget: variant.monthly_credit_budget,
    monthly_sandbox_credits: 500,
    gst_registered: variant.gst_registered,
    abn: variant.abn,
    commission_share_pct: 40.0,
    status: variant.status,
    notes: `QA-mode fixture row (variant=${variant.name}). Generated by web/scripts/seed-qa-reseller.mjs.`,
  };

  if (DRY) {
    console.log(`  [dry] insert resellers.${variant.code}`);
    return null;
  }

  const { data, error } = await supabase.from("resellers").insert(row).select("id").single();
  if (error) {
    console.error(`  ! insert resellers.${variant.code}: ${error.message}`);
    return null;
  }
  console.log(`  + inserted resellers.${variant.code} (id ${data.id.slice(0, 8)})`);
  return data.id;
}

// -- reseller_admins mirror -------------------------------------------------
async function mirrorAdmin(resellerId, adminUserId, variantCode) {
  const { data: existing } = await supabase
    .from("reseller_admins")
    .select("id")
    .eq("reseller_id", resellerId)
    .eq("user_id", adminUserId)
    .maybeSingle();
  if (existing) {
    if (DRY) console.log(`    [dry] kept reseller_admins on ${variantCode}`);
    return;
  }
  if (DRY) {
    console.log(`    [dry] insert reseller_admins on ${variantCode}`);
    return;
  }
  const { error } = await supabase.from("reseller_admins").insert({
    reseller_id: resellerId,
    user_id: adminUserId,
    role: "admin",
    status: "active",
  });
  if (error) console.warn(`    ! reseller_admins on ${variantCode}: ${error.message}`);
  else console.log(`    + reseller_admins on ${variantCode}`);
}

// -- reseller_promotion_codes on active_wholesale ---------------------------
async function seedPromotionCodes(resellerId, variantCode) {
  for (const tier of ACTIVE_WHOLESALE_PROMO_TIERS) {
    const promoCode = `${variantCode}${tier.tier_pct}`;
    const { data: existing } = await supabase
      .from("reseller_promotion_codes")
      .select("id")
      .eq("reseller_id", resellerId)
      .eq("tier_pct", tier.tier_pct)
      .maybeSingle();
    if (existing) {
      if (DRY) console.log(`    [dry] kept reseller_promotion_codes ${promoCode}`);
      continue;
    }
    if (DRY) {
      console.log(`    [dry] insert reseller_promotion_codes ${promoCode}`);
      continue;
    }
    const { error } = await supabase.from("reseller_promotion_codes").insert({
      reseller_id: resellerId,
      tier_pct: tier.tier_pct,
      code: promoCode,
      stripe_coupon_id: tier.stripe_coupon_id,
      stripe_promotion_code_id: tier.stripe_promotion_code_id,
      active: true,
    });
    if (error) console.warn(`    ! reseller_promotion_codes ${promoCode}: ${error.message}`);
    else console.log(`    + reseller_promotion_codes ${promoCode}`);
  }
}

// -- reseller_attributions on active_wholesale ------------------------------
async function seedAttribution(resellerId, founderUserId, variantCode) {
  const { data: existing } = await supabase
    .from("reseller_attributions")
    .select("id")
    .eq("reseller_id", resellerId)
    .eq("subject_user_id", founderUserId)
    .maybeSingle();
  if (existing) {
    if (DRY) console.log(`    [dry] kept reseller_attributions on ${variantCode}`);
    return;
  }
  if (DRY) {
    console.log(`    [dry] insert reseller_attributions on ${variantCode}`);
    return;
  }
  const { error } = await supabase.from("reseller_attributions").insert({
    reseller_id: resellerId,
    subject_type: "user",
    subject_user_id: founderUserId,
    source: "admin_manual",
    status: "active",
    metadata: { qa_probe: true, seed_script: "seed-qa-reseller.mjs" },
  });
  if (error) console.warn(`    ! reseller_attributions on ${variantCode}: ${error.message}`);
  else console.log(`    + reseller_attributions on ${variantCode}`);
}

// -- app_users lookup -------------------------------------------------------
async function findAppUserByEmail(email) {
  if (!email) return null;
  const { data, error } = await supabase
    .from("app_users")
    .select("id, email")
    .eq("email", email)
    .maybeSingle();
  if (error) {
    console.warn(`[seed] app_users lookup for ${email}: ${error.message}`);
    return null;
  }
  return data;
}

// -- admin resolution --------------------------------------------------------
// Picks the app_users row that will be mirrored onto the given variant's
// reseller_admins. Returns { email, user, source } so the log line can
// distinguish multi-admin vs fallback outcomes.
async function resolveVariantAdmin(variantName) {
  if (MULTI_ADMIN) {
    const email = MULTI_ADMIN_EMAILS[variantName] ?? null;
    if (email) {
      const user = await resolveAdminUser(email);
      if (user) return { email, user, source: "multi_admin" };
      return { email, user: null, source: "multi_admin_missing" };
    }
  }
  if (QA_ADMIN_EMAIL) {
    const user = await resolveAdminUser(QA_ADMIN_EMAIL);
    if (user) return { email: QA_ADMIN_EMAIL, user, source: "single_admin_fallback" };
    return { email: QA_ADMIN_EMAIL, user: null, source: "single_admin_missing" };
  }
  return { email: null, user: null, source: "unset" };
}

// -- main -------------------------------------------------------------------
async function main() {
  console.log(
    `[seed] mode=${DRY ? "dry-run" : "live"} reset=${RESET} onlyVariant=${ONLY_VARIANT ?? "*"} multi_admin=${
      MULTI_ADMIN ? "on" : "off"
    }`,
  );
  console.log(`[seed] QA_RESELLER_ADMIN_EMAIL=${QA_ADMIN_EMAIL ?? "(unset)"}`);
  console.log(`[seed] QA_RESELLER_ATTRIBUTED_FOUNDER_EMAIL=${QA_ATTRIBUTED_EMAIL ?? "(unset)"}`);
  if (MULTI_ADMIN) {
    console.log("[seed] multi-admin cohort (P10 Option A) — per-variant admin emails:");
    for (const [variant, email] of Object.entries(MULTI_ADMIN_EMAILS)) {
      console.log(`  ${variant.padEnd(18)} ${email}`);
    }
    if (!QA_ADMIN_EMAIL) {
      console.log(
        "[seed] note: QA_RESELLER_ADMIN_EMAIL unset — per-variant misses will NOT fall back to a shared admin.",
      );
    } else {
      console.log(
        `[seed] note: QA_RESELLER_ADMIN_EMAIL='${QA_ADMIN_EMAIL}' will be used as fallback if a per-variant email is missing.`,
      );
    }
  }

  if (RESET) await resetQaResellers();

  // Pre-warm the fallback lookup so its "not found" line prints once with the
  // rest of the header rather than mid-loop.
  if (QA_ADMIN_EMAIL) {
    const fallback = await resolveAdminUser(QA_ADMIN_EMAIL);
    if (!fallback) {
      console.log(
        `[seed] QA_RESELLER_ADMIN_EMAIL='${QA_ADMIN_EMAIL}' not found in app_users — reseller_admins mirror will be skipped for variants that fall back. Ship seed-test-users.mjs delta first (design §5).`,
      );
    }
  }
  const attributedUser = await findAppUserByEmail(QA_ATTRIBUTED_EMAIL);
  if (QA_ATTRIBUTED_EMAIL && !attributedUser) {
    console.log(`[seed] QA_RESELLER_ATTRIBUTED_FOUNDER_EMAIL='${QA_ATTRIBUTED_EMAIL}' not found in app_users — skipping reseller_attributions.`);
  }

  const summary = [];
  for (const variant of VARIANTS) {
    if (ONLY_VARIANT && variant.name !== ONLY_VARIANT) continue;
    console.log(`\n[seed] variant=${variant.name} code=${variant.code}`);
    const resellerId = await upsertReseller(variant);
    if (!resellerId && !DRY) {
      summary.push({ variant: variant.name, status: "failed", admin: "-" });
      continue;
    }

    const { email: adminEmail, user: adminUser, source: adminSource } = await resolveVariantAdmin(variant.name);
    if (resellerId && adminUser) {
      console.log(`  admin=${adminEmail} (${adminSource})`);
      await mirrorAdmin(resellerId, adminUser.id, variant.code);
    } else if (adminEmail) {
      console.log(`  admin=${adminEmail} (${adminSource}) — user not in app_users, mirror skipped`);
    } else {
      console.log("  admin=(unset) — mirror skipped");
    }

    if (variant.name === "active_wholesale" && resellerId) {
      await seedPromotionCodes(resellerId, variant.code);
      if (attributedUser) await seedAttribution(resellerId, attributedUser.id, variant.code);
    }
    summary.push({
      variant: variant.name,
      status: DRY ? "dry" : resellerId ? "ok" : "existed",
      admin: adminEmail ?? "-",
    });
  }

  console.log("\n[seed] summary");
  console.log("variant".padEnd(20), "status".padEnd(10), "admin");
  for (const s of summary) console.log(s.variant.padEnd(20), s.status.padEnd(10), s.admin);
  const failed = summary.filter((s) => s.status === "failed").length;
  if (failed > 0) {
    console.error(`\n[seed] ${failed} variant(s) failed`);
    exit(1);
  }
  console.log(`\n[seed] done: ${summary.length} variant(s) processed`);
}

main().catch((e) => {
  console.error("[seed] fatal", e);
  exit(1);
});
