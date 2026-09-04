// POST /api/cron/ai-model-discovery — weekly (Sun 04:00 UTC)
//
// Crawls OpenRouter/Groq/SambaNova/Cerebras model catalogues, filters for
// truly free entries, ranks by (a) context length, (b) known-good family
// membership, (c) latency from prior health checks. Writes top-10 to
// content/ai-model-candidates.json AND auto-injects top-3 into the active
// chain by prepending into ai-free-models.json.
//
// Falls back to prior candidates list on OpenRouter 500. Throttles 1s
// between provider requests to respect rate limits.
//
// Auth: Bearer CRON_SECRET.

import { NextResponse } from "next/server";
import * as fs from "fs";
import {
  fetchJson,
  filterFreeOpenRouter,
  scoreModel,
  KNOWN_PAID,
  type RawModel,
} from "@/lib/model-discovery";
import { KNOWN_GOOD_FAMILIES, KNOWN_GOOD_FREE_MODELS } from "@/lib/ai/known-good-pool";
import {
  readRegistry,
  writeRegistry,
  CANDIDATES_FILE,
  HEALTH_SNAPSHOT_FILE,
  entryKey,
} from "@/lib/ai/registry";
import { FREE_MODELS_CONFIG } from "@/lib/ai-client";
import { endpointFor } from "@/lib/ai/health-check";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CRON_SECRET = process.env.CRON_SECRET;
const TOP_CANDIDATES = 10;
const AUTO_INJECT = 3;
const THROTTLE_MS = 1_000;

interface Candidate {
  provider: string;
  model: string;
  family: string;
  score: number;
  context_length: number;
  known_good_family: boolean;
  known_latency_ms: number | null;
  discovered_at: string;
}

interface HealthSnapshot {
  results?: { provider: string; model: string; latency_ms: number; healthy: boolean }[];
}

function familyFor(id: string): string {
  const hay = id.toLowerCase();
  for (const f of KNOWN_GOOD_FAMILIES) if (hay.includes(f)) return f;
  const m = hay.match(/(llama|qwen|deepseek|mixtral|mistral|gemma|phi|nemotron|glm|kimi)[-.\d]*/);
  return m ? m[0] : "unknown";
}

function latencyMap(): Map<string, number> {
  const m = new Map<string, number>();
  try {
    const snap = JSON.parse(fs.readFileSync(HEALTH_SNAPSHOT_FILE, "utf8")) as HealthSnapshot;
    for (const r of snap.results ?? []) {
      if (r.healthy) m.set(`${r.provider}::${r.model}`, r.latency_ms);
    }
  } catch { /* first run */ }
  return m;
}

function rankToCandidates(provider: string, models: RawModel[]): Candidate[] {
  const lat = latencyMap();
  const now = new Date().toISOString();
  return models
    .filter((m) => !!m.id && !KNOWN_PAID.has(m.id))
    .map((m) => {
      const family = familyFor(m.id);
      const known = KNOWN_GOOD_FAMILIES.includes(family);
      const ctx = m.context_length ?? m.top_provider?.context_length ?? 0;
      // Base score from model-discovery ranker
      const base = scoreModel(m.id, m.name ?? "", ctx, {
        maxCompletionTokens: m.top_provider?.max_completion_tokens,
        created: m.created,
        isModerated: m.top_provider?.is_moderated,
      });
      if (base < 0) return null;
      const knownLat = lat.get(`${provider}::${m.id}`) ?? null;
      // Composite: base + family bonus + latency bonus (faster = better)
      const familyBonus = known ? 15 : 0;
      const latencyBonus = knownLat !== null ? Math.max(0, 10 - knownLat / 500) : 0;
      return {
        provider,
        model: m.id,
        family,
        score: Math.round((base + familyBonus + latencyBonus) * 100) / 100,
        context_length: ctx,
        known_good_family: known,
        known_latency_ms: knownLat,
        discovered_at: now,
      } as Candidate;
    })
    .filter((c): c is Candidate => c !== null)
    .sort((a, b) => b.score - a.score);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((res) => setTimeout(res, ms));
}

