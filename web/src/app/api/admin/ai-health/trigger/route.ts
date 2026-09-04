// POST /api/admin/ai-health/trigger — admin-gated manual trigger for the
// AI health-check or discovery cron routes. Lets the admin dashboard fire
// runs on-demand without needing the CRON_SECRET client-side.

import { NextResponse } from "next/server";
import { getCurrentUser, ADMIN_EMAIL } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const isAdmin = user.email === ADMIN_EMAIL || user.role === "admin";
  if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({} as { action?: string }));
  const action = (body as { action?: string }).action;
  if (action !== "health" && action !== "discovery") {
    return NextResponse.json({ error: "action must be 'health' or 'discovery'" }, { status: 400 });
  }

  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });

  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3000";
  const path = action === "health" ? "/api/cron/ai-health-check" : "/api/cron/ai-model-discovery";
  const url = `${base.replace(/\/$/, "")}${path}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
  });
  const json = await res.json().catch(() => ({}));
  return NextResponse.json({ ok: res.ok, status: res.status, result: json });
}
