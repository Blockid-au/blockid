// G22-D — the read side on fakes: program invoices (revenue_events, G25) / letters / batches (+ owner
// e-mail for the QA filter) become auto rows; the applications JSONL is read
// from the temp root; a failing table is a warning, never a throw; no
// client → warning + the JSONL rows still render; the dashboard carries the
// North Star + live window metrics when the funnel reader has them.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { InstitutionalClient, InstitutionalResult } from "@/lib/funnel/institutional";
import { APPLICATIONS_FILE } from "@/lib/pilots/applications";
import { isAdminOwner, readAutoInputs, readValidationDashboard } from "./auto";
import { writeValidationLedger } from "./ledger";
import { newEntry } from "./model";

function fakeClient(tables: Record<string, InstitutionalResult | Error>, calls: string[] = []): InstitutionalClient {
  const q = (table: string, cols: string) => {
    calls.push(`${table}:${cols}`);
    const res = tables[table] ?? { data: [], count: 0, error: null };
    const self: Record<string, unknown> = {};
    const chain = () => self;
    Object.assign(self, {
      in: chain,
      gte: chain,
      eq: chain,
      limit: chain,
      order: chain,
      then: (onOk: (v: InstitutionalResult) => unknown, onErr?: (e: unknown) => unknown) => (res instanceof Error ? Promise.reject(res).then(onOk, onErr) : Promise.resolve(res).then(onOk, onErr)),
    });
    return self as unknown as ReturnType<ReturnType<InstitutionalClient["from"]>["select"]>;
  };
  return { from: (table: string) => ({ select: (cols: string) => q(table, cols) }) };
}

let root: string;
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "validation-auto-"));
  const apps = path.join(root, APPLICATIONS_FILE);
  mkdirSync(path.dirname(apps), { recursive: true });
  writeFileSync(apps, JSON.stringify({ id: "a-1", received_at: "2026-09-18T00:00:00.000Z", ip_hash: null, program_name: "Uni Program", contact_name: "P", email: "p@uni.edu", cohort_size: 40, intake_month: "2026-11", message: "" }) + "\n");
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const INVOICE = { id: 1, user_id: "u-1", plan_id: "accelerator_starter", kind: "subscribe", gross_aud_cents: 500_000, currency: "AUD", ts: "2026-09-10T00:00:00.000Z" };

