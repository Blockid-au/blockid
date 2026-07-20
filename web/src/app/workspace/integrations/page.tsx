import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { OAuthConnectorCard } from "@/components/workspace/oauth-connector-card";
import {
  isProviderConfigured,
  listConnections,
  type OAuthConnection,
  type OAuthProvider,
} from "@/lib/oauth-connectors";

export const metadata: Metadata = {
  title: "Integrations",
  description:
    "Connect GitHub, Stripe, and Google Analytics to auto-fill your Evidence Vault.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface CardConfig {
  provider: OAuthProvider;
  title: string;
  description: string;
}

const CARDS: CardConfig[] = [
  {
    provider: "github",
    title: "GitHub",
    description:
      "Read-only access to your repos, commits, and stars. Feeds product-traction signals.",
  },
  {
    provider: "stripe",
    title: "Stripe",
    description:
      "Read-only OAuth (Stripe Connect). Pulls MRR, active customers, and 30-day payments (normalised to AUD).",
  },
  {
    provider: "ga4",
    title: "Google Analytics 4",
    description:
      "Read-only access to a GA4 property. Pulls sessions, new users, conversions, and average session duration.",
  },
];

function findConn(
  conns: OAuthConnection[],
  provider: OAuthProvider,
): OAuthConnection | undefined {
  return conns.find((c) => c.provider === provider && c.status === "active");
}

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; connected?: string }>;
}): Promise<React.ReactElement> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/integrations");

  const sp = await searchParams;
  const connections = await listConnections(user.id);

  return (
    <WorkspaceLayout user={user}>
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <header>
          <h1 className="text-2xl font-semibold text-ink-900 dark:text-ink-100">
            Integrations
          </h1>
          <p className="text-sm text-ink-600 dark:text-ink-400 mt-1">
            Link the tools your startup already uses. BlockID pulls read-only
            signals into your Evidence Vault and feeds them into your SVI score.
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
          {CARDS.map((c) => {
            const conn = findConn(connections, c.provider);
            return (
              <OAuthConnectorCard
                key={c.provider}
                provider={c.provider}
                title={c.title}
                description={c.description}
                configured={isProviderConfigured(c.provider)}
                initialConnected={Boolean(conn)}
                initialAccountId={conn?.providerAccountId ?? null}
                initialLastSyncAt={conn?.lastSyncAt ?? null}
                initialLastSyncError={conn?.lastSyncError ?? null}
              />
            );
          })}
        </div>
      </div>
    </WorkspaceLayout>
  );
}
