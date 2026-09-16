// Colocated vitest for lib/investor/actions (G13-W5-D3, block 6 + E2.6).
// Pins: the synthetic ticker shape, contact type / intro channel per plan,
// watchlist writes carry project_id + a real listing ticker when one exists
// (idempotent on repeat), portfolio upsert on (investor, project) with the
// 0403 project_id and a pre-0403 fallback, intro → mailto for Scout /
// unclaimed rows, → investor_contacts on the FOUNDER's project + notification
// for Firm+ (422 below reports_shared), request-access modes, and the
// founder-side intro (E2.6) that notifies the INVESTOR and never leaks the
// investor's email to the caller. Every write audits with ids only.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Row = Record<string, unknown>;
interface Captured { table: string; op: string | null; payload: unknown; filters: Array<[string, unknown]>; }
interface Queued { table: string; op?: string; data?: unknown; error?: unknown; }
const state = { configured: true, queue: [] as Queued[], calls: [] as Captured[] };
function next(table: string, op: string | null) {
  let idx = state.queue.findIndex((q) => q.table === table && (!q.op || q.op === op));
  if (idx === -1) idx = state.queue.findIndex((q) => q.table === table && !q.op);
  if (idx === -1) return { data: null, error: null };
  const [q] = state.queue.splice(idx, 1);
  return { data: q.data ?? null, error: q.error ?? null };
}
function builder(table: string) {
  const c: Captured = { table, op: null, payload: null, filters: [] };
  state.calls.push(c);
  const b: Record<string, unknown> = {};
  const chain = () => b;
  const resolve = () => Promise.resolve(next(table, c.op));
  Object.assign(b, {
    select(cols: string) { if (!c.op) c.op = "select"; c.filters.push(["select", cols]); return b; },
    insert(p: unknown) { c.op = "insert"; c.payload = p; return b; },
    update(p: unknown) { c.op = "update"; c.payload = p; return b; },
    eq(col: string, v: unknown) { c.filters.push([col, v]); return b; },
    is: chain, order: chain, limit: chain,
    maybeSingle: resolve, single: resolve,
    then(ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) { return resolve().then(ok, err); },
  });
  return b;
}
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => (state.configured ? { from: (t: string) => builder(t) } : null) }));
const { auditMock, notifyMock } = vi.hoisted(() => ({ auditMock: vi.fn(async () => ({ id: 1n, curr_hash: "h" })), notifyMock: vi.fn(async () => true) }));
vi.mock("@/lib/audit", () => ({ appendAudit: (p: unknown) => auditMock(p as never) }));
vi.mock("@/lib/notifications", () => ({ insertNotification: (a: unknown) => notifyMock(a as never) }));

import { addProjectToWatchlist, contactTypeForPlan, founderProjectId, introChannelFor, introMailto, markInvested, requestAccess, requestIntro, requestIntroToInvestor, syntheticTicker } from "./actions";

const PID = "0f6e5c1a-1111-4111-8111-aaaaaaaaaaaa";
const INV = "0f6e5c1a-2222-4222-8222-bbbbbbbbbbbb";
const claimed = { id: "e-1", projectId: PID, founderUserId: "u-founder", founderEmail: "jo@acme.io", ownerKind: "founder_claimed" as const, claimedAt: "2026-09-01T00:00:00Z", consentTier: "reports_shared" as const, inviteToken: null };
const calls = (table: string, op?: string) => state.calls.filter((c) => c.table === table && (!op || c.op === op));

beforeEach(() => {
  state.configured = true;
  state.queue = [];
  state.calls = [];
  auditMock.mockClear();
  notifyMock.mockClear().mockResolvedValue(true);
});

