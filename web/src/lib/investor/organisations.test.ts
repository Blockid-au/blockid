// Colocated vitest for lib/investor/organisations (G13-W5-D3). Pins: the
// seat limits (plans.usage_limits.seats override, -1 = unlimited, tier
// fallback Scout 1 / Firm 3 / Program 5), the Appendix-2 consensus rule
// (submitted rows only, median per dimension, tally, disagreement ≥ 2,
// aggregate majority / split, "Firm consensus (n/m)"), the acting-org rule
// (invited seat acts for the firm, else personal org), shareOrg, the invite
// flow (F4: 402 seat_limit with the upgrade hint · already_member · resend
// refreshes the token · email copy + audit `org.seat_invited`) and accept
// (email mismatch · expired · idempotent · audit `org.seat_accepted`).

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
    upsert(p: unknown) { c.op = "upsert"; c.payload = p; return b; },
    delete() { c.op = "delete"; return b; },
    eq(col: string, v: unknown) { c.filters.push([col, v]); return b; },
    in(col: string, v: unknown) { c.filters.push([`in:${col}`, v]); return b; },
    is: chain, gt: chain, order: chain, limit: chain,
    maybeSingle: resolve, single: resolve,
    then(ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) { return resolve().then(ok, err); },
  });
  return b;
}
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => (state.configured ? { from: (t: string) => builder(t) } : null) }));

const { auditMock, planMock, sendMock, personalOrgMock } = vi.hoisted(() => ({
  auditMock: vi.fn(async () => ({ id: 1n, curr_hash: "h" })),
  planMock: vi.fn(async (): Promise<null | { usage_limits: Record<string, number> }> => null),
  sendMock: vi.fn(async () => ({ ok: true })),
  personalOrgMock: vi.fn(async () => ({ id: "org-firm", slug: "firm", name: "Blue Fund", kind: "vc", owner_user_id: "u-me", is_personal: true })),
}));
vi.mock("@/lib/audit", () => ({ appendAudit: (p: unknown) => auditMock(p as never) }));
vi.mock("@/lib/plans-db", () => ({ getPlanCached: (id: string) => planMock(id) }));
const canMock = vi.fn(async (_u: unknown, _f: string) => true);
vi.mock("@/lib/entitlements", () => ({ can: (u: unknown, f: string) => canMock(u, f) }));
vi.mock("@/lib/email", () => ({ sendEmail: (a: unknown) => sendMock(a as never), complianceFooter: async () => ({ unsubscribeUrl: "https://blockid.au/u", footerHtml: "<p>footer</p>" }) }));
vi.mock("@/lib/investors/mandates", () => ({
  getOrCreatePersonalOrg: (uid: string) => personalOrgMock(uid as never),
  isMissingRelation: (e: { code?: string; message?: string } | null) => !!e && (e.code === "42P01" || /does not exist/i.test(e.message ?? "")),
}));

import {
  SEAT_LIMIT_BY_TIER,
  acceptInvite,
  buildSeatInviteEmail,
  computeConsensus,
  emptyConsensus,
  getTeam,
  inviteMember,
  inviteUrlForToken,
  isOrgSeat,
  readConsensus,
  removeSeat,
  resolveActingOrg,
  seatLimitFor,
  seatsUpgradeHint,
  shareOrg,
  type SeatAssessmentRow,
} from "./organisations";
import type { SeatVisibleAssessment } from "@/lib/evaluations/assessments";

const ME = { id: "u-me", plan: "investor_advisor", email: "me@fund.vc", displayName: "Mia" };
const FIRM = { id: "org-firm", slug: "firm", name: "Blue Fund", kind: "vc", owner_user_id: "u-me", is_personal: true };
const member = (user_id: string, role = "investment_partner", id = `m-${user_id}`) => ({ id, user_id, role, created_at: "2026-09-16T00:00:00Z", app_users: { display_name: user_id.toUpperCase(), email: `${user_id}@fund.vc` } });

