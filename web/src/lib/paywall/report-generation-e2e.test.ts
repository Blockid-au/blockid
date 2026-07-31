/**
 * report-generation-e2e.test.ts — the regression guard for the
 * `rpt-placeholder-…` bug.
 *
 * Until §8.6 landed, /api/cron/report-order-drain handed the worker a
 * stub generator that returned `rpt-placeholder-<orderId>`. Every unit
 * test still passed: the queue drained, report_orders flipped to READY,
 * `report_id` was populated. The only thing missing was the report.
 *
 * This test closes that hole by asserting the property the unit tests
 * never checked — **a READY order's report_id must resolve to a row that
 * actually exists in `assembled_reports`**. It drives the whole path:
 *
 *     processNextQueuedOrder()
 *       → generateTrustReportForOrder()   (the real production hook)
 *         → orchestrateReport()           (stubbed — no AI calls)
 *         → INSERT assembled_reports
 *       → UPDATE report_orders SET status='READY', report_id=…
 *
 * against one shared in-memory database double, then resolves the
 * written report_id back through it.
 *
 * The last test in this file re-runs the identical assertion against the
 * ORIGINAL placeholder generator and requires it to fail — proof that
 * the guard would have caught the bug, not just that it passes today.
 */

import { describe, it, expect } from "vitest";
import {
  processNextQueuedOrder,
  type MinimalSupabase,
  type QueueRow,
  type GenerateResult,
} from "./report-order-worker";
import { generateTrustReportForOrder } from "./report-generator";
import type { GeneratorSupabase, GeneratorSelectBuilder } from "./report-generator";
import type {
  AssembledReport,
  AgentRole,
  ReportSection,
} from "@/lib/report-pipeline/types";
import { AGENT_ROLES } from "@/lib/report-pipeline/types";
import type { CriterionKey } from "@/lib/evaluation-criteria";

// ─────────────────────────────────────────────────────────────────────────────
// One shared in-memory database, exposed through both the worker's and
// the generator's narrow Supabase surfaces so a report written by the
// generator is visible to an assertion about what the worker recorded.
// ─────────────────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;

interface UpdateCall {
  table: string;
  patch: Row;
  filters: Array<{ col: string; val: unknown }>;
}

class FakeGenSelect implements GeneratorSelectBuilder {
  constructor(private readonly rows: Row[]) {}

  eq(): GeneratorSelectBuilder {
    return this;
  }

  order(): GeneratorSelectBuilder {
    return this;
  }

  async maybeSingle(): Promise<{ data: Row | null; error: unknown }> {
    return { data: this.rows[0] ?? null, error: null };
  }

  then<T1 = { data: Row[] | null; error: unknown }, T2 = never>(
    onfulfilled?:
      | ((value: { data: Row[] | null; error: unknown }) => T1 | PromiseLike<T1>)
      | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ): PromiseLike<T1 | T2> {
    return Promise.resolve({ data: this.rows, error: null }).then(
      onfulfilled,
      onrejected,
    );
  }
}

/** The worker's update chain: `.eq().eq().select().maybeSingle()` for the
 *  guarded claim, and a bare awaited `.eq()` everywhere else. */
interface WorkerEqChain {
  eq(col: string, val: unknown): WorkerEqChain;
  select(cols: string): { maybeSingle(): Promise<{ data: Row | null; error: unknown }> };
  then<T1 = { data: null; error: null }, T2 = never>(
    onfulfilled?: ((value: { data: null; error: null }) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ): PromiseLike<T1 | T2>;
}

class FakeWorkerEqChain implements WorkerEqChain {
  constructor(private readonly call: UpdateCall) {}

  eq(col: string, val: unknown): WorkerEqChain {
    this.call.filters.push({ col, val });
    return this;
  }

  select(_cols: string): {
    maybeSingle(): Promise<{ data: Row | null; error: unknown }>;
  } {
    return {
      // The guarded queued→running claim always wins in this test.
      async maybeSingle() {
        return { data: { id: "queue-1" }, error: null };
      },
    };
  }

