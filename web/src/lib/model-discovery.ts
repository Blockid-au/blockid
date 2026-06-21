// Shared free-model discovery helpers — used by:
//   - /api/cron/refresh-models   (daily full refresh)
//   - /api/cron/discover-models  (on-demand top-3 augmentation when older
//                                  models start hitting rate limits)
//
// scoreModel() ranks a model by capability AND user-serving capacity. We don't
// just want "strongest by benchmark" — we want models that survive rate-limit
// pressure when many users are calling at once. So the score blends:
//   1. Family capability (DeepSeek V3, Kimi K2, MiniMax bumped above "120b"
//      models because their IDs rarely encode the effective param count).
//   2. Param size (when the id encodes it).
//   3. Context length (longer = handles more per request).
//   4. max_completion_tokens (capacity per request → directly correlates with
//      surviving a usage burst before the provider throttles).
//   5. Recency bonus — models added in the last 90 days haven't yet attracted
//      concentrated load, so they typically have more rate-limit headroom.
//   6. Moderation penalty — heavily-moderated models add latency/refusals that
//      hurt user-facing quality.

export interface RawModel {
  id: string;
  name?: string;
  context_length?: number;
  created?: number; // unix seconds, OpenRouter only
  pricing?: { prompt?: string; completion?: string };
  top_provider?: {
    context_length?: number;
    max_completion_tokens?: number;
    is_moderated?: boolean;
  };
}

export function scoreModel(
  id: string,
  name = "",
  ctx = 0,
  extra: {
    maxCompletionTokens?: number;
    created?: number;
    isModerated?: boolean;
  } = {},
): number {
  const hay = `${id} ${name}`.toLowerCase();
  if (/guard|safety|moderation|content-safety|embed|rerank|\btts\b|whisper|\bstt\b|image|audio|vision-only|moderat/.test(hay)) {
    return -1;
  }
  const FAM: [RegExp, number][] = [
    [/deepseek.*(v4|r1|v3\.2|v3\.1)/, 115],
    [/kimi.?k2/, 113],
    [/minimax/, 108],
    [/qwen3.*(coder|235b|480b|max|next)/, 100],
    [/glm-?(5|4\.7|4\.6|4\.5)/, 96],
    [/nemotron.*(ultra|super|253b|340b|550b)/, 92],
    [/llama-?4/, 88],
    [/qwen3/, 84],
    [/gpt-oss-120b/, 80],
    [/llama-3\.3-70b/, 78],
    [/hermes-3.*405b/, 76],
    [/gemma-?(3-27b|4)/, 70],
    [/nemotron.*(nano|30b|12b|9b)/, 58],
    [/gpt-oss-20b/, 50],
    [/(3b|1b|nano|mini|small|\bxs\b|tiny|lite)/, 38],
  ];
  let fam = 55;
  for (const [re, s] of FAM) if (re.test(hay)) { fam = s; break; }
  const pm = hay.match(/(\d{2,4})\s?b\b/);
  const paramB = pm ? parseInt(pm[1], 10) : 0;
  const paramScore = paramB ? Math.min(25, Math.log2(paramB + 1) * 3.2) : 8;
  const ctxScore = ctx ? Math.min(15, Math.log10(ctx) * 2.5) : 0;

  // Capacity bonus — more output tokens per call = more user requests served
  // before the provider throttles. Up to +12 points for 100K+ max output.
  const capScore = extra.maxCompletionTokens
    ? Math.min(12, Math.log10(extra.maxCompletionTokens) * 2.4)
    : 0;

  // Recency bonus — models created in the last 90 days haven't yet attracted
  // concentrated load. Linear decay to zero at 180 days. Up to +8 points.
  const recencyScore = (() => {
    if (!extra.created) return 0;
    const ageDays = (Date.now() / 1000 - extra.created) / 86400;
    if (ageDays < 0) return 0;
    if (ageDays <= 90) return 8;
    if (ageDays >= 180) return 0;
    return 8 * (1 - (ageDays - 90) / 90);
  })();

  // Moderation penalty — moderated models add refusals + latency.
  const modPenalty = extra.isModerated ? -3 : 0;

  return fam + paramScore + ctxScore + capScore + recencyScore + modPenalty;
}

// Known PAID models that appear in /models lists without a pricing field, so
// the heuristic ranker selects them. Confirmed via live test (response:
// payment_required). Add new ids here as discovered. See T0214.
export const KNOWN_PAID = new Set<string>([
  "MiniMax-M2.7",
  "minimax-m2.7",
]);

export function rank(models: RawModel[], topN: number, exclude: Set<string> = new Set()): string[] {
  return models
    .map((m) => ({
      id: m.id,
      s: scoreModel(m.id, m.name, m.context_length, {
        maxCompletionTokens: m.top_provider?.max_completion_tokens,
        created: m.created,
        isModerated: m.top_provider?.is_moderated,
      }),
    }))
    .filter((m) => m.s >= 0
      && !KNOWN_PAID.has(m.id)
      && !KNOWN_PAID.has(m.id.toLowerCase())
      && !exclude.has(m.id))
    .sort((a, b) => b.s - a.s)
    .slice(0, topN)
    .map((m) => m.id);
}

export async function fetchJson(url: string, headers: Record<string, string> = {}): Promise<RawModel[]> {
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

export function filterFreeOpenRouter(models: RawModel[]): RawModel[] {
  const zero = (v?: string) => v === "0" || v === "0.0" || v === "0.00";
  return models.filter((m) => {
    const p = m.pricing;
    return p && zero(p.prompt) && zero(p.completion);
  });
}
