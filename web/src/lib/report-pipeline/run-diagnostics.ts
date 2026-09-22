// G29-B — degraded-run diagnostics.
//
// A run that ends in `ReportFullyDegradedError` (or throws mid-wave) used to
// leave nothing behind but a quality row with the placeholder audit line: the
// audit dump is written after `runTrustReportForProject` resolves, the
// run-scoped strike ledger (G28-B) lives inside `generateAndPersistReport`'s
// aiCaller closure, and nobody recorded which wave ate the wall clock. The
// 2026-09-21/22 showcase outages were undiagnosable after the fact.
//
// `RunDiagnosticsTracker` observes the orchestrator's events (per-wave
// timings from `progress`, the deadline wave from `done`), and `snapshot()`
// folds in the strike ledger + the thrown error into ONE record that
// run-for-project (a) emits as a `run_diagnostics` event before re-throwing —
// the self-report script writes it into `tbr-audit-latest.json` — and (b)
// copies onto the quality row (`providers_struck`, `deadline_hit_wave`).
//
// Pure module: no I/O, no globals, no provider secrets (provider NAMES only —
// the same names /api/status.ai already publishes).

import type { PipelineEvent } from "./orchestrator";
import type { PipelinePhase } from "./types";

export interface WaveTiming {
  phase: PipelinePhase;
  /** ms since the run started when the phase began. */
  startedAtMs: number;
  /** ms the phase took; null when it was still running at the snapshot. */
  ms: number | null;
}

export interface RunStrikeSnapshot {
  strikes: number;
  timeout: number;
  overloaded: number;
}

export interface RunDiagnostics {
  degraded: true;
  /** The thrown error's message (no stack, no ids). */
  error: string;
  /** Wave the run was in when it threw / when `done` fired. */
  failedWave: PipelinePhase | null;
  /** Wave whose wall-clock race the deadline won (orchestrator `done.deadlineHitPhase`); null when the deadline never fired or the run threw before `done`. */
  deadlineHitWave: PipelinePhase | null;
  deadlineHit: boolean;
  waves: WaveTiming[];
  /** Providers the run-scoped ledger struck out (skipped for the rest of the run). */
  providersStruck: string[];
  /** provider → strikes / timeout / overloaded counts for the whole run. */
  strikes: Record<string, RunStrikeSnapshot>;
  calls: number | null;
  totalMs: number;
}

/** What the tracker needs from the G28-B ledger (RunStrikeLedger satisfies it; tests pass a literal). */
export interface RunStrikeLedgerLike {
  struckProviders(): string[];
  snapshot(): Record<string, RunStrikeSnapshot>;
}

export class RunDiagnosticsTracker {
  private readonly waves: WaveTiming[] = [];
  private current: PipelinePhase | null = null;
  private done: Extract<PipelineEvent, { type: "done" }> | null = null;

  constructor(private readonly t0: number = Date.now(), private readonly now: () => number = Date.now) {}

  /** Feed every orchestrator event through here (progress → wave timings, done → deadline wave). */
  observe(event: PipelineEvent): void {
    if (event.type === "progress") this.enter(event.phase);
    else if (event.type === "done") this.done = event;
  }

  get currentWave(): PipelinePhase | null {
    return this.current;
  }

  private enter(phase: PipelinePhase): void {
    if (phase === this.current) return;
    const at = this.now() - this.t0;
    const open = this.waves[this.waves.length - 1];
    if (open && open.ms === null) open.ms = Math.max(0, at - open.startedAtMs);
    this.waves.push({ phase, startedAtMs: Math.max(0, at), ms: null });
    this.current = phase;
  }

  /** One record for the dump + the quality row. Never throws. */
  snapshot(input: { ledger?: RunStrikeLedgerLike | null; error?: unknown }): RunDiagnostics {
    const at = this.now() - this.t0;
    const waves = this.waves.map((w) => ({ ...w, ms: w.ms === null ? Math.max(0, at - w.startedAtMs) : w.ms }));
    let providersStruck: string[] = [];
    let strikes: Record<string, RunStrikeSnapshot> = {};
    try {
      providersStruck = [...(input.ledger?.struckProviders() ?? [])].sort();
      strikes = { ...(input.ledger?.snapshot() ?? {}) };
    } catch {
      /* a broken ledger never hides the rest of the diagnostics */
    }
    const err = input.error;
    const message = err instanceof Error ? err.message : typeof err === "string" ? err : err ? String(err) : "unknown";
    return {
      degraded: true,
      error: message,
      failedWave: this.current,
      deadlineHitWave: this.done?.deadlineHitPhase ?? null,
      deadlineHit: this.done?.deadlineHit ?? false,
      waves,
      providersStruck,
      strikes,
      calls: this.done?.calls ?? null,
      totalMs: Math.max(0, this.done?.totalMs ?? at),
    };
  }
}

/** The `run_diagnostics` event payload (the record itself, tagged). */
export type RunDiagnosticsEvent = { type: "run_diagnostics" } & RunDiagnostics;
