// Colocated vitest for claim-on-auth.
//
// This runs inside register / login / magic-link / Google sign-in. Two rules
// it must never break:
//
//   1. It cannot throw. A claim failure that propagates would turn a
//      successful signup into a 500 — the user would have an account, a
//      session cookie, and an error page.
//   2. It must not clear the anon cookie when nothing was claimed. A fast
//      signup can land BEFORE /api/intake finishes writing its row; throwing
//      the key away at that moment orphans the analysis permanently.

import { beforeEach, describe, expect, it, vi } from "vitest";

const readAnonKeyMock = vi.fn<() => Promise<string | null>>();
const clearAnonCookieMock = vi.fn<() => Promise<void>>();
const claimAnalysesMock = vi.fn<
  (p: { userId: string; anonKey?: string | null; email?: string | null }) => Promise<{
    analyses: number;
    guestAnalyses: number;
  }>
>();

vi.mock("./anon-key", () => ({
  readAnonKey: () => readAnonKeyMock(),
  clearAnonCookie: () => clearAnonCookieMock(),
}));

vi.mock("./store", () => ({
  claimAnalyses: (p: Parameters<typeof claimAnalysesMock>[0]) => claimAnalysesMock(p),
}));

import { claimForCurrentBrowser } from "./claim";

beforeEach(() => {
  readAnonKeyMock.mockReset().mockResolvedValue("k".repeat(24));
  clearAnonCookieMock.mockReset().mockResolvedValue(undefined);
  claimAnalysesMock
    .mockReset()
    .mockResolvedValue({ analyses: 0, guestAnalyses: 0 });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});

describe("claimForCurrentBrowser", () => {
  it("passes the anon cookie and the email through to the store", async () => {
    await claimForCurrentBrowser({ userId: "u1", email: "a@b.com" });
    expect(claimAnalysesMock).toHaveBeenCalledWith({
      userId: "u1",
      anonKey: "k".repeat(24),
      email: "a@b.com",
    });
  });

  it("clears the anon cookie once analyses have moved to the account", async () => {
    claimAnalysesMock.mockResolvedValue({ analyses: 2, guestAnalyses: 0 });
    const out = await claimForCurrentBrowser({ userId: "u1" });
    expect(out.analyses).toBe(2);
    expect(clearAnonCookieMock).toHaveBeenCalledTimes(1);
  });

  it("KEEPS the cookie when nothing was claimed (the intake write may be in flight)", async () => {
    claimAnalysesMock.mockResolvedValue({ analyses: 0, guestAnalyses: 0 });
    await claimForCurrentBrowser({ userId: "u1" });
    expect(clearAnonCookieMock).not.toHaveBeenCalled();
  });

  it("keeps the cookie when only a paid guest report was claimed", async () => {
    claimAnalysesMock.mockResolvedValue({ analyses: 0, guestAnalyses: 1 });
    await claimForCurrentBrowser({ userId: "u1", email: "a@b.com" });
    expect(clearAnonCookieMock).not.toHaveBeenCalled();
  });

  it("still claims paid guest reports for a browser with no anon cookie", async () => {
    readAnonKeyMock.mockResolvedValue(null);
    claimAnalysesMock.mockResolvedValue({ analyses: 0, guestAnalyses: 1 });
    const out = await claimForCurrentBrowser({ userId: "u1", email: "a@b.com" });
    expect(out.guestAnalyses).toBe(1);
    expect(claimAnalysesMock).toHaveBeenCalledWith({
      userId: "u1",
      anonKey: null,
      email: "a@b.com",
    });
  });

  it("returns zeros instead of throwing when the store blows up", async () => {
    claimAnalysesMock.mockRejectedValue(new Error("db down"));
    await expect(claimForCurrentBrowser({ userId: "u1" })).resolves.toEqual({
      analyses: 0,
      guestAnalyses: 0,
    });
  });

  it("is idempotent from the caller's view — a second call claims nothing", async () => {
    claimAnalysesMock
      .mockResolvedValueOnce({ analyses: 3, guestAnalyses: 1 })
      .mockResolvedValueOnce({ analyses: 0, guestAnalyses: 0 });
    const first = await claimForCurrentBrowser({ userId: "u1", email: "a@b.com" });
    const second = await claimForCurrentBrowser({ userId: "u1", email: "a@b.com" });
    expect(first).toEqual({ analyses: 3, guestAnalyses: 1 });
    expect(second).toEqual({ analyses: 0, guestAnalyses: 0 });
  });

  it("normalises a missing email to null rather than undefined", async () => {
    await claimForCurrentBrowser({ userId: "u1" });
    expect(claimAnalysesMock.mock.calls[0][0].email).toBeNull();
  });
});
