import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { IntegrationRowCard } from "@/components/workspace/integration-row-card";
import { isProviderConfigured, listConnections } from "@/lib/oauth-connectors";
import { getSyncConfig } from "@/lib/blockchain-sync";
import {
  buildIntegrationsCatalogue,
  summariseCatalogue,
  type BlockchainConfigSummary,
  type OAuthConnectionSummary,
} from "@/lib/integrations/catalogue";
import { getCurrentProjectIsSandbox } from "@/lib/projects";

export const metadata: Metadata = {
  title: "Integrations",
  description:
    "Connect GitHub, Stripe, Google Analytics, and the blockchain sync layer to auto-fill your Evidence Vault and mirror equity events on-chain.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; connected?: string }>;
}): Promise<React.ReactElement> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/integrations");

  const isSandbox = await getCurrentProjectIsSandbox();

  const sp = await searchParams;
  const [connections, chainConfig] = await Promise.all([
    listConnections(user.id),
    getSyncConfig(user.id),
  ]);

  const oauthConnections: OAuthConnectionSummary[] = connections
    .filter((c) => c.provider === "github" || c.provider === "stripe" || c.provider === "ga4")
    .map((c) => ({
      provider: c.provider as "github" | "stripe" | "ga4",
      status: c.status,
      providerAccountId: c.providerAccountId,
      lastSyncAt: c.lastSyncAt,
      lastSyncError: c.lastSyncError,
    }));

  const blockchainConfig: BlockchainConfigSummary | null = chainConfig
    ? {
        syncEnabled: chainConfig.syncEnabled,
        syncState: chainConfig.syncState,
        tokenSymbol: chainConfig.tokenSymbol,
        tokenAddress: chainConfig.tokenAddress,
        lastSyncAt: chainConfig.lastSyncAt,
        pendingEvents: chainConfig.pendingEvents,
      }
    : null;

  const rows = buildIntegrationsCatalogue({
    oauthConnections,
    blockchainConfig,
    providerConfigured: isProviderConfigured,
  });
  const summary = summariseCatalogue(rows);

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <header>
          <h1 className="text-2xl font-semibold text-ink-900 dark:text-ink-100">
            Integrations
          </h1>
          <p className="text-sm text-ink-600 dark:text-ink-400 mt-1">
            One row per integration. Signals connectors auto-fill your Evidence Vault; the blockchain layer optionally mirrors equity events on-chain (off-chain is still the source of truth).
          </p>
          <p className="text-xs text-ink-500 dark:text-ink-500 mt-2">
            {summary.connected} of {summary.total} connected
            {summary.errored > 0 ? ` · ${summary.errored} need attention` : ""}
            {summary.not_configured > 0 ? ` · ${summary.not_configured} awaiting configuration` : ""}
          </p>
        </header>

        {sp.error ? (
          <div className="rounded-md border border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950 px-3 py-2 text-sm text-red-800 dark:text-red-200">
            Connection failed: {sp.error.replaceAll("_", " ")}
          </div>
        ) : null}
        {sp.connected ? (
          <div className="rounded-md border border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-200">
            {sp.connected.toUpperCase()} connected. First sync completed.
          </div>
        ) : null}

        <div className="space-y-4">
          {rows.map((row) => (
            <IntegrationRowCard key={row.provider} row={row} />
          ))}
        </div>
      </div>
    </WorkspaceLayout>
  );
}
