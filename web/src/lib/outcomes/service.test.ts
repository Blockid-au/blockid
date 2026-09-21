// Outcome service on a purpose-built chainable fake (G21 P3-A): the row
// written on record (status proposed for founder / evaluator, confirmed only
// for an admin with confirm=true), the duplicate key → existing row, the
// proposed-cap, the tier projection, and resolve: owner on founder /
// evaluator sources only, admin on any, conditioned update → 409 when
// someone else got there first.
import { describe, expect, it } from "vitest";
import { listOutcomesQueue, listProjectOutcomes, observedAtKey, projectOutcomesByTier, recordOutcome, resolveOutcome, type ResolveActor } from "./service";
import type { OutcomeRow } from "./types";

const PID = "11111111-2222-4333-8444-555555555555";
const OID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const NOW = new Date("2026-09-20T10:00:00.000Z");

interface Call { table: string; op: string; args: unknown[] }

function makeDb(seed: Record<string, Record<string, unknown>[]>, opts: { insertError?: { code: string; message: string }; updateHits?: boolean } = {}) {
  const calls: Call[] = [];
  const rows = { ...seed };
  function chain(table: string, write: Record<string, unknown> | null, mode: "insert" | "update" | null) {
    const t: Record<string, unknown> = {};
    const p: unknown = new Proxy(t, {
      get(_o, prop: string) {
        if (prop === "then") {
          const data = rows[table] ?? [];
          const pr = Promise.resolve({ data, error: null, count: data.length });
          return pr.then.bind(pr);
        }
        if (prop === "single" || prop === "maybeSingle") {
          return () => {
            calls.push({ table, op: prop, args: [] });
            const base = (rows[table] ?? [])[0] ?? null;
            if (mode === "insert") {
              if (opts.insertError) return Promise.resolve({ data: null, error: opts.insertError });
              const created = { id: OID, created_at: NOW.toISOString(), updated_at: NOW.toISOString(), ...write };
              rows[table] = [created, ...(rows[table] ?? [])];
              return Promise.resolve({ data: created, error: null });
            }
            if (mode === "update") {
              if (opts.updateHits === false) return Promise.resolve({ data: null, error: null });
              const merged = { ...(base ?? {}), ...write };
              if (base) rows[table] = [merged, ...(rows[table] ?? []).slice(1)];
              return Promise.resolve({ data: merged, error: null });
            }
            return Promise.resolve({ data: base, error: null });
          };
        }
        return (...args: unknown[]) => {
          calls.push({ table, op: prop, args });
          if (prop === "insert") return chain(table, args[0] as Record<string, unknown>, "insert");
          if (prop === "update") return chain(table, args[0] as Record<string, unknown>, "update");
          return p;
        };
      },
    });
    return p;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { db: { from: (table: string) => chain(table, null, null) } as any, calls, rows };
}

const INPUT = { kind: "funding_raised" as const, observedAt: "2026-08-15T09:30:45.000Z", value: { amount_aud: 500000, round: "seed" }, note: "Closed.", confidence: null };

const ROW: OutcomeRow = { id: OID, project_id: PID, kind: "funding_raised", observed_at: "2026-08-15T09:30:00.000Z", value: { amount_aud: 500000, round: "seed", source_url: "https://x.io/news" }, source: "founder", confidence: 60, recorded_by: "u-1", status: "proposed", confirmed_by: null, confirmed_at: null, note: "Closed.", created_at: NOW.toISOString(), updated_at: NOW.toISOString() };

describe("observedAtKey", () => {
  it("truncates to the minute so a same-day re-submit hits the unique key", () => {
    expect(observedAtKey("2026-08-15T09:30:45.678Z")).toBe("2026-08-15T09:30:00.000Z");
    expect(observedAtKey("nope")).toBe("nope");
  });
});

describe("recordOutcome", () => {
  it("founder → proposed row with the founder default confidence; note + value carried", async () => {
    const { db, calls } = makeDb({ startup_outcomes: [] });
    const r = await recordOutcome(db, { projectId: PID, input: INPUT, source: "founder", recordedBy: "u-1" }, { now: () => NOW });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.duplicate).toBe(false);
    expect(r.row).toMatchObject({ project_id: PID, kind: "funding_raised", observed_at: "2026-08-15T09:30:00.000Z", source: "founder", confidence: 60, status: "proposed", recorded_by: "u-1", confirmed_by: null, note: "Closed." });
    expect(calls.find((c) => c.op === "insert")).toBeTruthy();
  });

  it("evaluator → proposed at 70; admin with confirm → confirmed with confirmed_by / confirmed_at; an explicit confidence wins", async () => {
    const ev = await recordOutcome(makeDb({ startup_outcomes: [] }).db, { projectId: PID, input: INPUT, source: "evaluator", recordedBy: "e-1" }, { now: () => NOW });
    expect(ev.ok && ev.row).toMatchObject({ source: "evaluator", confidence: 70, status: "proposed" });
    const ad = await recordOutcome(makeDb({ startup_outcomes: [] }).db, { projectId: PID, input: { ...INPUT, confidence: 99 }, source: "admin", recordedBy: "a-1", confirm: true }, { now: () => NOW });
    expect(ad.ok && ad.row).toMatchObject({ source: "admin", confidence: 99, status: "confirmed", confirmed_by: "a-1", confirmed_at: NOW.toISOString() });
    // founder cannot self-confirm through the flag
    const f = await recordOutcome(makeDb({ startup_outcomes: [] }).db, { projectId: PID, input: INPUT, source: "founder", recordedBy: "u-1", confirm: true }, { now: () => NOW });
    expect(f.ok && f.row.status).toBe("proposed");
  });

  it("unique-key violation → the existing row, flagged duplicate", async () => {
    const { db } = makeDb({ startup_outcomes: [ROW] }, { insertError: { code: "23505", message: "duplicate key" } });
    const r = await recordOutcome(db, { projectId: PID, input: INPUT, source: "founder", recordedBy: "u-1" });
    expect(r.ok && r.duplicate).toBe(true);
    expect(r.ok && r.row.id).toBe(OID);
  });

  it("other insert errors → db_error 500; the proposed cap → 429", async () => {
    const { db } = makeDb({ startup_outcomes: [] }, { insertError: { code: "42P01", message: "missing" } });
    expect(await recordOutcome(db, { projectId: PID, input: INPUT, source: "founder", recordedBy: "u-1" })).toMatchObject({ ok: false, error: "db_error", status: 500 });
    const many = makeDb({ startup_outcomes: Array.from({ length: 50 }, (_, i) => ({ ...ROW, id: `o-${i}` })) });
    expect(await recordOutcome(many.db, { projectId: PID, input: INPUT, source: "founder", recordedBy: "u-1" })).toMatchObject({ ok: false, error: "too_many_proposed", status: 429 });
  });
});

