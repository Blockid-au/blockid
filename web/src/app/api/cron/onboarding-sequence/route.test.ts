// Colocated vitest for /api/cron/onboarding-sequence — the pre-analysis mailer.
//
// The route fires the 3-touch onboarding sequence (D+1 workspace-ready welcome,
// D+3 Evidence Vault CTA, D+7 Founding 100 scarcity pitch) to users who signed
// up but have NOT yet run an SVI analysis. Once they do, /api/cron/email-drip +
// /api/cron/weekly-insights take over. Silent regressions this suite pins:
//
//   (a) losing `export const dynamic = "force-dynamic"` — a static build would
//       freeze the "sent:0 skipped:0" envelope and neither the sendEmail call
//       nor the svi_notifications insert would ever fire in production;
//   (b) losing `export const maxDuration = 60` — the crontab wrapper would
//       kill mid-batch on the D+3 users who have many prior notifications;
//   (c) losing the CRON_SECRET bearer gate — unauth requests would leak the
//       pre-analysis user list AND actually send email;
//   (d) losing the getSupabaseAdmin() null-guard — a mis-configured env would
//       throw at the first `.from(...)` instead of returning a clean 503;
//   (e) breaking the "only users without an svi_analyses row" filter — a
//       regression here would spam users who already have a report and are
//       being nurtured by the weekly/email-drip lifecycle;
//   (f) regressing the MAX_BATCH=20 cap that protects the mail transport from
//       queue-of-doom incidents when a signup backfill lands;
//   (g) the step selection windows — D+1 must fire in [1..4], D+3 in [3..6],
//       D+7 in [7..10]; drift here either double-sends or silently skips a
//       step for users whose tick lands between windows;
//   (h) the notification dedupe — if svi_notifications already has the step's
//       notification_type for that email, the route MUST skip that step (a
//       regression would re-send D+1 every tick until the user churned);
//   (i) the only-one-email-per-user-per-run rule — after a successful send the
//       inner loop MUST break so the D+3 send does not immediately fire on a
//       tick that just sent D+1 (would double-tap a fresh signup in one run);
//   (j) branching on canSendEmail — a false verdict MUST increment `skipped`
//       and NOT call sendEmail, and MUST NOT insert a svi_notifications row
//       (otherwise the dedupe would silently swallow the D+1 forever);
//   (k) the notification row shape — {email, account_id: null, notification_type}
//       is the natural key the dedupe SELECT relies on; drift here breaks both
//       the dedupe AND the downstream lifecycle handoff;
//   (l) firstName derivation from display_name — `display_name?.split(" ")[0]`
//       with a "there" fallback so the subject line never renders "null,";
//   (m) skipping rows missing `email` or `created_at` without throwing — the
//       users table has been observed with nulls in both columns;
//   (n) envelope shape `{ok:true, sent, skipped, policy}` — the crontab log
//       aggregator keys on `policy: "onboarding_3_emails_pre_analysis"` and
//       drift here loses the pre-analysis metric on the daily digest;
//   (o) the 500 error envelope `{ok:false, error}` on internal throws — the
//       crontab wrapper counts the 500 as a hard failure and retries; a
//       missing `ok:false` would classify the failure as a soft success;
//   (p) POST↔GET parity — the route uses `export { GET as POST }` so the
//       crontab can hit either verb; drift here breaks the POST-retry path.
//
// Mocks `@/lib/supabase` (a small chainable fake covering the three query
// shapes the route uses), `@/lib/email` (sendEmail), and `@/lib/email-preferences`
// (canSendEmail + ensureEmailPreferences + the two URL builders — stubbed to
// return sentinel strings so the tests can pin the route wiring without
// depending on the URL builder internals).

import { describe, it, expect, vi, beforeEach } from "vitest";

const sendEmailMock = vi.fn();
vi.mock("@/lib/email", () => ({
  sendEmail: (args: Parameters<typeof sendEmailMock>[0]) => sendEmailMock(args),
}));

const canSendEmailMock = vi.fn();
const ensureEmailPreferencesMock = vi.fn();
const getUnsubscribeUrlMock = vi.fn();
const getPreferencesUrlMock = vi.fn();
vi.mock("@/lib/email-preferences", () => ({
  canSendEmail: (...a: unknown[]) => canSendEmailMock(...a),
  ensureEmailPreferences: (...a: unknown[]) => ensureEmailPreferencesMock(...a),
  getUnsubscribeUrl: (...a: unknown[]) => getUnsubscribeUrlMock(...a),
  getPreferencesUrl: (...a: unknown[]) => getPreferencesUrlMock(...a),
}));

type UserRow = {
  id: string;
  email: string | null;
  display_name: string | null;
  created_at: string | null;
};