describe("readAutoInputs", () => {
  it("no client → warning, the JSONL applications still read", async () => {
    const r = await readAutoInputs(null, root);
    expect(r.warnings.join(" ")).toMatch(/supabase not configured/);
    expect(r.inputs.applications.map((a) => a.program_name)).toEqual(["Uni Program"]);
    expect(r.inputs.revenueEvents).toEqual([]);
  });

  it("maps program invoices (+ payer e-mail), letters and batches (+ owner e-mails); a failing table is a warning; pilot_orders is never read", async () => {
    const calls: string[] = [];
    const client = fakeClient(
      {
        revenue_events: { data: [INVOICE], error: null },
        founder_feedback_letters: new Error("relation does not exist"),
        evaluation_batches: { data: [{ id: "b-1", user_id: "u-9", name: "Spring", program_name: "Spring 2026", status: "done", total: 5, done_count: 5, finished_at: "2026-09-16T00:00:00.000Z", created_at: "2026-09-15T00:00:00.000Z" }], error: null },
        app_users: { data: [{ id: "u-9", email: "pm@program.org" }, { id: "u-1", email: "ops@program.org" }], error: null },
      },
      calls,
    );
    const r = await readAutoInputs(client, root);
    expect(r.inputs.revenueEvents[0]).toMatchObject({ id: 1, plan_id: "accelerator_starter", payer_email: "ops@program.org" });
    expect(calls.some((c) => c.startsWith("pilot_orders:"))).toBe(false);
    expect(calls.some((c) => c.startsWith("revenue_events:") && c.includes("plan_id"))).toBe(true);
    expect(r.inputs.batches[0]).toMatchObject({ id: "b-1", owner_email: "pm@program.org", program_name: "Spring 2026" });
    expect(r.inputs.feedbackLetters).toEqual([]);
    expect(r.warnings.some((w) => w.startsWith("founder_feedback_letters:"))).toBe(true);
    expect(calls.some((c) => c.startsWith("evaluation_batches:") && c.includes("program_name"))).toBe(true);
  });

  it("G24-C: reads is_demo + the owner's role; a demo cohort by a non-admin seat is flagged is_demo / owner_is_admin=false, by the operator owner_is_admin=true", async () => {
    const calls: string[] = [];
    const client = fakeClient(
      {
        evaluation_batches: {
          data: [
            { id: "b-demo", user_id: "u-ext", name: "Demo cohort", program_name: "Workflow demo (fictional data)", status: "done", total: 5, done_count: 5, finished_at: "2026-09-21T00:00:00.000Z", created_at: "2026-09-21T00:00:00.000Z", is_demo: true },
            { id: "b-admin-demo", user_id: "u-admin", name: "Demo cohort", status: "done", total: 5, done_count: 5, finished_at: "2026-09-21T00:00:00.000Z", created_at: "2026-09-21T00:00:00.000Z", is_demo: true },
            { id: "b-real", user_id: "u-ext", name: "Spring", status: "done", total: 5, done_count: 5, finished_at: "2026-09-16T00:00:00.000Z", created_at: "2026-09-15T00:00:00.000Z", is_demo: false },
          ],
          error: null,
        },
        app_users: { data: [{ id: "u-ext", email: "pm@program.org", role: "user" }, { id: "u-admin", email: "ops@blockid.au", role: "admin" }], error: null },
      },
      calls,
    );
    const r = await readAutoInputs(client, root);
    expect(calls.some((c) => c.startsWith("evaluation_batches:") && c.includes("is_demo"))).toBe(true);
    expect(calls.some((c) => c.startsWith("app_users:") && c.includes("role"))).toBe(true);
    expect(r.inputs.batches.map((b) => [b.id, b.is_demo, b.owner_is_admin])).toEqual([
      ["b-demo", true, false],
      ["b-admin-demo", true, true],
      ["b-real", false, false],
    ]);
    expect(isAdminOwner({ email: "admin@blockid.au", role: null })).toBe(true);
    expect(isAdminOwner({ email: "someone@blockid.au", role: null })).toBe(false);
    expect(isAdminOwner(null)).toBe(false);
  });

  it("falls back to the 0422 batch columns when only is_demo is missing (42703), then the 0322 shape when program_name is missing too", async () => {
    const calls: string[] = [];
    const base = fakeClient({ evaluation_batches: { data: [{ id: "b-1", user_id: "u-9", name: "Spring", program_name: "Spring 2026", status: "done", total: 1, done_count: 1, finished_at: null, created_at: "2026-09-15T00:00:00.000Z" }], error: null } }, calls);
    let first = true;
    const client: InstitutionalClient = {
      from: (table) => ({
        select: (cols) => {
          if (table === "evaluation_batches" && first) {
            first = false;
            calls.push(`${table}:${cols}`);
            return fakeClient({ evaluation_batches: { data: null, error: { message: "column evaluation_batches.is_demo does not exist (42703)" } } }).from(table).select(cols);
          }
          return base.from(table).select(cols);
        },
      }),
    };
    const r = await readAutoInputs(client, root);
    expect(r.inputs.batches.map((b) => [b.name, b.is_demo])).toEqual([["Spring", false]]);
    const batchCalls = calls.filter((c) => c.startsWith("evaluation_batches:"));
    expect(batchCalls).toHaveLength(2);
    expect(batchCalls[1]).toContain("program_name");
    expect(batchCalls[1]).not.toContain("is_demo");
    expect(r.warnings.filter((w) => w.startsWith("evaluation_batches:"))).toHaveLength(0);
  });

  it("falls back to the pre-0422 batch columns when program_name is missing (42703)", async () => {
    const calls: string[] = [];
    let first = true;
    const base = fakeClient({ evaluation_batches: { data: [{ id: "b-1", user_id: "u-9", name: "Spring", status: "done", total: 1, done_count: 1, finished_at: null, created_at: "2026-09-15T00:00:00.000Z" }], error: null } }, calls);
    const client: InstitutionalClient = {
      from: (table) => ({
        select: (cols) => {
          if (table === "evaluation_batches" && first) {
            first = false;
            calls.push(`${table}:${cols}`);
            return fakeClient({ evaluation_batches: { data: null, error: { message: 'column evaluation_batches.program_name does not exist (42703)' } } }).from(table).select(cols);
          }
          return base.from(table).select(cols);
        },
      }),
    };
    const r = await readAutoInputs(client, root);
    expect(r.inputs.batches.map((b) => b.name)).toEqual(["Spring"]);
    expect(calls.filter((c) => c.startsWith("evaluation_batches:"))).toHaveLength(2);
    // The pre-0422 shape is expected, not a defect — no warning for the handled fallback.
    expect(r.warnings.filter((w) => w.startsWith("evaluation_batches:"))).toHaveLength(0);
  });
});

describe("readValidationDashboard", () => {
  it("ledger + auto rows + ladder + North Star + live window metrics + warnings", async () => {
    await writeValidationLedger(root, { version: 1, updated_at: null, entries: [newEntry({ organisation: "Acme", contact_role: "", date: "2026-09-19", level: 1, outcome: "done", objection: "Too early", objection_answered: false, next_step: "", note: "" }, "e-1")] });
    const client = fakeClient({
      revenue_events: { data: [INVOICE], error: null },
      evaluation_batch_items: { data: [{ batch_id: "b1", scored_at: "2026-09-02T00:00:00Z", status: "done" }], error: null },
      evaluation_batches: { data: [{ id: "b1", user_id: "org", name: "Cohort", status: "done", total: 1, done_count: 1, finished_at: null, created_at: "2026-09-01T00:00:00Z" }], error: null },
      app_users: { data: [{ id: "org", plan: "investor_fund", email: "desk@fund.vc" }, { id: "u-1", email: "ops@program.org" }], error: null },
      projects: { data: null, count: 12, error: null },
    });
    const d = await readValidationDashboard(client, root, Date.UTC(2026, 8, 20));
    expect(d.ledger.entries).toHaveLength(1);
    expect(d.ladder[0]).toMatchObject({ level: 1, actual: 1, target: 5 });
    expect(d.ladder[3]).toMatchObject({ level: 4, actual: 1, auto_counted: 1 });
    expect(d.auto.map((r) => r.source).sort()).toEqual(["evaluation_batches", "pilot-applications.jsonl", "revenue_events"]);
    expect(d.objections[0]?.text).toBe("Too early");
    expect(d.north_star).toMatchObject({ month: "2026-09", assessed: 1, paying_orgs: 1 });
    expect(d.window?.days).toBe(28);
    expect(d.window?.metrics.every((m) => typeof m.key === "string" && m.key.includes("."))).toBe(true);
    expect(d.window?.metrics.some((m) => m.value === 12)).toBe(true);
    expect(Array.isArray(d.warnings)).toBe(true);
  });
});