describe("listProjectOutcomes / projectOutcomesByTier", () => {
  it("lists newest observation first, optional status filter", async () => {
    const { db, calls } = makeDb({ startup_outcomes: [ROW] });
    const rows = await listProjectOutcomes(db, PID, { status: "confirmed" });
    expect(rows).toHaveLength(1);
    expect(calls.some((c) => c.op === "order" && c.args[0] === "observed_at")).toBe(true);
    expect(calls.some((c) => c.op === "eq" && c.args[0] === "status" && c.args[1] === "confirmed")).toBe(true);
  });

  it("tier projection: attributed_only → confirmed only, values withheld; reports_shared → no source links / notes; full_mentor + owner → everything minus actor ids", () => {
    const confirmed: OutcomeRow = { ...ROW, id: "o-c", status: "confirmed", confirmed_by: "u-1", confirmed_at: NOW.toISOString() };
    const rejected: OutcomeRow = { ...ROW, id: "o-r", status: "rejected" };
    const rows = [ROW, confirmed, rejected];
    const attributed = projectOutcomesByTier(rows, "attributed_only");
    expect(attributed.map((r) => r.id)).toEqual(["o-c"]);
    expect(attributed[0]).toMatchObject({ value: {}, note: null, withheld: true });
    expect(attributed[0]).not.toHaveProperty("recorded_by");
    const shared = projectOutcomesByTier(rows, "reports_shared");
    expect(shared.map((r) => r.id)).toEqual([OID, "o-c"]);
    expect(shared[0]!.value).toEqual({ amount_aud: 500000, round: "seed" });
    expect(shared[0]!.note).toBeNull();
    const full = projectOutcomesByTier(rows, "full_mentor");
    expect(full).toHaveLength(3);
    expect(full[0]!.value.source_url).toBe("https://x.io/news");
    expect(full[0]!.note).toBe("Closed.");
    expect(projectOutcomesByTier(rows, null)).toHaveLength(3);
  });
});

