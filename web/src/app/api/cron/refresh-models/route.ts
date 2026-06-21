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

export const dynamic = "force-dynamic";

const CRON_SECRET = process.env.CRON_SECRET;

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

export async function POST(request: Request) {
  const auth = request.headers.get("authorization");
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const config: Record<string, string[]> = {};
  const summary: Record<string, number> = {};

  // ── OpenRouter (public catalogue — the richest source of free models) ──
  const orAll = await fetchJson("https://openrouter.ai/api/v1/models");
  const orFree = filterFreeOpenRouter(orAll);
  if (orFree.length > 0) {
    config.openrouter = rank(orFree, 8); // top 8 strongest free models — wider fallback breadth
    summary.openrouter = config.openrouter.length;
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
    const ranked = rank(models, 8); // top 8 strongest free models — wider fallback breadth
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
  });
}
