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
import { CrmPushButton } from "@/components/founder/crm-push-button";

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
          <h1 className="bg-gradient-to-r from-[#00D4FF] to-[#0066FF] bg-clip-text text-transparent font-bold text-2xl">
            Integrations
          </h1>
          <p className="text-sm text-[#94A3B8] mt-1">
            One row per integration. Signals connectors auto-fill your Evidence Vault; the blockchain layer optionally mirrors equity events on-chain (off-chain is still the source of truth).
          </p>
          <p className="text-xs text-[#94A3B8]/70 mt-2">
            {summary.connected} of {summary.total} connected
            {summary.errored > 0 ? ` · ${summary.errored} need attention` : ""}
            {summary.not_configured > 0 ? ` · ${summary.not_configured} awaiting configuration` : ""}
          </p>
        </header>

        {sp.error ? (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            Connection failed: {sp.error.replaceAll("_", " ")}
          </div>
        ) : null}
        {sp.connected ? (
          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
            {sp.connected.toUpperCase()} connected. First sync completed.
          </div>
        ) : null}

        <div className="space-y-4">
          {rows.map((row) => (
            <IntegrationRowCard key={row.provider} row={row} />
          ))}
        </div>

        {/* ── CRM Push via Zapier ───────────────────────────────────── */}
        <section className="bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] backdrop-blur-sm rounded-2xl p-4 space-y-2">
          <h2 className="text-sm font-semibold text-[#F8FAFC]">
            CRM Push (via Zapier)
          </h2>
          <p className="text-xs text-[#94A3B8]">
            Push your startup profile and latest SVI score to HubSpot, Salesforce, Pipedrive, or any CRM
            connected through a Zapier webhook. Up to 5 pushes per hour.
          </p>
          <CrmPushButton />
        </section>
      </div>
    </WorkspaceLayout>
  );
}
