// Unit tests for /api/account/notify-prefs — P9-account-notify-prefs-route-test.
//
// Route powers the workspace "Notify me when someone views my SVI score"
// toggle. Two verbs on the same handler pair:
//   GET  → { ok, notifyScoreViewed } derived from email_preferences.svi_alerts
//   POST → { notifyScoreViewed: boolean } persisted via updateEmailPreferences
//
// Silent regressions this pins against:
//   - dropping the 401 gate and leaking / mutating another founder's prefs;
//   - flipping the default from true → false when the row is missing (would
//     silently opt everyone OUT of score-viewed notifications on first load);
//   - dropping the `ensureEmailPreferences` call and hitting the update path
//     against a non-existent row (the founder would see a 200 but no bit
//     actually flipped on the server);
//   - forwarding a truthy string ("false") straight into svi_alerts without
//     the Boolean() coercion — the DB would store the string "true" and the
//     UI would render it back as always-on;
//   - swallowing invalid JSON as a 500 (the route promises a 400).

import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUserMock = vi.fn<
  () => Promise<{ id: string; email: string } | null>
>();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

const ensureEmailPreferencesMock = vi.fn<
  (email: string, userId?: string) => Promise<string>
>();
const getEmailPreferencesMock = vi.fn<
  (email: string) => Promise<{ svi_alerts?: boolean } | null>
>();
const updateEmailPreferencesMock = vi.fn<
  (email: string, updates: Record<string, unknown>) => Promise<void>
>();
vi.mock("@/lib/email-preferences", () => ({
  ensureEmailPreferences: (email: string, userId?: string) =>
    ensureEmailPreferencesMock(email, userId),
  getEmailPreferences: (email: string) => getEmailPreferencesMock(email),
  updateEmailPreferences: (email: string, updates: Record<string, unknown>) =>
    updateEmailPreferencesMock(email, updates),
}));

import { GET, POST, dynamic } from "./route";

beforeEach(() => {
  getCurrentUserMock.mockReset();
  ensureEmailPreferencesMock.mockReset();
  getEmailPreferencesMock.mockReset();
  updateEmailPreferencesMock.mockReset();
  getCurrentUserMock.mockResolvedValue({ id: "user-1", email: "u@x.com" });
  ensureEmailPreferencesMock.mockResolvedValue("tok-abc");
  getEmailPreferencesMock.mockResolvedValue({ svi_alerts: true });
  updateEmailPreferencesMock.mockResolvedValue();
});

function jsonReq(body: unknown): Request {
  return new Request("http://localhost/api/account/notify-prefs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("dynamic export", () => {
  it('exports dynamic = "force-dynamic" so per-user prefs never prerender', () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

describe("GET — anonymous branch", () => {
  it("returns 401 { ok:false, reason:'Authentication required' } when getCurrentUser is null", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ ok: false, reason: "Authentication required" });
  });

  it("does NOT touch email-preferences on the anonymous branch (guard short-circuits before ensure/get)", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    await GET();
    expect(ensureEmailPreferencesMock).not.toHaveBeenCalled();
    expect(getEmailPreferencesMock).not.toHaveBeenCalled();
  });
});

describe("GET — happy path", () => {
  it("returns 200 { ok:true, notifyScoreViewed } derived from prefs.svi_alerts", async () => {
    getEmailPreferencesMock.mockResolvedValue({ svi_alerts: false });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, notifyScoreViewed: false });
  });

  it("forwards {email, id} into ensureEmailPreferences (both args pinned — a rename to positional would silently drop userId)", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u-42", email: "f@x.com" });
    await GET();
    expect(ensureEmailPreferencesMock).toHaveBeenCalledWith("f@x.com", "u-42");
  });

  it("looks up the row by the user's email verbatim (the helper handles casing/trim internally — a double-lower here would break founder@Domain.com)", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u-1", email: "Founder@X.com" });
    await GET();
    expect(getEmailPreferencesMock).toHaveBeenCalledWith("Founder@X.com");
  });

  it("ensures the row exists BEFORE reading it (so a first-time visit doesn't 200 with a phantom default)", async () => {
    const order: string[] = [];
    ensureEmailPreferencesMock.mockImplementation(async () => {
      order.push("ensure");
      return "tok";
    });
    getEmailPreferencesMock.mockImplementation(async () => {
      order.push("get");
      return { svi_alerts: true };
    });
    await GET();
    expect(order).toEqual(["ensure", "get"]);
  });

  it("defaults notifyScoreViewed to true when prefs are missing (?? true — opt-in-by-default UX)", async () => {
    getEmailPreferencesMock.mockResolvedValue(null);
    const body = await (await GET()).json();
    expect(body).toEqual({ ok: true, notifyScoreViewed: true });
  });

  it("defaults notifyScoreViewed to true when prefs exist but svi_alerts is undefined (a pre-migration row missing the column)", async () => {
    getEmailPreferencesMock.mockResolvedValue({});
    const body = await (await GET()).json();
    expect(body.notifyScoreViewed).toBe(true);
  });

  it("respects an explicit svi_alerts: false — a founder who unsubscribed must NOT get re-defaulted to true", async () => {
    getEmailPreferencesMock.mockResolvedValue({ svi_alerts: false });
    const body = await (await GET()).json();
    expect(body.notifyScoreViewed).toBe(false);
  });

  it("returns ok:true (never carries a `reason` key on the happy path)", async () => {
    const body = await (await GET()).json();
    expect(body.ok).toBe(true);
    expect(body.reason).toBeUndefined();
  });
});

