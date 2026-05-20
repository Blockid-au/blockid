import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listApiKeys, canCreateApiKeys, getRateLimitForPlan } from "@/lib/api-keys";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { ApiKeysClient } from "./api-keys-client";

export const metadata: Metadata = {
  title: "API Keys",
  description: "Manage API keys for programmatic access to BlockID.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ApiKeysPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/api-keys");

  const keys = await listApiKeys(user.id);
  const canCreate = canCreateApiKeys(user.plan);
  const rateLimit = getRateLimitForPlan(user.plan);

  return (
    <WorkspaceLayout user={user}>
      <div className="p-6 max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-ink-800">API Keys</h1>
          <p className="text-sm text-ink-700 mt-1">
            Manage API keys for programmatic access to BlockID.
          </p>
        </div>

        <ApiKeysClient
          keys={keys}
          canCreate={canCreate}
          currentPlan={user.plan ?? "free"}
          rateLimit={rateLimit}
        />
      </div>
    </WorkspaceLayout>
  );
}