function seat(userId: string, over: Partial<SeatVisibleAssessment> | null, isMe = false): SeatAssessmentRow {
  const base: SeatVisibleAssessment = {
    id: `a-${userId}`, evaluationId: "e-1", projectId: "p-1", assessorUserId: userId, orgId: "org-firm", snapshotId: null, version: 1, status: "submitted", decision: "track", conviction: 3, thesisFitPct: null,
    dimensionRatings: {}, criterionRatings: {}, valuationView: null, risks: [], questionsForFounder: [], privateNotes: null, sharedNotes: null, sharedFields: [], sharedWithFounderAt: null, submittedAt: "2026-09-16T00:00:00Z", createdAt: "", updatedAt: "",
  };
  return { userId, displayName: isMe ? "Me" : userId, isMe, assessment: over === null ? null : { ...base, ...over } };
}

beforeEach(() => {
  state.configured = true;
  state.queue = [];
  state.calls = [];
  auditMock.mockClear();
  sendMock.mockClear().mockResolvedValue({ ok: true });
  planMock.mockReset().mockResolvedValue(null);
  personalOrgMock.mockClear();
});

describe("seat limits", () => {
  it("reads plans.usage_limits.seats, treats -1 / ≥ 9999 as unlimited, and falls back to the tier ladder Scout 1 / Firm 3 / Program 5", async () => {
    planMock.mockResolvedValue({ usage_limits: { seats: 3 } });
    expect(await seatLimitFor("investor_advisor")).toBe(3);
    planMock.mockResolvedValue({ usage_limits: { seats: -1 } });
    expect(await seatLimitFor("investor_vc_ent")).toBe(Number.MAX_SAFE_INTEGER);
    planMock.mockResolvedValue({ usage_limits: {} });
    expect(await seatLimitFor("investor_angel")).toBe(1);
    expect(await seatLimitFor("investor_vc_small")).toBe(5);
    planMock.mockRejectedValue(new Error("db down"));
    expect(await seatLimitFor("investor_advisor")).toBe(3);
    expect(await seatLimitFor("founder_free")).toBe(1);
    expect(SEAT_LIMIT_BY_TIER.angel).toBe(1);
    expect(SEAT_LIMIT_BY_TIER.advisor).toBe(3);
    expect(SEAT_LIMIT_BY_TIER.vc_small).toBe(5);
    expect(seatsUpgradeHint(1)).toMatch(/Firm .*3 seats/);
    expect(seatsUpgradeHint(3)).toMatch(/Program .*5 seats/);
    expect(seatsUpgradeHint(Number.MAX_SAFE_INTEGER)).toBe("");
  });
});

describe("computeConsensus — Appendix 2", () => {
  it("medians per dimension over SUBMITTED rows, decision tally, majority aggregate, mean conviction, label n/m", () => {
    const seats = [
      seat("u-a", { decision: "proceed", conviction: 4, dimensionRatings: { TRE: { rating: 5, stance: "agree" }, MPC: { rating: 2, stance: "disagree" } } }, true),
      seat("u-b", { decision: "proceed", conviction: 5, dimensionRatings: { TRE: { rating: 4, stance: "agree" }, MPC: { rating: 4, stance: "agree" } } }),
      seat("u-c", { status: "draft", decision: "pass", conviction: 1, dimensionRatings: { TRE: { rating: 1, stance: "disagree" } } }),
      seat("u-d", null),
    ];
    const c = computeConsensus(seats, { id: "org-firm", name: "Blue Fund" });
    expect(c.available).toBe(true);
    expect(c.seatCount).toBe(4);
    expect(c.submittedCount).toBe(2);
    expect(c.medianRating.TRE).toBe(4.5);
    expect(c.medianRating.MPC).toBe(3);
    expect(c.medianRating.FTV).toBeNull();
    // MPC 2 vs 4 → span 2 → discuss; TRE 5 vs 4 → 1 → fine; the draft's TRE 1 is NOT counted.
    expect(c.disagreement).toEqual(["MPC"]);
    expect(c.tally).toEqual({ pass: 0, track: 0, proceed: 2 });
    expect(c.aggregate).toBe("proceed");
    expect(c.meanConviction).toBe(4.5);
    expect(c.label).toBe("Firm consensus (2/4)");
  });

  it("a tie is 'split'; no submitted row → aggregate null, medians null; empty consensus is inert", () => {
    const tie = computeConsensus([seat("u-a", { decision: "pass" }), seat("u-b", { decision: "proceed" })], { id: "o", name: "X" });
    expect(tie.aggregate).toBe("split");
    const none = computeConsensus([seat("u-a", { status: "draft" })], null);
    expect(none.aggregate).toBeNull();
    expect(none.submittedCount).toBe(0);
    expect(none.label).toBe("Seat consensus (0/1)");
    expect(emptyConsensus().available).toBe(false);
    expect(Object.keys(emptyConsensus().medianRating)).toHaveLength(8);
  });
});

