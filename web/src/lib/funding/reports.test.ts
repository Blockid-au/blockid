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
vi.mock("@/lib/email", () => ({
  sendEmail: (args: unknown) => sendEmailMock(args as never),
  // QA-3 P1-6: Spam Act footer + List-Unsubscribe URL threaded into every send.
  complianceFooter: async (to: string) => ({
    unsubscribeUrl: `https://blockid.au/unsubscribe?token=tok-${to}`,
    preferencesUrl: `https://blockid.au/unsubscribe?token=tok-${to}&manage=1`,
    footerHtml: `<p data-footer>Auschain PTY LTD · ABN 79 659 615 111 · Sydney NSW · <a href="https://blockid.au/unsubscribe?token=tok-${to}">Unsubscribe</a></p>`,
    footerText: "",
  }),
}));

vi.mock("@/lib/funding/data", () => ({
  listGrants: vi.fn(async () => []),
  listPrograms: vi.fn(async () => []),
}));

const generateMock = vi.fn();
vi.mock("@/lib/agents/grant-advisor", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/agents/grant-advisor")>();
  return { ...orig, generateFundingReport: (input: unknown) => generateMock(input) };
});

// S20-B — outbound webhook emitter (enqueue only).
const enqueueMock = vi.fn(async () => ({ queued: 1, endpoints: ["ep"], envelopeId: "evt" }));
vi.mock("@/lib/webhooks/registry", () => ({ enqueueWebhook: (...a: unknown[]) => enqueueMock(...(a as [])) }));

import {
  canViewFundingReport,
  countPaidFundingReports,
  generateAndStoreFundingReport,
  handleFundingReportCompleted,
  newAccessToken,
  publicFundingReport,
  reportUrl,
  sendFundingReportReadyEmail,
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
  enqueueMock.mockClear();
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
    const mail = sendEmailMock.mock.calls[0][0] as unknown as { to: string; subject: string; html: string; unsubscribeUrl?: string };
    // Spam Act (QA-3 P1-6): identity line + List-Unsubscribe on the delivery.
    expect(mail.html).toContain("ABN 79 659 615 111");
    expect(mail.unsubscribeUrl).toMatch(/^https:\/\/blockid\.au\/unsubscribe\?token=/);
    expect(mail.to).toBe("founder@example.com");
    expect(mail.subject).toMatch(/1 grants, 1 programs/);
    expect(mail.html).toContain("/funding/report/fr_guest?t=tok_abc");
    expect(mail.html).toMatch(/Grant information is free from government/);
    // #11: the ready email is stamped so the retry sweep never re-sends it;
    // the Stripe ids the paid update wrote survive the merge.
    expect(typeof (row.meta as Row).email_sent_at).toBe("string");
    expect((row.meta as Row).stripe_payment_intent).toBe("pi_1");
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
    // Not stamped — the holding note is not the report email, so the retry
    // sweep (#11) still sends the real one once it regenerates.
    expect((row.meta as Row).email_sent_at).toBeUndefined();
  });
});

