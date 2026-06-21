// POST /api/cron/discover-models — emergency on-demand augmentation that adds
// strong NEW free models to the list when the running chain starts hitting
// rate limits. Complements /api/cron/refresh-models (daily full refresh).
//
// Behavior: pull each provider's catalogue, find the strongest models that are
// NOT already in ai-free-models.json, and PREPEND them so the next request
// picks them up first (5-min cache TTL in ai-client.ts).
//
// Triggered by:
//   1. coolDownModel() in ai-client.ts when ≥2 rate-limit events fire in 5 min
//      (fire-and-forget, throttled to once per 30 min via discoverDebounce)
//   2. Weekly cron entry (Sun 04:00 UTC) for proactive freshness
//
// Auth: Bearer CRON_SECRET.

import { NextResponse } from "next/server";
import * as fs from "fs";
import { FREE_MODELS_CONFIG } from "@/lib/ai-client";
import { getSupabaseAdmin } from "@/lib/supabase";
import { fetchJson, filterFreeOpenRouter, rank } from "@/lib/model-discovery";

export const dynamic = "force-dynamic";

const CRON_SECRET = process.env.CRON_SECRET;
const NEW_PER_PROVIDER = 3; // top-3 strongest NEW models added per provider per call
const MAX_LIST_LEN = 15;    // hard cap so list never grows unbounded

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

interface CurrentList {
  updatedAt?: string;
  openrouter?: string[];
  groq?: string[];
  cerebras?: string[];
  sambanova?: string[];
  [key: string]: string[] | string | undefined;
}

function readCurrent(): CurrentList {
  try {
    return JSON.parse(fs.readFileSync(FREE_MODELS_CONFIG, "utf-8")) as CurrentList;
  } catch {
    return {};
  }
}

function prependDedupCap(existing: string[] | undefined, fresh: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of [...fresh, ...(existing ?? [])]) {
    if (!seen.has(id)) { seen.add(id); out.push(id); }
    if (out.length >= MAX_LIST_LEN) break;
  }
  return out;
}

export async function POST(request: Request) {
  const auth = request.headers.get("authorization");
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const current = readCurrent();
  const added: Record<string, string[]> = {};

  // ── OpenRouter — biggest source of NEW free models ──
  const orAll = await fetchJson("https://openrouter.ai/api/v1/models");
  const orFree = filterFreeOpenRouter(orAll);
  if (orFree.length > 0) {
    const exclude = new Set(current.openrouter ?? []);
    const fresh = rank(orFree, NEW_PER_PROVIDER, exclude);
    if (fresh.length > 0) added.openrouter = fresh;
  }

  // ── OpenAI-compatible free-tier providers ──
  const oaiProviders: { provider: string; url: string; env?: string }[] = [
    { provider: "groq", url: "https://api.groq.com/openai/v1/models", env: "GROQ_API_KEY" },
    { provider: "cerebras", url: "https://api.cerebras.ai/v1/models", env: "CEREBRAS_API_KEY" },
    { provider: "sambanova", url: "https://api.sambanova.ai/v1/models", env: "SAMBANOVA_API_KEY" },
  ];
  for (const { provider, url, env } of oaiProviders) {
    const key = (env && process.env[env]) || (await dbKey(provider));
    if (!key) continue;
    const models = await fetchJson(url, { Authorization: `Bearer ${key}` });
    const exclude = new Set((current[provider] as string[] | undefined) ?? []);
    const fresh = rank(models, NEW_PER_PROVIDER, exclude);
    if (fresh.length > 0) added[provider] = fresh;
  }

  // Nothing new — return early without rewriting the file
  if (Object.keys(added).length === 0) {
    return NextResponse.json({
      ok: true,
      noChange: true,
      reason: "No new strong free models discovered beyond current list",
    });
  }

  // Merge: prepend fresh ones in front of existing, dedupe, cap length
  const merged: CurrentList = { updatedAt: new Date().toISOString() };
  for (const provider of ["openrouter", "groq", "cerebras", "sambanova"] as const) {
    const existing = current[provider];
    const fresh = added[provider];
    if (fresh && fresh.length > 0) {
      merged[provider] = prependDedupCap(existing, fresh);
    } else if (existing) {
      merged[provider] = existing;
    }
  }

  try {
    fs.mkdirSync(FREE_MODELS_CONFIG.replace(/\/[^/]+$/, ""), { recursive: true });
    fs.writeFileSync(FREE_MODELS_CONFIG, JSON.stringify(merged, null, 2));
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `Write failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    updatedAt: merged.updatedAt,
    added,
    totalListSizes: Object.fromEntries(
      (["openrouter", "groq", "cerebras", "sambanova"] as const)
        .map((p) => [p, (merged[p] as string[] | undefined)?.length ?? 0]),
    ),
  });
}
