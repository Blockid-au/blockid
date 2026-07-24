#!/usr/bin/env node
// verify-tier-sync.mjs — CFO one-shot: reconcile Stripe tier coupons against
// the canonical [0,10,20,30,40] ladder + report per-tier status.
//
// Env:
//   STRIPE_SECRET_KEY          required (sk_live_… or sk_test_…)
//   SUPABASE_URL               required
//   SUPABASE_SERVICE_ROLE_KEY  required
//
// Flags:
//   --apply                  Call reconcileTierCoupons with confirmDrift=false.
//                            Creates missing canonical coupons + patches metadata.
//   --confirm-drift          Allow the reconciler to quarantine drifted coupons
//                            (metadata rename → canonical=false + versioned id).
//                            NEVER destructive — coupons.delete is never called.
//   --backfill-attribution   Walk last 90d checkout.sessions.list and INSERT
//                            missing reseller_attribution rows via linkFounderAttribution.
//   --emit-cron-health       Append a JSONL row into web/content/reports/cron-health.jsonl.
//   --json                   Emit machine-readable JSON summary at the end.
//
// Exit code: 0 on a clean prod snapshot (no drift, no misses), 1 otherwise.
//
// This script is intentionally dry-run-by-default: without --apply it lists
// what would change and exits 0/1 based on drift.