describe("pure helpers", () => {
  it("syntheticTicker matches the watchlist API regex; contact type + intro channel follow the plan tier", () => {
    expect(syntheticTicker(PID)).toBe("PRJ-0F6E5C1A");
    expect(syntheticTicker(PID)).toMatch(/^[A-Z]{1,8}-[A-Z0-9]{1,8}$/);
    expect(contactTypeForPlan("investor_angel")).toBe("angel");
    expect(contactTypeForPlan("investor_advisor")).toBe("advisor");
    expect(contactTypeForPlan("investor_vc_small")).toBe("vc");
    expect(contactTypeForPlan("accelerator_starter")).toBe("accelerator");
    expect(contactTypeForPlan(null, "investor_vc")).toBe("vc");
    expect(contactTypeForPlan("founder_free")).toBe("other");
    expect(introChannelFor("investor_angel")).toBe("mailto");
    expect(introChannelFor("investor_advisor")).toBe("crm");
    expect(introChannelFor("investor_vc_small")).toBe("crm");
    expect(introMailto(null, "Acme", "Mia")).toBeNull();
    expect(introMailto("jo@acme.io", "Acme", "Mia")).toMatch(/^mailto:jo%40acme\.io\?subject=Intro%20request/);
  });
});

describe("addProjectToWatchlist", () => {
  it("writes ticker + project_id (real listing ticker when the founder listed), tags following, audits; a repeat is idempotent", async () => {
    state.queue.push({ table: "watchlist", op: "select", data: null }); // by project_id
    state.queue.push({ table: "projects", data: { user_id: "u-founder" } });
    state.queue.push({ table: "startup_listings", data: { ticker: "ACME-AU" } });
    state.queue.push({ table: "watchlist", op: "select", data: null }); // by ticker
    const r = await addProjectToWatchlist({ userId: "u-eval", projectId: PID, projectSlug: "acme", evaluationId: "e-1" });
    expect(r).toEqual({ ok: true, added: true, ticker: "ACME-AU" });
    expect(calls("watchlist", "insert")[0].payload).toEqual({ account_id: "u-eval", ticker: "ACME-AU", slug: "acme", project_id: PID, notes: "#tag:following" });
    expect(auditMock.mock.calls[0][0]).toMatchObject({ action: "dossier.watchlisted", resource_id: "e-1", detail: { project_id: PID, ticker: "ACME-AU" } });

    state.queue.push({ table: "watchlist", op: "select", data: { id: "w-1", ticker: "ACME-AU" } });
    expect(await addProjectToWatchlist({ userId: "u-eval", projectId: PID, projectSlug: "acme", evaluationId: "e-1" })).toEqual({ ok: true, added: false, ticker: "ACME-AU" });
  });

  it("no listing → synthetic PRJ- ticker; an existing ticker row without project_id is back-filled", async () => {
    state.queue.push({ table: "watchlist", op: "select", data: null });
    state.queue.push({ table: "projects", data: { user_id: "u-founder" } });
    state.queue.push({ table: "startup_listings", data: null });
    state.queue.push({ table: "watchlist", op: "select", data: { id: "w-2", project_id: null } });
    const r = await addProjectToWatchlist({ userId: "u-eval", projectId: PID, projectSlug: null, evaluationId: "e-1" });
    expect(r).toEqual({ ok: true, added: false, ticker: "PRJ-0F6E5C1A" });
    expect(calls("watchlist", "update")[0].payload).toEqual({ project_id: PID });
    expect(calls("watchlist", "insert")).toHaveLength(0);
  });
});

