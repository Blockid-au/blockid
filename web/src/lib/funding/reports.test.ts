// Colocated vitest for the funding_reports lifecycle (T0242).
//
// Pins:
//   1. handleFundingReportCompleted — pending_payment → paid → generating →
//      ready, with the report columns written and the tokenised link emailed.
//   2. Idempotency — a replayed session on a row that is already `ready`
//      (or `paid`) neither regenerates nor emails again.
//   3. Missing metadata / missing row → skipped, no writes.
//   4. Generation failure → status `failed` + error_message, email still
//      sent with the "being prepared" copy (the buyer paid; support can rerun).
//   5. canViewFundingReport — owner, token, Stripe session; nothing else.
//   6. publicFundingReport — strips access_token / guest_email / stripe ids.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Row = Record<string, unknown>;
const rows = new Map<string, Row>();
const updates: Array<{ id: string | null; patch: Row; filters: Array<[string, unknown]> }> = [];
const inserts: Row[] = [];

function chain(table: string) {
  const state: { op: "select" | "insert" | "update" | null; patch: Row | null; filters: Array<[string, unknown]>; count: boolean } = {
    op: null,
    patch: null,
    filters: [],
    count: false,
  };
  const c: Record<string, unknown> = {};
  const self = () => c;
  c.select = (_cols?: string, opts?: { count?: string; head?: boolean }) => {
    if (!state.op) state.op = "select";
    if (opts?.count) state.count = true;
    return c;
  };
  // `.in(col, values)` — used by countPaidFundingReports (T0247).
  c.in = (col: string, vals: unknown[]) => {
    state.filters.push([col, vals]);
    return c;
  };
  c.insert = (row: Row) => {
    state.op = "insert";
    state.patch = row;
    return c;
  };
  c.update = (patch: Row) => {
    state.op = "update";
    state.patch = patch;
    return c;
  };
  c.eq = (col: string, val: unknown) => {
    state.filters.push([col, val]);
    return c;
  };
  c.maybeSingle = self;
  c.single = self;
  c.then = (resolve: (v: unknown) => unknown) => {
    if (table !== "funding_reports") return resolve({ data: null, error: null });
    const id = state.filters.find(([k]) => k === "id")?.[1] as string | undefined;
    if (state.op === "select" && state.count) {
      const matches = Array.from(rows.values()).filter((r) =>
        state.filters.every(([k, v]) => (Array.isArray(v) ? v.includes(r[k]) : r[k] === v)),
      );
      return resolve({ count: matches.length, error: null });
    }
    if (state.op === "select") return resolve({ data: id ? (rows.get(id) ?? null) : null, error: null });
    if (state.op === "insert") {
      const newId = `fr_${inserts.length + 1}`;
      const row = { id: newId, ...state.patch };
      rows.set(newId, row);
      inserts.push(row);
      return resolve({ data: { id: newId }, error: null });
    }
    if (state.op === "update") {
      const statusFilter = state.filters.find(([k]) => k === "status")?.[1];
      const target = id ? rows.get(id) : undefined;
      updates.push({ id: id ?? null, patch: state.patch ?? {}, filters: state.filters });
      if (target && (!statusFilter || target.status === statusFilter)) Object.assign(target, state.patch);
      return resolve({ data: null, error: null });
    }
    return resolve({ data: null, error: null });
  };
  return c;
}

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseAdmin: () => ({ from: (t: string) => chain(t) }),
}));

const sendEmailMock = vi.fn(async () => ({ ok: true }));
vi.mock("@/lib/email", () => ({ sendEmail: (args: unknown) => sendEmailMock(args as never) }));

vi.mock("@/lib/funding/data", () => ({
  listGrants: vi.fn(async () => []),
  listPrograms: vi.fn(async () => []),
}));

const generateMock = vi.fn();
vi.mock("@/lib/agents/grant-advisor", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/agents/grant-advisor")>();
  return { ...orig, generateFundingReport: (input: unknown) => generateMock(input) };
});

import {
  canViewFundingReport,
  countPaidFundingReports,
  handleFundingReportCompleted,
  newAccessToken,
  publicFundingReport,
  reportUrl,
  type FundingReportRow,
} from "./reports";

const INTAKE = { description: "Soil sensors for grain farmers", state: "NSW", stage: "mvp" };

