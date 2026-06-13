#!/usr/bin/env npx tsx
/**
 * Seed the BlockID Knowledge Base.
 *
 * Populates kb_articles and kb_methodologies from existing BlockID intelligence:
 *   1. content/reports/clevel-valuation-knowledge-base.md  → KB articles
 *   2. src/lib/benchmarks.ts (AU market data)              → KB articles
 *   3. 8 SVI dimensions                                    → KB methodologies
 *   4. 8 valuation methods                                 → KB methodologies
 *
 * Usage:
 *   cd web && npx tsx scripts/seed-kb.ts
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { BENCHMARKS, SVI_STAGE_BENCHMARKS } from "../src/lib/benchmarks";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("[seed-kb] Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ───────────────────────── 1. C-Level KB markdown → articles ─────────────────

function parseValuationKB(): Array<{
  slug: string; title: string; category: string; content: string;
  metadata: Record<string, unknown>;
}> {
  const path = resolve(process.cwd(), "content/reports/clevel-valuation-knowledge-base.md");
  const raw = readFileSync(path, "utf8");

  // Strip frontmatter
  const body = raw.replace(/^---[\s\S]*?---\n+/, "");

  // Split on H2 (## ) — each section becomes an article
  const sections = body.split(/^## /m).filter(Boolean);

  const articles: Array<{ slug: string; title: string; category: string; content: string; metadata: Record<string, unknown> }> = [];
  for (const section of sections) {
    const [headingLine, ...rest] = section.split("\n");
    const title = headingLine.trim();
    if (!title || title.startsWith("#")) continue;
    const content = rest.join("\n").trim();
    if (!content) continue;

    const slug = "valuation-kb-" + title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .slice(0, 60);

    const lower = (title + " " + content).toLowerCase();
    let category = "valuation";
    if (lower.includes("svi") && !lower.includes("valuation")) category = "svi";
    else if (lower.includes("sector") || lower.includes("comparable") || lower.includes("benchmark")) category = "benchmark";
    else if (lower.includes("financial") || lower.includes("mrr") || lower.includes("burn")) category = "financial";

    articles.push({
      slug,
      title,
      category,
      content: `## ${title}\n\n${content}`,
      metadata: { source: "clevel-valuation-knowledge-base.md", version: "2.0.0" },
    });
  }
  return articles;
}

// ───────────────────────── 2. Benchmarks → articles ──────────────────────────

function buildBenchmarkArticles(): Array<{
  slug: string; title: string; category: string; content: string;
  metadata: Record<string, unknown>;
}> {
  const articles: Array<{ slug: string; title: string; category: string; content: string; metadata: Record<string, unknown> }> = [];

  for (const [stage, b] of Object.entries(BENCHMARKS)) {
    const lines: string[] = [];
    lines.push(`# AU Startup Benchmarks — ${stage.toUpperCase()}`);
    lines.push("");
    lines.push("Aggregated p25/p50/p75 metrics from publicly available Australian");
    lines.push("startup ecosystem reports and anonymised sector averages.");
    lines.push("");
    lines.push("| Metric | p25 | p50 | p75 |");
    lines.push("|---|---:|---:|---:|");
    for (const [metric, band] of Object.entries(b)) {
      lines.push(`| ${metric} | ${band.p25} | ${band.p50} | ${band.p75} |`);
    }
    articles.push({
      slug: `benchmark-au-${stage}`,
      title: `AU Benchmarks: ${stage}`,
      category: "benchmark",
      content: lines.join("\n"),
      metadata: { stage, source: "src/lib/benchmarks.ts", market: "AU" },
    });
  }

  for (const b of SVI_STAGE_BENCHMARKS) {
    const lines: string[] = [];
    lines.push(`# SVI Benchmark — Stage ${b.stage} (${b.label})`);
    lines.push("");
    lines.push(`- Average SVI: **${b.avgSVI}**`);
    lines.push(`- Median SVI: **${b.medianSVI}**`);
    lines.push(`- p25 / p75: ${b.p25} / ${b.p75}`);
    lines.push(`- Top decile: **${b.topDecile}**`);
    lines.push("");
    lines.push("## Dimension benchmarks (avg / top)");
    lines.push("");
    lines.push("| Dim | Average | Top |");
    lines.push("|---|---:|---:|");
    for (const [dim, vals] of Object.entries(b.dimensions)) {
      lines.push(`| ${dim.toUpperCase()} | ${vals.avg} | ${vals.top} |`);
    }
    articles.push({
      slug: `svi-benchmark-stage-${b.stage}`,
      title: `SVI Benchmark — Stage ${b.stage} ${b.label}`,
      category: "svi",
      content: lines.join("\n"),
      metadata: { stage: b.stage, source: "src/lib/benchmarks.ts" },
    });
  }
  return articles;
}

// ───────────────────────── 3. SVI dimensions → methodologies ─────────────────

const SVI_DIMENSIONS = [
  { code: "FTV", name: "Founder–Team Velocity", weight: 0.18, description: "Founder quality, team cohesion, hiring velocity, advisor depth." },
  { code: "MPC", name: "Market–Problem Clarity", weight: 0.15, description: "Sharpness of the problem statement, validated demand, ICP clarity." },
  { code: "PTD", name: "Product–Tech Depth", weight: 0.15, description: "Technical maturity, production-readiness, defensibility of stack." },
  { code: "TRE", name: "Traction & Revenue Evidence", weight: 0.15, description: "MRR, growth rate, paying customer evidence, retention proof." },
  { code: "CGH", name: "Capital & Growth History", weight: 0.10, description: "Prior funding, grants, runway, capital efficiency signals." },
  { code: "IRI", name: "IP, Regulatory & Moat", weight: 0.10, description: "Patents, regulatory licences, network effects, switching costs." },
  { code: "LCO", name: "Legal, Compliance & Ops", weight: 0.08, description: "Cap table hygiene, contracts, governance, operational risk posture." },
  { code: "SVM", name: "Story, Vision & Mission", weight: 0.09, description: "Narrative coherence, mission depth, brand and storytelling power." },
];

function buildSviMethodologies() {
  return SVI_DIMENSIONS.map((d) => ({
    name: `SVI Dimension: ${d.code}`,
    type: "svi_dimension" as const,
    description: `${d.name} — ${d.description}`,
    inputs: [
      { name: "score", type: "number", description: `${d.code} sub-score in [0,100]`, required: true },
      { name: "evidenceTier", type: "number", description: "Evidence tier 0-5", required: false },
    ],
    formula: `weighted_contribution = score × ${d.weight}`,
    formula_code: `export const ${d.code}_WEIGHT = ${d.weight};\nexport function ${d.code.toLowerCase()}Contribution(score: number) { return score * ${d.code}_WEIGHT; }`,
    examples: [
      { input: { score: 60 }, output: { weighted: 60 * d.weight }, notes: `${d.code} mid-range score` },
      { input: { score: 90 }, output: { weighted: 90 * d.weight }, notes: `${d.code} top-quartile score` },
    ],
    refs: [
      { source: "BlockID Startup Index™ Methodology v2.0", date: "2026-06-13" },
    ],
    created_by: "cfo",
  }));
}

// ───────────────────────── 4. Valuation methods → methodologies ──────────────

function buildValuationMethodologies() {
  return [
    {
      name: "Berkus Method (AU)",
      description: "Five-pillar pre-revenue valuation method, AU-adjusted ceiling A$750k per pillar.",
      formula: "Σ pillar_score × A$750,000 across {idea, product, team, moat, traction}",
      formula_code: `const BERKUS_MAX = 750_000;
export function berkusValue(p: { idea: number; product: number; team: number; moat: number; traction: number }) {
  return (p.idea + p.product + p.team + p.moat + p.traction) * BERKUS_MAX;
}`,
      inputs: [
        { name: "idea", type: "number", description: "0–1 idea quality", required: true },
        { name: "product", type: "number", description: "0–1 product quality", required: true },
        { name: "team", type: "number", description: "0–1 team strength", required: true },
        { name: "moat", type: "number", description: "0–1 moat strength", required: true },
        { name: "traction", type: "number", description: "0–1 traction proof", required: true },
      ],
      examples: [{
        input: { idea: 0.7, product: 0.6, team: 0.7, moat: 0.5, traction: 0.3 },
        output: { value_aud: 2_100_000 },
        notes: "Solid early-stage profile",
      }],
    },
    {
      name: "Scorecard Method (AU Seed)",
      description: "Adjust AU seed median valuation by weighted SVI dimensions.",
      formula: "BASE × max(1 + Σ weight × (score − 0.5) × 2, 0.1)",
      formula_code: `const BASE = 3_000_000;
const W = { ftv: 0.30, mpc: 0.25, ptd: 0.15, svm: 0.10, tre: 0.10, iri: 0.05, lco: 0.05 };
export function scorecardValue(s: Record<keyof typeof W, number>) {
  const adj = Object.entries(W).reduce((sum, [k, w]) => sum + w * (s[k as keyof typeof W] / 100 - 0.5) * 2, 0);
  return BASE * Math.max(1 + adj, 0.1);
}`,
      inputs: [
        { name: "ftv", type: "number", description: "FTV 0–100", required: true },
        { name: "mpc", type: "number", description: "MPC 0–100", required: true },
        { name: "ptd", type: "number", description: "PTD 0–100", required: true },
        { name: "svm", type: "number", description: "SVM 0–100", required: true },
        { name: "tre", type: "number", description: "TRE 0–100", required: true },
        { name: "iri", type: "number", description: "IRI 0–100", required: true },
        { name: "lco", type: "number", description: "LCO 0–100", required: true },
      ],
      examples: [],
    },
    {
      name: "DCF (Discounted Cash Flow)",
      description: "Project free cash flows and discount to present value. Used for stage 4+.",
      formula: "Σ FCF_t / (1 + r)^t + Terminal / (1 + r)^N",
      formula_code: `export function dcf(fcf: number[], discountRate: number, terminal: number) {
  const pv = fcf.reduce((s, f, i) => s + f / Math.pow(1 + discountRate, i + 1), 0);
  return pv + terminal / Math.pow(1 + discountRate, fcf.length);
}`,
      inputs: [
        { name: "fcf", type: "number[]", description: "Projected annual free cash flows", required: true },
        { name: "discountRate", type: "number", description: "Discount rate, e.g. 0.25 for VC", required: true },
        { name: "terminal", type: "number", description: "Terminal value", required: true },
      ],
      examples: [],
    },
    {
      name: "VC Method",
      description: "Back-solve pre-money from exit value, target return multiple, and investment.",
      formula: "PreMoney = (ExitValue / ReturnMultiple) − Investment",
      formula_code: `export function vcMethod(exit: number, multiple: number, investment: number) {
  return exit / multiple - investment;
}`,
      inputs: [
        { name: "exit", type: "number", description: "Projected exit value", required: true },
        { name: "multiple", type: "number", description: "Target return multiple, e.g. 10×", required: true },
        { name: "investment", type: "number", description: "Round size", required: true },
      ],
      examples: [],
    },
    {
      name: "Revenue Multiple",
      description: "Apply sector-typical ARR multiple to current ARR.",
      formula: "Valuation = ARR × SectorMultiple",
      formula_code: `export function revenueMultiple(arr: number, multiple: number) { return arr * multiple; }`,
      inputs: [
        { name: "arr", type: "number", description: "Annual recurring revenue (AUD)", required: true },
        { name: "multiple", type: "number", description: "Sector multiple, e.g. 6× SaaS", required: true },
      ],
      examples: [],
    },
    {
      name: "Risk Factor Summation",
      description: "Adjust base valuation by ±A$250k per ±1 score across 12 risk factors.",
      formula: "BASE + Σ factor_score × A$250,000",
      formula_code: `const BASE = 3_000_000;
const STEP = 250_000;
export function riskFactorValue(factors: number[]) {
  return BASE + factors.reduce((s, f) => s + f * STEP, 0);
}`,
      inputs: [
        { name: "factors", type: "number[]", description: "12 factor scores in [-2,+2]", required: true },
      ],
      examples: [],
    },
    {
      name: "First Chicago Method",
      description: "Weighted blend of best/base/worst-case scenario valuations.",
      formula: "Σ probability_i × scenario_value_i",
      formula_code: `export function firstChicago(scenarios: Array<{ p: number; value: number }>) {
  return scenarios.reduce((s, sc) => s + sc.p * sc.value, 0);
}`,
      inputs: [
        { name: "scenarios", type: "Array<{p: number, value: number}>", description: "Scenarios with probability and value", required: true },
      ],
      examples: [],
    },
    {
      name: "SVI-Based Valuation (BlockID proprietary)",
      description: "Apply SVI premium to stage base. Proprietary BlockID method.",
      formula: "stage_base × (1 + (svi − 100) / 100 × band) where band ∈ {0.7, 1.0, 1.4}",
      formula_code: `const STAGE_BASES = { 0: 300_000, 1: 750_000, 2: 2_000_000, 3: 3_500_000, 4: 6_000_000, 5: 12_000_000 } as const;
export function sviValuation(stage: keyof typeof STAGE_BASES, svi: number) {
  const base = STAGE_BASES[stage];
  const premium = (svi - 100) / 100;
  return {
    low:  base * (1 + premium * 0.7),
    mid:  base * (1 + premium),
    high: base * (1 + premium * 1.4),
  };
}`,
      inputs: [
        { name: "stage", type: "number", description: "Stage 0–5", required: true },
        { name: "svi", type: "number", description: "SVI score (typically 70–250)", required: true },
      ],
      examples: [
        { input: { stage: 2, svi: 115 }, output: { mid: 2_300_000 }, notes: "Stage 2 startup with above-average SVI" },
      ],
    },
  ].map((m) => ({
    ...m,
    type: "valuation_method" as const,
    refs: [{ source: "BlockID Startup Index™ Methodology v2.0", date: "2026-06-13" }],
    created_by: "cfo",
  }));
}

// ───────────────────────── Run ───────────────────────────────────────────────

async function run() {
  const articles = [...parseValuationKB(), ...buildBenchmarkArticles()];
  const methodologies = [...buildSviMethodologies(), ...buildValuationMethodologies()];

  console.log(`[seed-kb] Seeding ${articles.length} articles + ${methodologies.length} methodologies…`);

  let okA = 0, failA = 0;
  for (const a of articles) {
    const { error } = await supabase
      .from("kb_articles")
      .upsert({ ...a, author: "cfo", is_public: false, updated_at: new Date().toISOString() }, { onConflict: "slug" });
    if (error) { failA++; console.warn(`  ✗ ${a.slug}: ${error.message}`); }
    else okA++;
  }
  console.log(`[seed-kb] Articles: ${okA} ok, ${failA} failed`);

  let okM = 0, failM = 0;
  for (const m of methodologies) {
    const { error } = await supabase
      .from("kb_methodologies")
      .upsert({ ...m, updated_at: new Date().toISOString() }, { onConflict: "name" });
    if (error) { failM++; console.warn(`  ✗ ${m.name}: ${error.message}`); }
    else okM++;
  }
  console.log(`[seed-kb] Methodologies: ${okM} ok, ${failM} failed`);
  console.log("[seed-kb] Done.");
}

run().catch((e) => { console.error(e); process.exit(1); });
