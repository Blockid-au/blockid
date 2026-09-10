// Colocated vitest for /api/cron/evaluator-progress-weekly (T0273).
// Pins: Bearer CRON_SECRET gate (401 unset / mismatched), 503 without
// Supabase, the audience filter (evaluations holders × evaluator persona ×
// money_radar), `?dry=1` → computes + returns per-user summaries and sends /
// claims / notifies nothing, the live path (claim → in-app → canSendEmail →
// send with the money_radar unsubscribe URL), dupe + unsubscribed + empty
// skips, release on a send failure, and POST === GET.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  fromMock: vi.fn(),
  supabaseAvailable: true,
  getEntitlementsMock: vi.fn(),
  sendEmailMock: vi.fn(),
  canSendEmailMock: vi.fn(),
  ensurePrefsMock: vi.fn(),
  buildMock: vi.fn(),
  claimMock: vi.fn(),
  releaseMock: vi.fn(),
  notifyMock: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => (h.supabaseAvailable ? { from: (t: string) => h.fromMock(t) } : null),
}));
vi.mock("@/lib/entitlements", () => ({ getEntitlements: (plan: unknown, id: unknown) => h.getEntitlementsMock(plan, id) }));
vi.mock("@/lib/email", () => ({ sendEmail: (args: unknown) => h.sendEmailMock(args) }));
vi.mock("@/lib/email-preferences", () => ({
  canSendEmail: (email: string, cat: string) => h.canSendEmailMock(email, cat),
  ensureEmailPreferences: (email: string) => h.ensurePrefsMock(email),
  getUnsubscribeUrl: (token: string, cat?: string) => `https://blockid.au/unsubscribe?token=${token}${cat ? `&category=${cat}` : ""}`,
}));
vi.mock("@/lib/evaluations/progress-radar", async () => {
  const shared = await vi.importActual<typeof import("@/lib/evaluations/progress-shared")>("@/lib/evaluations/progress-shared");
  return {
    buildEvaluatorProgress: (o: unknown) => h.buildMock(o),
    claimProgressSend: (p: unknown) => h.claimMock(p),
    releaseProgressSend: (p: unknown) => h.releaseMock(p),
    notifyEvaluatorProgress: (p: unknown) => h.notifyMock(p),
    isEvaluatorPersona: shared.isEvaluatorPersona,
    progressHeadline: shared.progressHeadline,
  };
});

import { GET, POST, dynamic, maxDuration } from "./route";

const USERS = [
  { id: "u-scout", email: "scout@fund.vc", display_name: "Sam", plan: "investor_angel", account_type: "investor", segment: "investor_angel" },
  { id: "u-firm", email: "firm@adv.au", display_name: "Fay", plan: "investor_advisor", account_type: "service_provider", segment: "advisor" },
  { id: "u-founder", email: "jo@acme.io", display_name: "Jo", plan: "founder_starter", account_type: "founder", segment: "founder" },
  { id: "u-free", email: "free@x.io", display_name: null, plan: "free", account_type: "accelerator", segment: "accelerator" },
];

function table(name: string) {
  const b: Record<string, unknown> = {};
  const data = name === "evaluations" ? USERS.map((u) => ({ evaluator_user_id: u.id })) : name === "app_users" ? USERS : [];
  Object.assign(b, {
    select: () => b,
    in: () => b,
    limit: () => b,
    then: (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) => Promise.resolve({ data, error: null }).then(ok, err),
  });
  return b;
}

function progressFor(userId: string, movers = 1) {
  const items = [{ evaluationId: "e-1", name: "Acme", delta: 4, sviNow: 70, money: { newMatches: 0, deadlinesAhead: 0, nextDeadline: null } }];
  return {
    userId,
    periodStart: "2026-09-07T00:00:00.000Z",
    periodEnd: "2026-09-13T23:30:00.000Z",
    items,
    movers: items.slice(0, movers),
    deadlines: [],
    newMatches: 0,
    newEvidence: 0,
    digest_ready: movers > 0,
  };
}

function req(url = "http://localhost/api/cron/evaluator-progress-weekly", auth?: string) {
  return new Request(url, { headers: auth ? { authorization: auth } : {} });
}