  then<T1 = { data: null; error: null }, T2 = never>(
    onfulfilled?: ((value: { data: null; error: null }) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ): PromiseLike<T1 | T2> {
    return Promise.resolve({ data: null, error: null }).then(
      onfulfilled,
      onrejected,
    );
  }
}

/** Project a seeded generic row onto the worker's QueueRow shape. */
function toQueueRow(row: Row | undefined): QueueRow | null {
  if (!row) return null;
  return {
    id: String(row.id),
    order_id: String(row.order_id),
    business_id: String(row.business_id),
    status: row.status as QueueRow["status"],
    retry_count: Number(row.retry_count ?? 0),
    enqueued_at: String(row.enqueued_at),
    started_at: (row.started_at as string | null) ?? null,
    finished_at: (row.finished_at as string | null) ?? null,
    error_reason: (row.error_reason as string | null) ?? null,
  };
}

class FakeDb {
  readonly updates: UpdateCall[] = [];
  readonly tables: Record<string, Row[]>;

  constructor(tables: Record<string, Row[]>) {
    this.tables = tables;
  }

  rows(table: string): Row[] {
    return this.tables[table] ?? [];
  }

  /** Rows INSERTed during the run land in the same store a SELECT reads,
   *  which is what makes "does report_id resolve?" a real question. */
  private insert(table: string, payload: Row | Row[]): void {
    const list = (this.tables[table] ??= []);
    for (const row of Array.isArray(payload) ? payload : [payload]) {
      list.push(row);
    }
  }

  /** Resolve a report_orders.report_id the way a reader endpoint would. */
  findAssembledReport(reportId: unknown): Row | undefined {
    return this.rows("assembled_reports").find((r) => r.id === reportId);
  }

  updatesFor(table: string): UpdateCall[] {
    return this.updates.filter((u) => u.table === table);
  }

  workerClient(): MinimalSupabase {
    const db = this;
    return {
      from(table: string) {
        return {
          select(_cols: string) {
            const chain = {
              eq(_col: string, _val: unknown) {
                return {
                  order(_c: string, _o: { ascending: boolean }) {
                    return {
                      limit(_n: number) {
                        return {
                          async maybeSingle(): Promise<{
                            data: QueueRow | null;
                            error: unknown;
                          }> {
                            return {
                              data: toQueueRow(db.rows(table)[0]),
                              error: null,
                            };
                          },
                        };
                      },
                    };
                  },
                };
              },
            };
            return chain;
          },
          update(patch: Row): WorkerEqChain {
            const call: UpdateCall = { table, patch, filters: [] };
            db.updates.push(call);
            return new FakeWorkerEqChain(call);
          },
        };
      },
    };
  }

