// G33-T05 — measured model speed, so a ladder only starts a model that can finish.
//
// 24/09/2026 live probe (1 500 output tokens, streamed, report scope):
//   DeepSeek-V3.2                  first token 0.7 s · 13 tok/s
//   Qwen3-235B-A22B-Instruct-2507  first token 12.5 s · 19 tok/s
//   DeepSeek-V4-Flash              first token 0.4 s · 32 tok/s
// The ladder order (quality first) was measured when V3.2 wrote a chapter in
// 20 s. At 13 tok/s a 2 600-token criterion call needs ~200 s, so a run whose
// W4 reserve is 120 s must start the chapter on a faster rung or lose it.
//
// Every streamed completion updates an exponentially weighted average (per
// process); the priors above only seed a fresh process. Pure and synchronous.

export interface ModelSpeed {
  firstTokenMs: number;
  tokensPerSecond: number;
  samples: number;
}

const ALPHA = 0.3;
const MIN_TPS = 1;
/**
 * G33-T16b: a model "fits" only with headroom — 24/09 canary: V3.2 was picked for
 * the CEO summary on an optimistic average and timed out at the 90 s reserve.
 */
export const FIT_SAFETY_FACTOR = 1.5;

export const MODEL_SPEED_PRIORS: Readonly<Record<string, Omit<ModelSpeed, "samples">>> = Object.freeze({
  "deepseek-ai/DeepSeek-V3.2": { firstTokenMs: 700, tokensPerSecond: 13 },
  "Qwen/Qwen3-235B-A22B-Instruct-2507": { firstTokenMs: 12_500, tokensPerSecond: 19 },
  "deepseek-ai/DeepSeek-V4-Flash": { firstTokenMs: 400, tokensPerSecond: 32 },
});

const speeds = new Map<string, ModelSpeed>();

export function _resetModelSpeeds(): void {
  speeds.clear();
}

export function modelSpeed(model: string): ModelSpeed | null {
  const seen = speeds.get(model);
  if (seen) return seen;
  const prior = MODEL_SPEED_PRIORS[model];
  return prior ? { ...prior, samples: 0 } : null;
}

/** Record one finished stream. Ignores samples too small to measure speed. */
export function recordModelSpeed(model: string, sample: { firstTokenMs: number | null | undefined; totalMs: number; outputTokens: number }): void {
  const first = sample.firstTokenMs;
  if (typeof first !== "number" || !Number.isFinite(first) || first < 0) return;
  const genMs = sample.totalMs - first;
  if (!(sample.outputTokens >= 50) || !(genMs > 0)) return;
  const tps = Math.max(MIN_TPS, sample.outputTokens / (genMs / 1000));
  const prev = modelSpeed(model);
  if (!prev) {
    speeds.set(model, { firstTokenMs: first, tokensPerSecond: tps, samples: 1 });
    return;
  }
  speeds.set(model, {
    firstTokenMs: Math.round(prev.firstTokenMs + ALPHA * (first - prev.firstTokenMs)),
    tokensPerSecond: prev.tokensPerSecond + ALPHA * (tps - prev.tokensPerSecond),
    samples: prev.samples + 1,
  });
}

/** Expected wall clock for `outputTokens` on `model`; null when the model has no prior or sample. */
export function estimateCompletionMs(model: string, outputTokens: number): number | null {
  const s = modelSpeed(model);
  if (!s) return null;
  return Math.round(s.firstTokenMs + (Math.max(0, outputTokens) / Math.max(MIN_TPS, s.tokensPerSecond)) * 1000);
}

/**
 * Stable re-order: models KNOWN (prior or sample) to finish `outputTokens` within
 * `remainingMs` move ahead, in their (quality) order; every other model follows
 * in its original order. When no known model fits, the order is unchanged —
 * speed cannot rescue the call, so quality order stands, and a model without
 * any measurement never jumps ahead of measured ones.
 */
export function orderModelsBySpeed(models: readonly string[], outputTokens: number, remainingMs: number | null | undefined): string[] {
  if (typeof remainingMs !== "number" || !Number.isFinite(remainingMs)) return [...models];
  const fits = models.filter((m) => {
    const est = estimateCompletionMs(m, outputTokens);
    return est !== null && est * FIT_SAFETY_FACTOR <= remainingMs;
  });
  if (fits.length === 0) return [...models];
  return [...fits, ...models.filter((m) => !fits.includes(m))];
}
