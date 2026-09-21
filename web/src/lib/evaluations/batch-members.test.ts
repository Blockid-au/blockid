// Colocated vitest for lib/evaluations/batch-members (G21 P2-B; migration
// 0423 evaluation_batch_members). Against a small per-table in-memory fake
// of @/lib/supabase. Pins: batchRoleAtLeast's rank order; resolveBatchRole
// (creator -> owner + isCreator, a member row -> its own role, neither ->
// null); assertBatchRole (unavailable with no client, not_found when the
// batch is missing, the creator passes any minRole WITHOUT a members read,
// a non-creator's member row is read and enforced against minRole,
// not_found for a non-member, and a missing members table demotes a
// non-creator to not_found while the creator still passes); listBatchMembers
// (creator first with its profile joined, member rows with their profiles,
// available:false when the table is missing); normaliseInviteEmail;
// addBatchMember (invalid_email / self / unknown_email-with-hint, the
// upsert + invite e-mail + audit path, the already-a-member path which
// re-audits as a role change and sends no e-mail, unavailable on a missing
// table); removeBatchMember (the creator can never be removed, removed
// true/false, the audit row); and buildCohortInviteEmail's subject / role
// line / HTML escaping / text twin.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Row = Record<string, unknown>;
type Db = {
  evaluation_batches: Row[];
  evaluation_batch_members: Row[];
  app_users: Row[];
  evaluation_batch_items: Row[];
};

const state: { db: Db; errors: Partial<Record<keyof Db, { code?: string; message?: string }>>; configured: boolean; nextId: number } = {
  db: { evaluation_batches: [], evaluation_batch_members: [], app_users: [], evaluation_batch_items: [] },
  errors: {},
  configured: true,
  nextId: 1,
};

function resetDb(): void {
  state.db = { evaluation_batches: [], evaluation_batch_members: [], app_users: [], evaluation_batch_items: [] };
  state.errors = {};
  state.configured = true;
  state.nextId = 1;
}

/** A minimal chainable PostgREST-like builder over one table of `state.db`. */
function builder(table: keyof Db) {
  type Filter = (r: Row) => boolean;
  const filters: Filter[] = [];
  let op: "select" | "insert" | "upsert" | "update" | "delete" = "select";
  let patch: Row = {};
  let payload: Row | Row[] | null = null;
  let onConflict: string | undefined;
  let ordering: { col: string; asc: boolean } | null = null;
  let lim: number | null = null;

  const rowsMatching = () => {
    let rows = state.db[table].filter((r) => filters.every((f) => f(r)));
    if (ordering) {
      const { col, asc } = ordering;
      rows = [...rows].sort((a, b) => (String(a[col] ?? "") < String(b[col] ?? "") ? -1 : String(a[col] ?? "") > String(b[col] ?? "") ? 1 : 0) * (asc ? 1 : -1));
    }
    if (lim != null) rows = rows.slice(0, lim);
    return rows;
  };

  const run = () => {
    const err = state.errors[table];
    if (err) return { data: null, error: err };
    if (op === "insert") {
      const rows = (Array.isArray(payload) ? payload : [payload as Row]).map((r) => ({ id: `${String(table)}-${state.nextId++}`, created_at: r.created_at ?? "2026-09-20T00:00:00Z", ...r }));
      state.db[table].push(...rows);
      return { data: rows.map((r) => ({ ...r })), error: null };
    }
    if (op === "upsert") {
      const rows = Array.isArray(payload) ? payload : [payload as Row];
      const keys = (onConflict ?? "id").split(",");
      const out: Row[] = [];
      for (const r of rows) {
        const existing = state.db[table].find((x) => keys.every((k) => String(x[k]) === String(r[k])));
        if (existing) {
          Object.assign(existing, r);
          out.push({ ...existing });
        } else {
          const row = { created_at: "2026-09-20T00:00:00Z", ...r };
          state.db[table].push(row);
          out.push({ ...row });
        }
      }
      return { data: out, error: null };
    }
    if (op === "update") {
      const rows = rowsMatching();
      for (const r of rows) Object.assign(r, patch);
      return { data: rows.map((r) => ({ ...r })), error: null };
    }
    if (op === "delete") {
      const rows = rowsMatching();
      state.db[table] = state.db[table].filter((r) => !rows.includes(r));
      return { data: rows.map((r) => ({ ...r })), error: null };
    }
    return { data: rowsMatching().map((r) => ({ ...r })), error: null };
  };

  const b: Record<string, unknown> = {};
  Object.assign(b, {
    select() {
      return b;
    },
    insert(p: Row | Row[]) {
      op = "insert";
      payload = p;
      return b;
    },
    upsert(p: Row, opts?: { onConflict?: string }) {
      op = "upsert";
      payload = p;
      onConflict = opts?.onConflict;
      return b;
    },
    update(p: Row) {
      op = "update";
      patch = p;
      return b;
    },
    delete() {
      op = "delete";
      return b;
    },
    eq(col: string, val: unknown) {
      filters.push((r) => String(r[col]) === String(val));
      return b;
    },
    in(col: string, vals: unknown[]) {
      filters.push((r) => vals.map(String).includes(String(r[col])));
      return b;
    },
    ilike(col: string, val: string) {
      const needle = String(val).toLowerCase();
      filters.push((r) => String(r[col] ?? "").toLowerCase() === needle);
      return b;
    },
    order(col: string, o?: { ascending?: boolean }) {
      ordering = { col, asc: o?.ascending !== false };
      return b;
    },
    limit(n: number) {
      lim = n;
      return b;
    },
    maybeSingle() {
      const { data, error } = run();
      const rows = (data ?? []) as Row[];
      return Promise.resolve({ data: rows[0] ?? null, error });
    },
    then(ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) {
      return Promise.resolve(run()).then(ok, err);
    },
  });
  return b;
}

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => (state.configured ? { from: (t: keyof Db) => builder(t) } : null),
}));

