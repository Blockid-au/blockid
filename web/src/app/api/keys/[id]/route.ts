import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { revokeApiKey } from "@/lib/api-keys";

// DELETE /api/keys/[id] — Revoke an API key (session auth + ownership check)
export async function DELETE(
  _request: Request,
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

  return NextResponse.json({ ok: true });
}

export const dynamic = "force-dynamic";
