// Time-boxed runner for the agent-research cron (/api/cron/agent-research).
//
// 27/09 health sweep: the cron failed 6/6 runs (curl exit 28 at 300 s). The
// route walked every scheduled topic in order (the daily agents alone own
// 14+ topics after the dimension-owner merge) with a fixed 45 s gap after
// the first success, so a run needed 10+ minutes and was always killed
// before it could answer or log to growth_insights. Now:
//   * the run stops starting topics once its wall-clock budget is spent and
//     returns what it has (`deferred` rows for the rest — a partial result);
//   * each topic's AI call is time-boxed to what is left of the budget;
//   * the stagger between calls is a few seconds, not 45;
//   * the stalest topics (oldest agent_knowledge_base.updated_at, never-run
//     first) go first, so deferred topics lead the next run.

export interface ResearchQueueItem<A> {
  agent: A;
  agentId: string;
  topic: string;
}

export interface ResearchQueueResult {
  agent: string;
  topic: string;
  status: "ok" | "skipped" | "failed" | "no_new_data" | "deferred";
  summary?: string;
  error?: string;
}

export interface ResearchQueueOptions<A> {
  runTopic: (item: ResearchQueueItem<A>) => Promise<ResearchQueueResult>;
  /** Wall-clock budget for the whole run, measured from `startedAt`. */
  budgetMs: number;
  /** Gap between two AI calls (provider RPM limits). */
  staggerMs: number;
  /** Upper bound for one topic's AI call. */
  topicTimeoutMs: number;
  /** Do not START a topic with less than this left in the budget. */
  minStartMs: number;
  /** Budget gate re-checked before each topic. */
  canRun?: () => boolean;
  startedAt?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

/** Key for the staleness map: `${agentId}\u0000${topic}`. */
export function researchKey(agentId: string, topic: string): string {
  return `${agentId}\u0000${topic}`;
}

/**
 * Stalest first: topics with no knowledge row, then oldest `updated_at`.
 * Stable for ties, so the goal-tree order is kept when nothing is known.
 */
export function orderByStaleness<A>(
  items: ReadonlyArray<ResearchQueueItem<A>>,
  lastUpdated: ReadonlyMap<string, string>,
): ResearchQueueItem<A>[] {
  const age = (it: ResearchQueueItem<A>): number => {
    const ts = lastUpdated.get(researchKey(it.agentId, it.topic));
    const t = ts ? Date.parse(ts) : Number.NaN;
    return Number.isFinite(t) ? t : Number.NEGATIVE_INFINITY;
  };
  return items
    .map((it, i) => ({ it, i, t: age(it) }))
    .sort((a, b) => (a.t === b.t ? a.i - b.i : a.t < b.t ? -1 : 1))
    .map((x) => x.it);
}

const TIMED_OUT = Symbol("timed-out");

export async function runResearchQueue<A>(
  items: ReadonlyArray<ResearchQueueItem<A>>,
  opts: ResearchQueueOptions<A>,
): Promise<{ results: ResearchQueueResult[]; partial: boolean }> {
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const startedAt = opts.startedAt ?? now();
  const remaining = () => opts.budgetMs - (now() - startedAt);
  const results: ResearchQueueResult[] = [];
  let calls = 0;
  let partial = false;

  for (const item of items) {
    const base = { agent: item.agentId, topic: item.topic };
    if (calls > 0 && opts.staggerMs > 0 && remaining() > opts.minStartMs + opts.staggerMs) {
      await sleep(opts.staggerMs);
    }
    if (remaining() < opts.minStartMs) {
      partial = true;
      results.push({ ...base, status: "deferred", summary: "Run time budget reached — next run picks this up first" });
      continue;
    }
    if (opts.canRun && !opts.canRun()) {
      results.push({ ...base, status: "skipped", summary: "Budget limit reached mid-run" });
      continue;
    }

    calls += 1;
    const limitMs = Math.min(opts.topicTimeoutMs, remaining());
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const outcome = await Promise.race([
        opts.runTopic(item),
        new Promise<typeof TIMED_OUT>((resolve) => {
          timer = setTimeout(() => resolve(TIMED_OUT), limitMs);
        }),
      ]);
      if (outcome === TIMED_OUT) {
        partial = true;
        results.push({ ...base, status: "failed", error: `timed out after ${Math.round(limitMs / 1000)} s` });
      } else {
        results.push(outcome);
      }
    } catch (err) {
      results.push({ ...base, status: "failed", error: err instanceof Error ? err.message : String(err) });
    } finally {
      clearTimeout(timer);
    }
  }

  return { results, partial };
}
