// Unit tests for POST + GET /api/blockchain/sync-toggle — P9-blockchain-sync-toggle-route.
//
// The sync-toggle route is the founder's control plane for the off-chain →
// on-chain reconciliation pipeline: POST flips `syncState` between
// off/on/paused/catching_up (via `toggleSync`); GET returns the current
// sync config with a safe empty-account fallback (via `getSyncConfig`).
// Neither branch touches Supabase directly — the underlying lib does — so
// this suite mocks `@/lib/auth`, `@/lib/feature-gate`, and
// `@/lib/blockchain-sync` and pins pure route wiring.
//
// Silent regressions this suite pins against:
//   - Dropping the feature-gate call on POST → an anonymous / non-entitled
//     caller can flip syncState (data / billing leak).
//   - Passing the wrong feature key (e.g. "blockchain.tokens") to the gate
//     on POST → the wrong entitlement branch is tested.
//   - Dropping `dynamic = "force-dynamic"` → GET responses get cached
//     across founders (Next.js App Router default).
//   - Regressing the invalid-JSON branch from 400 to 500 → the UI's
//     "please retry" hint is unreachable.
//   - Regressing the invalid-action branch from 400 to 500, or dropping
//     the whitelist → arbitrary strings flow into `toggleSync` and mint
//     unexpected `syncState` values downstream.
//   - Dropping any of the four whitelisted actions (enable/disable/pause/
//     catch_up) from the acceptor → the UI's four-button control panel
//     silently loses a button.
//   - Regressing the `toggleSync(user.id, action)` dispatch → a founder
//     toggles another founder's sync state (tenant-isolation leak).
//   - Regressing the "toggleSync failed" branch from 500 → the front-end
//     retry timer can't distinguish transient vs bug.
//   - Regressing the GET 401 branch when `getCurrentUser` returns null →
//     the anonymous caller sees another founder's config (leak).
//   - Dropping the GET null-config fallback → the UI's "no config yet"
//     empty-state cannot render because `config` is nullish.
//   - GET must NOT be feature-gated: a founder on a lower plan still
//     needs to *read* their sync config so the paywall CTA can render
//     with the right context.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const gateMock = vi.fn();
vi.mock("@/lib/feature-gate", () => ({
  gateRequireFeature: (feature: string) => gateMock(feature),
}));

const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

const toggleSyncMock = vi.fn();
const getSyncConfigMock = vi.fn();
vi.mock("@/lib/blockchain-sync", () => ({
  toggleSync: (accountId: string, action: string) =>
    toggleSyncMock(accountId, action),
  getSyncConfig: (accountId: string) => getSyncConfigMock(accountId),
}));

import { GET, POST } from "./route";

const USER = { id: "u-42", email: "founder@x.co" };

function gateOk() {
  return {
    ok: true,
    user: USER,
    uwp: { id: USER.id, plan: "pro", segment: "founder" },
  };
}

function gateFail(status: number, error: string) {
  return {
    ok: false,
    response: NextResponse.json({ ok: false, error }, { status }),
  };
}

function req(body: unknown, opts: { rawBody?: string } = {}): Request {
  const init: RequestInit = {
    method: "POST",
    headers: { "content-type": "application/json" },
  };
  if (opts.rawBody !== undefined) {
    init.body = opts.rawBody;
  } else {
    init.body = JSON.stringify(body);
  }
  return new Request("http://localhost/api/blockchain/sync-toggle", init);
}

function syncConfig(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "sc-1",
    accountId: USER.id,
    syncEnabled: true,
    syncState: "on",
    tokenAddress: "0xabc0000000000000000000000000000000000001",
    tokenSymbol: "AUSX",
    tokenName: "Auschain Cap-Table Token",
    lastSyncAt: null,
    lastSyncBlock: null,
    pendingEvents: 3,
    autoSyncTransfers: true,
    ...overrides,
  };
}

beforeEach(() => {
  gateMock.mockReset();
  getCurrentUserMock.mockReset();
  toggleSyncMock.mockReset();
  getSyncConfigMock.mockReset();
});