const { auditMock, sendMock } = vi.hoisted(() => ({
  auditMock: vi.fn(async () => ({ id: 1n, curr_hash: "h" })),
  sendMock: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/audit", () => ({ appendAudit: (p: unknown) => auditMock(p as never) }));
vi.mock("@/lib/email", () => ({
  sendEmail: (a: unknown) => sendMock(a as never),
  complianceFooter: async () => ({ unsubscribeUrl: "https://blockid.au/u", preferencesUrl: "https://blockid.au/p", footerHtml: "<p>footer</p>", footerText: "footer" }),
}));

import type { EvaluationBatch } from "./batch-shared";
import {
  addBatchMember,
  assertBatchRole,
  batchRoleAtLeast,
  batchSeatForEvaluation,
  buildCohortInviteEmail,
  getBatchById,
  listBatchMembers,
  normaliseInviteEmail,
  removeBatchMember,
  resolveBatchRole,
  type BatchMember,
} from "./batch-members";

function batchRow(over: Row = {}): Row {
  return { id: "b-1", user_id: "u-owner", name: "Cohort 4", rubric_weights: {}, status: "running", total: 3, done_count: 1, failed_count: 0, created_at: "2026-09-10T00:00:00Z", started_at: null, finished_at: null, ...over };
}

function batch(over: Partial<EvaluationBatch> = {}): EvaluationBatch {
  return { id: "b-1", userId: "u-owner", name: "Cohort 4", rubricWeights: {} as EvaluationBatch["rubricWeights"], status: "running", total: 3, doneCount: 1, failedCount: 0, createdAt: "2026-09-10T00:00:00Z", startedAt: null, finishedAt: null, ...over };
}

beforeEach(() => {
  resetDb();
  auditMock.mockClear();
  sendMock.mockClear().mockResolvedValue({ ok: true });
});

describe("batchRoleAtLeast", () => {
  it("ranks owner > reviewer > viewer", () => {
    expect(batchRoleAtLeast("owner", "viewer")).toBe(true);
    expect(batchRoleAtLeast("owner", "reviewer")).toBe(true);
    expect(batchRoleAtLeast("owner", "owner")).toBe(true);
    expect(batchRoleAtLeast("reviewer", "owner")).toBe(false);
    expect(batchRoleAtLeast("reviewer", "reviewer")).toBe(true);
    expect(batchRoleAtLeast("reviewer", "viewer")).toBe(true);
    expect(batchRoleAtLeast("viewer", "reviewer")).toBe(false);
    expect(batchRoleAtLeast("viewer", "viewer")).toBe(true);
  });
});

describe("resolveBatchRole", () => {
  it("the creator resolves to owner + isCreator, regardless of any member row", () => {
    expect(resolveBatchRole({ userId: "u-owner" }, "u-owner", null)).toEqual({ role: "owner", isCreator: true });
    expect(resolveBatchRole({ userId: "u-owner" }, "u-owner", "viewer")).toEqual({ role: "owner", isCreator: true });
  });

  it("a non-creator with a member row resolves to that role", () => {
    expect(resolveBatchRole({ userId: "u-owner" }, "u-2", "reviewer")).toEqual({ role: "reviewer", isCreator: false });
  });

  it("a non-creator with no member row resolves to null", () => {
    expect(resolveBatchRole({ userId: "u-owner" }, "u-2", null)).toBeNull();
  });
});

describe("assertBatchRole", () => {
  it("unavailable when there is no Supabase client", async () => {
    state.configured = false;
    expect(await assertBatchRole("b-1", "u-owner")).toEqual({ ok: false, error: "unavailable" });
  });

  it("not_found when the batch does not exist", async () => {
    expect(await assertBatchRole("b-missing", "u-owner")).toEqual({ ok: false, error: "not_found" });
  });

  it("the creator passes any minRole without a members-table read", async () => {
    state.db.evaluation_batches.push(batchRow());
    state.errors.evaluation_batch_members = { code: "42P01", message: "relation does not exist" };
    const r = await assertBatchRole("b-1", "u-owner", "owner");
    expect(r).toMatchObject({ ok: true, role: "owner", isCreator: true });
  });

  it("a member row is read for a non-creator and enforced against minRole", async () => {
    state.db.evaluation_batches.push(batchRow());
    state.db.evaluation_batch_members.push({ batch_id: "b-1", user_id: "u-2", role: "reviewer" });
    expect(await assertBatchRole("b-1", "u-2", "viewer")).toMatchObject({ ok: true, role: "reviewer", isCreator: false });
    expect(await assertBatchRole("b-1", "u-2", "owner")).toEqual({ ok: false, error: "forbidden" });
  });

  it("not_found for a non-member", async () => {
    state.db.evaluation_batches.push(batchRow());
    expect(await assertBatchRole("b-1", "u-stranger")).toEqual({ ok: false, error: "not_found" });
  });

  it("a missing members table demotes a non-creator to not_found (fail-soft before 0423)", async () => {
    state.db.evaluation_batches.push(batchRow());
    state.errors.evaluation_batch_members = { code: "42P01", message: "relation does not exist" };
    expect(await assertBatchRole("b-1", "u-stranger")).toEqual({ ok: false, error: "not_found" });
  });
});

describe("batchSeatForEvaluation (G22-A viaBatch)", () => {
  it("null without a client, an empty id, or when the evaluation is in no batch", async () => {
    expect(await batchSeatForEvaluation("u-x", "")).toBeNull();
    expect(await batchSeatForEvaluation("", "e-1")).toBeNull();
    expect(await batchSeatForEvaluation("u-x", "e-1")).toBeNull();
    state.configured = false;
    expect(await batchSeatForEvaluation("u-x", "e-1")).toBeNull();
  });

  it("the creator of a batch that holds the evaluation is its owner (no member row needed)", async () => {
    state.db.evaluation_batches.push(batchRow());
    state.db.evaluation_batch_items.push({ id: 1, batch_id: "b-1", evaluation_id: "e-1" });
    expect(await batchSeatForEvaluation("u-owner", "e-1")).toEqual({ batchId: "b-1", role: "owner" });
    // A different evaluation in no batch → null even for the owner.
    expect(await batchSeatForEvaluation("u-owner", "e-9")).toBeNull();
  });

  it("a member row on a batch that holds the evaluation gives that role; the highest seat wins across batches; strangers get null", async () => {
    state.db.evaluation_batches.push(batchRow(), batchRow({ id: "b-2", user_id: "u-other" }));
    state.db.evaluation_batch_items.push({ id: 1, batch_id: "b-1", evaluation_id: "e-1" }, { id: 2, batch_id: "b-2", evaluation_id: "e-1" });
    state.db.evaluation_batch_members.push({ batch_id: "b-1", user_id: "u-seat", role: "viewer" }, { batch_id: "b-2", user_id: "u-seat", role: "reviewer" });
    expect(await batchSeatForEvaluation("u-seat", "e-1")).toEqual({ batchId: "b-2", role: "reviewer" });
    expect(await batchSeatForEvaluation("u-stranger", "e-1")).toBeNull();
    // A member row on an unrelated batch does not open this evaluation.
    state.db.evaluation_batch_members.push({ batch_id: "b-3", user_id: "u-elsewhere", role: "owner" });
    expect(await batchSeatForEvaluation("u-elsewhere", "e-1")).toBeNull();
  });

  it("fail-soft: a missing members table (pre-0423) or a failing items read → null", async () => {
    state.db.evaluation_batches.push(batchRow({ id: "b-1", user_id: "u-other" }));
    state.db.evaluation_batch_items.push({ id: 1, batch_id: "b-1", evaluation_id: "e-1" });
    state.errors.evaluation_batch_members = { code: "42P01", message: "relation does not exist" };
    expect(await batchSeatForEvaluation("u-seat", "e-1")).toBeNull();
    state.errors = { evaluation_batch_items: { code: "42P01", message: "relation does not exist" } };
    expect(await batchSeatForEvaluation("u-other", "e-1")).toBeNull();
  });
});

describe("getBatchById", () => {
  it("returns null when missing / no client", async () => {
    expect(await getBatchById("b-missing")).toBeNull();
    state.configured = false;
    expect(await getBatchById("b-1")).toBeNull();
  });

  it("maps the row", async () => {
    state.db.evaluation_batches.push(batchRow());
    const b = await getBatchById("b-1");
    expect(b).toMatchObject({ id: "b-1", userId: "u-owner", name: "Cohort 4" });
  });
});

describe("listBatchMembers", () => {
  it("returns just the creator (with its profile) when the members table is empty", async () => {
    state.db.app_users.push({ id: "u-owner", email: "owner@x.test", display_name: "Owner" });
    const { members, available } = await listBatchMembers(batch());
    expect(available).toBe(true);
    expect(members).toEqual([{ userId: "u-owner", role: "owner", email: "owner@x.test", displayName: "Owner", invitedBy: null, createdAt: "2026-09-10T00:00:00Z", isCreator: true }]);
  });

  it("lists the creator first, then member rows, each with its profile", async () => {
    state.db.app_users.push({ id: "u-owner", email: "owner@x.test", display_name: "Owner" }, { id: "u-2", email: "reviewer@x.test", display_name: "Reviewer Two" });
    state.db.evaluation_batch_members.push({ batch_id: "b-1", user_id: "u-2", role: "reviewer", invited_by: "u-owner", created_at: "2026-09-11T00:00:00Z" });
    const { members, available } = await listBatchMembers(batch());
    expect(available).toBe(true);
    expect(members.map((m) => m.userId)).toEqual(["u-owner", "u-2"]);
    expect(members[1]).toMatchObject({ role: "reviewer", email: "reviewer@x.test", displayName: "Reviewer Two", invitedBy: "u-owner", isCreator: false });
  });

  it("available:false and just the creator when the members table is missing", async () => {
    state.errors.evaluation_batch_members = { code: "42P01", message: "relation does not exist" };
    const { members, available } = await listBatchMembers(batch());
    expect(available).toBe(false);
    expect(members).toHaveLength(1);
    expect(members[0].isCreator).toBe(true);
  });

  it("unconfigured Supabase: still the creator, available:false", async () => {
    state.configured = false;
    const { members, available } = await listBatchMembers(batch());
    expect(available).toBe(false);
    expect(members).toEqual([{ userId: "u-owner", role: "owner", email: null, displayName: null, invitedBy: null, createdAt: "2026-09-10T00:00:00Z", isCreator: true }]);
  });
});

describe("normaliseInviteEmail", () => {
  it("lowercases + trims a plausible address, rejects the rest", () => {
    expect(normaliseInviteEmail("  Jo@Example.com  ")).toBe("jo@example.com");
    expect(normaliseInviteEmail("no-at-sign")).toBeNull();
    expect(normaliseInviteEmail("a@b")).toBe("a@b");
    expect(normaliseInviteEmail("has space@x.test")).toBeNull();
    expect(normaliseInviteEmail("a")).toBeNull();
    expect(normaliseInviteEmail("x".repeat(255) + "@x.test")).toBeNull();
  });
});

describe("addBatchMember", () => {
  const inviter = { id: "u-owner", email: "owner@x.test", displayName: "Owner" };

  it("invalid_email / self / unknown_email (with the sign-up hint)", async () => {
    const r1 = await addBatchMember({ batch: batch(), inviter, email: "not-an-email", role: "reviewer" });
    expect(r1).toEqual({ ok: false, error: "invalid_email", message: "Enter a valid e-mail address" });
    const r2 = await addBatchMember({ batch: batch(), inviter, email: "Owner@X.test", role: "reviewer" });
    expect(r2.ok).toBe(false);
    expect((r2 as { error: string }).error).toBe("self");
    const r3 = await addBatchMember({ batch: batch(), inviter, email: "ghost@x.test", role: "reviewer" });
    expect(r3.ok).toBe(false);
    expect((r3 as { error: string; message: string }).error).toBe("unknown_email");
    expect((r3 as { message: string }).message).toContain("/signup");
  });

  it("also refuses when the found account already owns the cohort", async () => {
    state.db.app_users.push({ id: "u-owner", email: "owner-alt@x.test", display_name: "Owner" });
    const r = await addBatchMember({ batch: batch(), inviter, email: "owner-alt@x.test", role: "reviewer" });
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toBe("self");
  });

  it("upserts the member, sends the invite e-mail, and audits cohort.member_added", async () => {
    state.db.app_users.push({ id: "u-2", email: "reviewer@x.test", display_name: "Reviewer Two" });
    const r = await addBatchMember({ batch: batch(), inviter, email: "Reviewer@X.test", role: "reviewer", siteBase: "https://blockid.au" });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    expect(r.already).toBe(false);
    expect(r.emailSent).toBe(true);
    expect(r.member).toMatchObject({ userId: "u-2", role: "reviewer", email: "reviewer@x.test", displayName: "Reviewer Two" });
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect((sendMock.mock.calls[0][0] as { to: string }).to).toBe("reviewer@x.test");
    expect(auditMock).toHaveBeenCalledTimes(1);
    expect(auditMock.mock.calls[0][0]).toMatchObject({ action: "cohort.member_added", resource_type: "evaluation_batch", resource_id: "b-1", detail: { member_user_id: "u-2", role: "reviewer", email_sent: true } });
    expect(state.db.evaluation_batch_members.find((m) => m.user_id === "u-2")?.role).toBe("reviewer");
  });

  it("re-inviting an existing member changes the role, sends no e-mail, and audits cohort.member_role_changed", async () => {
    state.db.app_users.push({ id: "u-2", email: "reviewer@x.test", display_name: "Reviewer Two" });
    state.db.evaluation_batch_members.push({ batch_id: "b-1", user_id: "u-2", role: "viewer", invited_by: "u-owner", created_at: "2026-09-11T00:00:00Z" });
    const r = await addBatchMember({ batch: batch(), inviter, email: "reviewer@x.test", role: "reviewer" });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    expect(r.already).toBe(true);
    expect(r.emailSent).toBe(false);
    expect(sendMock).not.toHaveBeenCalled();
    expect(auditMock.mock.calls[0][0]).toMatchObject({ action: "cohort.member_role_changed" });
    expect(state.db.evaluation_batch_members.find((m) => m.user_id === "u-2")?.role).toBe("reviewer");
  });

  it("unavailable when the members table is missing (0423 pending)", async () => {
    state.db.app_users.push({ id: "u-2", email: "reviewer@x.test", display_name: "Reviewer Two" });
    state.errors.evaluation_batch_members = { code: "42P01", message: "relation does not exist" };
    const r = await addBatchMember({ batch: batch(), inviter, email: "reviewer@x.test", role: "reviewer" });
    expect(r).toEqual({ ok: false, error: "unavailable", message: "Cohort reviewer seats are not available yet (migration 0423 pending)" });
  });

  it("unavailable when there is no Supabase client", async () => {
    state.configured = false;
    const r = await addBatchMember({ batch: batch(), inviter, email: "reviewer@x.test", role: "reviewer" });
    expect(r).toEqual({ ok: false, error: "unavailable", message: "Database not configured" });
  });
});

describe("removeBatchMember", () => {
  it("the creator can never be removed", async () => {
    const r = await removeBatchMember({ batch: batch(), actorId: "u-owner", userId: "u-owner" });
    expect(r).toEqual({ ok: false, error: "creator", message: "The cohort owner cannot be removed" });
  });

  it("removed:true and audits cohort.member_removed when the row existed", async () => {
    state.db.evaluation_batch_members.push({ batch_id: "b-1", user_id: "u-2", role: "reviewer" });
    const r = await removeBatchMember({ batch: batch(), actorId: "u-owner", userId: "u-2" });
    expect(r).toEqual({ ok: true, removed: true });
    expect(state.db.evaluation_batch_members).toHaveLength(0);
    expect(auditMock).toHaveBeenCalledTimes(1);
    expect(auditMock.mock.calls[0][0]).toMatchObject({ action: "cohort.member_removed", resource_id: "b-1", detail: { member_user_id: "u-2" } });
  });

  it("removed:false and no audit when the row did not exist", async () => {
    const r = await removeBatchMember({ batch: batch(), actorId: "u-owner", userId: "u-ghost" });
    expect(r).toEqual({ ok: true, removed: false });
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("unavailable when there is no Supabase client", async () => {
    state.configured = false;
    const r = await removeBatchMember({ batch: batch(), actorId: "u-owner", userId: "u-2" });
    expect(r).toEqual({ ok: false, error: "unavailable", message: "Database not configured" });
  });
});

describe("buildCohortInviteEmail", () => {
  it("subject names the inviter and the cohort; the role line varies by role", () => {
    const viewer = buildCohortInviteEmail({ inviterName: "Jo", cohortName: "Cohort 4", role: "viewer", url: "https://blockid.au/x" });
    expect(viewer.subject).toBe('Jo added you to the BlockID Cohort “Cohort 4”');
    expect(viewer.text).toContain("view the cohort table, comparisons and the decision log");
    const reviewer = buildCohortInviteEmail({ inviterName: "Jo", cohortName: "Cohort 4", role: "reviewer", url: "https://blockid.au/x" });
    expect(reviewer.text).toContain("shortlist, set review status, record overrides with a reason code and draft decisions");
    const owner = buildCohortInviteEmail({ inviterName: "Jo", cohortName: "Cohort 4", role: "owner", url: "https://blockid.au/x" });
    expect(owner.text).toContain("manage the cohort, including inviting reviewers");
  });

  it("escapes HTML in the inviter / cohort name and carries a text twin + link", () => {
    const { html, text } = buildCohortInviteEmail({ inviterName: '<b>Jo</b>', cohortName: "Cohort <script>4</script>", role: "reviewer", url: "https://blockid.au/x" });
    expect(html).toContain("&lt;b&gt;Jo&lt;/b&gt;");
    expect(html).toContain("Cohort &lt;script&gt;4&lt;/script&gt;");
    expect(html).not.toContain("<script>4</script>");
    expect(html).toContain('href="https://blockid.au/x"');
    expect(text).toContain("https://blockid.au/x");
    expect(text).toContain("Humans make the decision.");
  });
});

// Reference so the imported type is exercised (a BatchMember shape sanity check).
describe("BatchMember shape", () => {
  it("has the fields listBatchMembers/addBatchMember populate", () => {
    const m: BatchMember = { userId: "u-1", role: "viewer", email: null, displayName: null, invitedBy: null, createdAt: "", isCreator: false };
    expect(m.role).toBe("viewer");
  });
});