function fakeReport() {
  return {
    generated_at: "2026-09-10T00:00:00.000Z",
    today: "2026-09-10",
    profile: { state: "NSW", stage: "mvp" },
    grants: [{ ref_id: "g1", name: "Grant One", grant: { amount_max_aud: 50000 } }],
    programs: [{ ref_id: "p1", name: "Program One" }],
    excluded: { grants: [], programs: [] },
    timeline: [{ month: "2026-10", kind: "grant", ref_id: "g1", name: "Grant One", action: "Lodge", lead_time_days: 30, why: "x" }],
    tax: {},
    summary: { grant_count: 1, program_count: 1, top_grants: ["Grant One"], top_programs: ["Program One"], total_amount_max_aud: 50000, top_grants_amount_max_aud: 50000, timeline_count: 1 },
    narrative_md: "## Plan\nDo the thing.",
    actions: ["Lodge Grant One"],
    narrative_source: "template",
    disclaimer: "d",
  };
}

function seedPending(id = "fr_guest", over: Row = {}) {
  rows.set(id, {
    id,
    user_id: null,
    guest_email: "founder@example.com",
    intake: INTAKE,
    status: "pending_payment",
    paid_via: "one_off",
    access_token: "tok_abc",
    stripe_session_id: null,
    meta: {},
    ...over,
  });
}

beforeEach(() => {
  rows.clear();
  updates.length = 0;
  inserts.length = 0;
  sendEmailMock.mockClear();
  generateMock.mockReset();
  generateMock.mockResolvedValue(fakeReport());
});

const session = { id: "cs_test_1", metadata: { funding_report_id: "fr_guest", email: "founder@example.com" }, amount_total: 300, payment_intent: "pi_1", customer_email: "founder@example.com" };

