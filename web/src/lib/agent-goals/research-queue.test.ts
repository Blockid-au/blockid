import { describe, expect, it } from "vitest";
import {
  orderByStaleness,
  researchKey,
  runResearchQueue,
  type ResearchQueueItem,
  type ResearchQueueResult,
} from "./research-queue";

// A fake clock: sleep() and every runTopic() advance it, so a full daily
// queue can be simulated without real waiting.
function fakeClock() {
  let t = 1_000_000;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
    sleep: async (ms: number) => {
      t += ms;
    },
  };
}

function items(n: number): ResearchQueueItem<null>[] {
  return Array.from({ length: n }, (_, i) => ({ agent: null, agentId: i % 2 ? "cmo" : "cfo", topic: `topic-${i}` }));
}

const ok = (it: ResearchQueueItem<null>): ResearchQueueResult => ({ agent: it.agentId, topic: it.topic, status: "ok" });

describe("runResearchQueue — 27/09 agent-research ran past curl's 300 s on 6/6 runs", () => {
  it("a 16-topic daily queue with 30 s AI calls stops inside the budget and defers the rest", async () => {
    const clock = fakeClock();
    const startedAt = clock.now();
    const { results, partial } = await runResearchQueue(items(16), {
      runTopic: async (it) => {
        clock.advance(30_000);
        return ok(it);
      },
      budgetMs: 230_000,
      staggerMs: 5_000,
      topicTimeoutMs: 60_000,
      minStartMs: 20_000,
      startedAt,
      now: clock.now,
      sleep: clock.sleep,
    });
    expect(clock.now() - startedAt).toBeLessThanOrEqual(230_000 + 30_000); // last started call may finish past the start cut-off
    expect(clock.now() - startedAt).toBeLessThan(300_000);
    expect(partial).toBe(true);
    expect(results).toHaveLength(16);
    const done = results.filter((r) => r.status === "ok").length;
    expect(done).toBeGreaterThanOrEqual(5);
    expect(results.slice(done).every((r) => r.status === "deferred")).toBe(true);
  });

  it("everything fits → no deferrals, partial=false", async () => {
    const clock = fakeClock();
    const { results, partial } = await runResearchQueue(items(3), {
      runTopic: async (it) => {
        clock.advance(10_000);
        return ok(it);
      },
      budgetMs: 230_000,
      staggerMs: 5_000,
      topicTimeoutMs: 60_000,
      minStartMs: 20_000,
      now: clock.now,
      sleep: clock.sleep,
    });
    expect(partial).toBe(false);
    expect(results.map((r) => r.status)).toEqual(["ok", "ok", "ok"]);
  });

  it("a hung AI call is abandoned at the per-topic time box and reported failed", async () => {
    const { results, partial } = await runResearchQueue(items(1), {
      runTopic: () => new Promise<ResearchQueueResult>(() => {}), // never settles
      budgetMs: 230_000,
      staggerMs: 0,
      topicTimeoutMs: 20,
      minStartMs: 0,
    });
    expect(partial).toBe(true);
    expect(results[0]).toMatchObject({ status: "failed", error: expect.stringMatching(/timed out/) });
  });

  it("a thrown topic is recorded as failed and the run continues", async () => {
    const { results } = await runResearchQueue(items(2), {
      runTopic: async (it) => {
        if (it.topic === "topic-0") throw new Error("provider down");
        return ok(it);
      },
      budgetMs: 230_000,
      staggerMs: 0,
      topicTimeoutMs: 1_000,
      minStartMs: 0,
    });
    expect(results.map((r) => r.status)).toEqual(["failed", "ok"]);
    expect(results[0].error).toBe("provider down");
  });

  it("the AI budget gate skips topics without calling the model", async () => {
    let calls = 0;
    const { results } = await runResearchQueue(items(2), {
      runTopic: async (it) => {
        calls += 1;
        return ok(it);
      },
      budgetMs: 230_000,
      staggerMs: 0,
      topicTimeoutMs: 1_000,
      minStartMs: 0,
      canRun: () => false,
    });
    expect(calls).toBe(0);
    expect(results.every((r) => r.status === "skipped")).toBe(true);
  });
});

describe("orderByStaleness", () => {
  it("never-researched topics first, then oldest updated_at; ties keep goal-tree order", () => {
    const q = items(4); // topic-0 cfo, topic-1 cmo, topic-2 cfo, topic-3 cmo
    const last = new Map([
      [researchKey("cfo", "topic-0"), "2026-09-26T20:00:00Z"],
      [researchKey("cmo", "topic-1"), "2026-09-20T20:00:00Z"],
    ]);
    expect(orderByStaleness(q, last).map((i) => i.topic)).toEqual(["topic-2", "topic-3", "topic-1", "topic-0"]);
  });

  it("with no knowledge rows the original order is kept", () => {
    expect(orderByStaleness(items(3), new Map()).map((i) => i.topic)).toEqual(["topic-0", "topic-1", "topic-2"]);
  });
});