  generatorClient(): GeneratorSupabase {
    const db = this;
    return {
      from(table: string) {
        return {
          select(_cols: string): GeneratorSelectBuilder {
            return new FakeGenSelect(db.rows(table));
          },
          insert(payload: Row | Row[]): PromiseLike<{
            error: { message?: string } | null;
          }> {
            db.insert(table, payload);
            return Promise.resolve({ error: null });
          },
        };
      },
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const ORDER_ID = "6c1f5a2e-0000-4000-8000-000000000001";
const BUSINESS_ID = "6c1f5a2e-0000-4000-8000-000000000002";
const USER_ID = "6c1f5a2e-0000-4000-8000-000000000003";
const ACCOUNT_ID = "6c1f5a2e-0000-4000-8000-000000000004";
const ANALYSIS_ID = "6c1f5a2e-0000-4000-8000-000000000005";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function seedDb(): FakeDb {
  return new FakeDb({
    report_generation_queue: [
      {
        id: "queue-1",
        order_id: ORDER_ID,
        business_id: BUSINESS_ID,
        status: "queued",
        retry_count: 0,
        enqueued_at: "2026-07-31T00:00:00Z",
        started_at: null,
        finished_at: null,
        error_reason: null,
      },
    ],
    report_orders: [
      {
        id: ORDER_ID,
        user_id: USER_ID,
        business_id: BUSINESS_ID,
        status: "PAID",
        credits_used: 200,
        metadata: { quote: { depth: "standard" }, payment_path: "credits" },
      },
    ],
    app_users: [{ id: USER_ID, email: "founder@example.com" }],
    svi_evidence: [
      {
        evidence_type: "traction",
        confidence_level: "high",
        dimension: "revenue",
        label: "First 10 paying customers",
      },
    ],
    evaluation_criteria: [
      {
        criterion_key: "market",
        text_input: "AU startup equity tooling",
        files: [],
        links: [],
        quality_level: "good",
        ai_score: 72,
      },
    ],
    // Populated by the generator during the run.
    assembled_reports: [],
    agent_report_tasks: [],
  });
}

function agentContributions(): AssembledReport["agentContributions"] {
  const entries = AGENT_ROLES.map((role) => [
    role,
    { criteria: [] as CriterionKey[], wordCount: 0 },
  ]);
  return Object.fromEntries(entries) as Record<
    AgentRole,
    { criteria: CriterionKey[]; wordCount: number }
  >;
}

function fakeAssembledReport(): AssembledReport {
  const section: ReportSection = {
    id: "sec-market",
    title: "Market Opportunity",
    agentRole: "cmo",
    criterion: "market",
    content: "The Australian cap-table tooling market is …",
    score: 72,
    visuals: [],
    wordCount: 640,
  };

  return {
    // Deliberately the orchestrator's own `rpt-…` id: the generator must
    // NOT hand this back as report_orders.report_id (that column is uuid).
    id: "rpt-mc3x-ab12cd",
    title: "Trust Business Report — Example Pty Ltd",
    tier: "standard",
    sections: [section],
    charts: [],
    executiveSummary: "Example Pty Ltd scores 118 on the SVI …",
    qualityScore: 74,
    totalWords: 6120,
    consistencyIssues: [],
    agentContributions: agentContributions(),
    markdown: "# Trust Business Report\n\n## Executive Summary\n\n…",
    createdAt: "2026-07-31T02:00:00.000Z",
  };
}

/** Stubs for the two project-scoped lookups the generator delegates to. */
const findAccount = async () => ({
  id: ACCOUNT_ID,
  email: "founder@example.com",
  startup_name: "Example Pty Ltd",
  current_svi: 118,
  current_stage: 3,
});

const findAnalysis = async () => ({
  id: ANALYSIS_ID,
  raw_input: "Example Pty Ltd builds cap-table tooling for AU founders.",
  total_svi: 118,
  analysis_json: { summary: "Early traction", stage: 3 },
});

const FIXED_NOW = new Date("2026-07-31T02:00:00.000Z");
const now = () => FIXED_NOW;

/**
 * THE GUARD. Drains one order, then asserts the stored order's
 * `report_id` resolves to a real `assembled_reports` row.
 *
 * Shared by the real-generator test and the placeholder-regression test
 * so both are held to exactly the same standard.
 */
async function drainAndAssertReportResolves(
  db: FakeDb,
  generateReport: (input: {
    orderId: string;
    businessId: string;
  }) => Promise<GenerateResult>,
): Promise<Row> {
  const outcome = await processNextQueuedOrder({
    supabase: db.workerClient(),
    generateReport,
    now,
  });

  expect(outcome.status).toBe("done");

  const readyWrite = db
    .updatesFor("report_orders")
    .find((u) => u.patch.status === "READY");
  expect(readyWrite, "order never reached READY").toBeDefined();

  const reportId = readyWrite?.patch.report_id;

  // 1. It must not be the old stub id.
  expect(String(reportId)).not.toMatch(/^rpt-placeholder/);

  // 2. report_orders.report_id is a uuid column (migration 0270) — a
  //    non-uuid would be rejected by Postgres at write time.
  expect(String(reportId)).toMatch(UUID_RE);

  // 3. It must resolve to a report that was actually stored.
  const stored = db.findAssembledReport(reportId);
  expect(
    stored,
    `report_id ${String(reportId)} does not resolve to any assembled_reports row`,
  ).toBeDefined();

  return stored as Row;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Trust Report generation — end to end", () => {
  it("stores a real report and points report_orders.report_id at it", async () => {
    const db = seedDb();

    const stored = await drainAndAssertReportResolves(db, (input) =>
      generateTrustReportForOrder(input, {
        supabase: db.generatorClient(),
        aiConfigured: () => true,
        findAccount,
        findAnalysis,
        orchestrate: async () => fakeAssembledReport(),
      }),
    );

    // The stored row is a complete report, not a husk.
    expect(stored.status).toBe("complete");
    expect(stored.title).toBe("Trust Business Report — Example Pty Ltd");
    expect(String(stored.full_markdown).length).toBeGreaterThan(0);
    expect(stored.total_words).toBe(6120);
    expect(stored.sections_count).toBe(1);
    expect(stored.account_id).toBe(ACCOUNT_ID);
    expect(stored.user_id).toBe(USER_ID);
    expect(stored.project_id).toBe(BUSINESS_ID);
    expect(stored.analysis_id).toBe(ANALYSIS_ID);
    expect(stored.tier).toBe("standard");

    // Per-agent analytics rows point at the same stored id.
    const tasks = db.rows("agent_report_tasks");
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.report_id).toBe(stored.id);
  });

  it("passes the orchestrator the real business context", async () => {
    const db = seedDb();
    const seen: Array<Record<string, unknown>> = [];

    await drainAndAssertReportResolves(db, (input) =>
      generateTrustReportForOrder(input, {
        supabase: db.generatorClient(),
        aiConfigured: () => true,
        findAccount,
        findAnalysis,
        orchestrate: async (orchestratorInput) => {
          seen.push({
            accountId: orchestratorInput.accountId,
            userId: orchestratorInput.userId,
            projectId: orchestratorInput.projectId,
            startupName: orchestratorInput.startupName,
            tier: orchestratorInput.tier,
            evidenceCount: orchestratorInput.evidenceItems.length,
            marketText: orchestratorInput.criteriaData.market.textInput,
            svi: orchestratorInput.sviAnalysis.totalSVI,
          });
          return fakeAssembledReport();
        },
      }),
    );

    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual({
      accountId: ACCOUNT_ID,
      userId: USER_ID,
      projectId: BUSINESS_ID,
      startupName: "Example Pty Ltd",
      tier: "standard",
      evidenceCount: 1,
      marketText: "AU startup equity tooling",
      svi: 118,
    });
  });

  it("REGRESSION: the placeholder generator fails this guard", async () => {
    const db = seedDb();

    // Verbatim reproduction of the shipped stub that used to live in
    // /api/cron/report-order-drain/route.ts.
    const placeholderGenerator = async (input: {
      orderId: string;
      businessId: string;
    }): Promise<GenerateResult> => ({
      ok: true,
      reportId: `rpt-placeholder-${input.orderId.slice(0, 8)}`,
    });

    await expect(
      drainAndAssertReportResolves(db, placeholderGenerator),
    ).rejects.toThrow();

    // And spell out why: nothing was ever stored.
    expect(db.rows("assembled_reports")).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Failure classification — a failed generation must never look READY.
// ─────────────────────────────────────────────────────────────────────────────

describe("Trust Report generation — failure classification", () => {
  it("treats a missing SVI analysis as permanent (no point retrying)", async () => {
    const db = seedDb();

    const result = await generateTrustReportForOrder(
      { orderId: ORDER_ID, businessId: BUSINESS_ID },
      {
        supabase: db.generatorClient(),
        aiConfigured: () => true,
        findAccount,
        findAnalysis: async () => null,
        orchestrate: async () => fakeAssembledReport(),
      },
    );

    expect(result).toEqual({
      ok: false,
      transient: false,
      reason: "no_svi_analysis_for_business",
    });
    expect(db.rows("assembled_reports")).toHaveLength(0);
  });

  it("treats an orchestrator throw as transient", async () => {
    const db = seedDb();

    const result = await generateTrustReportForOrder(
      { orderId: ORDER_ID, businessId: BUSINESS_ID },
      {
        supabase: db.generatorClient(),
        aiConfigured: () => true,
        findAccount,
        findAnalysis,
        orchestrate: async () => {
          throw new Error("provider 503");
        },
      },
    );

    expect(result).toEqual({
      ok: false,
      transient: true,
      reason: "orchestration_failed: provider 503",
    });
    expect(db.rows("assembled_reports")).toHaveLength(0);
  });

  it("never returns a report id when the assembled_reports insert fails", async () => {
    const db = seedDb();
    const failingClient: GeneratorSupabase = {
      from(table: string) {
        const inner = db.generatorClient().from(table);
        return {
          select: inner.select,
          insert(payload: Row | Row[]) {
            if (table === "assembled_reports") {
              return Promise.resolve({ error: { message: "disk full" } });
            }
            return inner.insert(payload);
          },
        };
      },
    };

    const result = await generateTrustReportForOrder(
      { orderId: ORDER_ID, businessId: BUSINESS_ID },
      {
        supabase: failingClient,
        aiConfigured: () => true,
        findAccount,
        findAnalysis,
        orchestrate: async () => fakeAssembledReport(),
      },
    );

    expect(result).toEqual({
      ok: false,
      transient: true,
      reason: "assembled_reports_insert_failed: disk full",
    });
  });

  it("treats an unconfigured AI provider as transient", async () => {
    const db = seedDb();

    const result = await generateTrustReportForOrder(
      { orderId: ORDER_ID, businessId: BUSINESS_ID },
      {
        supabase: db.generatorClient(),
        aiConfigured: () => false,
        findAccount,
        findAnalysis,
        orchestrate: async () => fakeAssembledReport(),
      },
    );

    expect(result).toEqual({
      ok: false,
      transient: true,
      reason: "ai_not_configured",
    });
  });
});