describe("POST — anonymous branch", () => {
  it("returns 401 { ok:false, reason:'Authentication required' } when getCurrentUser is null", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await POST(jsonReq({ notifyScoreViewed: true }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ ok: false, reason: "Authentication required" });
  });

  it("does NOT read the request body or touch email-preferences on the anonymous branch", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    // A body that would throw on .json() proves we never called .json().
    const req = new Request("http://localhost/api/account/notify-prefs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(ensureEmailPreferencesMock).not.toHaveBeenCalled();
    expect(updateEmailPreferencesMock).not.toHaveBeenCalled();
  });
});

describe("POST — invalid body branch", () => {
  it("returns 400 { ok:false } when the body is not valid JSON", async () => {
    const req = new Request("http://localhost/api/account/notify-prefs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ ok: false });
  });

  it("does NOT persist anything on the invalid-body branch", async () => {
    const req = new Request("http://localhost/api/account/notify-prefs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "\0\0garbage",
    });
    await POST(req);
    expect(ensureEmailPreferencesMock).not.toHaveBeenCalled();
    expect(updateEmailPreferencesMock).not.toHaveBeenCalled();
  });
});

describe("POST — happy path", () => {
  it("returns 200 { ok:true } on a valid update", async () => {
    const res = await POST(jsonReq({ notifyScoreViewed: true }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });

  it("ensures the row exists BEFORE updating (so a first-time toggle from a fresh founder never fails silently)", async () => {
    const order: string[] = [];
    ensureEmailPreferencesMock.mockImplementation(async () => {
      order.push("ensure");
      return "tok";
    });
    updateEmailPreferencesMock.mockImplementation(async () => {
      order.push("update");
    });
    await POST(jsonReq({ notifyScoreViewed: true }));
    expect(order).toEqual(["ensure", "update"]);
  });

  it("forwards {email, id} into ensureEmailPreferences (the userId arg backfills the FK on a first-time toggle)", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u-99", email: "z@x.com" });
    await POST(jsonReq({ notifyScoreViewed: false }));
    expect(ensureEmailPreferencesMock).toHaveBeenCalledWith("z@x.com", "u-99");
  });

  it("writes { svi_alerts: true } when notifyScoreViewed is true", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u-1", email: "u@x.com" });
    await POST(jsonReq({ notifyScoreViewed: true }));
    expect(updateEmailPreferencesMock).toHaveBeenCalledWith("u@x.com", {
      svi_alerts: true,
    });
  });

  it("writes { svi_alerts: false } when notifyScoreViewed is false", async () => {
    await POST(jsonReq({ notifyScoreViewed: false }));
    expect(updateEmailPreferencesMock).toHaveBeenCalledWith("u@x.com", {
      svi_alerts: false,
    });
  });

  it("coerces a truthy non-boolean into true via Boolean() (a string 'yes' from a malformed client counts as ON)", async () => {
    await POST(jsonReq({ notifyScoreViewed: "yes" as unknown as boolean }));
    expect(updateEmailPreferencesMock).toHaveBeenCalledWith("u@x.com", {
      svi_alerts: true,
    });
  });

  it("coerces a falsy non-boolean into false via Boolean() (undefined / null / 0 all disable svi_alerts)", async () => {
    await POST(jsonReq({}));
    expect(updateEmailPreferencesMock).toHaveBeenLastCalledWith("u@x.com", {
      svi_alerts: false,
    });
    updateEmailPreferencesMock.mockClear();
    await POST(jsonReq({ notifyScoreViewed: null as unknown as boolean }));
    expect(updateEmailPreferencesMock).toHaveBeenLastCalledWith("u@x.com", {
      svi_alerts: false,
    });
    updateEmailPreferencesMock.mockClear();
    await POST(jsonReq({ notifyScoreViewed: 0 as unknown as boolean }));
    expect(updateEmailPreferencesMock).toHaveBeenLastCalledWith("u@x.com", {
      svi_alerts: false,
    });
  });

  it("never forwards other keys from the body into updateEmailPreferences (the update payload is svi_alerts-only)", async () => {
    await POST(
      jsonReq({
        notifyScoreViewed: true,
        weekly_reports: false,
        unsubscribed_all: true,
      } as unknown as { notifyScoreViewed: boolean }),
    );
    const [, updates] = updateEmailPreferencesMock.mock.calls[0]!;
    expect(Object.keys(updates)).toEqual(["svi_alerts"]);
  });

  it("uses the caller's email verbatim in the update (the helper handles casing/trim internally)", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u-1", email: "Founder@X.com" });
    await POST(jsonReq({ notifyScoreViewed: true }));
    expect(updateEmailPreferencesMock).toHaveBeenCalledWith(
      "Founder@X.com",
      expect.any(Object),
    );
  });

  it("returns { ok:true } even when updateEmailPreferences resolves after a swallowed DB error (the helper never throws — the route pins the fire-and-forget contract)", async () => {
    // updateEmailPreferences returns void even on internal error; the route
    // trusts that contract and returns ok:true. If the route were to start
    // awaiting a result envelope this test flags the change.
    updateEmailPreferencesMock.mockResolvedValue();
    const body = await (await POST(jsonReq({ notifyScoreViewed: true }))).json();
    expect(body).toEqual({ ok: true });
  });
});
