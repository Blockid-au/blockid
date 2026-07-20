#!/usr/bin/env node
/**
 * Seed 3 pricing/conversion experiments for T0121 + T0123.
 *
 * Idempotent: existing rows keyed by `name` are left alone (only promoted
 * to `running` if they are currently draft/paused). New rows are inserted
 * with `status = running` so the /api/pricing-test/assign endpoint starts
 * serving immediately.
 *
 * Uses `@supabase/supabase-js` directly (matches the pattern used by the
 * other seed scripts here) rather than `web/src/lib/supabase.ts`, because
 * that TypeScript module carries the `server-only` sentinel that .mjs
 * scripts cannot import at runtime.
 *
 * Env:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Run:
 *   node scripts/seed-pricing-experiments.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { env, exit } from "node:process";

const EXPERIMENTS = [
  {
    name: "hero-cta-2026-07",
    hypothesis:
      "More outcome-focused CTA copy will lift homepage → analyser click-through by ≥15%.",
    variants: [
      {
        key: "control",
        label: 'CTA: "Search & Score"',
        payload: { copy: "Search & Score" },
      },
      {
        key: "run",
        label: 'CTA: "Run my SVI"',
        payload: { copy: "Run my SVI" },
      },
      {
        key: "score",
        label: 'CTA: "Get my score in 30s"',
        payload: { copy: "Get my score in 30s" },
      },
    ],
    traffic_split: { control: 34, run: 33, score: 33 },
  },
  {
    name: "pricing-anchor-2026-07",
    hypothesis:
      "Adding a higher A$79/mo anchor tier above Founder will lift conversion on the middle tier by ≥10%.",
    variants: [
      {
        key: "control",
        label: "No anchor tier (2 tiers)",
        payload: { showAnchor: false },
      },
      {
        key: "with_anchor",
        label: "Founder+ anchor tier at A$79/mo",
        payload: {
          showAnchor: true,
          anchorName: "Founder+",
          anchorMonthlyAud: 79,
          anchorAnnualAud: 790,
          anchorFeatures: [
            "Everything in Founder",
            "Priority support (12h SLA)",
            "Warm investor intros (up to 3/mo)",
          ],
        },
      },
    ],
    traffic_split: { control: 50, with_anchor: 50 },
  },
  {
    name: "analyzer-email-nudge-2026-07",
    hypothesis:
      "An explicit email-delivery reminder chip above the analyser email field will lift email fill-rate by ≥8%.",
    variants: [
      {
        key: "control",
        label: "No chip",
        payload: { showChip: false },
      },
      {
        key: "with_chip",
        label: "Show chip above email input",
        payload: {
          showChip: true,
          chipCopy: "We'll email your full report to this address",
        },
      },
    ],
    traffic_split: { control: 50, with_chip: 50 },
  },
];

async function main() {
  const supabaseUrl = env.SUPABASE_URL || "http://localhost:8000";
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    console.error(
      "[seed-pricing-experiments] SUPABASE_SERVICE_ROLE_KEY missing in env",
    );
    exit(1);
  }
  const supabase = createClient(supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "public" },
  });

  console.log(
    `[seed-pricing-experiments] target=${supabaseUrl} experiments=${EXPERIMENTS.length}`,
  );

  const summary = [];
  for (const exp of EXPERIMENTS) {
    const { data: existing, error: readErr } = await supabase
      .from("pricing_experiments")
      .select("id, status")
      .eq("name", exp.name)
      .maybeSingle();
    if (readErr) {
      console.error(`  ! ${exp.name}: read failed → ${readErr.message}`);
      continue;
    }

    if (existing) {
      let action = "existed";
      if (existing.status !== "running") {
        const { error: upErr } = await supabase
          .from("pricing_experiments")
          .update({
            status: "running",
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
        if (upErr) {
          console.error(
            `  ! ${exp.name}: promote-to-running failed → ${upErr.message}`,
          );
        } else {
          action = "promoted";
          console.log(
            `  ~ ${exp.name}: existed (${existing.status}) → promoted running → ${existing.id}`,
          );
        }
      } else {
        console.log(`  ~ ${exp.name}: already running → ${existing.id}`);
      }
      summary.push({ name: exp.name, id: existing.id, action });
      continue;
    }

    const { data: inserted, error: insErr } = await supabase
      .from("pricing_experiments")
      .insert({
        name: exp.name,
        hypothesis: exp.hypothesis,
        variants: exp.variants,
        traffic_split: exp.traffic_split,
        status: "running",
      })
      .select("id")
      .single();
    if (insErr || !inserted) {
      console.error(
        `  ! ${exp.name}: insert failed → ${insErr?.message ?? "unknown"}`,
      );
      continue;
    }
    console.log(`  + ${exp.name}: created → ${inserted.id}`);
    summary.push({ name: exp.name, id: inserted.id, action: "created" });
  }

  console.log("\n[seed-pricing-experiments] summary:");
  for (const row of summary) {
    console.log(`  ${row.action.padEnd(9)} ${row.id}  ${row.name}`);
  }
  console.log(
    `[seed-pricing-experiments] done — ${summary.length}/${EXPERIMENTS.length} handled`,
  );
}

main().catch((err) => {
  console.error("[seed-pricing-experiments] fatal:", err);
  exit(1);
});
