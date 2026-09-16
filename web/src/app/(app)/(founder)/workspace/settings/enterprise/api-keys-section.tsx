// S-IA2 — ex /workspace/api-keys ("API Keys"), now the "API keys" section of
// /workspace/settings/enterprise. Async server component: lists the caller's
// keys and resolves the plan gate (`canCreateApiKeys`) — a lower plan still
// sees <ApiKeysClient>'s own "API access is on Enterprise plans" upgrade card
// rather than a redirect. The composed page authenticates once and passes
// `user` down.

import type { AppUser } from "@/lib/auth";
import { listApiKeys, canCreateApiKeys, getRateLimitForPlan } from "@/lib/api-keys";
import { ApiKeysClient } from "./api-keys-client";

export async function ApiKeysSection({ user }: { user: AppUser }) {
  const keys = await listApiKeys(user.id);
  const canCreate = await canCreateApiKeys(user);
  const rateLimit = getRateLimitForPlan(user.plan);

  return (
    <section aria-labelledby="api-keys" data-testid="api-keys-section">
      <div className="mb-6">
        <h2 id="api-keys" className="scroll-mt-24 text-xl font-bold text-ink-800">API Keys</h2>
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
    </section>
  );
}