describe("markInvested", () => {
  it("inserts one row per (investor, project) with startup_id = project id + project_id, validates ownership %, updates on repeat, audits", async () => {
    expect(await markInvested({ userId: "u", projectId: PID, projectName: "Acme", evaluationId: "e-1", ownershipPct: 120 })).toMatchObject({ ok: false, error: "invalid_input" });
    state.queue.push({ table: "investor_portfolio", op: "select", data: null });
    state.queue.push({ table: "investor_portfolio", op: "insert", data: { id: "pf-1" } });
    const r = await markInvested({ userId: "u", projectId: PID, projectName: "Acme", evaluationId: "e-1", valuationAud: 4_000_000, ownershipPct: 7.5 });
    expect(r).toEqual({ ok: true, id: "pf-1", created: true });
    expect(calls("investor_portfolio", "insert")[0].payload).toMatchObject({ investor_user_id: "u", startup_id: PID, project_id: PID, company_name: "Acme", valuation_aud: 4_000_000, ownership_pct: 7.5 });
    expect(auditMock.mock.calls.at(-1)![0]).toMatchObject({ action: "portfolio.marked_invested", detail: { portfolio_id: "pf-1", created: true, has_valuation: true } });

    state.queue.push({ table: "investor_portfolio", op: "select", data: { id: "pf-1" } });
    expect(await markInvested({ userId: "u", projectId: PID, projectName: "Acme", evaluationId: "e-1" })).toEqual({ ok: true, id: "pf-1", created: false });
    expect(calls("investor_portfolio", "update")).toHaveLength(1);
  });

  it("pre-0403: an insert that fails on project_id is retried without the column", async () => {
    state.queue.push({ table: "investor_portfolio", op: "select", data: null });
    state.queue.push({ table: "investor_portfolio", op: "insert", error: { message: 'column "project_id" of relation "investor_portfolio" does not exist' } });
    state.queue.push({ table: "investor_portfolio", op: "insert", data: { id: "pf-2" } });
    const r = await markInvested({ userId: "u", projectId: PID, projectName: "Acme", evaluationId: "e-1" });
    expect(r).toEqual({ ok: true, id: "pf-2", created: true });
    const second = calls("investor_portfolio", "insert")[1].payload as Row;
    expect(second.project_id).toBeUndefined();
  });
});

describe("requestIntro (evaluator → founder)", () => {
  const scout = { id: "u-eval", email: "scout@fund.vc", displayName: "Sam", plan: "investor_angel" };
  const firm = { id: "u-eval", email: "mia@fund.vc", displayName: "Mia", plan: "investor_advisor", orgName: "Blue Fund" };

  it("Scout → mailto (kept); no founder email → no_founder", async () => {
    const r = await requestIntro({ investor: scout, evaluation: claimed, startupName: "Acme" });
    expect(r).toMatchObject({ ok: true, channel: "mailto" });
    expect(auditMock.mock.calls[0][0]).toMatchObject({ action: "intro.requested", detail: { channel: "mailto" } });
    expect(await requestIntro({ investor: scout, evaluation: { ...claimed, founderEmail: null, ownerKind: "evaluator", claimedAt: null, founderUserId: null }, startupName: "Acme" })).toMatchObject({ ok: false, error: "no_founder" });
  });

  it("Firm on a claimed row ≥ reports_shared → investor_contacts on the founder's project + intro_requested notification; < reports_shared → consent_too_low", async () => {
    expect(await requestIntro({ investor: firm, evaluation: { ...claimed, consentTier: "attributed_only" }, startupName: "Acme" })).toMatchObject({ ok: false, error: "consent_too_low" });
    state.queue.push({ table: "projects", data: { id: "p-founder" } });
    state.queue.push({ table: "investor_contacts", op: "select", data: null });
    state.queue.push({ table: "investor_contacts", op: "insert", data: { id: "c-1" } });
    const r = await requestIntro({ investor: firm, evaluation: claimed, startupName: "Acme" });
    expect(r).toEqual({ ok: true, channel: "crm", contactId: "c-1", created: true, notified: true });
    const ins = calls("investor_contacts", "insert")[0].payload as Row;
    expect(ins).toMatchObject({ project_id: "p-founder", name: "Mia", email: "mia@fund.vc", org: "Blue Fund", type: "advisor", stage: "contacted", source: "dossier_intro", created_by: "u-eval" });
    expect(ins.tags).toEqual(["inbound", "dossier"]);
    expect(notifyMock.mock.calls[0][0]).toMatchObject({ userId: "u-founder", projectId: "p-founder", kind: "intro_requested", payload: { direction: "to_founder", investor: "Mia", contact_id: "c-1" } });
    expect(auditMock.mock.calls.at(-1)![0]).toMatchObject({ action: "intro.requested", detail: { channel: "crm", contact_id: "c-1" } });
  });

  it("an existing contact (same email) is touched, not duplicated; founder without a project falls back to mailto", async () => {
    state.queue.push({ table: "projects", data: { id: "p-founder" } });
    state.queue.push({ table: "investor_contacts", op: "select", data: { id: "c-old" } });
    const r = await requestIntro({ investor: firm, evaluation: claimed, startupName: "Acme" });
    expect(r).toMatchObject({ ok: true, channel: "crm", contactId: "c-old", created: false });
    expect(calls("investor_contacts", "insert")).toHaveLength(0);
    expect(calls("investor_contacts", "update")).toHaveLength(1);
    state.queue.push({ table: "projects", data: null });
    expect(await requestIntro({ investor: firm, evaluation: claimed, startupName: "Acme" })).toMatchObject({ ok: true, channel: "mailto" });
    expect(await founderProjectId("")).toBeNull();
  });
});

