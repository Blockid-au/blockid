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

import { NextResponse } from "next/server";
import * as fs from "fs";
import { FREE_MODELS_CONFIG } from "@/lib/ai-client";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const CRON_SECRET = process.env.CRON_SECRET;

interface RawModel { id: string; name?: string; context_length?: number }

// Rank a model by capability — higher = stronger. Returns -1 for non-chat /
// specialized models we never want in the report fallback chain.
function scoreModel(id: string, name = "", ctx = 0): number {
  const hay = `${id} ${name}`.toLowerCase();
  if (/guard|safety|moderation|content-safety|embed|rerank|\btts\b|whisper|\bstt\b|image|audio|vision-only|moderat/.test(hay)) {
    return -1;
  }
  const FAM: [RegExp, number][] = [
    [/deepseek.*(v4|r1|v3\.2|v3\.1)/, 96],
    [/kimi.?k2/, 94],
    [/minimax/, 90],
    [/qwen3.*(coder|235b|480b|max|next)/, 90],
    [/glm-?(5|4\.6|4\.5)/, 88],
    [/nemotron.*(ultra|super|253b|340b|550b)/, 88],
    [/llama-?4/, 86],
    [/qwen3/, 84],
    [/gpt-oss-120b/, 84],
    [/llama-3\.3-70b/, 82],
    [/hermes-3.*405b/, 80],
    [/gemma-?(3-27b|4)/, 76],
    [/nemotron.*(nano|30b|12b|9b)/, 62],
    [/(3b|1b|nano|mini|small|\bxs\b|tiny|lite)/, 42],
  ];
  let fam = 55;
  for (const [re, s] of FAM) if (re.test(hay)) { fam = s; break; }
  const pm = hay.match(/(\d{2,4})\s?b\b/);
  const paramB = pm ? parseInt(pm[1], 10) : 0;
  const paramScore = paramB ? Math.min(30, Math.log2(paramB + 1) * 4) : 8;
  const ctxScore = ctx ? Math.min(15, Math.log10(ctx) * 2.5) : 0;
  return fam + paramScore + ctxScore;
}

function rank(models: RawModel[], topN: number): string[] {
  return models
    .map((m) => ({ id: m.id, s: scoreModel(m.id, m.name, m.context_length) }))
    .filter((m) => m.s >= 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, topN)
    .map((m) => m.id);
}

async function fetchJson(url: string, headers: Record<string, string> = {}): Promise<RawModel[]> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20_000);
  try {
    const res = await fetch(url, { headers, signal: ctrl.signal });
    if (!res.ok) return [];
    const data = await res.json();
    return (data?.data ?? []) as RawModel[];
  } catch {
    return [];
  } finally {
    clearTimeout(t);
  }
}

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
  const orFree = orAll.filter((m) => {
    const p = (m as RawModel & { pricing?: { prompt?: string; completion?: string } }).pricing;
    const zero = (v?: string) => v === "0" || v === "0.0" || v === "0.00";
    return p && zero(p.prompt) && zero(p.completion);
  });
  if (orFree.length > 0) {
    config.openrouter = rank(orFree, 5); // top 5 strongest free models
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
    const ranked = rank(models, 5); // top 5 strongest free models
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
