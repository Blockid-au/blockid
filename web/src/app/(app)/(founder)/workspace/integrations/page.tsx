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
import { getCurrentProjectIsSandbox, getProjectScope, roleCanAdmin } from "@/lib/projects";
import { CrmPushButton } from "@/components/founder/crm-push-button";
import { WebhooksSection } from "@/components/workspace/webhooks-section";
import { canUseWebhooks, WEBHOOK_EVENT_LABELS, WEBHOOK_EVENTS } from "@/lib/webhooks/registry";
import { supabaseWebhookStore } from "@/lib/webhooks/store";
import { publicEndpoint, type PublicEndpoint } from "@/lib/webhooks/http";

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

  // S20-B — Webhooks: the caller's own endpoints plus the active project's
  // (admin+ manages project-level ones; an editor / viewer sees view-only).
  // Never throws — a scope error or missing table just hides the list.
  let webhookProjectId: string | null = null;
  let webhookReadOnly = false;
  let webhookEndpoints: PublicEndpoint[] = [];
  try {
    const scope = await getProjectScope();
    if (scope) {
      if (roleCanAdmin(scope.role)) webhookProjectId = scope.projectId;
      else webhookReadOnly = true;
    }
    const store = supabaseWebhookStore();
    if (store) {
      const own = await store.listEndpoints({ userId: user.id });
      const project = webhookProjectId ? await store.listEndpoints({ projectId: webhookProjectId }) : [];
      const seen = new Set<string>();
      webhookEndpoints = [...project, ...own].filter((e) => !seen.has(e.id) && seen.add(e.id)).map(publicEndpoint);
    }
  } catch {
    webhookEndpoints = [];
  }
  const webhookAccess = await canUseWebhooks({ id: user.id, plan: user.plan, role: user.role });
  const webhookEvents = WEBHOOK_EVENTS.map((e) => ({ event: e, ...WEBHOOK_EVENT_LABELS[e] }));

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <header>
          <h1 className="text-primary font-bold text-2xl">
            Integrations
          </h1>
          <p className="text-sm text-muted mt-1">
            One row per integration. Signals connectors auto-fill your Evidence Vault; the blockchain layer optionally mirrors equity events on-chain (off-chain is still the source of truth).
          </p>
          <p className="text-xs text-muted/70 mt-2">
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
        <section className="bg-surface-sunken border border-line-subtle backdrop-blur-sm rounded-2xl p-4 space-y-2">
          <h2 className="text-sm font-semibold text-primary">
            CRM Push (via Zapier)
          </h2>
          <p className="text-xs text-muted">
            Push your startup profile and latest SVI score to HubSpot, Salesforce, Pipedrive, or any CRM
            connected through a Zapier webhook. Up to 5 pushes per hour.
          </p>
          <CrmPushButton />
        </section>

        {/* ── Outbound webhooks (S20-B) ─────────────────────────────── */}
        <WebhooksSection
          initialEndpoints={webhookEndpoints}
          events={webhookEvents}
          access={webhookAccess}
          projectId={webhookProjectId}
          readOnly={webhookReadOnly}
        />
      </div>
    </WorkspaceLayout>
  );
}
