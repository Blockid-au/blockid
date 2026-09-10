import { describe, it, expect, vi, beforeEach } from "vitest";

// Colocated vitest for lib/evaluations.ts (T0270). Pins:
//   * plan-limit enforcement — `used >= getProjectLimit(plan)` refuses with
//     `evaluation_limit_reached` BEFORE any projects/evaluations insert;
//   * the projects row is owned by the evaluator (user_id = evaluator) and
//     the evaluations row carries owner_kind / consent_tier defaults;
//   * invite: founder_email mints an invite_token, sets
//     owner_kind='founder_invited', emails the founder with the agreed copy;
//   * owner checks — getEvaluationForUser / updateEvaluation / delete all
//     filter on evaluator_user_id; canAccessProjectAsEvaluator recognises
//     the evaluator and a claimed founder, nobody else;
//   * claim flow — email mismatch refused, happy path flips owner_kind /
//     consent_tier / claimed_at, second claim is idempotent, projects.user_id
//     never touched;
//   * input normalisation (website scheme, AU state, email shape).

// ─── Fake Supabase — chainable builder, queued responses per table ─────────

interface Captured {
  table: string;
  op: "select" | "insert" | "update" | "delete" | null;
  selectCols: string | null;
  selectOpts: Record<string, unknown> | null;
  payload: unknown;
  eqs: Array<{ col: string; val: unknown }>;
  ins: Array<{ col: string; vals: unknown[] }>;
  or: string | null;
  order: { col: string; opts: unknown } | null;
  limit: number | null;
  terminal: "single" | "maybeSingle" | "await" | null;
}

interface Queued {
  table: string;
  data?: unknown;
  error?: unknown;
  count?: number | null;
}

const state = {
  adminConfigured: true,
  queue: [] as Queued[],
  calls: [] as Captured[],
};

function nextResponse(table: string): { data: unknown; error: unknown; count: number | null } {
  const idx = state.queue.findIndex((q) => q.table === table);
  if (idx === -1) return { data: null, error: null, count: null };
  const [q] = state.queue.splice(idx, 1);
  return { data: q.data ?? null, error: q.error ?? null, count: q.count ?? null };
}

function makeBuilder(table: string) {
  const c: Captured = {
    table, op: null, selectCols: null, selectOpts: null, payload: null,
    eqs: [], ins: [], or: null, order: null, limit: null, terminal: null,
  };
  state.calls.push(c);
  const resolve = () => Promise.resolve(nextResponse(table));
  const b: Record<string, unknown> = {};
  Object.assign(b, {
    select(cols: string, opts?: Record<string, unknown>) {
      if (c.op === null) c.op = "select";
      c.selectCols = cols;
      c.selectOpts = opts ?? null;
      return b;
    },
    insert(payload: unknown) { c.op = "insert"; c.payload = payload; return b; },
    update(payload: unknown) { c.op = "update"; c.payload = payload; return b; },
    delete() { c.op = "delete"; return b; },
    eq(col: string, val: unknown) { c.eqs.push({ col, val }); return b; },
    in(col: string, vals: unknown[]) { c.ins.push({ col, vals }); return b; },
    or(expr: string) { c.or = expr; return b; },
    order(col: string, opts: unknown) { c.order = { col, opts }; return b; },
    limit(n: number) { c.limit = n; return b; },
    single() { c.terminal = "single"; return resolve(); },
    maybeSingle() { c.terminal = "maybeSingle"; return resolve(); },
    then(onOk: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) {
      c.terminal = "await";
      return resolve().then(onOk, onErr);
    },
  });
  return b;
}

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => state.adminConfigured,
  getSupabaseAdmin: () => (state.adminConfigured ? { from: (t: string) => makeBuilder(t) } : null),
}));

const getProjectLimitMock = vi.fn<(plan: string) => Promise<number>>(async () => 25);
vi.mock("@/lib/projects", () => ({
  getProjectLimit: (plan: string) => getProjectLimitMock(plan),
}));

