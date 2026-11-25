// POST /api/cron/refresh-models — daily discovery of the strongest FREE models.
//
// Pulls the live model catalogues, keeps only genuinely free models, ranks them
// by capability (family + parameter size + context), and writes the top picks to
// content/reports/ai-free-models.json. ai-client.ts reads that file at runtime
// (cached 5 min) and merges it ahead of the curated defaults — so the fallback
// chain stays fresh as providers add/remove free models, and a bad refresh can
// never break it (defaults are always appended).
//
// Schedule: daily. Auth: Bearer CRON_SECRET.
//
// See also: /api/cron/discover-models — emergency on-demand augmentation that
// only adds 3 NEW models when the running chain starts hitting rate limits.

import { NextResponse } from "next/server";
import * as fs from "fs";
import { FREE_MODELS_CONFIG } from "@/lib/ai-client";
import { getSupabaseAdmin } from "@/lib/supabase";
import { fetchJson, filterFreeOpenRouter, rank } from "@/lib/model-discovery";
import { isCronAuthorised } from "@/lib/security/cron-auth";
import { readStrikes, recentlyPruned } from "@/lib/ai/model-strikes";
import { checkModelsBatch, type HealthStatus } from "@/lib/ai/health-check";

export const dynamic = "force-dynamic";


async function dbKey(provider: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data } = await supabase
    .from("ai_provider_keys")
    .select("api_key")
    .eq("provider", provider)
    .eq("is_active", true)
    .maybeSingle();
  return data?.api_key ?? null;
}

/** G36 — a catalogue rank is not proof a model answers. 25/11 live probe:
 *  `recursive/flint-v1.0:free` ranked #3 on OpenRouter yet returned an EMPTY
 *  answer after 12.5 s, so every call that reached it was wasted. Each ranked
 *  candidate is now called once (tiny prompt, 20 s cap) and only models that
 *  return real content are listed, in rank order. A 429 / quota at probe time
 *  is transient on free tiers → kept. If nothing passes (provider outage) the
 *  unverified rank is kept rather than emptying the fallback chain. */
const VERIFY_TIMEOUT_MS = 20_000;
const KEEP_ON: ReadonlySet<HealthStatus> = new Set(["healthy", "quota_exceeded"]);

async function keepAnswering(
  provider: string,
  ranked: string[],
): Promise<{ kept: string[]; dropped: { model: string; status: HealthStatus }[] }> {
  if (ranked.length === 0) return { kept: ranked, dropped: [] };
  const results = await checkModelsBatch(
    ranked.map((model) => ({ provider, model })),
    { timeoutMs: VERIFY_TIMEOUT_MS, concurrency: 4 },
  );
  const kept: string[] = [];
  const dropped: { model: string; status: HealthStatus }[] = [];
  ranked.forEach((model, i) => {
    const status = results[i]?.status ?? "error";
    if (KEEP_ON.has(status)) kept.push(model);
    else dropped.push({ model, status });
  });
  if (kept.length === 0) {
    console.warn(`[refresh-models] ${provider}: no candidate answered the probe — keeping the unverified rank`);
    return { kept: ranked, dropped: [] };
  }
  return { kept, dropped };
}

export async function POST(request: Request) {
  if (!isCronAuthorised(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const config: Record<string, string[]> = {};
  const summary: Record<string, number> = {};
  const droppedByProbe: Record<string, { model: string; status: HealthStatus }[]> = {};
  // S31-A: models the health check pruned in the last 7 days stay out.
  const pruned = recentlyPruned(readStrikes());

  // ── OpenRouter (public catalogue — the richest source of free models) ──
  const orAll = await fetchJson("https://openrouter.ai/api/v1/models");
  const orFree = filterFreeOpenRouter(orAll);
  if (orFree.length > 0) {
    const verified = await keepAnswering("openrouter", rank(orFree, 12, pruned.openrouter ?? new Set())); // top 12 strongest free models — wider fallback breadth
    config.openrouter = verified.kept;
    summary.openrouter = config.openrouter.length;
    if (verified.dropped.length) droppedByProbe.openrouter = verified.dropped;
  }

  // ── OpenAI-compatible free-tier providers (best-effort, need their key) ──
  const oaiProviders: { provider: string; url: string; env?: string }[] = [
    { provider: "groq", url: "https://api.groq.com/openai/v1/models", env: "GROQ_API_KEY" },
    { provider: "cerebras", url: "https://api.cerebras.ai/v1/models", env: "CEREBRAS_API_KEY" },
    { provider: "sambanova", url: "https://api.sambanova.ai/v1/models", env: "SAMBANOVA_API_KEY" },
  ];
  for (const { provider, url, env } of oaiProviders) {
    const key = (env && process.env[env]) || (await dbKey(provider));
    if (!key) continue;
    const models = await fetchJson(url, { Authorization: `Bearer ${key}` });
    const verified = await keepAnswering(provider, rank(models, 12, pruned[provider] ?? new Set())); // top 12 strongest free models — wider fallback breadth
    const ranked = verified.kept;
    if (verified.dropped.length) droppedByProbe[provider] = verified.dropped;
    if (ranked.length > 0) {
      config[provider] = ranked;
      summary[provider] = ranked.length;
    }
  }

  if (Object.keys(config).length === 0) {
    return NextResponse.json({ ok: false, error: "No models discovered (all sources failed)" }, { status: 502 });
  }

  const payload = { updatedAt: new Date().toISOString(), ...config };
  try {
    fs.mkdirSync(FREE_MODELS_CONFIG.replace(/\/[^/]+$/, ""), { recursive: true });
    fs.writeFileSync(FREE_MODELS_CONFIG, JSON.stringify(payload, null, 2));
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `Write failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    updatedAt: payload.updatedAt,
    discovered: summary,
    openrouterTop5: config.openrouter?.slice(0, 5) ?? [],
    droppedByProbe,
    excludedPruned: Object.fromEntries(Object.entries(pruned).map(([p, set]) => [p, set.size])),
  });
}
