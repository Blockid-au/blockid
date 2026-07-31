// Colocated test for GET/POST /api/cron/prompt-eval-nightly — Sub-Q3.
//
// Covers the 5 required cases:
//   1. Happy pass-through-to-prod: shouldPromote() true → promoteCanaryToProd invoked.
//   2. Fail-keeps-canary: shouldPromote() false → no promotion, evaluation persisted.
//   3. Missing-fixture-skipped-noted: absent file → missingFixtures[] populated.
//   4. Secret mismatch → 401 with no side effects.
//   5. Max-per-invocation cap: query passes .limit(20).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";

vi.mock("server-only", () => ({}));

// ── Supabase fake ────────────────────────────────────────────────────

interface Row {
  id: string;
  agent: string;
  version: string;
  purpose: string;
  model: string;
  variables: unknown;
  output_schema: unknown;
  guardrails: string[];
  test_set_id: string | null;
  evaluation_result: unknown;
  status: string;
  released_at: string | null;
  rollback_from: string | null;
  created_at: string;
}

let table: Row[] = [];
let selectLimitSeen: number | null = null;

function makeRow(o: Partial<Row>): Row {
  return {
    id: o.id ?? "11111111-1111-4111-8111-111111111111",
    agent: o.agent ?? "AIR-003",
    version: o.version ?? "1.0.0",
    purpose: o.purpose ?? "test",
    model: o.model ?? "claude-sonnet-5",
    variables: o.variables ?? {},
    output_schema: o.output_schema ?? {},
    guardrails: o.guardrails ?? [],
    test_set_id: o.test_set_id ?? null,
    evaluation_result: o.evaluation_result ?? null,
    status: o.status ?? "canary",
    released_at: o.released_at ?? null,
    rollback_from: o.rollback_from ?? null,
    created_at: o.created_at ?? new Date().toISOString(),
  };
}

function fakeSupabase() {
  return {
    from(name: string) {
      if (name !== "prompt_versions") throw new Error("unknown table " + name);
      const filters: Array<{ col: string; val: unknown; op: "eq" | "in" }> = [];
      let mode: "select" | "update" = "select";
      let updatePatch: Partial<Row> = {};
      const api: {
        select(_: string): typeof api;
        update(patch: Partial<Row>): typeof api;
        eq(col: string, val: unknown): typeof api;
        in(col: string, vals: unknown[]): typeof api;
        limit(n: number): typeof api;
        maybeSingle(): Promise<{ data: Row | null; error: null }>;
        then?: unknown;
      } = {
        select() {
          mode = "select";
          return api;
        },
        update(patch: Partial<Row>) {
          mode = "update";
          updatePatch = patch;
          return api;
        },
        eq(col: string, val: unknown) {
          filters.push({ col, val, op: "eq" });
          return api;
        },
        in(col: string, vals: unknown[]) {
          filters.push({ col, val: vals, op: "in" });
          return api;
        },
        limit(n: number) {
          selectLimitSeen = n;
          return api;
        },
        async maybeSingle() {
          const match = table.find(r =>
            filters.every(f =>
              f.op === "eq"
                ? (r as unknown as Record<string, unknown>)[f.col] === f.val
                : (f.val as unknown[]).includes((r as unknown as Record<string, unknown>)[f.col]),
            ),
          );
          return { data: match ?? null, error: null };
        },
      };
      (api as unknown as { then: (resolve: (v: unknown) => void) => void }).then = (
        resolve,
      ) => {
        const matches = table.filter(r =>
          filters.every(f =>
            f.op === "eq"
              ? (r as unknown as Record<string, unknown>)[f.col] === f.val
              : (f.val as unknown[]).includes((r as unknown as Record<string, unknown>)[f.col]),
          ),
        );
        if (mode === "update") {
          for (const r of matches) Object.assign(r, updatePatch);
          resolve({ data: matches, error: null });
        } else {
          resolve({ data: matches, error: null });
        }
      };
      return api;
    },
  };
}

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => fakeSupabase(),
}));