describe("acting org / membership", () => {
  it("resolveActingOrg: an org the user does not own wins; else the personal org is created on demand", async () => {
    state.queue.push({ table: "investor_organisation_members", data: [{ org_id: "org-firm", created_at: "x", investor_organisations: { ...FIRM, owner_user_id: "u-owner", is_personal: false } }] });
    const org = await resolveActingOrg("u-me");
    expect(org?.id).toBe("org-firm");
    expect(org?.owner_user_id).toBe("u-owner");
    expect(personalOrgMock).not.toHaveBeenCalled();

    state.queue.push({ table: "investor_organisation_members", data: [{ org_id: "org-me", created_at: "x", investor_organisations: { ...FIRM, id: "org-me" } }] });
    const personal = await resolveActingOrg("u-me");
    expect(personal?.id).toBe("org-firm");
    expect(personal?.is_personal).toBe(true);
    expect(personalOrgMock).toHaveBeenCalledWith("u-me");
  });

  it("isOrgSeat is true only for a seat in someone else's org; shareOrg finds the common org", async () => {
    state.queue.push({ table: "investor_organisation_members", data: [{ org_id: "org-me", investor_organisations: { owner_user_id: "u-me" } }] });
    expect(await isOrgSeat("u-me")).toBe(false);
    state.queue.push({ table: "investor_organisation_members", data: [{ org_id: "org-firm", investor_organisations: { owner_user_id: "u-owner" } }] });
    state.queue.push({ table: "app_users", data: [{ id: "u-owner", plan: "investor_vc_small" }] });
    expect(await isOrgSeat("u-me")).toBe(true);
    // W5 review: a seat lapses with the owner's plan — a cancelled Firm grants nothing.
    canMock.mockResolvedValueOnce(false);
    state.queue.push({ table: "investor_organisation_members", data: [{ org_id: "org-firm", investor_organisations: { owner_user_id: "u-owner" } }] });
    state.queue.push({ table: "app_users", data: [{ id: "u-owner", plan: "free" }] });
    expect(await isOrgSeat("u-me")).toBe(false);
    state.queue.push({ table: "investor_organisation_members", data: [{ org_id: "org-firm", user_id: "u-a" }, { org_id: "org-firm", user_id: "u-b" }, { org_id: "org-x", user_id: "u-b" }] });
    expect(await shareOrg("u-a", "u-b")).toBe("org-firm");
    state.queue.push({ table: "investor_organisation_members", data: [{ org_id: "org-firm", user_id: "u-a" }, { org_id: "org-x", user_id: "u-b" }] });
    expect(await shareOrg("u-a", "u-b")).toBeNull();
    expect(await shareOrg("u-a", "u-a")).toBeNull();
  });

  it("42P01 on the members table → null / false, never a throw", async () => {
    state.queue.push({ table: "investor_organisation_members", error: { code: "42P01", message: "relation does not exist" } });
    expect(await resolveActingOrg("u-me")).toBeNull();
    state.configured = false;
    expect(await isOrgSeat("u-me")).toBe(false);
    expect((await readConsensus({ evaluationId: "e-1", viewerUserId: "u-me" })).available).toBe(false);
  });
});

