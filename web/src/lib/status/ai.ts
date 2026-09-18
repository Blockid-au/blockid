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
export type AiStatus = {
  providers: ProviderRow[] | null;
  budget_exhausted_1h: number | null;
  interactive_order: string[] | null;
  model_health: ModelHealth | null;
  fully_degraded_24h: number;
};

type Snapshot = { providers?: unknown; budget_exhausted_1h?: unknown; interactive_order?: unknown };
export type SnapshotFn = () => Snapshot | Promise<Snapshot>;

/** Coerce whatever the dispatcher returns into the documented shape. Exported for tests. */
export function normaliseSnapshot(snap: unknown): Pick<AiStatus, "providers" | "budget_exhausted_1h" | "interactive_order"> {
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
