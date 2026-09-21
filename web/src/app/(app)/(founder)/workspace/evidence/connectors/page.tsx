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
import {
  DashboardIntegrationsSection,
  SECTION_CONNECTED_VALUES,
} from "./dashboard-integrations-section";
import { getSupabaseAdmin } from "@/lib/supabase";
import { connectorFreshness, type ConnectorFreshness } from "@/lib/evidence/freshness";
import { CATALOGUE_PROVIDER_TO_EVIDENCE, connectorEvidenceValue, notOfferedConnectors } from "@/lib/connectors/evidence-value";
import { hiddenFeature } from "@/lib/features/hidden";
import {
  ConnectorEvidenceStrip,
  FreshnessBadge,
  NotOfferedConnectorsList,
  type NotOfferedConnectorItem,
} from "@/components/workspace/connector-evidence-value";

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
  if (!user) redirect("/auth/login?next=/workspace/evidence/connectors");

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

  // G20-F1 (2026-09-20): a connector whose OAuth app is not provisioned on
  // this deployment (Stripe Connect today — STRIPE_CLIENT_ID unset) is not
  // listed at all instead of showing a disabled "not available yet" button.
  // Setting the env key un-hides the row (lib/features/hidden.ts documents
  // the hidden connectors).
  const allRows = buildIntegrationsCatalogue({
    oauthConnections,
    blockchainConfig,
    providerConfigured: isProviderConfigured,
  });
  const rows = allRows.filter((row) => row.status !== "not_configured");
  const summary = summariseCatalogue(rows);

  // G21 P3-C — which claim each source makes more trustworthy + freshness.
  // Freshness is project-scoped (oauth_connections_v2 + connector_snapshots);
  // a missing project or db yields no badge rather than a wrong one.
  let projectIdForEvidence: string | null = null;
  try {
    projectIdForEvidence = (await getProjectScope())?.projectId ?? null;
  } catch {
    projectIdForEvidence = null;
  }
  const freshness = projectIdForEvidence ? await connectorFreshness(projectIdForEvidence, { db: getSupabaseAdmin() }) : [];
  const freshnessFor = (provider: string): ConnectorFreshness | null => freshness.find((f) => f.provider === provider) ?? null;
  const xeroConfigured = Boolean(process.env.XERO_CLIENT_ID);
  const xeroFreshness = freshnessFor("xero");
  // The G20 hidden connectors (unprovisioned OAuth apps) keep their
  // "Not offered yet" card — as a list row here, with the sentence — and
  // the Priority-2/3 integrations get one row each.
  const notOffered: NotOfferedConnectorItem[] = [];
  for (const row of allRows) {
    if (row.status !== "not_configured") continue;
    const value = connectorEvidenceValue(CATALOGUE_PROVIDER_TO_EVIDENCE[row.provider] ?? row.provider);
    if (!value) continue;
    const key = value.hiddenKey ?? `connector_${value.id}`;
    notOffered.push({ value, featureKey: key, reason: hiddenFeature(key)?.reason ?? value.sentence });
  }
  if (!xeroConfigured) {
    const value = connectorEvidenceValue("xero")!;
    notOffered.push({ value, featureKey: "connector_xero", reason: hiddenFeature("connector_xero")?.reason ?? value.sentence });
  }
  for (const value of notOfferedConnectors()) {
    const key = value.hiddenKey ?? `connector_${value.id}`;
    notOffered.push({ value, featureKey: key, reason: hiddenFeature(key)?.reason ?? value.sentence });
  }

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
          </p>
        </header>

        {sp.error ? (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            Connection failed: {sp.error.replaceAll("_", " ")}
          </div>
        ) : null}
        {sp.connected &&
        !(SECTION_CONNECTED_VALUES as readonly string[]).includes(sp.connected) ? (
          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
            {sp.connected.toUpperCase()} connected. First sync completed.
          </div>
        ) : null}

        <div className="space-y-4">
          {rows.map((row) => (
            <div key={row.provider} data-connector-card={row.provider}>
              <IntegrationRowCard row={row} />
              {row.kind === "oauth" ? (
                <ConnectorEvidenceStrip
                  id={CATALOGUE_PROVIDER_TO_EVIDENCE[row.provider] ?? row.provider}
                  freshness={row.status === "connected" || row.status === "error" ? freshnessFor(row.provider) : null}
                />
              ) : (
                <p className="mt-2 px-1 text-xs text-muted" data-evidence-sentence>
                  Strengthens no claim on its own: a transparency mirror of cap-table events already recorded off-chain, which stays the source of truth.
                </p>
              )}
            </div>
          ))}
          {xeroConfigured ? (
            <div data-connector-card="xero">
              <div className="border border-ink-200 dark:border-ink-800 rounded-lg p-5 bg-white dark:bg-ink-900">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-semibold text-ink-900 dark:text-ink-100">Xero</h3>
                      {xeroFreshness ? <FreshnessBadge freshness={xeroFreshness} /> : null}
                    </div>
                    <p className="text-sm text-ink-600 dark:text-ink-400 mt-1">
                      Read-only OAuth. Pulls the 3-month profit and loss and the bank balance from your accounting file (AUD).
                    </p>
                    {xeroFreshness?.error ? <p className="text-xs text-red-600 dark:text-red-400 mt-1">{xeroFreshness.error}</p> : null}
                  </div>
                  <a href="/api/oauth/xero" className="px-3 py-1.5 text-sm rounded-md bg-brand-600 hover:bg-brand-700 text-white shrink-0">
                    {xeroFreshness ? "Reconnect" : "Connect"}
                  </a>
                </div>
              </div>
              <ConnectorEvidenceStrip id="xero" freshness={xeroFreshness} />
            </div>
          ) : null}
        </div>

        <NotOfferedConnectorsList items={notOffered} />

        {/* ── Evidence sources (S-IA2, ex /dashboard/integrations) ──── */}
        <DashboardIntegrationsSection user={user} connected={sp.connected} />

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