describe("getTeam / inviteMember / acceptInvite / removeSeat", () => {
  function seedTeam(members: Row[], invites: Row[] = [], seats = 3) {
    planMock.mockResolvedValue({ usage_limits: { seats } });
    state.queue.push({ table: "investor_organisation_members", op: "select", data: [{ org_id: FIRM.id, created_at: "x", investor_organisations: FIRM }] });
    state.queue.push({ table: "investor_organisation_members", op: "select", data: members });
    state.queue.push({ table: "investor_organisation_invites", op: "select", data: invites });
  }

  it("getTeam: owner + members + open invites count against the limit; the owner is always a seat", async () => {
    seedTeam([member("u-b")], [{ id: "i-1", email: "c@fund.vc", role: "ic_member", token: "tok", expires_at: "2099-01-01T00:00:00Z", created_at: "x" }]);
    const t = await getTeam(ME);
    expect(t.available).toBe(true);
    expect(t.isOwner).toBe(true);
    expect(t.members.map((m) => m.userId)).toEqual(["u-me", "u-b"]);
    expect(t.members[0].isOwner).toBe(true);
    expect(t.invites[0]).toMatchObject({ email: "c@fund.vc", token: "tok" });
    expect(t.seats).toEqual({ limit: 3, used: 3, remaining: 0, unlimited: false });
  });

  it("F4: the 4th seat is refused with seat_limit + the upgrade hint; nothing written, nothing emailed", async () => {
    seedTeam([member("u-me"), member("u-b"), member("u-c")]);
    const r = await inviteMember(ME, { email: "D@Fund.vc" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe("seat_limit");
    expect(r.limit).toBe(3);
    expect(r.used).toBe(3);
    expect(r.upgradeHint).toMatch(/Program/);
    expect(state.calls.some((c) => c.table === "investor_organisation_invites" && c.op === "insert")).toBe(false);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("invites within the limit: lower-cased email, 14-day token, magic-link email, audit org.seat_invited; existing seat → already_member; bad email → invalid_email", async () => {
    seedTeam([member("u-me")]);
    state.queue.push({ table: "investor_organisation_invites", op: "insert", data: { id: "i-9", email: "d@fund.vc", role: "investment_partner", token: "t", expires_at: "x", created_at: "x" } });
    const r = await inviteMember(ME, { email: " D@Fund.vc " });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.invite.email).toBe("d@fund.vc");
    expect(r.inviteUrl).toMatch(/^https:\/\/blockid\.au\/auth\/login\?next=%2Fworkspace%2Finvestor%2Fteam%3Finvite%3D/);
    expect(r.emailSent).toBe(true);
    expect(r.seats.used).toBe(2);
    const ins = state.calls.find((c) => c.table === "investor_organisation_invites" && c.op === "insert")!.payload as Row;
    expect(ins.email).toBe("d@fund.vc");
    expect(ins.org_id).toBe("org-firm");
    expect(String(ins.token)).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(sendMock.mock.calls[0][0]).toMatchObject({ to: "d@fund.vc", subject: expect.stringContaining("Blue Fund") });
    expect(auditMock.mock.calls[0][0]).toMatchObject({ action: "org.seat_invited", resource_type: "investor_organisation", resource_id: "org-firm" });

    seedTeam([member("u-me"), member("u-b")]);
    const dup = await inviteMember(ME, { email: "u-b@fund.vc" });
    expect(dup).toMatchObject({ ok: false, error: "already_member" });
    seedTeam([member("u-me")]);
    expect(await inviteMember(ME, { email: "nope" })).toMatchObject({ ok: false, error: "invalid_email" });
  });

  it("a non-owner seat cannot invite; a re-send refreshes the open invite's token instead of a second row", async () => {
    planMock.mockResolvedValue({ usage_limits: { seats: 3 } });
    state.queue.push({ table: "investor_organisation_members", op: "select", data: [{ org_id: FIRM.id, created_at: "x", investor_organisations: { ...FIRM, owner_user_id: "u-owner" } }] });
    state.queue.push({ table: "app_users", data: { plan: "investor_vc_small" } });
    state.queue.push({ table: "investor_organisation_members", op: "select", data: [member("u-owner"), member("u-me")] });
    state.queue.push({ table: "investor_organisation_invites", op: "select", data: [] });
    expect(await inviteMember(ME, { email: "x@fund.vc" })).toMatchObject({ ok: false, error: "not_owner" });

    seedTeam([member("u-me"), member("u-b"), member("u-c")], [{ id: "i-1", email: "d@fund.vc", role: "ic_member", token: "old", expires_at: "2099-01-01T00:00:00Z", created_at: "x" }]);
    state.queue.push({ table: "investor_organisation_invites", op: "update", data: { id: "i-1", email: "d@fund.vc", role: "ic_member", token: "new", expires_at: "x", created_at: "x" } });
    const resend = await inviteMember(ME, { email: "d@fund.vc" });
    expect(resend.ok).toBe(true);
    expect(state.calls.some((c) => c.table === "investor_organisation_invites" && c.op === "insert")).toBe(false);
    expect(state.calls.some((c) => c.table === "investor_organisation_invites" && c.op === "update")).toBe(true);
  });

  it("acceptInvite: email must match, expiry honoured, idempotent, seat upserted + invite stamped + audit org.seat_accepted", async () => {
    const invite = (over: Row = {}) => ({ id: "i-1", org_id: "org-firm", email: "d@fund.vc", role: "ic_member", expires_at: "2099-01-01T00:00:00Z", accepted_at: null, revoked_at: null, investor_organisations: FIRM, ...over });
    state.queue.push({ table: "investor_organisation_invites", data: invite() });
    expect(await acceptInvite({ id: "u-d", email: "other@fund.vc" }, "a".repeat(24))).toMatchObject({ ok: false, error: "email_mismatch" });
    state.queue.push({ table: "investor_organisation_invites", data: invite({ expires_at: "2000-01-01T00:00:00Z" }) });
    expect(await acceptInvite({ id: "u-d", email: "D@fund.vc" }, "a".repeat(24))).toMatchObject({ ok: false, error: "expired" });
    state.queue.push({ table: "investor_organisation_invites", data: invite({ accepted_at: "2026-09-16T00:00:00Z" }) });
    expect(await acceptInvite({ id: "u-d", email: "d@fund.vc" }, "a".repeat(24))).toMatchObject({ ok: true, alreadyMember: true });
    state.queue.push({ table: "investor_organisation_invites", data: null });
    expect(await acceptInvite({ id: "u-d", email: "d@fund.vc" }, "a".repeat(24))).toMatchObject({ ok: false, error: "not_found" });
    expect(await acceptInvite({ id: "u-d", email: "d@fund.vc" }, "short")).toMatchObject({ ok: false, error: "not_found" });

    state.calls = [];
    state.queue.push({ table: "investor_organisation_invites", op: "select", data: invite() });
    const ok = await acceptInvite({ id: "u-d", email: "d@fund.vc" }, "a".repeat(24));
    expect(ok).toMatchObject({ ok: true, alreadyMember: false, org: { id: "org-firm", name: "Blue Fund" } });
    const up = state.calls.find((c) => c.table === "investor_organisation_members" && c.op === "upsert")!.payload as Row;
    expect(up).toEqual({ org_id: "org-firm", user_id: "u-d", role: "ic_member" });
    const stamp = state.calls.find((c) => c.table === "investor_organisation_invites" && c.op === "update")!.payload as Row;
    expect(stamp.accepted_by).toBe("u-d");
    expect(auditMock.mock.calls.at(-1)![0]).toMatchObject({ action: "org.seat_accepted", user_id: "u-d" });
  });

  it("removeSeat: owner only, never the owner's own seat; revokes an open invite", async () => {
    seedTeam([member("u-me"), member("u-b")]);
    expect(await removeSeat(ME, { memberId: "m-u-me" })).toMatchObject({ ok: false, error: "not_found" });
    seedTeam([member("u-me"), member("u-b")]);
    expect(await removeSeat(ME, { memberId: "m-u-b" })).toEqual({ ok: true });
    expect(state.calls.some((c) => c.table === "investor_organisation_members" && c.op === "delete")).toBe(true);
    seedTeam([member("u-me")], [{ id: "i-1", email: "c@fund.vc", role: "ic_member", token: "tok", expires_at: "2099-01-01T00:00:00Z", created_at: "x" }]);
    expect(await removeSeat(ME, { inviteId: "i-1" })).toEqual({ ok: true });
    const upd = state.calls.filter((c) => c.table === "investor_organisation_invites" && c.op === "update").at(-1)!.payload as Row;
    expect(typeof upd.revoked_at).toBe("string");
  });
});

describe("readConsensus", () => {
  it("reads every seat's newest version, masks other seats' private notes, keeps the viewer's own row, and names seats", async () => {
    state.queue.push({ table: "investor_organisation_members", op: "select", data: [{ org_id: FIRM.id, created_at: "x", investor_organisations: FIRM }] });
    state.queue.push({ table: "investor_organisation_members", op: "select", data: [{ user_id: "u-me" }, { user_id: "u-b" }] });
    const row = (assessor_user_id: string, version: number, over: Row = {}) => ({ id: `a-${assessor_user_id}-${version}`, evaluation_id: "e-1", project_id: "p-1", assessor_user_id, org_id: "org-firm", snapshot_id: null, version, status: "submitted", decision: "proceed", conviction: 4, thesis_fit_pct: null, dimension_ratings: { TRE: { rating: 4, stance: "agree" } }, criterion_ratings: {}, valuation_view: null, risks: [], questions_for_founder: [], private_notes: "SECRET", shared_notes: null, shared_fields: [], shared_with_founder_at: null, submitted_at: "x", created_at: "x", updated_at: "x", ...over });
    state.queue.push({ table: "evaluation_assessments", data: [row("u-b", 2, { decision: "pass" }), row("u-b", 1), row("u-me", 1, { decision: "track" })] });
    state.queue.push({ table: "app_users", data: [{ id: "u-b", display_name: "Ben", email: "ben@fund.vc" }] });
    const c = await readConsensus({ evaluationId: "e-1", viewerUserId: "u-me" });
    expect(c.available).toBe(true);
    expect(c.seatCount).toBe(2);
    const b = c.seats.find((s) => s.userId === "u-b")!;
    expect(b.displayName).toBe("Ben");
    expect(b.assessment?.version).toBe(2);
    expect(b.assessment?.decision).toBe("pass");
    expect(b.assessment?.privateNotes).toBeNull();
    expect(JSON.stringify(c)).not.toContain("SECRET");
    expect(c.seats.find((s) => s.isMe)?.displayName).toBe("Me");
    expect(c.tally).toEqual({ pass: 1, track: 1, proceed: 0 });
    expect(c.aggregate).toBe("split");
    expect(c.label).toBe("Firm consensus (2/2)");
  });
});

describe("invite email + url", () => {
  it("names the inviter and org, carries the magic link and the expiry, escapes HTML", () => {
    const { subject, html } = buildSeatInviteEmail({ inviterName: "Mia <Fund>", orgName: "Blue & Co", inviteUrl: inviteUrlForToken("tok-1"), expiresDays: 14 });
    expect(subject).toBe("Mia <Fund> invited you to a seat at Blue & Co on BlockID");
    expect(html).toContain("Mia &lt;Fund&gt;");
    expect(html).toContain("Blue &amp; Co");
    expect(html).toContain("expires in 14 days");
    expect(html).toContain("invite%3Dtok-1");
  });
});
