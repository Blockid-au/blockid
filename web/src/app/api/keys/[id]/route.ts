import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { revokeApiKey } from "@/lib/api-keys";
import { logUserAction, extractIp, extractUserAgent } from "@/lib/audit/log";

// DELETE /api/keys/[id] — Revoke an API key (session auth + ownership check)
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, reason: "Authentication required" },
      { status: 401 },
    );
  }

  const { id } = await params;

  if (!id || typeof id !== "string") {
    return NextResponse.json(
      { ok: false, reason: "Key ID is required." },
      { status: 400 },
    );
  }

  const result = await revokeApiKey(id, user.id);

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, reason: result.error ?? "Failed to revoke key." },
      { status: 500 },
    );
  }

  // SOC2-lite audit — key_prefix is the DB-stored truncated form (first
  // 16 chars + "..."), never the raw secret. If the pre-update lookup
  // missed (e.g. race), prefix is omitted rather than fabricated.
  await logUserAction({
    userId: user.id,
    action: "api_key.revoked",
    subjectType: "api_key",
    subjectId: id,
    fields: {
      key_id: id,
      ...(result.keyPrefix ? { key_prefix: result.keyPrefix } : {}),
    },
    route: `/api/keys/${id}`,
    ip: extractIp(request.headers),
    ua: extractUserAgent(request.headers),
  });

  return NextResponse.json({ ok: true });
}

export const dynamic = "force-dynamic";
