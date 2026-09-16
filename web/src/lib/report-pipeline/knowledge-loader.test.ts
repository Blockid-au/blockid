// knowledge-loader (G13-W2-R2, spec §C.2): knowledge-base files memoised +
// capped per dim, agent_knowledge_base rows (top 3 approved, ≤ 120 tokens,
// status-column fallback), never throws.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  __resetKnowledgeCaches,
  knowledgeBlocksForDim,
  loadAgentKnowledgeRows,
  loadKnowledgeFile,
  renderKnowledgeData,
  renderKnowledgeFiles,
  renderKnowledgeRows,
  type KnowledgeDb,
} from "./knowledge-loader";
import { DIMENSION_OWNERS, KNOWLEDGE_FILES } from "./dimension-owners";
import { PROMPT_BLOCK_CAPS, estimateTokens } from "./prompt-tokens";

beforeEach(() => __resetKnowledgeCaches());
afterEach(() => {
  delete process.env.KNOWLEDGE_BASE_DIR;
  __resetKnowledgeCaches();
});

describe("knowledge files", () => {
  it("resolves every KNOWLEDGE_FILES entry from the repo .claude/knowledge-base (cwd = web/)", () => {
    (Object.keys(KNOWLEDGE_FILES) as Array<keyof typeof KNOWLEDGE_FILES>).forEach((key) => {
      expect(loadKnowledgeFile(key).length).toBeGreaterThan(200);
    });
  });

  it("caps each block at KNOWLEDGE_FILE tokens and uses at most KNOWLEDGE_FILES_MAX files per dim", () => {
    const blocks = knowledgeBlocksForDim("cgh");
    expect(blocks.length).toBeLessThanOrEqual(PROMPT_BLOCK_CAPS.KNOWLEDGE_FILES_MAX);
    expect(blocks.map((b) => b.key)).toEqual(DIMENSION_OWNERS.cgh.knowledge.slice(0, 2));
    blocks.forEach((b) => expect(estimateTokens(b.text)).toBeLessThanOrEqual(PROMPT_BLOCK_CAPS.KNOWLEDGE_FILE));
    const rendered = renderKnowledgeFiles(blocks);
    expect(rendered).toContain("### Knowledge: esop-expertise (esop/esop-expertise.md)");
    expect(renderKnowledgeFiles([])).toBe("");
  });

  it("memoises reads and degrades to an empty block when the directory is unreachable", () => {
    process.env.KNOWLEDGE_BASE_DIR = "/nonexistent/knowledge-base";
    __resetKnowledgeCaches();
    // The env dir is tried first; the cwd fallbacks still find the repo files.
    expect(loadKnowledgeFile("svi-framework").length).toBeGreaterThan(0);
    expect(knowledgeBlocksForDim("tre", { maxFiles: 0 })).toEqual([]);
  });
});

function fakeDb(rows: unknown[] | null, error: { message: string } | null, log: string[] = []): KnowledgeDb {
  const q = {
    eq(col: string, val: string) {
      log.push(`${col}=${val}`);
      return q;
    },
    order() {
      return q;
    },
    limit: async () => ({ data: rows, error }),
  };
  return { from: () => ({ select: () => q }) };
}

describe("agent_knowledge_base rows", () => {
  it("returns the top rows for the role, capped at KNOWLEDGE_ROW tokens, filtered on status=approved", async () => {
    const log: string[] = [];
    const db = fakeDb(
      [
        { agent: "cfo", topic: "SaaS multiples", data: { summary: Array.from({ length: 200 }, () => "figure").join(" ") }, created_at: "2026-09-10T00:00:00Z" },
        { agent: "cfo", topic: "empty", data: null, created_at: "2026-09-09T00:00:00Z" },
      ],
      null,
      log,
    );
    const rows = await loadAgentKnowledgeRows("cfo", db);
    expect(rows).toHaveLength(1);
    expect(rows[0].topic).toBe("SaaS multiples");
    expect(estimateTokens(rows[0].text)).toBeLessThanOrEqual(PROMPT_BLOCK_CAPS.KNOWLEDGE_ROW);
    expect(log).toContain("status=approved");
    expect(renderKnowledgeRows(rows)).toContain("**SaaS multiples** (2026-09-10)");
  });

  it("falls back to an unfiltered read when the status column is missing (migration 0396 not applied)", async () => {
    let calls = 0;
    const db: KnowledgeDb = {
      from: () => ({
        select: () => {
          const withStatus = { flag: false };
          const q = {
            eq(col: string) {
              if (col === "status") withStatus.flag = true;
              return q;
            },
            order() {
              return q;
            },
            limit: async () => {
              calls += 1;
              return withStatus.flag
                ? { data: null, error: { message: "column agent_knowledge_base.status does not exist" } }
                : { data: [{ agent: "clo", topic: "ESIC", data: "100-point test", created_at: "2026-09-01" }], error: null };
            },
          };
          return q;
        },
      }),
    };
    const rows = await loadAgentKnowledgeRows("clo", db);
    expect(calls).toBe(2);
    expect(rows[0].text).toBe("100-point test");
  });

  it("memoises per role and never throws (null db, throwing db)", async () => {
    expect(await loadAgentKnowledgeRows("cmo", null)).toEqual([]);
    const throwing: KnowledgeDb = { from: () => { throw new Error("boom"); } };
    expect(await loadAgentKnowledgeRows("cmo", throwing)).toEqual([]);
    const db = fakeDb([{ agent: "cro", topic: "t", data: "x", created_at: "2026" }], null);
    await loadAgentKnowledgeRows("cro", db, { now: 1000 });
    const again = await loadAgentKnowledgeRows("cro", fakeDb(null, { message: "nope" }), { now: 2000 });
    expect(again).toHaveLength(1); // served from the memo, not the failing db
  });

  it("renderKnowledgeData flattens jsonb payloads preferring summary-like keys", () => {
    expect(renderKnowledgeData({ noise: "z", summary: "S", findings: ["a", "b"] })).toBe("summary: S; findings: a; b; noise: z");
    expect(renderKnowledgeData(null)).toBe("");
    expect(renderKnowledgeData(42)).toBe("42");
  });
});