import { setTimeout as delay } from "node:timers/promises";
import { appendFileSync } from "node:fs";
import { resolve as pathResolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const args = new Set(process.argv.slice(2));
const APPLY = args.has("--apply");
const CONFIRM_DRIFT = args.has("--confirm-drift");
const BACKFILL = args.has("--backfill-attribution");
const EMIT_CRON = args.has("--emit-cron-health");
const JSON_OUT = args.has("--json");

const CANONICAL_TIERS = [0, 10, 20, 30, 40];
const NON_ZERO_TIERS = [10, 20, 30, 40];

function log(...m) {
  if (!JSON_OUT) console.log(...m);
}
function err(...m) {
  console.error(...m);
}

async function main() {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const supaUrl = process.env.SUPABASE_URL;
  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!stripeKey) {
    err("verify-tier-sync: STRIPE_SECRET_KEY required");
    process.exit(2);
  }
  if (!supaUrl || !supaKey) {
    err("verify-tier-sync: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required");
    process.exit(2);
  }

  // Late imports — keep the top of the file dependency-free so --help works
  // even without node_modules installed.
  const [{ default: Stripe }, { createClient }, planner] = await Promise.all([
    import("stripe"),
    import("@supabase/supabase-js"),
    import("../../web/src/lib/reseller/tier-coupon-reconciler.ts").catch(
      () => null,
    ),
  ]);

  const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });
  const supa = createClient(supaUrl, supaKey, {
    auth: { persistSession: false },
  });

  // 1) List Stripe coupons scoped to the canonical namespace.
  const coupons = [];
  {
    const listed = await stripe.coupons.list({ limit: 100 });
    for (const c of listed.data ?? []) {
      const id = String(c.id ?? "");
      if (!id.startsWith("res_tier_")) continue;
      const meta = c.metadata ?? {};
      if (meta.source && meta.source !== "reseller_module_p9.3") continue;
      coupons.push({
        id,
        percent_off: typeof c.percent_off === "number" ? c.percent_off : null,
        duration: String(c.duration ?? "unknown"),
        metadata: meta,
        deleted: Boolean(c.deleted),
      });
    }
  }

  // 2) DB active-code counts per tier.
  const dbActiveByTier = new Map(NON_ZERO_TIERS.map((t) => [t, 0]));
  dbActiveByTier.set(0, 0);
  try {
    const { data, error } = await supa
      .from("reseller_promotion_codes")
      .select("tier_pct, active")
      .eq("active", true);
    if (error) throw error;
    for (const row of data ?? []) {
      const t = Number(row.tier_pct);
      if (dbActiveByTier.has(t)) {
        dbActiveByTier.set(t, dbActiveByTier.get(t) + 1);
      }
    }
  } catch (e) {
    err("verify-tier-sync: reseller_promotion_codes read failed:", e.message);
  }

  // 3) Plan reconciliation (pure).
  let plan;
  if (planner?.planTierCouponReconciliation) {
    plan = planner.planTierCouponReconciliation({
      existingCoupons: coupons,
      canonicalTiers: NON_ZERO_TIERS,
    });
  } else {
    // Fallback: inline mini-planner so the script still runs in a build that
    // has not compiled TS. Only covers noop/create/repair coarse states.
    plan = { actions: [], drift: [] };
    for (const tier of NON_ZERO_TIERS) {
      const c = coupons.find((x) => x.id === `res_tier_${tier}`);
      if (!c) plan.actions.push({ kind: "create", tier_pct: tier });
      else if (c.percent_off !== tier || c.duration !== "forever") {
        const drift = { kind: "repair", tier_pct: tier, existing: c };
        plan.actions.push(drift);
        plan.drift.push(drift);
      } else plan.actions.push({ kind: "noop", tier_pct: tier, existing: c });
    }
  }

  // 4) Render the table.
  log("");
  log(
    "tier | stripe_coupon_id     | stripe_%_off | db_active_codes | status",
  );
  log(
    "-----|----------------------|--------------|-----------------|----------------",
  );
  for (const tier of CANONICAL_TIERS) {
    if (tier === 0) {
      log(
        `   0 | (attribution-only)   |            - |              ${String(dbActiveByTier.get(0) ?? 0).padStart(2)} | ok (no coupon)`,
      );
      continue;
    }
    const a = plan.actions.find((x) => x.tier_pct === tier);
    const c =
      a && "existing" in a
        ? a.existing
        : coupons.find((x) => x.id === `res_tier_${tier}`);
    const id = c ? c.id : "(missing)";
    const pct = c ? String(c.percent_off ?? "?") : "-";
    const status = a
      ? a.kind === "noop"
        ? "ok"
        : a.kind === "create"
          ? "MISS (would create)"
          : a.kind === "metadata_patch"
            ? "STALE (would patch)"
            : "DRIFT (requires --confirm-drift)"
      : "unknown";
    log(
      `  ${String(tier).padStart(2)} | ${id.padEnd(20)} | ${pct.padStart(12)} | ${String(dbActiveByTier.get(tier) ?? 0).padStart(15)} | ${status}`,
    );
  }
  log("");

  // 5) Optionally apply reconciler.
  let report = null;
  if (APPLY) {
    log(
      `verify-tier-sync: applying reconciler (confirmDrift=${CONFIRM_DRIFT})...`,
    );
    try {
      const mod = await import(
        "../../web/src/lib/reseller/stripe-billing.ts"
      );
      report = await mod.reconcileTierCoupons(stripe, {
        confirmDrift: CONFIRM_DRIFT,
      });
      log(`verify-tier-sync: applied ${report.actions.length} actions`);
      for (const a of report.actions) {
        log(
          `  - tier ${a.tier_pct}: ${a.kind}${a.applied ? " ✓" : " (skipped)"}${a.error ? " ERROR: " + a.error : ""}`,
        );
      }
    } catch (e) {
      err("verify-tier-sync: reconciler failed:", e.message);
    }
  }

  // 6) Optional back-fill of reseller_attribution rows.
  let backfillResult = null;
  if (BACKFILL) {
    log("verify-tier-sync: back-filling reseller_attribution (last 90d)...");
    backfillResult = { walked: 0, inserted: 0, skipped: 0, errors: 0 };
    try {
      const { linkFounderAttribution } = await import(
        "../../web/src/lib/reseller/founder-attribution-linker.ts"
      );
      const since = Math.floor(Date.now() / 1000) - 90 * 24 * 3600;
      let starting_after;
      for (let page = 0; page < 20; page++) {
        const list = await stripe.checkout.sessions.list({
          limit: 100,
          created: { gte: since },
          ...(starting_after ? { starting_after } : {}),
        });
        for (const s of list.data ?? []) {
          backfillResult.walked++;
          try {
            const outcome = await linkFounderAttribution(supa, s, {
              projectId: null,
              founderId: null,
              resellerRow: null,
            });
            if (outcome.ok && outcome.kind === "inserted") {
              backfillResult.inserted++;
            } else {
              backfillResult.skipped++;
            }
          } catch (e) {
            backfillResult.errors++;
            err("  backfill row failed:", e.message);
          }
          await delay(5);
        }
        if (!list.has_more) break;
        starting_after = list.data[list.data.length - 1]?.id;
        if (!starting_after) break;
      }
      log(
        `verify-tier-sync: back-fill walked=${backfillResult.walked} inserted=${backfillResult.inserted} skipped=${backfillResult.skipped} errors=${backfillResult.errors}`,
      );
    } catch (e) {
      err("verify-tier-sync: back-fill failed:", e.message);
    }
  }

  // 7) Emit cron-health row (opt-in — respects the "never touch jsonl" rule
  //    unless explicitly asked).
  if (EMIT_CRON) {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const cronHealthPath = pathResolve(
      __dirname,
      "../../web/content/reports/cron-health.jsonl",
    );
    const row = {
      ts: new Date().toISOString(),
      cron: "verify-tier-sync",
      status: plan.drift.length === 0 && plan.actions.every((a) => a.kind === "noop")
        ? "ok"
        : "drift",
      drift_count: plan.drift.length,
      miss_count: plan.actions.filter((a) => a.kind === "create").length,
      apply: APPLY,
      confirm_drift: CONFIRM_DRIFT,
    };
    try {
      appendFileSync(cronHealthPath, JSON.stringify(row) + "\n");
    } catch (e) {
      err("verify-tier-sync: cron-health append failed:", e.message);
    }
  }

  const dirty =
    plan.drift.length > 0 ||
    plan.actions.some((a) => a.kind === "create" || a.kind === "metadata_patch");

  if (JSON_OUT) {
    process.stdout.write(
      JSON.stringify(
        {
          apply: APPLY,
          confirm_drift: CONFIRM_DRIFT,
          coupons_seen: coupons.length,
          actions: plan.actions.map((a) => ({ kind: a.kind, tier_pct: a.tier_pct })),
          drift_count: plan.drift.length,
          db_active_by_tier: Object.fromEntries(dbActiveByTier),
          report,
          backfill: backfillResult,
          exit: dirty ? 1 : 0,
        },
        null,
        2,
      ) + "\n",
    );
  } else if (dirty) {
    log("verify-tier-sync: FAIL — drift or missing tier coupons detected");
  } else {
    log("verify-tier-sync: OK — Stripe tier coupons match the canonical ladder");
  }

  process.exit(dirty ? 1 : 0);
}

main().catch((e) => {
  err("verify-tier-sync: uncaught:", e);
  process.exit(2);
});