// ── callStructured stub (unused because we inject a runCase factory,
// but the module import path must resolve) ───────────────────────────
vi.mock("@/lib/ai/call-structured", () => ({
  callStructured: vi.fn(),
}));

// ── prompt-registry: mock only promoteCanaryToProd, keep PromptVersion Zod
const promoteMock = vi.fn();
vi.mock("@/lib/ai/prompt-registry", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ai/prompt-registry")>(
    "@/lib/ai/prompt-registry",
  );
  return {
    ...actual,
    promoteCanaryToProd: (...args: Parameters<typeof actual.promoteCanaryToProd>) =>
      promoteMock(...args),
  };
});

// ── Fixture-file helpers ─────────────────────────────────────────────

const TMP_FIXTURE_DIR = path.join(process.cwd(), "test-fixtures", "prompt-eval");
const TMP_FILES: string[] = [];

async function writeFixture(agent: string, version: string, body: unknown) {
  const p = path.join(TMP_FIXTURE_DIR, `${agent}-v${version}.json`);
  await fs.writeFile(p, JSON.stringify(body), "utf8");
  TMP_FILES.push(p);
}

// ── Import route AFTER mocks ────────────────────────────────────────

import { __testHooks, GET } from "./route";
import type { CaseRunner } from "@/lib/ai/eval-runner";

// ── Test lifecycle ───────────────────────────────────────────────────

const SECRET = "cron-secret-eval-test";

beforeEach(() => {
  table = [];
  selectLimitSeen = null;
  promoteMock.mockReset();
  promoteMock.mockResolvedValue({ ok: true, newProdId: "x", rolledBackId: null });
  __testHooks.runCaseFactory = null;
  process.env.CRON_SECRET = SECRET;
});

afterEach(async () => {
  // Clean any per-test fixture files we wrote.
  await Promise.all(
    TMP_FILES.splice(0).map(f => fs.rm(f, { force: true })),
  );
});

function req(headers: Record<string, string> = {}) {
  return new Request("http://x/api/cron/prompt-eval-nightly", {
    method: "GET",
    headers,
  });
}

function passingRunCase(): CaseRunner {
  return async () => ({
    ok: true,
    data: {
      proposed_score: 75,
      confidence: 0.8,
      gaps: ["cap_table_clean"],
    },
    latencyMs: 100,
    costUsd: 0.001,
    runId: "run-ok",
  });
}

function failingRunCase(): CaseRunner {
  return async () => ({
    ok: true,
    data: {
      proposed_score: 10,          // out of range
      confidence: 0.2,             // below min
      gaps: [],                    // missing required gap
      detail: "reference to Sequoia Capital", // hallucination
    },
    latencyMs: 100,
    costUsd: 0.001,
    runId: "run-bad",
  });
}

// ── 1. Happy pass-through-to-prod ────────────────────────────────────