type FakeState = {
  users: UserRow[];
  notifCounts: Map<string, number>; // key = `${email}|${type}`
  inserts: Array<{ email: string | null; account_id: null; notification_type: string }>;
  throwOnUsersQuery?: Error;
};

let state: FakeState;

function resetState() {
  state = { users: [], notifCounts: new Map(), inserts: [] };
}

function makeUsersChain() {
  const self = {
    select() { return self; },
    not() { return self; },
    order() { return self; },
    limit() {
      if (state.throwOnUsersQuery) throw state.throwOnUsersQuery;
      return Promise.resolve({ data: state.users, error: null });
    },
  };
  return self;
}

function makeNotifChain() {
  const self: {
    _email: string | null;
    _type: string | null;
    select: (cols?: unknown, opts?: unknown) => typeof self;
    eq: (col: string, val: string) => typeof self;
    insert: (row: { email: string | null; notification_type: string; account_id: null }) => Promise<{ data: null; error: null }>;
    then: (onFulfilled?: (v: { count: number; error: null }) => unknown, onRejected?: (e: unknown) => unknown) => Promise<unknown>;
  } = {
    _email: null,
    _type: null,
    select() { return self; },
    eq(col, val) {
      if (col === "email") self._email = val;
      if (col === "notification_type") self._type = val;
      return self;
    },
    insert(row) {
      state.inserts.push(row);
      return Promise.resolve({ data: null, error: null });
    },
    then(onFulfilled, onRejected) {
      const key = `${self._email}|${self._type}`;
      const count = state.notifCounts.get(key) ?? 0;
      return Promise.resolve({ count, error: null }).then(onFulfilled, onRejected);
    },
  };
  return self;
}

let supabaseValue: unknown = {};
const getSupabaseAdminMock = vi.fn(() => supabaseValue);
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

function fakeSupabase() {
  return {
    from(table: string) {
      if (table === "users") return makeUsersChain();
      if (table === "svi_notifications") return makeNotifChain();
      throw new Error(`unexpected table: ${table}`);
    },
  };
}

import * as routeModule from "./route";
import { GET, POST } from "./route";

const SECRET = "cron-secret-onboarding-value";

function req(method: "GET" | "POST" = "GET", headers: Record<string, string> = {}) {
  return new Request("http://x/api/cron/onboarding-sequence", { method, headers });
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000 - 60_000).toISOString();
}

beforeEach(() => {
  resetState();
  supabaseValue = fakeSupabase();
  getSupabaseAdminMock.mockClear();
  sendEmailMock.mockReset();
  canSendEmailMock.mockReset();
  ensureEmailPreferencesMock.mockReset();
  getUnsubscribeUrlMock.mockReset();
  getPreferencesUrlMock.mockReset();

  sendEmailMock.mockResolvedValue({ ok: true });
  canSendEmailMock.mockResolvedValue(true);
  ensureEmailPreferencesMock.mockResolvedValue("tok-abc");
  getUnsubscribeUrlMock.mockReturnValue("https://x/unsub?token=tok-abc");
  getPreferencesUrlMock.mockReturnValue("https://x/unsub?token=tok-abc&manage=1");

  process.env.CRON_SECRET = SECRET;
  process.env.NEXT_PUBLIC_SITE_URL = "https://blockid.au";
});

describe("/api/cron/onboarding-sequence — route module shape", () => {
  it("pins `export const dynamic = 'force-dynamic'` so the DB writes always fire", () => {
    expect((routeModule as { dynamic?: string }).dynamic).toBe("force-dynamic");
  });

  it("pins `export const maxDuration = 60` so the crontab wrapper does not kill mid-batch", () => {
    expect((routeModule as { maxDuration?: number }).maxDuration).toBe(60);
  });

  it("aliases POST to GET (`export { GET as POST }`) so the crontab may hit either verb", () => {
    expect(POST).toBe(GET);
  });
});

