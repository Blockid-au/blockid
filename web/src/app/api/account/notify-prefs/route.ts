import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  ensureEmailPreferences,
  getEmailPreferences,
  updateEmailPreferences,
} from "@/lib/email-preferences";

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

export async function POST(request: Request) {
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