describe("requestAccess (block 3 CTA)", () => {
  const inv = { id: "u-eval", email: "mia@fund.vc", displayName: "Mia" };
  it("full_mentor → already_full; unclaimed → invite mode with the claim url; claimed → notifies the founder with the next tier", async () => {
    expect(await requestAccess({ investor: inv, evaluation: { ...claimed, consentTier: "full_mentor" }, startupName: "Acme", claimUrl: null })).toMatchObject({ ok: false, error: "already_full" });
    const invite = await requestAccess({ investor: inv, evaluation: { ...claimed, ownerKind: "founder_invited", claimedAt: null, consentTier: "attributed_only", inviteToken: "tok" }, startupName: "Acme", claimUrl: "https://blockid.au/claim" });
    expect(invite).toEqual({ ok: true, mode: "invite", claimUrl: "https://blockid.au/claim" });
    expect(notifyMock).not.toHaveBeenCalled();
    const r = await requestAccess({ investor: inv, evaluation: claimed, startupName: "Acme", claimUrl: null });
    expect(r).toEqual({ ok: true, mode: "notified", requested: "full_mentor", notified: true });
    expect(notifyMock.mock.calls[0][0]).toMatchObject({ userId: "u-founder", kind: "access_requested", payload: { requested: "full_mentor", investor: "Mia", startup: "Acme" }, throttleMs: 86_400_000 });
    expect(auditMock.mock.calls.at(-1)![0]).toMatchObject({ action: "consent.requested", detail: { tier: "full_mentor", mode: "notified" } });
  });
});

describe("requestIntroToInvestor (E2.6 founder side)", () => {
  it("writes the investor as a CRM contact on the founder's project (email looked up server-side), notifies the INVESTOR, audits; bad ids → invalid_input", async () => {
    expect(await requestIntroToInvestor({ founder: { id: "u-f", email: "jo@acme.io", displayName: "Jo" }, projectId: "not-a-uuid", startupName: "Acme", investor: { id: INV, name: "Mia", firm: "Blue Fund", plan: "investor_advisor" } })).toMatchObject({ ok: false, error: "invalid_input" });
    state.queue.push({ table: "app_users", data: { email: "Mia@Fund.vc" } });
    state.queue.push({ table: "investor_contacts", op: "select", data: null });
    state.queue.push({ table: "investor_contacts", op: "insert", data: { id: "c-9" } });
    const r = await requestIntroToInvestor({ founder: { id: "u-f", email: "jo@acme.io", displayName: "Jo" }, projectId: PID, startupName: "Acme", investor: { id: INV, name: "Mia", firm: "Blue Fund", plan: "investor_advisor", mandateId: "0f6e5c1a-3333-4333-8333-cccccccccccc" } });
    expect(r).toEqual({ ok: true, contactId: "c-9", created: true, notified: true });
    const ins = calls("investor_contacts", "insert")[0].payload as Row;
    expect(ins).toMatchObject({ project_id: PID, name: "Mia", email: "mia@fund.vc", org: "Blue Fund", type: "advisor", stage: "contacted", source: "investor_match", created_by: "u-f" });
    expect(ins.tags).toEqual(["match", "mandate"]);
    expect(notifyMock.mock.calls[0][0]).toMatchObject({ userId: INV, kind: "intro_requested", payload: { direction: "to_investor", founder: "Jo", startup: "Acme", project_id: PID } });
    // The result never carries the investor's email.
    expect(JSON.stringify(r)).not.toContain("fund.vc");
    expect(auditMock.mock.calls.at(-1)![0]).toMatchObject({ action: "intro.requested", resource_type: "project", resource_id: PID, detail: { channel: "crm", investor_id: INV } });
  });
});
