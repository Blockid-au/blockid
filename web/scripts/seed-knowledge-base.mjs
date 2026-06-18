#!/usr/bin/env node
// Seed the knowledge_entries table from web/content/knowledge-base/au-accelerators-2026.json
//
// Idempotent — uses (source, criterion) as a deduplication key so re-runs upsert
// instead of duplicating. Run after every JSON edit:
//   node scripts/seed-knowledge-base.mjs

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_DIR = resolve(__dirname, "..");

const env = Object.fromEntries(
  readFileSync(resolve(WEB_DIR, ".env"), "utf8").split("\n")
    .map((l) => l.match(/^([A-Z_]+)=(.*)/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
);

const url = (env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL).replace("supabase-kong", "localhost");
const s = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY);

const seed = JSON.parse(readFileSync(resolve(WEB_DIR, "content/knowledge-base/au-accelerators-2026.json"), "utf8"));

const SOURCE_DISPLAY = {
  antler: "Antler",
  startmate: "Startmate",
  yc: "Y Combinator",
  techstars: "Techstars",
  skydeck: "SkyDeck (Berkeley)",
  mvi: "MVi (Melbourne Uni)",
  cicada: "Cicada Innovations",
  blackbird: "Blackbird",
};

console.log(`Seeding ${seed.entries.length} entries…`);

let inserted = 0;
let updated = 0;
let failed = 0;

for (const e of seed.entries) {
  // Dedup by (source, criterion). Use upsert semantics with a manual check
  // because there's no native unique constraint on (source, criterion).
  const { data: existing } = await s
    .from("knowledge_entries")
    .select("id")
    .eq("source", e.source)
    .eq("criterion", e.criterion)
    .maybeSingle();

  const payload = {
    source: e.source,
    source_name: SOURCE_DISPLAY[e.source] ?? e.source,
    topic: e.topic,
    criterion: e.criterion,
    description: e.description,
    stage_min: e.stage_min,
    stage_max: e.stage_max,
    sector: e.sector ?? "any",
    evidence_required: e.evidence_required ?? [],
    tactic: e.tactic ?? [],
    valuation_lift_pct: e.valuation_lift_pct ?? 0,
    citations: e.citations ?? [],
    active: true,
  };

  if (existing) {
    const { error } = await s.from("knowledge_entries").update(payload).eq("id", existing.id);
    if (error) { failed++; console.error("UPDATE FAIL:", e.criterion, error.message); }
    else updated++;
  } else {
    const { error } = await s.from("knowledge_entries").insert(payload);
    if (error) { failed++; console.error("INSERT FAIL:", e.criterion, error.message); }
    else inserted++;
  }
}

console.log(`✓ Inserted: ${inserted} · Updated: ${updated} · Failed: ${failed}`);

const { count } = await s.from("knowledge_entries").select("id", { count: "exact", head: true }).eq("active", true);
console.log(`Total active entries: ${count}`);