function actor(over: Partial<ResolveActor> = {}): ResolveActor {
  return { userId: "u-1", isAdmin: false, ownsProject: async () => true, ...over };
}

describe("resolveOutcome", () => {
  it("owner confirms an EVALUATOR proposal on their own project (never their own founder row — review P1); note appended; conditioned update on status = proposed", async () => {
    const { db, calls } = makeDb({ startup_outcomes: [{ ...ROW, source: "evaluator" }] });
    const r = await resolveOutcome(db, { id: OID, decision: "confirm", note: "Verified against the ASIC filing.", actor: actor() }, { now: () => NOW });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.row).toMatchObject({ status: "confirmed", confirmed_by: "u-1", confirmed_at: NOW.toISOString(), note: "Closed.\n— Verified against the ASIC filing." });
    const upd = calls.find((c) => c.op === "update");
    expect(upd).toBeTruthy();
    const eqs = calls.filter((c) => c.op === "eq").map((c) => c.args);
    expect(eqs).toContainEqual(["status", "proposed"]);
  });

  it("owner cannot resolve connector / register proposals (403); non-owner → 404; admin resolves any", async () => {
    // Review P1: the founder cannot confirm their own founder-source row (self-declared → calibration).
    expect(await resolveOutcome(makeDb({ startup_outcomes: [{ ...ROW, source: "founder" }] }).db, { id: OID, decision: "confirm", note: null, actor: actor() })).toMatchObject({ ok: false, error: "forbidden", status: 403 });
    const connector: OutcomeRow = { ...ROW, source: "connector" };
    expect(await resolveOutcome(makeDb({ startup_outcomes: [connector] }).db, { id: OID, decision: "confirm", note: null, actor: actor() })).toMatchObject({ ok: false, error: "forbidden", status: 403 });
    expect(await resolveOutcome(makeDb({ startup_outcomes: [ROW] }).db, { id: OID, decision: "confirm", note: null, actor: actor({ ownsProject: async () => false }) })).toMatchObject({ ok: false, error: "not_found", status: 404 });
    const admin = await resolveOutcome(makeDb({ startup_outcomes: [connector] }).db, { id: OID, decision: "reject", note: "Not this company.", actor: actor({ userId: "a-1", isAdmin: true }) }, { now: () => NOW });
    expect(admin.ok && admin.row).toMatchObject({ status: "rejected", confirmed_by: "a-1" });
  });

  it("unknown id → 404; already resolved → 409; lost race → 409 already_resolved", async () => {
    expect(await resolveOutcome(makeDb({ startup_outcomes: [] }).db, { id: OID, decision: "confirm", note: null, actor: actor() })).toMatchObject({ ok: false, error: "not_found", status: 404 });
    expect(await resolveOutcome(makeDb({ startup_outcomes: [{ ...ROW, source: "evaluator", status: "confirmed" }] }).db, { id: OID, decision: "confirm", note: null, actor: actor() })).toMatchObject({ ok: false, error: "not_proposed", status: 409 });
    expect(await resolveOutcome(makeDb({ startup_outcomes: [{ ...ROW, source: "evaluator" }] }, { updateHits: false }).db, { id: OID, decision: "confirm", note: null, actor: actor() })).toMatchObject({ ok: false, error: "already_resolved", status: 409 });
  });
});

describe("listOutcomesQueue", () => {
  it("joins the project name; status filter; empty when nothing", async () => {
    const { db, calls } = makeDb({ startup_outcomes: [ROW], projects: [{ id: PID, name: "Acme" }] });
    const rows = await listOutcomesQueue(db, { status: "proposed" });
    expect(rows[0]).toMatchObject({ id: OID, project_name: "Acme" });
    expect(calls.some((c) => c.table === "projects" && c.op === "in")).toBe(true);
    expect(await listOutcomesQueue(makeDb({ startup_outcomes: [] }).db)).toEqual([]);
  });
});
