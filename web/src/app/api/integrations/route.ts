import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  isProviderConfigured,
  listConnections,
  revokeConnection,
  type OAuthProvider,
} from "@/lib/oauth-connectors";
import { apiRoute } from "@/lib/audit/api-route";

export const dynamic = "force-dynamic";

const PROVIDERS: OAuthProvider[] = ["github", "stripe", "ga4"];

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const connections = await listConnections(user.id);
  const summary = PROVIDERS.map((provider) => {
    const conn = connections.find(
      (c) => c.provider === provider && c.status === "active",
    );
    return {
      provider,
      configured: isProviderConfigured(provider),
      connected: Boolean(conn) && !conn?.tokenUnreadable,
      // S23-A — stored token exists but cannot be opened (unsealed row
      // refused after the key was set, or a rotated-away key): the founder
      // must re-authorise. Never "connected" with a token we cannot use.
      needsReconnect: Boolean(conn?.tokenUnreadable),
      id: conn?.id ?? null,
      providerAccountId: conn?.providerAccountId ?? null,
      lastSyncAt: conn?.lastSyncAt ?? null,
      lastSyncError: conn?.lastSyncError ?? null,
      status: conn?.status ?? null,
      metadata: conn?.metadata ?? null,
    };
  });

  return NextResponse.json({ ok: true, connections: summary });
}

async function DELETE_handler(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const url = new URL(request.url);
  const providerParam = url.searchParams.get("provider");
  if (!providerParam || !PROVIDERS.includes(providerParam as OAuthProvider)) {
    return NextResponse.json({ ok: false, error: "bad_provider" }, { status: 400 });
  }

  const connections = await listConnections(user.id);
  const conn = connections.find(
    (c) => c.provider === (providerParam as OAuthProvider) && c.status === "active",
  );
  if (!conn) {
    return NextResponse.json({ ok: true, revoked: false });
  }

  await revokeConnection(conn.id);
  return NextResponse.json({ ok: true, revoked: true });
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const DELETE = apiRoute({ route: "api/integrations/route.ts", method: "DELETE" }, DELETE_handler);