describe("handleFundingReportCompleted", () => {
  it("marks paid, generates with the narrative, stores matches and emails the tokenised link", async () => {
    seedPending();
    const r = await handleFundingReportCompleted(session, "evt_1");
    expect(r).toEqual({ ok: true, reportId: "fr_guest" });

    const row = rows.get("fr_guest")!;
    expect(row.status).toBe("ready");
    expect(row.stripe_session_id).toBe("cs_test_1");
    expect((row.meta as Row).stripe_event_id).toBe("evt_1");
    expect((row.meta as Row).paid_amount_cents).toBe(300);
    expect(row.narrative_md).toContain("Do the thing");
    expect((row.grant_matches as unknown[]).length).toBe(1);
    expect((row.timeline as unknown[]).length).toBe(1);
    expect(((row.meta as Row).summary as Row).grant_count).toBe(1);

    expect(generateMock).toHaveBeenCalledTimes(1);
    expect((generateMock.mock.calls[0][0] as { withNarrative: boolean }).withNarrative).toBe(true);

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const mail = sendEmailMock.mock.calls[0][0] as unknown as { to: string; subject: string; html: string };
    expect(mail.to).toBe("founder@example.com");
    expect(mail.subject).toMatch(/1 grants, 1 programs/);
    expect(mail.html).toContain("/funding/report/fr_guest?t=tok_abc");
    expect(mail.html).toMatch(/Grant information is free from government/);
  });

  it("is idempotent — a replay on a ready row does not regenerate or email", async () => {
    seedPending("fr_guest", { status: "ready", stripe_session_id: "cs_test_1" });
    const r = await handleFundingReportCompleted(session, "evt_2");
    expect(r).toEqual({ ok: true, reportId: "fr_guest", skipped: "already_processed" });
    expect(generateMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
  });

  it("only advances a pending_payment row (paid update carries the status filter)", async () => {
    seedPending();
    await handleFundingReportCompleted(session, "evt_3");
    const paidUpdate = updates.find((u) => u.patch.status === "paid");
    expect(paidUpdate?.filters).toContainEqual(["status", "pending_payment"]);
  });

  it("skips when metadata has no funding_report_id or the row is missing", async () => {
    expect(await handleFundingReportCompleted({ ...session, metadata: {} }, "evt_4")).toMatchObject({ ok: false, skipped: "missing_report_id" });
    expect(await handleFundingReportCompleted(session, "evt_5")).toMatchObject({ ok: false, skipped: "row_missing" });
    expect(generateMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("generation failure → failed + error_message; the buyer still gets a 'being prepared' email", async () => {
    seedPending();
    generateMock.mockRejectedValueOnce(new Error("LLM down"));
    const r = await handleFundingReportCompleted(session, "evt_6");
    expect(r.ok).toBe(true);
    const row = rows.get("fr_guest")!;
    expect(row.status).toBe("failed");
    expect(row.error_message).toBe("LLM down");
    const mail = sendEmailMock.mock.calls[0][0] as unknown as { subject: string };
    expect(mail.subject).toMatch(/being prepared/);
  });
});

describe("access", () => {
  const row = {
    id: "fr_1",
    user_id: "user_a",
    guest_email: "g@example.com",
    project_id: null,
    intake: INTAKE,
    grant_matches: [],
    program_matches: [],
    timeline: [],
    narrative_md: null,
    credits_cost: 0,
    paid_via: "one_off",
    stripe_session_id: "cs_live_9",
    status: "ready",
    access_token: "tok_secret",
    meta: null,
    created_at: "2026-09-10T00:00:00Z",
    updated_at: "2026-09-10T00:00:00Z",
  } as FundingReportRow;

  it("owner, exact token or exact Stripe session can view; anyone else cannot", () => {
    expect(canViewFundingReport(row, { userId: "user_a" })).toBe(true);
    expect(canViewFundingReport(row, { token: "tok_secret" })).toBe(true);
    expect(canViewFundingReport(row, { sessionId: "cs_live_9" })).toBe(true);
    expect(canViewFundingReport(row, { userId: "user_b" })).toBe(false);
    expect(canViewFundingReport(row, { token: "tok_secre" })).toBe(false);
    expect(canViewFundingReport(row, { token: "" })).toBe(false);
    expect(canViewFundingReport(row, {})).toBe(false);
    expect(canViewFundingReport({ ...row, user_id: null, access_token: null }, { userId: "user_a", token: "x" })).toBe(false);
  });

  it("publicFundingReport never leaks the token, email or Stripe ids", () => {
    const pub = publicFundingReport(row, { token: "tok_secret" });
    const json = JSON.stringify(pub);
    expect(json).not.toContain("tok_secret");
    expect(json).not.toContain("g@example.com");
    expect(json).not.toContain("cs_live_9");
    expect(pub.intake?.state).toBe("NSW");
    expect(pub.is_owner).toBe(false);
    expect(pub.disclaimer).toMatch(/General information only/);
  });

  it("access tokens are 32 url-safe chars and reportUrl carries them", () => {
    const t = newAccessToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(reportUrl("abc", t)).toMatch(new RegExp(`/funding/report/abc\\?t=${t}$`));
    expect(reportUrl("abc")).toMatch(/\/funding\/report\/abc$/);
  });
});

// T0247 — the "3rd A$3 report" Radar upsell counts what the user PAID for.
describe("countPaidFundingReports", () => {
  it("counts one_off + credits rows in a paid state for that user only; plan runs and failures excluded", async () => {
    const base = { intake: INTAKE, grant_matches: [], program_matches: [], timeline: [], credits_cost: 0 };
    rows.set("a1", { id: "a1", user_id: "user_a", paid_via: "one_off", status: "ready", ...base });
    rows.set("a2", { id: "a2", user_id: "user_a", paid_via: "credits", status: "ready", ...base });
    rows.set("a3", { id: "a3", user_id: "user_a", paid_via: "credits", status: "generating", ...base });
    rows.set("a4", { id: "a4", user_id: "user_a", paid_via: "plan", status: "ready", ...base });
    rows.set("a5", { id: "a5", user_id: "user_a", paid_via: "one_off", status: "pending_payment", ...base });
    rows.set("a6", { id: "a6", user_id: "user_a", paid_via: "credits", status: "failed", ...base });
    rows.set("b1", { id: "b1", user_id: "user_b", paid_via: "one_off", status: "ready", ...base });
    expect(await countPaidFundingReports("user_a")).toBe(3);
    expect(await countPaidFundingReports("user_b")).toBe(1);
    expect(await countPaidFundingReports("user_c")).toBe(0);
    expect(await countPaidFundingReports("")).toBe(0);
  });
});
