#!/usr/bin/env node
// create-promo-codes.mjs — mint Stripe coupon + promotion_code objects for
// every active reseller × tier that does not yet have real Stripe IDs in
// public.reseller_promotion_codes, then stamp the returned IDs back onto the
// row so runtime resolvers can attach them at Checkout.
//
// Per feedback_reseller_no_stripe.md, Auschain PTY LTD is the sole merchant
// of record. This script uses the Auschain STRIPE_SECRET_KEY to create
// COUPONS that belong to Auschain — Stripe Connect is intentionally NOT
// used. The `code_prefix` for each reseller is inferred from the reseller's
// canonical .code field (INFOVISION → IFV via a mapping table below) or its
// existing promotion-code rows (falls back to whatever prefix is already
// stored in reseller_promotion_codes.code for tier 0).
//
// Env:
//   STRIPE_SECRET_KEY          required — refuses to touch live keys unless
//                              --live-ok is passed (guard against autonomous
//                              provisioning against production).
//   SUPABASE_URL               required
//   SUPABASE_SERVICE_ROLE_KEY  required
//
// Flags:
//   --dry-run      Print what would happen; no Stripe calls, no DB writes,
//                  no JSONL append.
//   --only=<code>  Restrict to one reseller by its resellers.code value
//                  (e.g. --only=INFOVISION or --only=DOVANLONG).
//   --live-ok      Required if STRIPE_SECRET_KEY starts with sk_live_.
//   --json         Emit JSON summary at end instead of the human table.
//
// JSONL sync log at web/content/reports/promo-sync.jsonl. One row per action
// with {ts, reseller_id, reseller_code, code, discount_pct, stripe_coupon_id,
// stripe_promotion_code_id, action}.

