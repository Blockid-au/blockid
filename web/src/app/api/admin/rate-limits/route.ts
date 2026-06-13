// GET /api/admin/rate-limits — admin-only, returns current rate-limit snapshot
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getRateLimitSnapshot } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const entries = getRateLimitSnapshot();
  return NextResponse.json({ ok: true, entries, generatedAt: Date.now() });
}