describe("prompt-eval-nightly — happy pass-through-to-prod", () => {
  it("evaluates, persists result, and promotes a canary that passes the gate", async () => {
    const agent = "AIR-TEST-PASS";
    const version = "9.9.9";
    const rowId = "22222222-2222-4222-8222-222222220001";
    table = [makeRow({ id: rowId, agent, version, status: "canary" })];
    await writeFixture(agent, version, {
      agent,
      version,
      purpose: "test",
      cases: [
        {
          id: "c1",
          name: "c1",
          input: { businessId: "b1" },
          expected: {
            proposed_score: { min: 60, max: 80 },
            confidence: { min: 0.6 },
            must_have_gaps: ["cap_table_clean"],
            must_not_hallucinate: ["Sequoia Capital"],
          },
        },
      ],
    });
    __testHooks.runCaseFactory = () => passingRunCase();

    const res = await GET(req({ authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      inspected: number;
      evaluated: number;
      promoted: number;
      missingFixtures: string[];
    };
    expect(body.inspected).toBe(1);
    expect(body.evaluated).toBe(1);
    expect(body.promoted).toBe(1);
    expect(body.missingFixtures).toEqual([]);
    expect(promoteMock).toHaveBeenCalledTimes(1);
    expect(promoteMock).toHaveBeenCalledWith(agent, rowId, "nightly_eval");

    // Persisted evaluation_result carries the eval-runner's aggregate.
    const row = table.find(r => r.id === rowId)!;
    const persisted = row.evaluation_result as { accuracy_pct: number };
    expect(persisted.accuracy_pct).toBeGreaterThanOrEqual(0.8);
  });
});

// ── 2. Fail-keeps-canary ─────────────────────────────────────────────

describe("prompt-eval-nightly — fail-keeps-canary", () => {
  it("persists a failing evaluation_result and does NOT promote", async () => {
    const agent = "AIR-TEST-FAIL";
    const version = "9.9.9";
    const rowId = "33333333-3333-4333-8333-333333330001";
    table = [makeRow({ id: rowId, agent, version, status: "canary" })];
    await writeFixture(agent, version, {
      agent,
      version,
      purpose: "test",
      cases: [
        {
          id: "c1",
          name: "c1",
          input: { businessId: "b1" },
          expected: {
            proposed_score: { min: 60, max: 80 },
            confidence: { min: 0.6 },
            must_have_gaps: ["cap_table_clean"],
            must_not_hallucinate: ["Sequoia Capital"],
          },
        },
      ],
    });
    __testHooks.runCaseFactory = () => failingRunCase();

    const res = await GET(req({ authorization: `Bearer ${SECRET}` }));
    const body = (await res.json()) as { evaluated: number; promoted: number };
    expect(body.evaluated).toBe(1);
    expect(body.promoted).toBe(0);
    expect(promoteMock).not.toHaveBeenCalled();

    const persisted = table.find(r => r.id === rowId)!.evaluation_result as {
      hard_fail: boolean;
      accuracy_pct: number;
    };
    expect(persisted.hard_fail).toBe(true);
  });
});

// ── 3. Missing-fixture-skipped-noted ─────────────────────────────────

describe("prompt-eval-nightly — missing fixture", () => {
  it("skips the row and surfaces it in missingFixtures[] without erroring", async () => {
    const agent = "AIR-TEST-MISSING";
    const version = "9.9.9";
    table = [makeRow({ id: "44444444-4444-4444-8444-444444440001", agent, version, status: "canary" })];
    __testHooks.runCaseFactory = () => passingRunCase();

    const res = await GET(req({ authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      evaluated: number;
      promoted: number;
      missingFixtures: string[];
    };
    expect(body.evaluated).toBe(0);
    expect(body.promoted).toBe(0);
    expect(body.missingFixtures).toContain(`${agent}-v${version}`);
    expect(promoteMock).not.toHaveBeenCalled();
  });
});

// ── 4. Secret mismatch → 401 ─────────────────────────────────────────

describe("prompt-eval-nightly — auth gate", () => {
  it("returns 401 when the bearer does not match CRON_SECRET", async () => {
    __testHooks.runCaseFactory = () => passingRunCase();
    const res = await GET(req({ authorization: "Bearer nope" }));
    expect(res.status).toBe(401);
    expect(promoteMock).not.toHaveBeenCalled();
  });

  it("returns 401 when CRON_SECRET is unset", async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(req({ authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(401);
  });
});

// ── 5. Max-per-invocation cap ────────────────────────────────────────

describe("prompt-eval-nightly — max-per-invocation cap", () => {
  it("passes .limit(20) to the prompt_versions query", async () => {
    __testHooks.runCaseFactory = () => passingRunCase();
    await GET(req({ authorization: `Bearer ${SECRET}` }));
    expect(selectLimitSeen).toBe(20);
  });
});