import { setTimeout as delay } from "node:timers/promises";
import { appendFileSync } from "node:fs";
import { resolve as pathResolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const flagSet = new Set(args.filter((a) => !a.startsWith("--only=")));
const DRY_RUN = flagSet.has("--dry-run");
const LIVE_OK = flagSet.has("--live-ok");
const JSON_OUT = flagSet.has("--json");
const ONLY = (args.find((a) => a.startsWith("--only=")) ?? "").slice("--only=".length) || null;

const TIER_LADDER = [0, 10, 20, 30, 40];

// Prefix inference: prefer the tier-0 code already in the DB (if any); else
// fall back to this map; else derive first 3 letters of the reseller code.
const PREFIX_MAP = {
  INFOVISION: "IFV",
  DOVANLONG: "DVL",
};

function log(...m) {
  if (!JSON_OUT) console.log(...m);
}
function err(...m) {
  console.error(...m);
}

function normalisePrefix(raw) {
  const cleaned = String(raw ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!cleaned) throw new Error("normalisePrefix: empty after cleanup");
  return cleaned;
}

function codesForPrefix(prefix) {
  const clean = normalisePrefix(prefix);
  return TIER_LADDER.map((tier) => ({
    tier,
    code: tier === 0 ? clean : `${clean}${tier}`,
  }));
}

async function main() {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const supaUrl = process.env.SUPABASE_URL;
  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!stripeKey) {
    err("create-promo-codes: STRIPE_SECRET_KEY is required. Get it from Stripe dashboard → developers → API keys.");
    process.exit(2);
  }
  if (stripeKey.startsWith("sk_live_") && !LIVE_OK && !DRY_RUN) {
    err("create-promo-codes: refusing to run against a LIVE Stripe key without --live-ok.");
    err("  This is a safety guard against autonomous provisioning against production.");
    err("  Rerun with --dry-run to preview, or --live-ok to confirm.");
    process.exit(2);
  }
  if (!DRY_RUN && (!supaUrl || !supaKey)) {
    err("create-promo-codes: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required unless --dry-run.");
    process.exit(2);
  }

  const [{ default: Stripe }, supaMod] = await Promise.all([
    import("stripe"),
    DRY_RUN && !supaUrl ? Promise.resolve(null) : import("@supabase/supabase-js"),
  ]);

  const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });
  const supa =
    supaMod && supaUrl && supaKey
      ? supaMod.createClient(supaUrl, supaKey, { auth: { persistSession: false } })
      : null;

  // 1) Load target resellers from DB.
  let resellers = [];
  if (supa) {
    let q = supa
      .from("resellers")
      .select("id, code, display_name, status, allowed_tiers")
      .eq("status", "active");
    if (ONLY) q = q.eq("code", ONLY.toUpperCase());
    const { data, error } = await q;
    if (error) {
      err("create-promo-codes: reseller read failed:", error.message);
      process.exit(2);
    }
    resellers = data ?? [];
  } else {
    // --dry-run without Supabase — hard-code the two v3 target resellers.
    log("create-promo-codes: --dry-run without SUPABASE_URL — using fixture list.");
    resellers = [
      { id: "fixture-infovision", code: "INFOVISION", display_name: "InfoVision", status: "active", allowed_tiers: TIER_LADDER },
      { id: "fixture-dovanlong",  code: "DOVANLONG",  display_name: "DoVanLong",  status: "active", allowed_tiers: TIER_LADDER },
    ];
    if (ONLY) {
      resellers = resellers.filter((r) => r.code === ONLY.toUpperCase());
    }
  }

  if (resellers.length === 0) {
    err(`create-promo-codes: no active resellers matched (${ONLY ? `--only=${ONLY}` : "no filter"}).`);
    process.exit(1);
  }

  const summary = [];
  const jsonlPath = pathResolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../web/content/reports/promo-sync.jsonl",
  );

  for (const reseller of resellers) {
    // 2) Determine prefix.
    let prefix = PREFIX_MAP[reseller.code] ?? null;
    if (!prefix && supa) {
      const { data: existingTier0 } = await supa
        .from("reseller_promotion_codes")
        .select("code")
        .eq("reseller_id", reseller.id)
        .eq("tier_pct", 0)
        .maybeSingle();
      if (existingTier0?.code) prefix = existingTier0.code;
    }
    if (!prefix) prefix = reseller.code.slice(0, 3);
    prefix = normalisePrefix(prefix);

    log(`\n== ${reseller.code} (${reseller.display_name})  prefix=${prefix} ==`);

    const specs = codesForPrefix(prefix).filter((s) =>
      Array.isArray(reseller.allowed_tiers) ? reseller.allowed_tiers.includes(s.tier) : true,
    );

    for (const spec of specs) {
      const { tier, code } = spec;

      // 3) Look at DB row.
      let existingRow = null;
      if (supa) {
        const { data } = await supa
          .from("reseller_promotion_codes")
          .select("id, tier_pct, code, stripe_coupon_id, stripe_promotion_code_id, stripe_synced_at, active")
          .eq("reseller_id", reseller.id)
          .eq("tier_pct", tier)
          .maybeSingle();
        existingRow = data ?? null;
      }

      // Skip if already synced with a real Stripe id (not a placeholder).
      const looksSynced =
        existingRow &&
        (tier === 0
          ? true
          : existingRow.stripe_coupon_id &&
            !existingRow.stripe_coupon_id.startsWith("coupon_pending_") &&
            existingRow.stripe_promotion_code_id &&
            !existingRow.stripe_promotion_code_id.startsWith("promo_pending_"));

      if (looksSynced) {
        log(`  tier ${String(tier).padStart(2)} — ${code.padEnd(12)} SKIP already synced`);
        summary.push({ reseller: reseller.code, code, tier, action: "skipped" });
        continue;
      }

      // Tier 0 is attribution-only, no Stripe object required — but the DB
      // row must still exist. If missing, create it (dry-run only prints).
      if (tier === 0) {
        if (DRY_RUN) {
          log(`  tier  0 — ${code.padEnd(12)} DRY would ensure attribution-only row`);
          summary.push({ reseller: reseller.code, code, tier, action: "dry-run-attribution-only" });
        } else if (!existingRow && supa) {
          const { error } = await supa.from("reseller_promotion_codes").insert({
            reseller_id: reseller.id,
            tier_pct: 0,
            code,
            stripe_coupon_id: null,
            stripe_promotion_code_id: null,
            active: true,
          });
          if (error) {
            err(`  tier  0 — ${code.padEnd(12)} INSERT failed: ${error.message}`);
            summary.push({ reseller: reseller.code, code, tier, action: "error", error: error.message });
          } else {
            log(`  tier  0 — ${code.padEnd(12)} CREATED attribution-only row`);
            summary.push({ reseller: reseller.code, code, tier, action: "created" });
          }
        } else {
          log(`  tier  0 — ${code.padEnd(12)} OK attribution-only row present`);
          summary.push({ reseller: reseller.code, code, tier, action: "skipped" });
        }
        continue;
      }

      // Non-zero tier — mint Stripe coupon + promotion_code.
      if (DRY_RUN) {
        log(`  tier ${String(tier).padStart(2)} — ${code.padEnd(12)} DRY would create coupon(percent_off=${tier}, duration=forever) + promotion_code(${code})`);
        summary.push({ reseller: reseller.code, code, tier, action: "dry-run-create" });
        continue;
      }

      let coupon, promo;
      try {
        coupon = await stripe.coupons.create(
          {
            percent_off: tier,
            duration: "forever",
            name: `BlockID reseller ${code}`,
            metadata: {
              source: "reseller_module_v3_k2",
              reseller_id: reseller.id,
              reseller_code: reseller.code,
              tier_pct: String(tier),
            },
          },
          { idempotencyKey: `promo:${reseller.id}:${tier}` },
        );
      } catch (e) {
        err(`  tier ${tier} — ${code} coupon.create failed: ${e.message}`);
        summary.push({ reseller: reseller.code, code, tier, action: "error", error: e.message });
        continue;
      }

      try {
        promo = await stripe.promotionCodes.create(
          {
            coupon: coupon.id,
            code,
            active: true,
            metadata: {
              source: "reseller_module_v3_k2",
              reseller_id: reseller.id,
              reseller_code: reseller.code,
              tier_pct: String(tier),
            },
          },
          { idempotencyKey: `promo_code:${reseller.id}:${tier}` },
        );
      } catch (e) {
        err(`  tier ${tier} — ${code} promotionCodes.create failed: ${e.message}`);
        summary.push({ reseller: reseller.code, code, tier, action: "error", error: e.message });
        continue;
      }

      // Persist Stripe IDs back to the row.
      if (supa) {
        const now = new Date().toISOString();
        if (existingRow) {
          const { error } = await supa
            .from("reseller_promotion_codes")
            .update({
              stripe_coupon_id: coupon.id,
              stripe_promotion_code_id: promo.id,
              stripe_synced_at: now,
              active: true,
              code, // in case DB still stored the long-form INFOVISIONxx label
            })
            .eq("id", existingRow.id);
          if (error) {
            err(`  tier ${tier} — ${code} DB update failed: ${error.message}`);
            summary.push({ reseller: reseller.code, code, tier, action: "error", error: error.message });
            continue;
          }
        } else {
          const { error } = await supa.from("reseller_promotion_codes").insert({
            reseller_id: reseller.id,
            tier_pct: tier,
            code,
            stripe_coupon_id: coupon.id,
            stripe_promotion_code_id: promo.id,
            stripe_synced_at: now,
            active: true,
          });
          if (error) {
            err(`  tier ${tier} — ${code} DB insert failed: ${error.message}`);
            summary.push({ reseller: reseller.code, code, tier, action: "error", error: error.message });
            continue;
          }
        }
      }

      log(`  tier ${String(tier).padStart(2)} — ${code.padEnd(12)} CREATED coupon=${coupon.id} promo=${promo.id}`);
      summary.push({
        reseller: reseller.code,
        code,
        tier,
        action: "created",
        stripe_coupon_id: coupon.id,
        stripe_promotion_code_id: promo.id,
      });

      // JSONL row (per action, append-only).
      try {
        appendFileSync(
          jsonlPath,
          JSON.stringify({
            ts: new Date().toISOString(),
            reseller_id: reseller.id,
            reseller_code: reseller.code,
            code,
            discount_pct: tier,
            stripe_coupon_id: coupon.id,
            stripe_promotion_code_id: promo.id,
            action: "created",
          }) + "\n",
        );
      } catch (e) {
        err(`  tier ${tier} — ${code} JSONL append failed: ${e.message}`);
      }

      await delay(50); // gentle rate-limit
    }
  }

  if (JSON_OUT) {
    process.stdout.write(JSON.stringify({ dry_run: DRY_RUN, resellers: resellers.length, summary }, null, 2) + "\n");
  } else {
    log("\n== summary ==");
    for (const row of summary) {
      log(`  ${row.reseller.padEnd(12)} tier ${String(row.tier).padStart(2)} ${row.code.padEnd(12)} → ${row.action}`);
    }
    log("");
  }

  const errored = summary.some((s) => s.action === "error");
  process.exit(errored ? 1 : 0);
}

main().catch((e) => {
  err("create-promo-codes: uncaught:", e);
  process.exit(2);
});
