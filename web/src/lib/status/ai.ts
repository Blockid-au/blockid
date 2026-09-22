// G15-R2 — /api/status.ai: provider dispatcher state + model-probe health +
// degraded-report counter.
//
//   providers / budget_exhausted_1h / interactive_order
//       from lib/ai-client getProviderHealthSnapshot() (G15-R3). Imported
//       dynamically inside try/catch — while R3 is unmerged the export is
//       missing and these three are null.
//   model_health   content/ai-model-health.json (hourly probe cron)
//   fully_degraded_24h
//       rows in content/reports/report-pipeline-health.jsonl (R3) in the last
//       24 h — every one is a founder-facing report that went out on the
//       template fallback.
//
// Returns null only when nothing at all could be read.

import { readJsonFile, readJsonlTail, withinLast, getStatusRoot } from "./jsonl";

export const AI_MODEL_HEALTH_FILE = "content/ai-model-health.json";
export const REPORT_PIPELINE_HEALTH_FILE = "report-pipeline-health.jsonl";

export type ProviderState = "ok" | "cooldown" | "blocked";
export type ProviderRow = { name: string; state: ProviderState; cooldown_until: string | null; reason?: string };
export type ModelHealth = { updated_at: string; total: number; healthy: number; quota_exceeded: number };
/** G29-A: one ladder provider's dead-rung verdict (lib/ai/model-strikes providerCapacity). */
export type DeadRungRow = { state: "ok" | "degraded" | "unfunded"; dead: string[]; total: number; reason?: string; until: string | null };
export type AiStatus = {
  providers: ProviderRow[] | null;
  budget_exhausted_1h: number | null;
  interactive_order: string[] | null;
  /** G29-A: configured providers in state `ok`; null when the dispatcher is unavailable. */
  healthy_providers: number | null;
  /** G29-A: providers whose every rung is dead or that answered 402 in the last 24 h — founder item #9. */
  unfunded: string[];
  /** G29-A: dead rungs per ladder provider. */
  dead_rungs: Record<string, DeadRungRow>;
  model_health: ModelHealth | null;
  fully_degraded_24h: number;
};

type Snapshot = { providers?: unknown; budget_exhausted_1h?: unknown; interactive_order?: unknown; healthy_providers?: unknown; unfunded?: unknown; dead_rungs?: unknown };
export type SnapshotFn = () => Snapshot | Promise<Snapshot>;

function normaliseDeadRungs(raw: unknown): Record<string, DeadRungRow> {
  const out: Record<string, DeadRungRow> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [provider, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== "object") continue;
    const r = v as Record<string, unknown>;
    const state: DeadRungRow["state"] = r.state === "unfunded" || r.state === "degraded" ? r.state : "ok";
    const row: DeadRungRow = {
      state,
      dead: Array.isArray(r.dead) ? r.dead.filter((x): x is string => typeof x === "string").slice(0, 30) : [],
      total: typeof r.total === "number" && Number.isFinite(r.total) ? r.total : 0,
      until: typeof r.until === "string" ? r.until : null,
    };
    if (typeof r.reason === "string" && r.reason) row.reason = r.reason.slice(0, 40);
    out[provider] = row;
  }
  return out;
}

/** Coerce whatever the dispatcher returns into the documented shape. Exported for tests. */
export function normaliseSnapshot(snap: unknown): Pick<AiStatus, "providers" | "budget_exhausted_1h" | "interactive_order" | "healthy_providers" | "unfunded" | "dead_rungs"> {
  const s = (snap && typeof snap === "object" ? snap : {}) as Snapshot;
  const providers: ProviderRow[] | null = Array.isArray(s.providers)
    ? (s.providers as Array<Record<string, unknown>>)
        .filter((p) => p && typeof p === "object" && typeof p.name === "string")
        .map((p) => {
          const state: ProviderState = p.state === "cooldown" || p.state === "blocked" ? p.state : "ok";
          const row: ProviderRow = { name: String(p.name), state, cooldown_until: typeof p.cooldown_until === "string" ? p.cooldown_until : null };
          if (typeof p.reason === "string" && p.reason) row.reason = p.reason.slice(0, 120);
          return row;
        })
    : null;
  return {
    providers,
    budget_exhausted_1h: typeof s.budget_exhausted_1h === "number" && Number.isFinite(s.budget_exhausted_1h) ? s.budget_exhausted_1h : null,
    interactive_order: Array.isArray(s.interactive_order) ? s.interactive_order.filter((x): x is string => typeof x === "string") : null,
    // G29-A: an older dispatcher (no field) → derive the count from the rows when we have them.
    healthy_providers: typeof s.healthy_providers === "number" && Number.isFinite(s.healthy_providers)
      ? s.healthy_providers
      : providers ? providers.filter((p) => p.state === "ok").length : null,
    unfunded: Array.isArray(s.unfunded) ? s.unfunded.filter((x): x is string => typeof x === "string") : [],
    dead_rungs: normaliseDeadRungs(s.dead_rungs),
  };
}

export function normaliseModelHealth(raw: unknown): ModelHealth | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  if (typeof r.updated_at !== "string") return null;
  return { updated_at: r.updated_at, total: num(r.total), healthy: num(r.healthy), quota_exceeded: num(r.quota_exceeded) };
}

async function loadSnapshotFn(): Promise<SnapshotFn | null> {
  try {
    const mod = (await import("@/lib/ai-client")) as Record<string, unknown>;
    const fn = mod.getProviderHealthSnapshot;
    return typeof fn === "function" ? (fn as SnapshotFn) : null;
  } catch {
    return null;
  }
}

export async function readAiStatus(
  root: string = getStatusRoot(),
  now: number = Date.now(),
  deps: { snapshot?: SnapshotFn | null } = {},
): Promise<AiStatus | null> {
  let dispatcher = normaliseSnapshot(null);
  try {
    const fn = deps.snapshot === undefined ? await loadSnapshotFn() : deps.snapshot;
    if (fn) dispatcher = normaliseSnapshot(await fn());
  } catch {
    // dispatcher unavailable → nulls
  }
  const [health, degraded] = await Promise.all([
    readJsonFile(root, AI_MODEL_HEALTH_FILE).catch(() => null),
    readJsonlTail<{ ts?: unknown }>(root, REPORT_PIPELINE_HEALTH_FILE, 500).catch(() => [] as Array<{ ts?: unknown }>),
  ]);
  const model_health = normaliseModelHealth(health);
  const fully_degraded_24h = degraded.filter((r) => withinLast(r.ts, 24 * 60 * 60 * 1000, now)).length;
  if (!dispatcher.providers && !model_health && degraded.length === 0) return null;
  return { ...dispatcher, model_health, fully_degraded_24h };
}
