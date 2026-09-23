// G28-B — run-scoped provider strikes.
//
// The process-wide cooldown in ai-client (`providerCooldown`, 2 min generic /
// 15 min on a 429) only fires AFTER a provider's whole model ladder failed —
// and every parallel call of one report run walks that ladder on its own.
// BlockID's own showcase runs on 2026-09-21: six W1 calls each sat through
// DeepInfra `Worker timeout (120s)` × 2–3 models (`showcase-rerun5/6.log`),
// one W1 wave took 437 s of a 480 s budget, W4 had nothing left and all
// eight chapters degraded → no report.
//
// A `RunStrikeLedger` lives for ONE pipeline run (the aiCaller closure
// creates it; nothing survives the run). Every worker timeout or
// `engine_overloaded` / 429 answer a provider gives during that run is one
// strike; at RUN_STRIKE_THRESHOLD (2) the provider is skipped for the rest
// of the run — inside its own model ladder (no third model) and in the
// provider loop of every later call — so the chain falls through to Gemini /
// Claude CLI / Groq within one timeout instead of one timeout per model per
// call. The provider order itself is untouched (DeepInfra stays first; the
// Claude CLI subscription stays the last Anthropic fallback); the next run
// starts with an empty ledger.
//
// Pure module: no I/O, no globals — the tests drive it with plain errors.

export const RUN_STRIKE_THRESHOLD_DEFAULT = 2;

/** Strikes before a provider is skipped for the rest of the run (env `AI_RUN_STRIKE_THRESHOLD`, min 1). */
export function runStrikeThreshold(): number {
  const n = Number(process.env.AI_RUN_STRIKE_THRESHOLD ?? "");
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : RUN_STRIKE_THRESHOLD_DEFAULT;
}

export type RunStrikeKind = "timeout" | "overloaded";

const TIMEOUT_RE = /worker timeout|\btimed? ?out\b|\betimedout\b|deadline exceeded|socket hang up/i;
const OVERLOADED_RE = /engine_overloaded|\boverloaded\b|\b429\b|rate.?limit|too many requests|resource_exhausted|model busy|\bcapacity\b/i;

/**
 * Which strike an error counts as, or null when it is not a strike (a 401,
 * a 404 model id, a JSON parse error, an empty answer — those already have
 * their own cooldowns and say nothing about the provider being slow).
 */
export function classifyRunStrike(err: unknown): RunStrikeKind | null {
  const msg = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  if (!msg) return null;
  if (TIMEOUT_RE.test(msg)) return "timeout";
  if (OVERLOADED_RE.test(msg)) return "overloaded";
  return null;
}

export class RunStruckError extends Error {
  constructor(readonly provider: string, readonly strikes: number) {
    super(`${provider} skipped for the rest of this run after ${strikes} strikes (slow or busy answers)`);
    this.name = "RunStruckError";
  }
}

export class RunStrikeLedger {
  private readonly counts = new Map<string, number>();
  private readonly kinds = new Map<string, Record<RunStrikeKind, number>>();
  /** Errors already counted — a ladder records the attempt, callAI's catch sees the same object again. */
  private readonly counted = new WeakSet<object>();
  readonly threshold: number;
  readonly createdAt: number;

  constructor(threshold: number = runStrikeThreshold(), now: number = Date.now()) {
    this.threshold = Math.max(1, Math.floor(threshold));
    this.createdAt = now;
  }

  /** Count `err` against `provider` when it is a timeout / overloaded answer. Returns the kind counted, or null. */
  note(provider: string, err: unknown): RunStrikeKind | null {
    const kind = classifyRunStrike(err);
    if (!kind) return null;
    if (typeof err === "object" && err !== null) {
      if (this.counted.has(err)) return null;
      this.counted.add(err);
    }
    this.counts.set(provider, (this.counts.get(provider) ?? 0) + 1);
    const k = this.kinds.get(provider) ?? { timeout: 0, overloaded: 0 };
    k[kind] += 1;
    this.kinds.set(provider, k);
    return kind;
  }

  strikes(provider: string): number {
    return this.counts.get(provider) ?? 0;
  }

  /** True once the provider reached the threshold — skip it for the rest of the run. */
  struck(provider: string): boolean {
    return this.strikes(provider) >= this.threshold;
  }

  struckProviders(): string[] {
    // Scoped DeepInfra timeouts use provider/model keys. Keep those in the
    // detailed snapshot without claiming the entire provider is unavailable.
    return [...this.counts.entries()].filter(([p, n]) => !p.includes("/") && n >= this.threshold).map(([p]) => p);
  }

  /** Provider or provider/model scope → failure counts for run telemetry. */
  snapshot(): Record<string, { strikes: number; timeout: number; overloaded: number }> {
    const out: Record<string, { strikes: number; timeout: number; overloaded: number }> = {};
    for (const [p, n] of this.counts) {
      const k = this.kinds.get(p) ?? { timeout: 0, overloaded: 0 };
      out[p] = { strikes: n, timeout: k.timeout, overloaded: k.overloaded };
    }
    return out;
  }
}

/** One ledger per pipeline run — call it inside the run's aiCaller factory, never at module scope. */
export function createRunStrikeLedger(threshold?: number): RunStrikeLedger {
  return new RunStrikeLedger(threshold);
}

/** Minimal shape ai-client reads off `AICallOptions.runStrikes` (so callers may inject a fake). */
export interface RunStrikeSink {
  note(provider: string, err: unknown): RunStrikeKind | null;
  struck(provider: string): boolean;
  strikes(provider: string): number;
}
