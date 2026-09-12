import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  ensureEmailPreferences,
  getEmailPreferences,
  updateEmailPreferences,
} from "@/lib/email-preferences";
import { apiRoute } from "@/lib/audit/api-route";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json(
      { ok: false, reason: "Authentication required" },
      { status: 401 },
    );

  await ensureEmailPreferences(user.email, user.id);
  const prefs = await getEmailPreferences(user.email);
  return NextResponse.json({
    ok: true,
    notifyScoreViewed: prefs?.svi_alerts ?? true,
  });
}

async function POST_handler(request: Request) {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json(
      { ok: false, reason: "Authentication required" },
      { status: 401 },
    );

  let body: { notifyScoreViewed?: boolean };
  try {
    body = (await request.json()) as { notifyScoreViewed?: boolean };
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  await ensureEmailPreferences(user.email, user.id);
  await updateEmailPreferences(user.email, {
    svi_alerts: Boolean(body.notifyScoreViewed),
  });

  return NextResponse.json({ ok: true });
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/account/notify-prefs/route.ts", method: "POST" }, POST_handler);