describe("POST /api/blockchain/sync-toggle", () => {
  it("passes the 'blockchain.sync' feature key to the gate", async () => {
    gateMock.mockResolvedValue(gateFail(402, "feature_locked"));
    await POST(req({ action: "enable" }));
    expect(gateMock).toHaveBeenCalledWith("blockchain.sync");
  });

  it("returns the gate's 401 response verbatim when the caller is anonymous", async () => {
    gateMock.mockResolvedValue(gateFail(401, "Authentication required"));
    const res = await POST(req({ action: "enable" }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Authentication required");
    expect(toggleSyncMock).not.toHaveBeenCalled();
  });

  it("returns the gate's 402 feature_locked response verbatim when the plan lacks the feature", async () => {
    gateMock.mockResolvedValue(gateFail(402, "feature_locked"));
    const res = await POST(req({ action: "enable" }));
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.error).toBe("feature_locked");
    expect(toggleSyncMock).not.toHaveBeenCalled();
  });

  it("returns 400 'Invalid JSON' when the request body is not valid JSON", async () => {
    gateMock.mockResolvedValue(gateOk());
    const res = await POST(req(null, { rawBody: "not-json-at-all{{" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Invalid JSON");
    expect(toggleSyncMock).not.toHaveBeenCalled();
  });

  it("returns 400 with the whitelist hint when the action is missing", async () => {
    gateMock.mockResolvedValue(gateOk());
    const res = await POST(req({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    // The error message enumerates the four supported actions so the UI can
    // render an inline hint without hardcoding the list on the client.
    expect(body.error).toContain("enable");
    expect(body.error).toContain("disable");
    expect(body.error).toContain("pause");
    expect(body.error).toContain("catch_up");
    expect(toggleSyncMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the action is not in the whitelist (unknown verbs never reach toggleSync)", async () => {
    gateMock.mockResolvedValue(gateOk());
    const res = await POST(req({ action: "delete_everything" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid action");
    expect(toggleSyncMock).not.toHaveBeenCalled();
  });

  it("stringifies a non-string action before whitelisting (so a numeric 1 doesn't accidentally match)", async () => {
    gateMock.mockResolvedValue(gateOk());
    const res = await POST(req({ action: 1 }));
    expect(res.status).toBe(400);
    expect(toggleSyncMock).not.toHaveBeenCalled();
  });

  it("dispatches action='enable' to toggleSync(user.id, 'enable') and returns { ok:true, syncState:'on' }", async () => {
    gateMock.mockResolvedValue(gateOk());
    toggleSyncMock.mockResolvedValue({ ok: true, newState: "on" });
    const res = await POST(req({ action: "enable" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, syncState: "on" });
    expect(toggleSyncMock).toHaveBeenCalledWith(USER.id, "enable");
    expect(toggleSyncMock).toHaveBeenCalledTimes(1);
  });

  it("dispatches action='disable' to toggleSync and echoes the returned newState", async () => {
    gateMock.mockResolvedValue(gateOk());
    toggleSyncMock.mockResolvedValue({ ok: true, newState: "off" });
    const res = await POST(req({ action: "disable" }));
    const body = await res.json();
    expect(body.syncState).toBe("off");
    expect(toggleSyncMock).toHaveBeenCalledWith(USER.id, "disable");
  });

  it("dispatches action='pause' to toggleSync and echoes the returned newState", async () => {
    gateMock.mockResolvedValue(gateOk());
    toggleSyncMock.mockResolvedValue({ ok: true, newState: "paused" });
    const res = await POST(req({ action: "pause" }));
    const body = await res.json();
    expect(body.syncState).toBe("paused");
    expect(toggleSyncMock).toHaveBeenCalledWith(USER.id, "pause");
  });

  it("dispatches action='catch_up' to toggleSync and echoes the returned newState", async () => {
    gateMock.mockResolvedValue(gateOk());
    toggleSyncMock.mockResolvedValue({ ok: true, newState: "catching_up" });
    const res = await POST(req({ action: "catch_up" }));
    const body = await res.json();
    expect(body.syncState).toBe("catching_up");
    expect(toggleSyncMock).toHaveBeenCalledWith(USER.id, "catch_up");
  });

  it("returns the syncState the lib reported, even when it doesn't match a naive action→state mapping (server is the source of truth)", async () => {
    gateMock.mockResolvedValue(gateOk());
    // Simulate a future case where toggleSync overrides an 'enable' request
    // because the account is mid-catch-up. Response must reflect the lib's
    // reality, not the request's optimistic value.
    toggleSyncMock.mockResolvedValue({ ok: true, newState: "catching_up" });
    const res = await POST(req({ action: "enable" }));
    const body = await res.json();
    expect(body.syncState).toBe("catching_up");
  });

  it("returns 500 'Failed to update sync state' when toggleSync reports ok=false", async () => {
    gateMock.mockResolvedValue(gateOk());
    toggleSyncMock.mockResolvedValue({ ok: false, newState: "off" });
    const res = await POST(req({ action: "enable" }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Failed to update sync state");
    // Even though the lib returned a newState, the failure branch must NOT
    // echo it — the UI's success animation is keyed on ok:true, so leaking
    // syncState on a failure would false-signal that the flip succeeded.
    expect(body.syncState).toBeUndefined();
  });

  it("does NOT call toggleSync when the gate rejects (short-circuit ordering)", async () => {
    gateMock.mockResolvedValue(gateFail(401, "Authentication required"));
    await POST(req({ action: "enable" }));
    expect(toggleSyncMock).not.toHaveBeenCalled();
  });

  it("does NOT call toggleSync when the JSON body is malformed (short-circuit ordering)", async () => {
    gateMock.mockResolvedValue(gateOk());
    await POST(req(null, { rawBody: "{" }));
    expect(toggleSyncMock).not.toHaveBeenCalled();
  });

  it("does NOT call toggleSync when the action is not whitelisted (short-circuit ordering)", async () => {
    gateMock.mockResolvedValue(gateOk());
    await POST(req({ action: "wipe" }));
    expect(toggleSyncMock).not.toHaveBeenCalled();
  });

  it("issues exactly one toggleSync call per successful POST (no accidental double-dispatch)", async () => {
    gateMock.mockResolvedValue(gateOk());
    toggleSyncMock.mockResolvedValue({ ok: true, newState: "on" });
    await POST(req({ action: "enable" }));
    expect(toggleSyncMock).toHaveBeenCalledTimes(1);
  });
});

describe("GET /api/blockchain/sync-toggle", () => {
  it("returns 401 when getCurrentUser resolves null (anonymous caller)", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Authentication required");
    expect(getSyncConfigMock).not.toHaveBeenCalled();
  });

  it("does NOT feature-gate GET (read access is available regardless of plan so the paywall CTA can render)", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    getSyncConfigMock.mockResolvedValue(null);
    await GET();
    expect(gateMock).not.toHaveBeenCalled();
  });

  it("looks up the sync config by the authenticated user's id (not any request-derived value)", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    getSyncConfigMock.mockResolvedValue(null);
    await GET();
    expect(getSyncConfigMock).toHaveBeenCalledWith(USER.id);
    expect(getSyncConfigMock).toHaveBeenCalledTimes(1);
  });

  it("returns the lib's SyncConfig verbatim on the happy path", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    const cfg = syncConfig();
    getSyncConfigMock.mockResolvedValue(cfg);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.config).toEqual(cfg);
  });

  it("falls back to the empty-account default config when getSyncConfig resolves null", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    getSyncConfigMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    // Pin the fallback shape: the UI's empty state renders off these keys,
    // so dropping any of them silently breaks the "no token deployed yet"
    // onboarding banner.
    expect(body.config).toEqual({
      syncEnabled: false,
      syncState: "off",
      tokenAddress: null,
      tokenSymbol: null,
      pendingEvents: 0,
    });
  });

  it("does not overwrite a real syncState='off' account with the fallback default (falsy-config guard is on null, not on any 'off' state)", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    // A real account with syncState='off' but a deployed token must render
    // the token address, not the fallback null.
    const cfg = syncConfig({
      syncEnabled: false,
      syncState: "off",
      tokenAddress: "0xdeadbeef00000000000000000000000000000000",
    });
    getSyncConfigMock.mockResolvedValue(cfg);
    const res = await GET();
    const body = await res.json();
    expect(body.config.tokenAddress).toBe(
      "0xdeadbeef00000000000000000000000000000000",
    );
    expect(body.config.syncState).toBe("off");
  });
});

describe("route module invariants", () => {
  it("exports `dynamic = 'force-dynamic'` so responses are not statically cached across founders", async () => {
    const mod = await import("./route");
    expect((mod as { dynamic?: string }).dynamic).toBe("force-dynamic");
  });
});
