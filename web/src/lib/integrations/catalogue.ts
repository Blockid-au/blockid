// Pure catalogue builder for /workspace/integrations.
// Reseller-module B10: renders one row per integration (GitHub, Stripe, GA4,
// Blockchain) with connection status + last-sync + a link to the manager UI.
// Kept pure (no fetch, no DOM, no server-only imports) so the shape is
// unit-testable and the page component can server-render deterministically.

export type IntegrationProvider = "github" | "stripe" | "ga4" | "blockchain";

export type IntegrationKind = "oauth" | "chain";

export type IntegrationStatus =
  | "connected"
  | "error"
  | "not_connected"
  | "not_configured"
  | "syncing";

export interface IntegrationRow {
  provider: IntegrationProvider;
  kind: IntegrationKind;
  title: string;
  description: string;
  category: "signals" | "billing" | "chain";
  status: IntegrationStatus;
  accountLabel: string | null;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  statusDetail: string | null;
  actionHref: string;
  configured: boolean;
}

export interface OAuthConnectionSummary {
  provider: "github" | "stripe" | "ga4";
  status: "active" | "revoked" | "error";
  providerAccountId: string | null;
  lastSyncAt: string | null;
  lastSyncError: string | null;
}

export interface BlockchainConfigSummary {
  syncEnabled: boolean;
  syncState: "off" | "on" | "paused" | "catching_up";
  tokenSymbol: string | null;
  tokenAddress: string | null;
  lastSyncAt: string | null;
  pendingEvents: number;
}

export interface BuildIntegrationsCatalogueInput {
  oauthConnections: OAuthConnectionSummary[];
  blockchainConfig: BlockchainConfigSummary | null;
  providerConfigured: (provider: "github" | "stripe" | "ga4") => boolean;
  walletHref?: string;
}

const OAUTH_META: Record<
  "github" | "stripe" | "ga4",
  { title: string; description: string; category: IntegrationRow["category"] }
> = {
  github: {
    title: "GitHub",
    description:
      "Read-only access to your repos, commits, and stars. Feeds product-traction signals.",
    category: "signals",
  },
  stripe: {
    title: "Stripe",
    description:
      "Read-only OAuth (Stripe Connect). Pulls MRR, active customers, and 30-day payments (normalised to AUD).",
    category: "billing",
  },
  ga4: {
    title: "Google Analytics 4",
    description:
      "Read-only access to a GA4 property. Pulls sessions, new users, conversions, and average session duration.",
    category: "signals",
  },
};

function findOAuth(
  conns: OAuthConnectionSummary[],
  provider: "github" | "stripe" | "ga4",
): OAuthConnectionSummary | null {
  const active = conns.find(
    (c) => c.provider === provider && c.status === "active",
  );
  if (active) return active;
  const errored = conns.find(
    (c) => c.provider === provider && c.status === "error",
  );
  return errored ?? null;
}

function buildOAuthRow(
  provider: "github" | "stripe" | "ga4",
  conn: OAuthConnectionSummary | null,
  configured: boolean,
): IntegrationRow {
  const meta = OAUTH_META[provider];
  let status: IntegrationStatus;
  if (!configured) status = "not_configured";
  else if (conn == null) status = "not_connected";
  else if (conn.status === "error") status = "error";
  else status = "connected";

  return {
    provider,
    kind: "oauth",
    title: meta.title,
    description: meta.description,
    category: meta.category,
    status,
    accountLabel: conn?.providerAccountId ?? null,
    lastSyncAt: conn?.lastSyncAt ?? null,
    lastSyncError: conn?.lastSyncError ?? null,
    statusDetail: null,
    actionHref: `/api/integrations/${provider}?action=start`,
    configured,
  };
}

function buildBlockchainRow(
  config: BlockchainConfigSummary | null,
  walletHref: string,
): IntegrationRow {
  let status: IntegrationStatus;
  let statusDetail: string | null = null;
  const enabled = Boolean(config?.syncEnabled);
  const state = config?.syncState ?? "off";
  if (config == null || (!enabled && state === "off")) {
    status = "not_connected";
  } else if (state === "catching_up") {
    status = "syncing";
    statusDetail = `Catching up · ${config?.pendingEvents ?? 0} pending`;
  } else if (state === "paused") {
    status = "error";
    statusDetail = `Sync paused · ${config?.pendingEvents ?? 0} pending`;
  } else if (state === "on" && enabled) {
    status = "connected";
    statusDetail = config?.tokenSymbol
      ? `Token ${config.tokenSymbol}${
          config.pendingEvents > 0 ? ` · ${config.pendingEvents} pending` : ""
        }`
      : null;
  } else {
    status = "not_connected";
  }

  return {
    provider: "blockchain",
    kind: "chain",
    title: "Blockchain sync",
    description:
      "Optional on-chain mirror of your cap-table events. Off-chain is always the source of truth; blockchain is a transparency layer.",
    category: "chain",
    status,
    accountLabel: config?.tokenAddress ?? null,
    lastSyncAt: config?.lastSyncAt ?? null,
    lastSyncError: null,
    statusDetail,
    actionHref: walletHref,
    configured: true,
  };
}

export function buildIntegrationsCatalogue(
  input: BuildIntegrationsCatalogueInput,
): IntegrationRow[] {
  const walletHref = input.walletHref ?? "/workspace/wallet";
  return [
    buildOAuthRow("github", findOAuth(input.oauthConnections, "github"), input.providerConfigured("github")),
    buildOAuthRow("stripe", findOAuth(input.oauthConnections, "stripe"), input.providerConfigured("stripe")),
    buildOAuthRow("ga4", findOAuth(input.oauthConnections, "ga4"), input.providerConfigured("ga4")),
    buildBlockchainRow(input.blockchainConfig, walletHref),
  ];
}

export function formatRelativeTime(
  iso: string | null,
  now: number = Date.now(),
): string {
  if (!iso) return "never";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "never";
  const mins = Math.round((now - t) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(t).toISOString().slice(0, 10);
}

export function summariseCatalogue(rows: IntegrationRow[]): {
  total: number;
  connected: number;
  errored: number;
  not_connected: number;
  not_configured: number;
} {
  const summary = {
    total: rows.length,
    connected: 0,
    errored: 0,
    not_connected: 0,
    not_configured: 0,
  };
  for (const r of rows) {
    if (r.status === "connected" || r.status === "syncing") summary.connected += 1;
    else if (r.status === "error") summary.errored += 1;
    else if (r.status === "not_configured") summary.not_configured += 1;
    else summary.not_connected += 1;
  }
  return summary;
}