describe("evaluator-progress-weekly route", () => {
  const origSecret = process.env.CRON_SECRET;
  beforeEach(() => {
    process.env.CRON_SECRET = "s3cret";
    h.supabaseAvailable = true;
    for (const m of [h.fromMock, h.getEntitlementsMock, h.sendEmailMock, h.canSendEmailMock, h.ensurePrefsMock, h.buildMock, h.claimMock, h.releaseMock, h.notifyMock]) m.mockReset();
    h.fromMock.mockImplementation((t: string) => table(t));
    h.getEntitlementsMock.mockImplementation(async (plan: string) => (plan === "free" ? ["svi.basic"] : ["money_radar", "investor.dealflow"]));
    h.buildMock.mockImplementation(async ({ userId }: { userId: string }) => progressFor(userId));
    h.claimMock.mockResolvedValue("claimed");
    h.notifyMock.mockResolvedValue(undefined);
    h.canSendEmailMock.mockResolvedValue(true);
    h.ensurePrefsMock.mockResolvedValue("tok-1");
    h.sendEmailMock.mockResolvedValue({ ok: true, id: "m-1" });
  });
  afterEach(() => {
    if (origSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = origSecret;
  });

  it("exports force-dynamic + 300 s maxDuration and POST === GET", () => {
    expect(dynamic).toBe("force-dynamic");
    expect(maxDuration).toBe(300);
    expect(POST).toBe(GET);
  });

  it("401 without / with wrong bearer, and when CRON_SECRET is unset; 503 without Supabase", async () => {
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req(undefined, "Bearer nope"))).status).toBe(401);
    delete process.env.CRON_SECRET;
    expect((await GET(req(undefined, "Bearer s3cret"))).status).toBe(401);
    expect(h.buildMock).not.toHaveBeenCalled();

    process.env.CRON_SECRET = "s3cret";
    h.supabaseAvailable = false;
    expect((await GET(req(undefined, "Bearer s3cret"))).status).toBe(503);
  });

  it("?dry=1 computes for the evaluator audience with money_radar and sends / claims / notifies nothing", async () => {
    const r = await GET(req("http://localhost/api/cron/evaluator-progress-weekly?dry=1", "Bearer s3cret"));
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body).toMatchObject({ ok: true, dryRun: true, holders: 4, audience: 3, sent: 0, would_send: 2, skipped_no_radar: 1 });
    // Founder persona filtered before entitlements; free accelerator filtered by money_radar.
    expect(h.buildMock.mock.calls.map((c) => (c[0] as { userId: string }).userId)).toEqual(["u-scout", "u-firm"]);
    expect(body.users).toEqual([
      expect.objectContaining({ user_id: "u-scout", startups: 1, moved: 1, outcome: "would_send", subject: "Your weekly progress radar — 1 of 1 startup moved" }),
      expect.objectContaining({ user_id: "u-firm", outcome: "would_send" }),
    ]);
    expect(h.claimMock).not.toHaveBeenCalled();
    expect(h.notifyMock).not.toHaveBeenCalled();
    expect(h.sendEmailMock).not.toHaveBeenCalled();
  });

  it("live: claim → in-app → canSendEmail(money_radar) → email with the money_radar unsubscribe URL", async () => {
    const r = await POST(req(undefined, "Bearer s3cret"));
    const body = await r.json();
    expect(body).toMatchObject({ ok: true, dryRun: false, sent: 2, skipped_dupe: 0, failures: 0 });
    expect(body.users).toBeUndefined();
    expect(h.claimMock).toHaveBeenCalledTimes(2);
    expect(h.notifyMock).toHaveBeenCalledTimes(2);
    expect(h.canSendEmailMock).toHaveBeenCalledWith("scout@fund.vc", "money_radar");
    const args = h.sendEmailMock.mock.calls[0][0] as Record<string, string>;
    expect(args.to).toBe("scout@fund.vc");
    expect(args.subject).toBe("Your weekly progress radar — 1 of 1 startup moved");
    expect(args.unsubscribeUrl).toBe("https://blockid.au/unsubscribe?token=tok-1&category=money_radar");
    expect(args.html).toContain("Hi Sam");
    expect(args.html).toContain("Unsubscribe from Progress Radar emails");
    expect(h.releaseMock).not.toHaveBeenCalled();
  });

  it("skips: silent week (no claim), dupe slot (no notify / send), unsubscribed (in-app still written)", async () => {
    h.buildMock.mockImplementation(async ({ userId }: { userId: string }) => progressFor(userId, userId === "u-scout" ? 0 : 1));
    h.claimMock.mockResolvedValueOnce("dupe");
    let body = await (await POST(req(undefined, "Bearer s3cret"))).json();
    expect(body).toMatchObject({ skipped_empty: 1, skipped_dupe: 1, sent: 0 });
    expect(h.claimMock).toHaveBeenCalledTimes(1);
    expect(h.notifyMock).not.toHaveBeenCalled();
    expect(h.sendEmailMock).not.toHaveBeenCalled();

    h.buildMock.mockImplementation(async ({ userId }: { userId: string }) => progressFor(userId));
    h.claimMock.mockResolvedValue("claimed");
    h.canSendEmailMock.mockResolvedValue(false);
    body = await (await POST(req(undefined, "Bearer s3cret"))).json();
    expect(body).toMatchObject({ skipped_unsubscribed: 2, sent: 0 });
    expect(h.notifyMock).toHaveBeenCalledTimes(2);
    expect(h.sendEmailMock).not.toHaveBeenCalled();
  });

  it("releases the claimed slot when the email send fails so the next tick can retry", async () => {
    h.sendEmailMock.mockResolvedValueOnce({ ok: false, reason: "send_error" });
    const body = await (await POST(req(undefined, "Bearer s3cret"))).json();
    expect(body).toMatchObject({ sent: 1, failures: 1 });
    expect(h.releaseMock).toHaveBeenCalledTimes(1);
    expect((h.releaseMock.mock.calls[0][0] as { userId: string }).userId).toBe("u-scout");
  });

  it("a missing evaluations table (42P01) is a clean no-op, other query errors are 500", async () => {
    h.fromMock.mockImplementation((t: string) => {
      if (t !== "evaluations") return table(t);
      const b: Record<string, unknown> = {};
      Object.assign(b, {
        select: () => b,
        limit: () => b,
        then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: null, error: { code: "42P01", message: "missing" } }).then(ok),
      });
      return b;
    });
    let r = await GET(req(undefined, "Bearer s3cret"));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, audience: 0, reason: "evaluations_table_missing" });

    h.fromMock.mockImplementation((t: string) => {
      if (t !== "evaluations") return table(t);
      const b: Record<string, unknown> = {};
      Object.assign(b, {
        select: () => b,
        limit: () => b,
        then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: null, error: { code: "XX000", message: "boom" } }).then(ok),
      });
      return b;
    });
    r = await GET(req(undefined, "Bearer s3cret"));
    expect(r.status).toBe(500);
  });
});
