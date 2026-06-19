// /api/svi-api/keys — manage SVI institutional API keys (T_SVI_EXC_0014)
// GET = list user's keys; POST = create free key; DELETE ?id=<id> = revoke

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createSviApiKey, listSviApiKeys, revokeSviApiKey } from "@/lib/svi-api-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ ok: false, error: "Sign in required" }, { status: 401 });
  const keys = await listSviApiKeys(me.id);
  return NextResponse.json({ ok: true, keys });
}

export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ ok: false, error: "Sign in required" }, { status: 401 });

  let body: { name?: string; tier?: string } = {};
  try { body = await req.json(); } catch { /* ignore */ }

  // Only allow creating free keys via this route — paid tiers go through /api/svi-api/checkout
  const result = await createSviApiKey(me.id, "free", body.name);
  if ("error" in result) return NextResponse.json({ ok: false, error: result.error }, { status: 400 });

  return NextResponse.json({ ok: true, key: result.raw, id: result.id, message: "Store this key — it won't be shown again." });
}

export async function DELETE(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ ok: false, error: "Sign in required" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });

  const ok = await revokeSviApiKey(me.id, id);
  return NextResponse.json({ ok });
}
