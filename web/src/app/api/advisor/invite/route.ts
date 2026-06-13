import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

// POST /api/advisor/invite — invite a founder as a client
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const { email } = (body as { email?: string }) ?? {};
  if (!email || typeof email !== "string") {
    return NextResponse.json({ ok: false, error: "Missing email" }, { status: 400 });
  }

  const normEmail = email.trim().toLowerCase();
  if (normEmail === user.email.toLowerCase()) {
    return NextResponse.json(
      { ok: false, error: "Cannot invite yourself" },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Service unavailable" }, { status: 503 });
  }

  // Check if invite already pending
  const { data: existing } = await supabase
    .from("advisor_invites")
    .select("id")
    .eq("advisor_id", user.id)
    .eq("invited_email", normEmail)
    .eq("status", "pending")
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { ok: false, error: "Invite already sent to this email" },
      { status: 409 },
    );
  }

  // Insert invite record
  const { error: insertErr } = await supabase.from("advisor_invites").insert({
    advisor_id: user.id,
    advisor_email: user.email,
    invited_email: normEmail,
    status: "pending",
  });

  if (insertErr) {
    console.error("[blockid:advisor] invite insert failed", insertErr);
    return NextResponse.json({ ok: false, error: "Failed to create invite" }, { status: 500 });
  }

  // Send invite email
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://blockid.au";
  const advisorName = user.displayName ?? user.email;

  await sendEmail({
    to: normEmail,
    subject: `${advisorName} has invited you to BlockID.au`,
    html: `
      <p>Hi there,</p>
      <p><strong>${advisorName}</strong> has invited you to collaborate on BlockID.au — Australia's AI-powered startup intelligence platform.</p>
      <p>Accept the invitation to share your Startup Value Index (SVI) score and progress with your advisor.</p>
      <div style="text-align:center;margin:24px 0;">
        <a href="${siteUrl}/auth/login?advisor_invite=1&advisor=${encodeURIComponent(user.email)}"
           style="display:inline-block;background:#2563eb;color:white;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:700;">
          Accept Invitation →
        </a>
      </div>
      <p style="color:#94a3b8;font-size:12px;">If you don't recognise ${advisorName}, you can safely ignore this email.</p>
    `,
  });

  return NextResponse.json({ ok: true });
}