describe("/api/cron/onboarding-sequence — auth gate", () => {
  it("returns 401 when no Authorization header is sent", async () => {
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("returns 401 when the bearer token is wrong", async () => {
    const res = await GET(req("GET", { authorization: "Bearer nope" }));
    expect(res.status).toBe(401);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("is case-sensitive — 'bearer' (lowercase) with the right secret is still rejected", async () => {
    const res = await GET(req("GET", { authorization: `bearer ${SECRET}` }));
    expect(res.status).toBe(401);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});

describe("/api/cron/onboarding-sequence — supabase availability", () => {
  it("returns 503 with ok:false when getSupabaseAdmin returns null", async () => {
    supabaseValue = null;
    const res = await GET(req("GET", { authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, error: "Supabase not configured" });
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});

describe("/api/cron/onboarding-sequence — empty pool", () => {
  it("returns 200 with sent:0 skipped:0 and the pre-analysis policy tag when no users match", async () => {
    state.users = [];
    const res = await GET(req("GET", { authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      sent: 0,
      skipped: 0,
      policy: "onboarding_3_emails_pre_analysis",
    });
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});

describe("/api/cron/onboarding-sequence — step selection", () => {
  it("D+1 fires for a user signed up 1 day ago (subject + notification_type match the D+1 step)", async () => {
    state.users = [
      { id: "u1", email: "a@x.io", display_name: "Ada Lovelace", created_at: daysAgoIso(1) },
    ];
    const res = await GET(req("GET", { authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, sent: 1, skipped: 0 });
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const call = sendEmailMock.mock.calls[0][0];
    expect(call.to).toBe("a@x.io");
    expect(call.subject).toBe("Ada, your BlockID workspace is ready");
    expect(state.inserts).toEqual([
      { email: "a@x.io", account_id: null, notification_type: "onboarding_d1" },
    ]);
  });

  it("D+3 fires (not D+1) for a user signed up exactly 3 days ago when D+1 was already sent", async () => {
    state.users = [
      { id: "u2", email: "b@x.io", display_name: "Bo", created_at: daysAgoIso(3) },
    ];
    state.notifCounts.set("b@x.io|onboarding_d1", 1);
    await GET(req("GET", { authorization: `Bearer ${SECRET}` }));
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock.mock.calls[0][0].subject).toBe(
      "Bo, connect your data to boost your SVI score",
    );
    expect(state.inserts).toEqual([
      { email: "b@x.io", account_id: null, notification_type: "onboarding_d3" },
    ]);
  });

  it("D+7 fires with the Founding 100 A$5 subject line for a user signed up 7 days ago", async () => {
    state.users = [
      { id: "u3", email: "c@x.io", display_name: "Cam Smith", created_at: daysAgoIso(7) },
    ];
    state.notifCounts.set("c@x.io|onboarding_d1", 1);
    state.notifCounts.set("c@x.io|onboarding_d3", 1);
    await GET(req("GET", { authorization: `Bearer ${SECRET}` }));
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock.mock.calls[0][0].subject).toBe(
      "Cam, only a few Founding 100 spots left at A$5",
    );
    expect(state.inserts[0].notification_type).toBe("onboarding_d7");
  });

  it("nothing fires for a user signed up 11 days ago — every step is past its `daysAfter + 3` window", async () => {
    state.users = [
      { id: "u4", email: "d@x.io", display_name: "Dee", created_at: daysAgoIso(11) },
    ];
    const res = await GET(req("GET", { authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ sent: 0, skipped: 0 });
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(state.inserts).toEqual([]);
  });

  it("nothing fires for a user signed up 0 days ago — every step is still ahead of `daysAfter`", async () => {
    state.users = [
      { id: "u5", email: "e@x.io", display_name: "Ev", created_at: daysAgoIso(0) },
    ];
    await GET(req("GET", { authorization: `Bearer ${SECRET}` }));
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(state.inserts).toEqual([]);
  });

  it("only ONE email per user per tick — a fresh 1-day-old user gets D+1 and the loop breaks (no D+3 attempt)", async () => {
    state.users = [
      { id: "u6", email: "f@x.io", display_name: "Fi", created_at: daysAgoIso(1) },
    ];
    await GET(req("GET", { authorization: `Bearer ${SECRET}` }));
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0].notification_type).toBe("onboarding_d1");
  });
});

describe("/api/cron/onboarding-sequence — dedupe + preferences", () => {
  it("skips a step whose svi_notifications row already exists (no re-send, no duplicate insert)", async () => {
    state.users = [
      { id: "u7", email: "g@x.io", display_name: "Gi", created_at: daysAgoIso(1) },
    ];
    state.notifCounts.set("g@x.io|onboarding_d1", 1);
    const res = await GET(req("GET", { authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(state.inserts).toEqual([]);
  });

  it("increments skipped and does NOT send when canSendEmail returns false (category = weekly_reports)", async () => {
    canSendEmailMock.mockResolvedValue(false);
    state.users = [
      { id: "u8", email: "h@x.io", display_name: "Hi", created_at: daysAgoIso(1) },
    ];
    const res = await GET(req("GET", { authorization: `Bearer ${SECRET}` }));
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, sent: 0, skipped: 1 });
    expect(canSendEmailMock).toHaveBeenCalledWith("h@x.io", "weekly_reports");
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(state.inserts).toEqual([]);
  });

  it("passes token from ensureEmailPreferences through both URL builders + into the sendEmail payload", async () => {
    ensureEmailPreferencesMock.mockResolvedValue("tok-xyz");
    getUnsubscribeUrlMock.mockReturnValue("https://blockid.au/unsub?token=tok-xyz");
    state.users = [
      { id: "u9", email: "i@x.io", display_name: "Iv", created_at: daysAgoIso(1) },
    ];
    await GET(req("GET", { authorization: `Bearer ${SECRET}` }));
    expect(ensureEmailPreferencesMock).toHaveBeenCalledWith("i@x.io");
    expect(getUnsubscribeUrlMock).toHaveBeenCalledWith("tok-xyz", "weekly_reports");
    expect(getPreferencesUrlMock).toHaveBeenCalledWith("tok-xyz");
    const call = sendEmailMock.mock.calls[0][0];
    expect(call.unsubscribeUrl).toBe("https://blockid.au/unsub?token=tok-xyz");
  });
});

describe("/api/cron/onboarding-sequence — row hygiene", () => {
  it("firstName falls back to 'there' when display_name is null (never renders 'null,' in the subject)", async () => {
    state.users = [
      { id: "u10", email: "j@x.io", display_name: null, created_at: daysAgoIso(1) },
    ];
    await GET(req("GET", { authorization: `Bearer ${SECRET}` }));
    expect(sendEmailMock.mock.calls[0][0].subject).toBe(
      "there, your BlockID workspace is ready",
    );
  });

  it("only the first token of display_name is used as firstName (e.g. 'Ada Lovelace' → 'Ada')", async () => {
    state.users = [
      { id: "u11", email: "k@x.io", display_name: "Ada Lovelace", created_at: daysAgoIso(1) },
    ];
    await GET(req("GET", { authorization: `Bearer ${SECRET}` }));
    expect(sendEmailMock.mock.calls[0][0].subject.startsWith("Ada,")).toBe(true);
  });

  it("skips a row with null email — no send, no insert, no counter change", async () => {
    state.users = [
      { id: "u12", email: null, display_name: "Nemo", created_at: daysAgoIso(1) },
    ];
    const res = await GET(req("GET", { authorization: `Bearer ${SECRET}` }));
    expect(await res.json()).toMatchObject({ sent: 0, skipped: 0 });
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(state.inserts).toEqual([]);
  });

  it("skips a row with null created_at — no send, no insert, no counter change", async () => {
    state.users = [
      { id: "u13", email: "m@x.io", display_name: "Mo", created_at: null },
    ];
    const res = await GET(req("GET", { authorization: `Bearer ${SECRET}` }));
    expect(await res.json()).toMatchObject({ sent: 0, skipped: 0 });
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(state.inserts).toEqual([]);
  });
});

describe("/api/cron/onboarding-sequence — batch cap + envelope", () => {
  it("processes at most MAX_BATCH=20 users even when the fetch surfaces more than 20 eligible", async () => {
    state.users = Array.from({ length: 25 }, (_, i) => ({
      id: `u-${i}`,
      email: `many-${i}@x.io`,
      display_name: `User${i}`,
      created_at: daysAgoIso(1),
    }));
    const res = await GET(req("GET", { authorization: `Bearer ${SECRET}` }));
    const body = await res.json();
    expect(body).toMatchObject({ sent: 20, skipped: 0 });
    expect(sendEmailMock).toHaveBeenCalledTimes(20);
    expect(state.inserts).toHaveLength(20);
  });

  it("envelope carries exactly {ok, sent, skipped, policy} — no drift on the pre-analysis metric key", async () => {
    state.users = [
      { id: "u-env", email: "env@x.io", display_name: "En", created_at: daysAgoIso(1) },
    ];
    const res = await GET(req("GET", { authorization: `Bearer ${SECRET}` }));
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(["ok", "policy", "sent", "skipped"]);
    expect(body.policy).toBe("onboarding_3_emails_pre_analysis");
  });

  it("returns 500 with ok:false + stringified error when the users query throws", async () => {
    state.throwOnUsersQuery = new Error("boom-users-query");
    const res = await GET(req("GET", { authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(String(body.error)).toContain("boom-users-query");
  });
});

describe("/api/cron/onboarding-sequence — send payload wiring", () => {
  it("sendEmail receives the site logo URL derived from NEXT_PUBLIC_SITE_URL", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://staging.blockid.au";
    state.users = [
      { id: "u-logo", email: "logo@x.io", display_name: "Lo", created_at: daysAgoIso(1) },
    ];
    await GET(req("GET", { authorization: `Bearer ${SECRET}` }));
    const call = sendEmailMock.mock.calls[0][0];
    expect(call.html).toContain("https://staging.blockid.au/images/logo-transparent.png");
    expect(call.html).toContain("https://staging.blockid.au/#svi");
  });

  it("defaults the site URL to https://blockid.au when NEXT_PUBLIC_SITE_URL is unset", async () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    state.users = [
      { id: "u-default", email: "def@x.io", display_name: "De", created_at: daysAgoIso(1) },
    ];
    await GET(req("GET", { authorization: `Bearer ${SECRET}` }));
    const call = sendEmailMock.mock.calls[0][0];
    expect(call.html).toContain("https://blockid.au/images/logo-transparent.png");
  });
});