const sendEmailMock = vi.fn<(args: unknown) => Promise<{ ok: boolean; id?: string; reason?: string }>>(async () => ({ ok: true, id: "m-1" }));
vi.mock("@/lib/email", () => ({
  sendEmail: (args: unknown) => sendEmailMock(args),
}));

const canMock = vi.fn<(u: unknown, f: string) => Promise<boolean>>(async () => false);
vi.mock("@/lib/entitlements", () => ({
  can: (u: unknown, f: string) => canMock(u, f),
}));

vi.mock("nanoid", () => ({ nanoid: (n: number) => "t".repeat(n) }));

import {
  buildFounderInviteEmail,
  canAccessProjectAsEvaluator,
  claimEvaluation,
  claimUrlForToken,
  createEvaluation,
  deleteEvaluation,
  getEvaluationForUser,
  isEvaluatorUser,
  listEvaluations,
  normaliseCreateInput,
  updateEvaluation,
} from "./evaluations";

const EVALUATOR = { id: "u-eval", email: "scout@fund.vc", plan: "investor_angel", displayName: "Sam Scout" };

function evalRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "e-1",
    evaluator_user_id: "u-eval",
    project_id: "p-1",
    owner_kind: "evaluator",
    consent_tier: "attributed_only",
    founder_email: null,
    founder_user_id: null,
    invite_token: null,
    invited_at: null,
    claimed_at: null,
    label: null,
    notes: null,
    website: null,
    state: null,
    created_at: "2026-09-10T00:00:00Z",
    updated_at: "2026-09-10T00:00:00Z",
    ...over,
  };
}

const calls = (table: string) => state.calls.filter((c) => c.table === table);

beforeEach(() => {
  state.adminConfigured = true;
  state.queue = [];
  state.calls = [];
  getProjectLimitMock.mockClear();
  getProjectLimitMock.mockResolvedValue(25);
  sendEmailMock.mockClear();
  sendEmailMock.mockResolvedValue({ ok: true, id: "m-1" });
  canMock.mockClear();
  canMock.mockResolvedValue(false);
});

// ─── normaliseCreateInput ─────────────────────────────────────────────────

describe("normaliseCreateInput", () => {
  it("requires a name and caps it at 100 chars", () => {
    expect(normaliseCreateInput({ name: "  " })).toMatchObject({ ok: false });
    expect(normaliseCreateInput({ name: "x".repeat(101) })).toMatchObject({ ok: false });
  });

  it("adds https:// to bare domains and rejects junk websites", () => {
    const ok = normaliseCreateInput({ name: "Acme", website: "acme.com.au/" });
    expect(ok).toMatchObject({ ok: true, value: { website: "https://acme.com.au" } });
    expect(normaliseCreateInput({ name: "Acme", website: "not a url" })).toMatchObject({ ok: false });
  });

  it("normalises AU state (case-insensitive) and rejects unknown values", () => {
    expect(normaliseCreateInput({ name: "A", state: "nsw" })).toMatchObject({ ok: true, value: { state: "NSW" } });
    expect(normaliseCreateInput({ name: "A", state: "National" })).toMatchObject({ ok: true, value: { state: "national" } });
    expect(normaliseCreateInput({ name: "A", state: "CA" })).toMatchObject({ ok: false });
  });

  it("lower-cases founder email and rejects malformed addresses", () => {
    expect(normaliseCreateInput({ name: "A", founder_email: " Jo@Startup.IO " })).toMatchObject({
      ok: true,
      value: { founderEmail: "jo@startup.io" },
    });
    expect(normaliseCreateInput({ name: "A", founder_email: "nope" })).toMatchObject({ ok: false });
  });
});

// ─── createEvaluation ─────────────────────────────────────────────────────

