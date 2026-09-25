// G34-BT2 EM06 — /api/unsubscribe accepts the RFC 8058 one-click POST
// (form body `List-Unsubscribe=One-Click`, token in the query, no login) and
// keeps the JSON preference-update contract for the in-app forms.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const unsubscribeByTokenMock = vi.fn();
const unsubscribeCategoryByTokenMock = vi.fn();
const updateEmailPreferencesMock = vi.fn();
const getPreferencesByTokenMock = vi.fn();
vi.mock("@/lib/email-preferences", () => ({
  unsubscribeByToken: (t: string) => unsubscribeByTokenMock(t),
  unsubscribeCategoryByToken: (t: string, c: string) => unsubscribeCategoryByTokenMock(t, c),
  updateEmailPreferences: (e: string, u: unknown) => updateEmailPreferencesMock(e, u),
  getPreferencesByToken: (t: string) => getPreferencesByTokenMock(t),
}));
vi.mock("@/lib/email", () => ({ sendFarewellEmail: vi.fn(async () => ({ ok: true })) }));

import { POST } from "./route";

function post(url: string, body: string, type: string) {
  return new NextRequest(url, { method: "POST", body, headers: { "content-type": type } });
}

beforeEach(() => {
  vi.clearAllMocks();
  unsubscribeByTokenMock.mockResolvedValue({ ok: true, email: "a@b.co" });
  unsubscribeCategoryByTokenMock.mockResolvedValue({ ok: true });
  getPreferencesByTokenMock.mockResolvedValue({ email: "a@b.co" });
});

describe("POST /api/unsubscribe — RFC 8058 one-click", () => {
  it("unsubscribes everything from the one-click form post, no session needed", async () => {
    const res = await POST(
      post("https://blockid.au/api/unsubscribe?token=tok1", "List-Unsubscribe=One-Click", "application/x-www-form-urlencoded"),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, unsubscribed: "all" });
    expect(unsubscribeByTokenMock).toHaveBeenCalledWith("tok1");
  });

  it("honours a category-scoped one-click URL", async () => {
    const res = await POST(
      post(
        "https://blockid.au/api/unsubscribe?token=tok1&category=promotions",
        "List-Unsubscribe=One-Click",
        "application/x-www-form-urlencoded",
      ),
    );
    expect(res.status).toBe(200);
    expect(unsubscribeCategoryByTokenMock).toHaveBeenCalledWith("tok1", "promotions");
    expect(unsubscribeByTokenMock).not.toHaveBeenCalled();
  });

  it("404s an unknown token", async () => {
    unsubscribeByTokenMock.mockResolvedValue({ ok: false });
    const res = await POST(
      post("https://blockid.au/api/unsubscribe?token=nope", "List-Unsubscribe=One-Click", "application/x-www-form-urlencoded"),
    );
    expect(res.status).toBe(404);
  });

  it("keeps the JSON preference-update contract", async () => {
    const res = await POST(
      post(
        "https://blockid.au/api/unsubscribe",
        JSON.stringify({ token: "tok1", preferences: { promotions: false, bogus: true } }),
        "application/json",
      ),
    );
    expect(res.status).toBe(200);
    expect(updateEmailPreferencesMock).toHaveBeenCalledWith("a@b.co", { promotions: false });
    expect(unsubscribeByTokenMock).not.toHaveBeenCalled();
  });
});