// S20-B — the shared generator (webhook path + retry cron) enqueues
// funding.report_ready for a signed-in owner / attached project; guest
// rows have no subscriber; a failed generation never fires.
describe("generateAndStoreFundingReport → funding.report_ready", () => {
  it("guest row (no user, no project): nothing enqueued", async () => {
    seedPending();
    await handleFundingReportCompleted(session, "evt_w1");
    expect(rows.get("fr_guest")!.status).toBe("ready");
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it("signed-in owner with a project: ids + counts + tokenless url, recipient = the owner", async () => {
    seedPending("fr_user", { user_id: "u-1", project_id: "p-1", status: "paid", guest_email: null });
    const report = await generateAndStoreFundingReport("fr_user", { withNarrative: true });
    expect(report).not.toBeNull();
    expect(enqueueMock).toHaveBeenCalledTimes(1);
    expect(enqueueMock).toHaveBeenCalledWith(
      "funding.report_ready",
      "p-1",
      { report_id: "fr_user", project_id: "p-1", grant_count: 1, program_count: 1, url: reportUrl("fr_user") },
      { userIds: ["u-1"] },
    );
    expect(JSON.stringify(enqueueMock.mock.calls[0])).not.toContain("tok_abc");
  });

  it("a failed generation never fires", async () => {
    seedPending("fr_user", { user_id: "u-1", project_id: "p-1", status: "paid" });
    generateMock.mockRejectedValueOnce(new Error("LLM down"));
    expect(await generateAndStoreFundingReport("fr_user")).toBeNull();
    expect(enqueueMock).not.toHaveBeenCalled();
  });
});

// Review 2026-09-10 #11 — shared by the webhook and the retry cron.
describe("sendFundingReportReadyEmail", () => {
  it("sends once: stamps meta.email_sent_at (merging existing meta) and returns already_sent on the next call", async () => {
    seedPending("fr_r", { status: "ready", meta: { paid_at: "2026-09-10T00:00:00Z", stripe_event_id: "evt_9" } });
    const report = fakeReport() as unknown as Parameters<typeof sendFundingReportReadyEmail>[0]["report"];
    expect(await sendFundingReportReadyEmail({ reportId: "fr_r", to: "founder@example.com", report, accessToken: "tok_abc" })).toBe("sent");
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const mail = sendEmailMock.mock.calls[0][0] as unknown as { subject: string; html: string };
    expect(mail.subject).toMatch(/1 grants, 1 programs/);
    expect(mail.html).toContain("/funding/report/fr_r?t=tok_abc");
    const meta = rows.get("fr_r")!.meta as Row;
    expect(typeof meta.email_sent_at).toBe("string");
    expect(meta.stripe_event_id).toBe("evt_9");

    expect(await sendFundingReportReadyEmail({ reportId: "fr_r", to: "founder@example.com", report, accessToken: "tok_abc" })).toBe("already_sent");
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it("a failed send is reported and NOT stamped, so it can be retried", async () => {
    seedPending("fr_f", { status: "ready" });
    sendEmailMock.mockResolvedValueOnce({ ok: false, reason: "send_error" } as never);
    const report = fakeReport() as unknown as Parameters<typeof sendFundingReportReadyEmail>[0]["report"];
    expect(await sendFundingReportReadyEmail({ reportId: "fr_f", to: "founder@example.com", report, accessToken: null })).toBe("failed");
    expect((rows.get("fr_f")!.meta as Row).email_sent_at).toBeUndefined();
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

  // Review 2026-09-10 #2: the signed-in route generates before it charges, so
  // a `spend_failed` row already holds the paid content. Only `ready` rows
  // may release matches / timeline / narrative / summary through the API.
  it.each(["spend_failed", "failed", "generating", "paid", "pending_payment"])(
    "publicFundingReport blanks grants/programs/timeline/narrative/summary for a %s row",
    (status) => {
      const loaded = {
        ...row,
        status,
        grant_matches: [{ ref_id: "g1", name: "Grant One" }],
        program_matches: [{ ref_id: "p1", name: "Program One" }],
        timeline: [{ month: "2026-10", ref_id: "g1" }],
        narrative_md: "## Secret plan",
        meta: { today: "2026-09-10", generated_at: "2026-09-10T00:00:00Z", summary: { grant_count: 1 }, actions: ["Lodge"], tax: {} },
      } as unknown as FundingReportRow;
      const pub = publicFundingReport(loaded, { userId: "user_a" });
      expect(pub.status).toBe(status);
      expect(pub.grants).toEqual([]);
      expect(pub.programs).toEqual([]);
      expect(pub.timeline).toEqual([]);
      expect(pub.narrative_md).toBeNull();
      expect(pub.meta).toEqual({ today: "2026-09-10", generated_at: "2026-09-10T00:00:00Z", summary: null });
      expect(JSON.stringify(pub)).not.toContain("Secret plan");
      expect(JSON.stringify(pub)).not.toContain("Grant One");
    },
  );

  it("a ready row releases everything, and only the allow-listed meta keys", () => {
    const loaded = {
      ...row,
      grant_matches: [{ ref_id: "g1", name: "Grant One" }],
      narrative_md: "## Plan",
      meta: {
        today: "2026-09-10",
        generated_at: "2026-09-10T00:00:00Z",
        summary: { grant_count: 1 },
        actions: ["Lodge"],
        tax: { rd: true },
        narrative_source: "llm",
        excluded: { grants: 2, programs: 0 },
        disclaimer: "d",
        // Server bookkeeping the webhook stamps — must never leave (#10).
        stripe_payment_intent: "pi_secret",
        stripe_event_id: "evt_secret",
        paid_amount_cents: 300,
        paid_at: "2026-09-10T00:00:00Z",
        amount_cents: 300,
        email_sent_at: "2026-09-10T00:01:00Z",
      },
    } as unknown as FundingReportRow;
    const pub = publicFundingReport(loaded, { userId: "user_a" });
    expect(pub.grants).toHaveLength(1);
    expect(pub.narrative_md).toBe("## Plan");
    expect(Object.keys(pub.meta ?? {}).sort()).toEqual(
      ["actions", "disclaimer", "excluded", "generated_at", "narrative_source", "summary", "tax", "today"],
    );
    const json = JSON.stringify(pub);
    for (const leak of ["pi_secret", "evt_secret", "paid_amount_cents", "paid_at", "email_sent_at", "amount_cents"]) {
      expect(json, leak).not.toContain(leak);
    }
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