describe("createEvaluation", () => {
  it("refuses with evaluation_limit_reached before any insert when used >= plan limit", async () => {
    getProjectLimitMock.mockResolvedValue(2);
    state.queue.push({ table: "evaluations", count: 2 });

    const res = await createEvaluation(EVALUATOR, { name: "Acme" });
    expect(res).toMatchObject({ ok: false, error: "evaluation_limit_reached", limit: 2, used: 2 });
    expect(getProjectLimitMock).toHaveBeenCalledWith("investor_angel");
    expect(calls("projects").some((c) => c.op === "insert")).toBe(false);
    expect(calls("evaluations").some((c) => c.op === "insert")).toBe(false);
  });

  it("creates a project owned by the evaluator plus an evaluations row (no invite without founder email)", async () => {
    state.queue.push({ table: "evaluations", count: 3 });
    state.queue.push({ table: "projects", data: [{ slug: "acme", archived_at: null }] });
    state.queue.push({ table: "projects", data: { id: "p-9", name: "Acme", slug: "acme-2", industry: "SaaS", stage: 0, description: "Widgets" } });
    state.queue.push({ table: "evaluations", data: evalRow({ id: "e-9", project_id: "p-9", website: "https://acme.io", state: "VIC" }) });

    const res = await createEvaluation(EVALUATOR, {
      name: "Acme", website: "acme.io", description: "Widgets", state: "vic", industry: "SaaS",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const projectInsert = calls("projects").find((c) => c.op === "insert")!;
    expect(projectInsert.payload).toMatchObject({
      user_id: "u-eval", name: "Acme", slug: "acme-2", description: "Widgets", industry: "SaaS", is_default: false,
    });
    expect(projectInsert.payload).not.toHaveProperty("attribution_reseller_id");

    const evalInsert = calls("evaluations").find((c) => c.op === "insert")!;
    expect(evalInsert.payload).toMatchObject({
      evaluator_user_id: "u-eval", project_id: "p-9", owner_kind: "evaluator",
      consent_tier: "attributed_only", founder_email: null, invite_token: null, website: "https://acme.io", state: "VIC",
    });

    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(res.evaluation).toMatchObject({ id: "e-9", projectId: "p-9", projectName: "Acme", projectSlug: "acme-2", latestSvi: null });
    expect(res.used).toBe(4);
    expect(res.limit).toBe(25);
    expect(res.inviteSent).toBe(false);
  });

  it("mints an invite token, marks founder_invited and emails the founder the claim link", async () => {
    state.queue.push({ table: "evaluations", count: 0 });
    state.queue.push({ table: "projects", data: [] });
    state.queue.push({ table: "projects", data: { id: "p-1", name: "Acme", slug: "acme", stage: 0 } });
    state.queue.push({
      table: "evaluations",
      data: evalRow({ owner_kind: "founder_invited", founder_email: "jo@acme.io", invite_token: "t".repeat(24), invited_at: "2026-09-10T00:00:00Z" }),
    });

    const res = await createEvaluation(EVALUATOR, { name: "Acme", founder_email: "Jo@Acme.io" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const projectInsert = calls("projects").find((c) => c.op === "insert")!;
    expect(projectInsert.payload).toMatchObject({ is_default: true });

    const evalInsert = calls("evaluations").find((c) => c.op === "insert")!;
    expect(evalInsert.payload).toMatchObject({
      owner_kind: "founder_invited", founder_email: "jo@acme.io", invite_token: "t".repeat(24),
    });
    expect((evalInsert.payload as { invited_at: string }).invited_at).toBeTruthy();

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const mail = sendEmailMock.mock.calls[0][0] as { to: string; subject: string; html: string };
    expect(mail.to).toBe("jo@acme.io");
    expect(mail.subject).toBe("Sam Scout is evaluating Acme on BlockID — claim it to share your evidence");
    expect(mail.html).toContain(claimUrlForToken("t".repeat(24)));
    expect(res.inviteSent).toBe(true);
    expect(res.evaluation.ownerKind).toBe("founder_invited");
  });

  it("keeps the create when the invite email fails to send", async () => {
    sendEmailMock.mockResolvedValue({ ok: false, reason: "not_configured" });
    state.queue.push({ table: "evaluations", count: 0 });
    state.queue.push({ table: "projects", data: [] });
    state.queue.push({ table: "projects", data: { id: "p-1", name: "Acme", slug: "acme" } });
    state.queue.push({ table: "evaluations", data: evalRow({ owner_kind: "founder_invited", founder_email: "jo@acme.io", invite_token: "x" }) });

    const res = await createEvaluation(EVALUATOR, { name: "Acme", founder_email: "jo@acme.io" });
    expect(res).toMatchObject({ ok: true, inviteSent: false });
  });

  it("rolls the project back when the evaluations insert fails", async () => {
    state.queue.push({ table: "evaluations", count: 0 });
    state.queue.push({ table: "projects", data: [] });
    state.queue.push({ table: "projects", data: { id: "p-1", name: "Acme", slug: "acme" } });
    state.queue.push({ table: "evaluations", error: { code: "42P01", message: "relation evaluations does not exist" } });

    const res = await createEvaluation(EVALUATOR, { name: "Acme" });
    expect(res).toMatchObject({ ok: false, error: "create_failed" });
    const del = calls("projects").find((c) => c.op === "delete")!;
    expect(del.eqs).toEqual([{ col: "id", val: "p-1" }, { col: "user_id", val: "u-eval" }]);
  });

  it("returns invalid_input without touching the DB", async () => {
    const res = await createEvaluation(EVALUATOR, { name: "" });
    expect(res).toMatchObject({ ok: false, error: "invalid_input" });
    expect(state.calls).toHaveLength(0);
  });
});

// ─── reads + owner checks ─────────────────────────────────────────────────

describe("listEvaluations", () => {
  it("scopes to the evaluator, joins the project and decorates the latest SVI per project", async () => {
    state.queue.push({
      table: "evaluations",
      data: [
        { ...evalRow({ id: "e-1", project_id: "p-1" }), projects: { name: "Acme", slug: "acme", industry: "SaaS", stage: 3, description: null } },
        { ...evalRow({ id: "e-2", project_id: "p-2" }), projects: [{ name: "Beta", slug: "beta", stage: 1 }] },
      ],
    });
    state.queue.push({
      table: "svi_snapshots",
      data: [
        { project_id: "p-1", svi_total: 72, created_at: "2026-09-09T00:00:00Z" },
        { project_id: "p-1", svi_total: 60, created_at: "2026-09-01T00:00:00Z" },
      ],
    });

    const rows = await listEvaluations("u-eval");
    expect(calls("evaluations")[0].eqs).toEqual([{ col: "evaluator_user_id", val: "u-eval" }]);
    expect(calls("svi_snapshots")[0].ins).toEqual([{ col: "project_id", vals: ["p-1", "p-2"] }]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ id: "e-1", projectName: "Acme", projectStage: 3, latestSvi: 72, latestSviAt: "2026-09-09T00:00:00Z" });
    expect(rows[1]).toMatchObject({ id: "e-2", projectName: "Beta", latestSvi: null });
  });

  it("degrades to [] when the table is missing (42P01) or the client is absent", async () => {
    state.queue.push({ table: "evaluations", error: { code: "42P01", message: "relation evaluations does not exist" } });
    expect(await listEvaluations("u-eval")).toEqual([]);
    state.adminConfigured = false;
    expect(await listEvaluations("u-eval")).toEqual([]);
  });
});

describe("owner checks", () => {
  it("getEvaluationForUser filters by id AND evaluator_user_id", async () => {
    state.queue.push({ table: "evaluations", data: evalRow() });
    const row = await getEvaluationForUser("u-eval", "e-1");
    expect(row?.id).toBe("e-1");
    expect(calls("evaluations")[0].eqs).toEqual([
      { col: "id", val: "e-1" },
      { col: "evaluator_user_id", val: "u-eval" },
    ]);
  });

  it("updateEvaluation only writes label/notes and is owner-scoped", async () => {
    state.queue.push({ table: "evaluations", data: evalRow({ label: "Cohort 4", notes: "call Tuesday" }) });
    const row = await updateEvaluation("u-eval", "e-1", { label: "  Cohort 4 ", notes: "call Tuesday" });
    const upd = calls("evaluations")[0];
    expect(upd.op).toBe("update");
    expect(upd.payload).toEqual({ label: "Cohort 4", notes: "call Tuesday" });
    expect(upd.eqs).toEqual([{ col: "id", val: "e-1" }, { col: "evaluator_user_id", val: "u-eval" }]);
    expect(row?.label).toBe("Cohort 4");
  });

  it("updateEvaluation returns null for a row the caller does not hold", async () => {
    state.queue.push({ table: "evaluations", data: null });
    expect(await updateEvaluation("u-other", "e-1", { label: "x" })).toBeNull();
  });

  it("deleteEvaluation removes only the evaluations row, owner-scoped, and reports whether a row went", async () => {
    state.queue.push({ table: "evaluations", data: [{ id: "e-1" }] });
    expect(await deleteEvaluation("u-eval", "e-1")).toBe(true);
    const del = calls("evaluations")[0];
    expect(del.op).toBe("delete");
    expect(del.eqs).toEqual([{ col: "id", val: "e-1" }, { col: "evaluator_user_id", val: "u-eval" }]);
    expect(calls("projects")).toHaveLength(0);

    state.queue.push({ table: "evaluations", data: [] });
    expect(await deleteEvaluation("u-other", "e-1")).toBe(false);
  });
});

describe("canAccessProjectAsEvaluator", () => {
  it("allows the evaluator who holds the project", async () => {
    state.queue.push({ table: "evaluations", data: [evalRow()] });
    const res = await canAccessProjectAsEvaluator("u-eval", "p-1");
    expect(res).toMatchObject({ allowed: true, via: "evaluator" });
    const q = calls("evaluations")[0];
    expect(q.eqs).toEqual([{ col: "project_id", val: "p-1" }]);
    expect(q.or).toBe("evaluator_user_id.eq.u-eval,founder_user_id.eq.u-eval");
  });

  it("allows a founder only once they have claimed", async () => {
    state.queue.push({ table: "evaluations", data: [evalRow({ founder_user_id: "u-founder", owner_kind: "founder_invited" })] });
    expect(await canAccessProjectAsEvaluator("u-founder", "p-1")).toEqual({ allowed: false });

    state.queue.push({
      table: "evaluations",
      data: [evalRow({ founder_user_id: "u-founder", owner_kind: "founder_claimed", claimed_at: "2026-09-10T01:00:00Z" })],
    });
    expect(await canAccessProjectAsEvaluator("u-founder", "p-1")).toMatchObject({ allowed: true, via: "founder_claimed" });
  });

  it("denies everyone else and denies on DB error", async () => {
    state.queue.push({ table: "evaluations", data: [] });
    expect(await canAccessProjectAsEvaluator("u-stranger", "p-1")).toEqual({ allowed: false });
    state.queue.push({ table: "evaluations", error: { message: "boom" } });
    expect(await canAccessProjectAsEvaluator("u-eval", "p-1")).toEqual({ allowed: false });
  });
});

// ─── claim flow ───────────────────────────────────────────────────────────

describe("claimEvaluation", () => {
  const invited = () =>
    evalRow({ owner_kind: "founder_invited", founder_email: "jo@acme.io", invite_token: "tok" });

  it("404s an unknown / blank token", async () => {
    expect(await claimEvaluation("", { id: "u-f", email: "jo@acme.io" })).toMatchObject({ ok: false, error: "not_found" });
    state.queue.push({ table: "evaluations", data: null });
    expect(await claimEvaluation("nope", { id: "u-f", email: "jo@acme.io" })).toMatchObject({ ok: false, error: "not_found" });
  });

  it("refuses when the logged-in email differs from the invited address", async () => {
    state.queue.push({ table: "evaluations", data: { ...invited(), projects: { name: "Acme" } } });
    const res = await claimEvaluation("tok", { id: "u-x", email: "someone@else.com" });
    expect(res).toMatchObject({ ok: false, error: "email_mismatch" });
    expect(calls("evaluations").some((c) => c.op === "update")).toBe(false);
  });

  it("flips owner_kind / consent_tier / claimed_at and never touches projects.user_id", async () => {
    state.queue.push({ table: "evaluations", data: { ...invited(), projects: { name: "Acme" } } });
    state.queue.push({
      table: "evaluations",
      data: evalRow({ owner_kind: "founder_claimed", consent_tier: "reports_shared", founder_user_id: "u-f", founder_email: "jo@acme.io", claimed_at: "2026-09-10T02:00:00Z" }),
    });

    const res = await claimEvaluation("tok", { id: "u-f", email: "JO@acme.io" });
    expect(res).toMatchObject({ ok: true, alreadyClaimed: false, projectName: "Acme" });
    if (!res.ok) return;
    expect(res.evaluation).toMatchObject({ ownerKind: "founder_claimed", consentTier: "reports_shared", founderUserId: "u-f" });

    const upd = calls("evaluations").find((c) => c.op === "update")!;
    expect(upd.payload).toMatchObject({
      owner_kind: "founder_claimed", consent_tier: "reports_shared", founder_user_id: "u-f", founder_email: "jo@acme.io",
    });
    expect((upd.payload as { claimed_at: string }).claimed_at).toBeTruthy();
    expect(upd.eqs).toEqual([{ col: "id", val: "e-1" }]);
    expect(calls("projects")).toHaveLength(0);
  });

  it("is idempotent for the same founder", async () => {
    state.queue.push({
      table: "evaluations",
      data: { ...invited(), owner_kind: "founder_claimed", consent_tier: "reports_shared", founder_user_id: "u-f", claimed_at: "2026-09-10T02:00:00Z", projects: { name: "Acme" } },
    });
    const res = await claimEvaluation("tok", { id: "u-f", email: "jo@acme.io" });
    expect(res).toMatchObject({ ok: true, alreadyClaimed: true });
    expect(calls("evaluations").some((c) => c.op === "update")).toBe(false);
  });
});

// ─── gate + template ──────────────────────────────────────────────────────

describe("isEvaluatorUser", () => {
  it("passes on evaluator account_type without consulting the plan", async () => {
    state.queue.push({ table: "app_users", data: { account_type: "service_provider" } });
    expect(await isEvaluatorUser({ id: "u-1", plan: "founder_free" })).toBe(true);
    expect(canMock).not.toHaveBeenCalled();
  });

  it("falls back to can(investor.dealflow) for founders", async () => {
    state.queue.push({ table: "app_users", data: { account_type: "founder" } });
    canMock.mockResolvedValue(true);
    expect(await isEvaluatorUser({ id: "u-1", plan: "investor_angel" })).toBe(true);
    expect(canMock).toHaveBeenCalledWith({ id: "u-1", plan: "investor_angel", segment: "investor" }, "investor.dealflow");

    state.queue.push({ table: "app_users", data: { account_type: "founder" } });
    canMock.mockResolvedValue(false);
    expect(await isEvaluatorUser({ id: "u-1", plan: "founder_free" })).toBe(false);
  });
});

describe("buildFounderInviteEmail", () => {
  it("uses the agreed subject line and escapes HTML in names", () => {
    const { subject, html } = buildFounderInviteEmail({
      evaluatorName: "Sam <Scout>",
      startupName: "Acme & Co",
      claimUrl: "https://blockid.au/auth/login?next=%2Fworkspace%2Fevaluations%3Fclaim%3Dtok",
    });
    expect(subject).toBe("Sam <Scout> is evaluating Acme & Co on BlockID — claim it to share your evidence");
    expect(html).toContain("Sam &lt;Scout&gt; is evaluating Acme &amp; Co on BlockID");
    expect(html).toContain("claim it to share your evidence");
    expect(html).toContain("https://blockid.au/auth/login?next=%2Fworkspace%2Fevaluations%3Fclaim%3Dtok");
    expect(html).not.toContain("<Scout>");
  });

  it("claimUrlForToken routes through login to the evaluations page", () => {
    const url = claimUrlForToken("abc");
    expect(url).toMatch(/\/auth\/login\?next=/);
    expect(decodeURIComponent(url.split("next=")[1])).toBe("/workspace/evaluations?claim=abc");
  });
});
