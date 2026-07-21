import { describe, expect, it } from "vitest";
import {
  buildIntegrationsCatalogue,
  formatRelativeTime,
  summariseCatalogue,
  type BlockchainConfigSummary,
  type OAuthConnectionSummary,
} from "./catalogue";

const allConfigured = () => true;
const noneConfigured = () => false;

const chainOn: BlockchainConfigSummary = {
  syncEnabled: true,
  syncState: "on",
  tokenSymbol: "OSC",
  tokenAddress: "0xabc",
  lastSyncAt: "2026-07-21T00:00:00.000Z",
  pendingEvents: 0,
};

describe("buildIntegrationsCatalogue", () => {
  it("always returns exactly four rows in stable order github/stripe/ga4/blockchain", () => {
    const rows = buildIntegrationsCatalogue({
      oauthConnections: [],
      blockchainConfig: null,
      providerConfigured: allConfigured,
    });
    expect(rows.map((r) => r.provider)).toEqual([
      "github",
      "stripe",
      "ga4",
      "blockchain",
    ]);
  });

  it("marks oauth rows not_configured when providerConfigured returns false", () => {
    const rows = buildIntegrationsCatalogue({
      oauthConnections: [],
      blockchainConfig: null,
      providerConfigured: noneConfigured,
    });
    for (const p of ["github", "stripe", "ga4"] as const) {
      const row = rows.find((r) => r.provider === p);
      expect(row?.status).toBe("not_configured");
      expect(row?.configured).toBe(false);
    }
  });

  it("marks oauth row connected when an active connection exists", () => {
    const conn: OAuthConnectionSummary = {
      provider: "github",
      status: "active",
      providerAccountId: "octocat",
      lastSyncAt: "2026-07-21T00:00:00.000Z",
      lastSyncError: null,
    };
    const rows = buildIntegrationsCatalogue({
      oauthConnections: [conn],
      blockchainConfig: null,
      providerConfigured: allConfigured,
    });
    const gh = rows.find((r) => r.provider === "github");
    expect(gh?.status).toBe("connected");
    expect(gh?.accountLabel).toBe("octocat");
    expect(gh?.lastSyncAt).toBe("2026-07-21T00:00:00.000Z");
  });

  it("prefers active connection over errored one for the same provider", () => {
    const rows = buildIntegrationsCatalogue({
      oauthConnections: [
        { provider: "stripe", status: "error", providerAccountId: null, lastSyncAt: null, lastSyncError: "boom" },
        { provider: "stripe", status: "active", providerAccountId: "acct_1", lastSyncAt: null, lastSyncError: null },
      ],
      blockchainConfig: null,
      providerConfigured: allConfigured,
    });
    const stripe = rows.find((r) => r.provider === "stripe");
    expect(stripe?.status).toBe("connected");
    expect(stripe?.accountLabel).toBe("acct_1");
  });

  it("marks oauth row error when only a revoked/errored connection exists", () => {
    const rows = buildIntegrationsCatalogue({
      oauthConnections: [
        { provider: "ga4", status: "error", providerAccountId: "prop-1", lastSyncAt: null, lastSyncError: "rate_limited" },
      ],
      blockchainConfig: null,
      providerConfigured: allConfigured,
    });
    const ga = rows.find((r) => r.provider === "ga4");
    expect(ga?.status).toBe("error");
    expect(ga?.lastSyncError).toBe("rate_limited");
  });

  it("ignores revoked connections (treats as not_connected)", () => {
    const rows = buildIntegrationsCatalogue({
      oauthConnections: [
        { provider: "github", status: "revoked", providerAccountId: null, lastSyncAt: null, lastSyncError: null },
      ],
      blockchainConfig: null,
      providerConfigured: allConfigured,
    });
    expect(rows.find((r) => r.provider === "github")?.status).toBe("not_connected");
  });

  it("blockchain: null config → not_connected", () => {
    const rows = buildIntegrationsCatalogue({
      oauthConnections: [],
      blockchainConfig: null,
      providerConfigured: allConfigured,
    });
    const bc = rows.find((r) => r.provider === "blockchain");
    expect(bc?.status).toBe("not_connected");
    expect(bc?.actionHref).toBe("/workspace/wallet");
  });

  it("blockchain: syncEnabled + syncState=on → connected with token detail", () => {
    const rows = buildIntegrationsCatalogue({
      oauthConnections: [],
      blockchainConfig: chainOn,
      providerConfigured: allConfigured,
    });
    const bc = rows.find((r) => r.provider === "blockchain");
    expect(bc?.status).toBe("connected");
    expect(bc?.statusDetail).toBe("Token OSC");
    expect(bc?.lastSyncAt).toBe("2026-07-21T00:00:00.000Z");
    expect(bc?.accountLabel).toBe("0xabc");
  });

  it("blockchain: catching_up → syncing with pending count", () => {
    const rows = buildIntegrationsCatalogue({
      oauthConnections: [],
      blockchainConfig: { ...chainOn, syncState: "catching_up", pendingEvents: 12 },
      providerConfigured: allConfigured,
    });
    const bc = rows.find((r) => r.provider === "blockchain");
    expect(bc?.status).toBe("syncing");
    expect(bc?.statusDetail).toContain("Catching up");
    expect(bc?.statusDetail).toContain("12 pending");
  });

  it("blockchain: paused → error", () => {
    const rows = buildIntegrationsCatalogue({
      oauthConnections: [],
      blockchainConfig: { ...chainOn, syncState: "paused", pendingEvents: 3 },
      providerConfigured: allConfigured,
    });
    const bc = rows.find((r) => r.provider === "blockchain");
    expect(bc?.status).toBe("error");
    expect(bc?.statusDetail).toContain("paused");
  });

  it("blockchain: on with pendingEvents > 0 surfaces the queue in statusDetail", () => {
    const rows = buildIntegrationsCatalogue({
      oauthConnections: [],
      blockchainConfig: { ...chainOn, pendingEvents: 4 },
      providerConfigured: allConfigured,
    });
    const bc = rows.find((r) => r.provider === "blockchain");
    expect(bc?.statusDetail).toBe("Token OSC · 4 pending");
  });

  it("blockchain: syncEnabled=false but syncState=on → not_connected (defensive)", () => {
    const rows = buildIntegrationsCatalogue({
      oauthConnections: [],
      blockchainConfig: { ...chainOn, syncEnabled: false },
      providerConfigured: allConfigured,
    });
    expect(rows.find((r) => r.provider === "blockchain")?.status).toBe("not_connected");
  });

  it("respects custom walletHref override", () => {
    const rows = buildIntegrationsCatalogue({
      oauthConnections: [],
      blockchainConfig: null,
      providerConfigured: allConfigured,
      walletHref: "/workspace/equity-dashboard",
    });
    expect(rows.find((r) => r.provider === "blockchain")?.actionHref).toBe(
      "/workspace/equity-dashboard",
    );
  });
});

