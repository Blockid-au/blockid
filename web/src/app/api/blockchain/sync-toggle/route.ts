import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { toggleSync, getSyncConfig } from "@/lib/blockchain-sync";

export const dynamic = "force-dynamic";

// POST /api/blockchain/sync-toggle — Enable/disable/pause/catch-up blockchain sync
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const action = String(body.action ?? "");
  const validActions = ["enable", "disable", "pause", "catch_up"];
  if (!validActions.includes(action)) {
    return NextResponse.json(
      { ok: false, error: `Invalid action. Use: ${validActions.join(", ")}` },
      { status: 400 },
    );
  }

  const result = await toggleSync(
    user.id,
    action as "enable" | "disable" | "pause" | "catch_up",
  );

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: "Failed to update sync state" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, syncState: result.newState });
}

// GET /api/blockchain/sync-toggle — Get current sync status
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

  const config = await getSyncConfig(user.id);
  return NextResponse.json({
    ok: true,
    config: config ?? {
      syncEnabled: false,
      syncState: "off",
      tokenAddress: null,
      tokenSymbol: null,
      pendingEvents: 0,
    },
  });
}