export async function POST(request: Request): Promise<NextResponse> {
  const auth = request.headers.get("authorization");
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const allCandidates: Candidate[] = [];
  const perProvider: Record<string, number> = {};
  const errors: Record<string, string> = {};

  // OpenRouter — public catalogue, no auth needed
  try {
    const raw = await fetchJson("https://openrouter.ai/api/v1/models");
    const free = filterFreeOpenRouter(raw);
    const c = rankToCandidates("openrouter", free);
    allCandidates.push(...c);
    perProvider.openrouter = c.length;
  } catch (err) {
    errors.openrouter = err instanceof Error ? err.message : String(err);
  }
  await sleep(THROTTLE_MS);

  // OpenAI-compatible providers
  const keyed: { provider: string; url: string; envKey: string }[] = [
    { provider: "groq", url: "https://api.groq.com/openai/v1/models", envKey: "GROQ_API_KEY" },
    { provider: "cerebras", url: "https://api.cerebras.ai/v1/models", envKey: "CEREBRAS_API_KEY" },
    { provider: "sambanova", url: "https://api.sambanova.ai/v1/models", envKey: "SAMBANOVA_API_KEY" },
  ];
  for (const { provider, url, envKey } of keyed) {
    const key = process.env[envKey];
    if (!key) { errors[provider] = `no ${envKey}`; continue; }
    try {
      const raw = await fetchJson(url, { Authorization: `Bearer ${key}` });
      const c = rankToCandidates(provider, raw);
      allCandidates.push(...c);
      perProvider[provider] = c.length;
    } catch (err) {
      errors[provider] = err instanceof Error ? err.message : String(err);
    }
    await sleep(THROTTLE_MS);
  }

  // If total discovery failed (e.g. OpenRouter 500 + no keys), keep prior list.
  const priorReg = readRegistry(true);
  const usePrior = allCandidates.length === 0 && (priorReg.candidates_discovered?.length ?? 0) > 0;
  const top = usePrior
    ? priorReg.candidates_discovered.slice(0, TOP_CANDIDATES)
    : allCandidates.slice(0, TOP_CANDIDATES);

  // Persist candidates file (atomic).
  const candidatesPayload = {
    updated_at: new Date().toISOString(),
    fallback_used: usePrior,
    provider_counts: perProvider,
    errors,
    candidates: top,
  };
  try {
    const tmp = `${CANDIDATES_FILE}.tmp.${process.pid}.${Date.now()}`;
    fs.writeFileSync(tmp, JSON.stringify(candidatesPayload, null, 2));
    fs.renameSync(tmp, CANDIDATES_FILE);
  } catch (err) {
    console.error("[ai-model-discovery] candidates write failed", err);
  }

  // Auto-inject top-3 fresh (dedup against existing chain).
  let injected = 0;
  if (!usePrior && allCandidates.length > 0) {
    injected = injectTop(allCandidates.slice(0, AUTO_INJECT));
  }

  // Update registry candidates_discovered field.
  const reg = readRegistry(true);
  reg.candidates_discovered = top.map((c) => ({
    provider: c.provider,
    model: c.model,
    family: "family" in c ? c.family : undefined,
    discovered_at: "discovered_at" in c ? c.discovered_at : new Date().toISOString(),
  }));
  reg.updated_at = new Date().toISOString();
  writeRegistry(reg);

  return NextResponse.json({
    ok: true,
    total_discovered: allCandidates.length,
    provider_counts: perProvider,
    top_candidates: top.slice(0, 5).map((c) => "model" in c ? `${c.provider}/${c.model}` : ""),
    auto_injected: injected,
    fallback_used: usePrior,
    errors,
  });
}

interface FreeModelsFile { updatedAt?: string; [k: string]: unknown }

function injectTop(top: Candidate[]): number {
  let file: FreeModelsFile = {};
  try { file = JSON.parse(fs.readFileSync(FREE_MODELS_CONFIG, "utf8")) as FreeModelsFile; } catch { /* new */ }
  const grouped = new Map<string, string[]>();
  for (const c of top) {
    if (!endpointFor(c.provider)) continue;
    const arr = grouped.get(c.provider) ?? [];
    arr.push(c.model);
    grouped.set(c.provider, arr);
  }
  let added = 0;
  for (const [provider, fresh] of grouped) {
    const existing = (file[provider] as string[] | undefined) ?? [];
    const seen = new Set<string>();
    const merged: string[] = [];
    for (const id of [...fresh, ...existing]) {
      if (seen.has(id)) continue;
      seen.add(id);
      merged.push(id);
      if (!existing.includes(id)) added++;
      if (merged.length >= 15) break;
    }
    file[provider] = merged;
  }
  file.updatedAt = new Date().toISOString();
  try {
    const tmp = `${FREE_MODELS_CONFIG}.tmp.${process.pid}.${Date.now()}`;
    fs.mkdirSync(FREE_MODELS_CONFIG.replace(/\/[^/]+$/, ""), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(file, null, 2));
    fs.renameSync(tmp, FREE_MODELS_CONFIG);
  } catch (err) {
    console.error("[ai-model-discovery] inject write failed", err);
    return 0;
  }
  // Silence lint unused import if we didn't reference KNOWN_GOOD_FREE_MODELS elsewhere
  void KNOWN_GOOD_FREE_MODELS;
  void entryKey;
  return added;
}