describe("formatRelativeTime", () => {
  const NOW = Date.parse("2026-07-21T12:00:00.000Z");

  it("null → 'never'", () => {
    expect(formatRelativeTime(null, NOW)).toBe("never");
  });

  it("invalid iso → 'never'", () => {
    expect(formatRelativeTime("not-a-date", NOW)).toBe("never");
  });

  it("<1 min → 'just now'", () => {
    expect(formatRelativeTime("2026-07-21T11:59:40.000Z", NOW)).toBe("just now");
  });

  it("minutes < 60 → 'Nm ago'", () => {
    expect(formatRelativeTime("2026-07-21T11:35:00.000Z", NOW)).toBe("25m ago");
  });

  it("hours < 24 → 'Nh ago'", () => {
    expect(formatRelativeTime("2026-07-21T05:00:00.000Z", NOW)).toBe("7h ago");
  });

  it("days < 30 → 'Nd ago'", () => {
    expect(formatRelativeTime("2026-07-14T12:00:00.000Z", NOW)).toBe("7d ago");
  });

  it("older than 30d → ISO date", () => {
    expect(formatRelativeTime("2026-05-01T12:00:00.000Z", NOW)).toBe("2026-05-01");
  });
});

describe("summariseCatalogue", () => {
  it("counts each status bucket", () => {
    const rows = buildIntegrationsCatalogue({
      oauthConnections: [
        { provider: "github", status: "active", providerAccountId: "x", lastSyncAt: null, lastSyncError: null },
        { provider: "ga4", status: "error", providerAccountId: "y", lastSyncAt: null, lastSyncError: "e" },
      ],
      blockchainConfig: chainOn,
      providerConfigured: (p) => p !== "stripe",
    });
    const s = summariseCatalogue(rows);
    expect(s.total).toBe(4);
    expect(s.connected).toBe(2); // github + blockchain
    expect(s.errored).toBe(1); // ga4
    expect(s.not_configured).toBe(1); // stripe
    expect(s.not_connected).toBe(0);
  });
});
