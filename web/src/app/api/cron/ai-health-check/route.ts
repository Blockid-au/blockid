// POST /api/cron/ai-health-check — every 30 min
//
// Pings every active + candidate model with a tiny prompt, records latency
// and status, writes:
//   - content/ai-model-health.jsonl (append-only log)
//   - content/ai-model-health.json (current snapshot)
//   - content/ai-provider-registry.json (unified snapshot for both sites)
//
// On new quota-exceeded degradations: auto-injects up to 3 backup models
// from the KNOWN_GOOD_FREE_MODELS pool (skipping providers without keys or
// models already active) and alerts via Telegram.
//
// S31-A additions:
//   - provider-level validity probe (lib/ai/provider-status.ts) — one cheap
//     call per configured provider, result written to
//     content/reports/ai-provider-status.json and surfaced as `providers`
//     here and as `ai_providers` on /api/status;
//   - dead-model pruning (lib/ai/model-strikes.ts): a model that fails
//     AI_MODEL_PRUNE_STRIKES (3) consecutive checks is removed from
//     ai-free-models.json and kept out of refresh/discovery for 7 days.
//
// Auth: Bearer CRON_SECRET.

import { NextResponse } from "next/server";
import * as fs from "fs";
import { checkModelsBatch, endpointFor, type HealthResult } from "@/lib/ai/health-check";
import {
  readRegistry,
  writeRegistry,
  persistHealthResults,
  nextBackoffMs,
  pruneDegraded,
  entryKey,
  type Registry,
  type RegistryEntry,
  type DegradedEntry,
} from "@/lib/ai/registry";
import { KNOWN_GOOD_FREE_MODELS, poolWithKeys } from "@/lib/ai/known-good-pool";
import { FREE_MODELS_CONFIG } from "@/lib/ai-client";
import { sendTelegram, mdEscape } from "@/lib/telegram";
import { isCronAuthorised } from "@/lib/security/cron-auth";
import { probeProviders, type ProviderStatusFile } from "@/lib/ai/provider-status";
import { applyHealthResults, compactStrikes, pruneDeadModels, pruneThreshold, readStrikes, writeStrikes } from "@/lib/ai/model-strikes";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_BACKUPS_INJECTED = 3;
const CHECK_TIMEOUT_MS = 5_000;
const CHECK_CONCURRENCY = 6;

function providerHasKey(provider: string): boolean {
  const ep = endpointFor(provider);
  if (!ep) return false;
  if (!process.env[ep.envKey]) return false;
  if (provider === "cloudflare" && !process.env.CF_ACCOUNT_ID) return false;
  return true;
}

interface FreeModelsFile {
  updatedAt?: string;
  openrouter?: string[];
  groq?: string[];
  cerebras?: string[];
  sambanova?: string[];
  [k: string]: unknown;
}

