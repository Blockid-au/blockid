import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  isProviderConfigured,
  listConnections,
  revokeConnection,
  type OAuthProvider,
} from "@/lib/oauth-connectors";

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
      connected: Boolean(conn),
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

export async function DELETE(request: Request) {
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
