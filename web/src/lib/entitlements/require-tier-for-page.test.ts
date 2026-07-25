import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// next/navigation.redirect() throws a special error in Next; we mock it to a
// plain throw so we can assert the target URL without pulling in the runtime.
const { redirectMock, getCurrentUserMock, canMock, recordGateHitMock } =
  vi.hoisted(() => ({
    redirectMock: vi.fn((url: string) => {
      const err = new Error(`REDIRECT:${url}`);
      (err as unknown as { digest: string }).digest = `NEXT_REDIRECT;replace;${url}`;
      throw err;
    }),
    getCurrentUserMock: vi.fn(),
    canMock: vi.fn(),
    recordGateHitMock: vi.fn(),
  }));

vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUserMock() }));
vi.mock("@/lib/entitlements", () => ({
  can: (...args: unknown[]) => canMock(...args),
  recordGateHit: (...args: unknown[]) => recordGateHitMock(...args),
}));

import { requireTierForPage, SAFE_LIST } from "./require-tier-for-page";

async function catchRedirect(fn: () => Promise<void>): Promise<string> {
  try {
    await fn();
    throw new Error("expected redirect");
  } catch (err) {
    const msg = (err as Error).message;
    if (!msg.startsWith("REDIRECT:")) throw err;
    return msg.slice("REDIRECT:".length);
  }
}

describe("requireTierForPage", () => {
  beforeEach(() => {
    redirectMock.mockClear();
    getCurrentUserMock.mockReset();
    canMock.mockReset();
    recordGateHitMock.mockReset();
  });

  it("redirects unauthenticated users to /auth/login with next= preserved", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const url = await catchRedirect(() =>
      requireTierForPage({
        feature: "cap_table.write",
        fromPath: "/workspace/cap-table",
      }),
    );
    expect(url).toBe("/auth/login?next=%2Fworkspace%2Fcap-table");
  });

  it("redirects to /pricing?feature=&from= when feature is missing", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1", plan: "founder_free" });
    canMock.mockResolvedValue(false);
    const url = await catchRedirect(() =>
      requireTierForPage({
        feature: "cap_table.write",
        fromPath: "/workspace/cap-table",
      }),
    );
    expect(url).toBe(
      "/pricing?feature=cap_table.write&from=%2Fworkspace%2Fcap-table",
    );
    expect(recordGateHitMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "u1", plan: "founder_free" }),
      "cap_table.write",
      "menu",
    );
  });

  it("redirects when minTier is not met, without hitting can()", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1", plan: "founder_free" });
    const url = await catchRedirect(() =>
      requireTierForPage({
        minTier: "growth",
        fromPath: "/workspace/vesting",
      }),
    );
    expect(url).toBe("/pricing?from=%2Fworkspace%2Fvesting");
    expect(canMock).not.toHaveBeenCalled();
  });

  it("returns silently when both feature and tier pass", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1", plan: "founder_growth" });
    canMock.mockResolvedValue(true);
    await expect(
      requireTierForPage({
        feature: "cap_table.write",
        minTier: "growth",
        fromPath: "/workspace/cap-table",
      }),
    ).resolves.toBeUndefined();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("preserves the fromPath verbatim so post-checkout can bounce back", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1", plan: "founder_free" });
    canMock.mockResolvedValue(false);
    const url = await catchRedirect(() =>
      requireTierForPage({
        feature: "share_management",
        fromPath: "/workspace/data-room?tab=finance",
      }),
    );
    expect(url).toContain(
      encodeURIComponent("/workspace/data-room?tab=finance"),
    );
  });

  it("never gates any safe-listed path (regression against redirect loops)", async () => {
    for (const path of SAFE_LIST) {
      getCurrentUserMock.mockResolvedValue(null);
      await expect(
        requireTierForPage({ feature: "share_management", fromPath: path }),
      ).resolves.toBeUndefined();
    }
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("does not record a gate hit when authentication fails", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    await catchRedirect(() =>
      requireTierForPage({
        feature: "share_management",
        fromPath: "/workspace/vesting",
      }),
    );
    expect(recordGateHitMock).not.toHaveBeenCalled();
  });
});