/** Read the active chain from ai-free-models.json. */
function readActiveTargets(): { provider: string; model: string }[] {
  let file: FreeModelsFile = {};
  try {
    file = JSON.parse(fs.readFileSync(FREE_MODELS_CONFIG, "utf8")) as FreeModelsFile;
  } catch { /* first-run — falls back to pool below */ }
  const out: { provider: string; model: string }[] = [];
  for (const provider of ["groq", "cerebras", "sambanova", "openrouter"] as const) {
    const list = file[provider];
    if (Array.isArray(list)) {
      for (const model of list) {
        if (typeof model === "string") out.push({ provider, model });
      }
    }
  }
  return out;
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!isCronAuthorised(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // Compose target set: active chain + known-good pool (dedup, only providers with keys).
  const active = readActiveTargets().filter((t) => providerHasKey(t.provider));
  const pool = poolWithKeys(providerHasKey).map((m) => ({ provider: m.provider, model: m.model }));
  const seen = new Set<string>();
  const targets = [...active, ...pool].filter((t) => {
    const k = entryKey(t);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  if (targets.length === 0) {
    return NextResponse.json({ ok: false, error: "No targets (no keys? no config?)" }, { status: 500 });
  }

  // S31-A provider-level validity probe runs alongside the model pings.
  const providerProbe: Promise<ProviderStatusFile | null> = probeProviders({ force: true }).catch((err) => {
    console.warn(`[ai-health-check] provider probe failed: ${err instanceof Error ? err.message : err}`);
    return null;
  });

  const results = await checkModelsBatch(targets, {
    timeoutMs: CHECK_TIMEOUT_MS,
    concurrency: CHECK_CONCURRENCY,
  });
  persistHealthResults(results);

  // S31-A dead-model pruning — N consecutive failed checks drop the model from
  // the active list so the dispatcher stops paying a retry + cooldown for it.
  const strikes = applyHealthResults(readStrikes(), results);
  const pruned = pruneActiveModels(strikes);
  writeStrikes(compactStrikes(pruned.strikes));
  const prunedKeys = new Set(Object.entries(pruned.removed).flatMap(([p, ms]) => ms.map((m) => entryKey({ provider: p, model: m }))));

  const prior = pruneDegraded(readRegistry(true));
  const priorDegradedByKey = new Map<string, DegradedEntry>(prior.degraded.map((d) => [entryKey(d), d]));

  const nowIso = new Date().toISOString();
  const activeKeys = new Set(active.filter((t) => !prunedKeys.has(entryKey(t))).map(entryKey));

  // Update degraded list — add newly-quota'd, keep still-in-window ones, drop recovered.
  const nextDegraded: DegradedEntry[] = [];
  const newlyDegraded: DegradedEntry[] = [];
  const resultByKey = new Map<string, HealthResult>(results.map((r) => [entryKey(r), r]));

  for (const r of results) {
    const key = entryKey(r);
    if (!r.quota_exceeded) continue;
    const priorEntry = priorDegradedByKey.get(key);
    const backoff = nextBackoffMs(priorEntry);
    const entry: DegradedEntry = {
      provider: r.provider,
      model: r.model,
      degraded_until: new Date(Date.now() + backoff).toISOString(),
      reason: r.error ?? "quota_exceeded",
      backoff_ms: backoff,
      first_degraded_at: priorEntry?.first_degraded_at ?? nowIso,
    };
    nextDegraded.push(entry);
    if (!priorEntry) newlyDegraded.push(entry);
  }
  // Keep degraded entries that weren't retested this run but are still in window.
  const testedKeys = new Set(results.map(entryKey));
  for (const [k, d] of priorDegradedByKey) {
    if (!testedKeys.has(k) && d.degraded_until > nowIso) nextDegraded.push(d);
  }

  // Primary chain — active targets ranked by healthy first, latency asc.
  const primaryChain: RegistryEntry[] = active
    .filter((t) => !prunedKeys.has(entryKey(t)))
    .map((t, i) => {
      const r = resultByKey.get(entryKey(t));
      return {
        provider: t.provider,
        model: t.model,
        priority: i + 1,
        healthy: r?.healthy ?? false,
        latency_ms: r?.latency_ms ?? null,
        last_checked: r?.checked_at ?? null,
        http_status: r?.http_status,
      };
    })
    .sort((a, b) => {
      if (a.healthy !== b.healthy) return a.healthy ? -1 : 1;
      return (a.latency_ms ?? 99999) - (b.latency_ms ?? 99999);
    })
    .map((e, i) => ({ ...e, priority: i + 1 }));

  // Fallback pool — known-good models NOT already in primary chain.
  const primaryKeys = new Set(primaryChain.map(entryKey));
  const fallbackPool: RegistryEntry[] = KNOWN_GOOD_FREE_MODELS
    .filter((m) => providerHasKey(m.provider) && !primaryKeys.has(entryKey(m)))
    .map((m, i) => {
      const r = resultByKey.get(entryKey(m));
      return {
        provider: m.provider,
        model: m.model,
        priority: i + 1,
        healthy: r?.healthy ?? false,
        latency_ms: r?.latency_ms ?? null,
        last_checked: r?.checked_at ?? null,
        http_status: r?.http_status,
      };
    });

  // Auto-inject: for each newly-degraded active model, pick up to N backups
  // from fallback pool (healthy + not already active), and prepend to
  // ai-free-models.json so the AI client picks them up on next 5-min refresh.
  let injectedCount = 0;
  if (newlyDegraded.length > 0) {
    const injections = fallbackPool
      .filter((e) => e.healthy && !activeKeys.has(entryKey(e)))
      .slice(0, MAX_BACKUPS_INJECTED);
    if (injections.length > 0) {
      injectedCount = injectFreeModels(injections);
    }
  }

  const registry: Registry = {
    updated_at: nowIso,
    primary_chain: primaryChain,
    fallback_pool: fallbackPool,
    degraded: nextDegraded,
    candidates_discovered: prior.candidates_discovered ?? [],
  };
  writeRegistry(registry);

  const prunedCount = prunedKeys.size;
  if (newlyDegraded.length > 0 || prunedCount > 0) {
    const lines = [
      `AI health check: ${mdEscape(String(newlyDegraded.length))} new degradation(s), ${mdEscape(String(prunedCount))} model(s) pruned`,
      ...newlyDegraded.slice(0, 6).map((d) => mdEscape(`• ${d.provider}/${d.model} → cooldown ${Math.round(d.backoff_ms / 60000)}m`)),
      ...Object.entries(pruned.removed).slice(0, 6).map(([p, ms]) => mdEscape(`✂ ${p}: ${ms.join(", ")}`)),
      injectedCount > 0 ? mdEscape(`Injected ${injectedCount} backup model(s) from known-good pool.`) : mdEscape("No fresh backups available to inject."),
    ].join("\n");
    await sendTelegram(lines).catch(() => { /* best-effort */ });
  }

  const providers = await providerProbe;
  const providerSummary = providers
    ? Object.fromEntries(Object.values(providers.providers).map((p) => [p.provider, p.status]))
    : null;

  return NextResponse.json({
    ok: true,
    updated_at: nowIso,
    checked: results.length,
    healthy: results.filter((r) => r.healthy).length,
    quota_exceeded: results.filter((r) => r.quota_exceeded).length,
    newly_degraded: newlyDegraded.length,
    injected_backups: injectedCount,
    pruned: pruned.removed,
    prune_threshold: pruneThreshold(),
    primary_chain_size: primaryChain.length,
    fallback_pool_size: fallbackPool.length,
    providers: providerSummary,
  });
}

/** Apply the strike table to ai-free-models.json in place (atomic write).
 *  Returns the prune outcome; a write failure leaves the file untouched and
 *  reports nothing removed so the registry does not drift from disk. */
function pruneActiveModels(strikes: ReturnType<typeof readStrikes>) {
  let file: FreeModelsFile = {};
  try {
    file = JSON.parse(fs.readFileSync(FREE_MODELS_CONFIG, "utf8")) as FreeModelsFile;
  } catch {
    return { config: {}, removed: {}, strikes };
  }
  const outcome = pruneDeadModels(file as Record<string, unknown>, strikes);
  if (Object.keys(outcome.removed).length === 0) return outcome;
  const next = { ...outcome.config, updatedAt: new Date().toISOString() };
  const tmp = `${FREE_MODELS_CONFIG}.tmp.${process.pid}.${Date.now()}`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(next, null, 2));
    fs.renameSync(tmp, FREE_MODELS_CONFIG);
  } catch (err) {
    console.error("[ai-health-check] prune write failed", err);
    return { config: file as Record<string, unknown>, removed: {}, strikes };
  }
  console.warn(`[ai-health-check] pruned dead models: ${JSON.stringify(outcome.removed)}`);
  return outcome;
}

/** Prepend fresh models into ai-free-models.json so ai-client picks them up
 *  on its next 5-min refresh. Returns count actually added. */
function injectFreeModels(entries: RegistryEntry[]): number {
  let file: FreeModelsFile = {};
  try {
    file = JSON.parse(fs.readFileSync(FREE_MODELS_CONFIG, "utf8")) as FreeModelsFile;
  } catch { /* new file */ }

  const grouped = new Map<string, string[]>();
  for (const e of entries) {
    const arr = grouped.get(e.provider) ?? [];
    arr.push(e.model);
    grouped.set(e.provider, arr);
  }

  let added = 0;
  for (const [provider, fresh] of grouped) {
    const existing = (file[provider] as string[] | undefined) ?? [];
    const merged: string[] = [];
    const seen = new Set<string>();
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
  const tmp = `${FREE_MODELS_CONFIG}.tmp.${process.pid}.${Date.now()}`;
  try {
    fs.mkdirSync(FREE_MODELS_CONFIG.replace(/\/[^/]+$/, ""), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(file, null, 2));
    fs.renameSync(tmp, FREE_MODELS_CONFIG);
  } catch (err) {
    console.error("[ai-health-check] inject write failed", err);
    return 0;
  }
  return added;
}
