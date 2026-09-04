// POST /api/tbr/[token]/lead
//
// Wave 27A — anonymous investor lead-capture on a shared TBR. Rate-limited
// to 3 submissions per IP per 24h. On success, notifies the founder via
// Telegram + email + founder_notifications feed.
//
// Body: {
//   investor_name?: string; investor_email: string;
//   investor_firm?: string; investor_role?: string;
//   interest_level: "exploring" | "warm" | "ready_to_talk";
//   message?: string;
// }

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { enforceRateLimit } from "@/lib/rate-limit";
import { sendTelegram, mdEscape } from "@/lib/telegram";
import { sendEmail } from "@/lib/email";
import { insertNotification, ownerFromShareToken } from "@/lib/notifications";
import { sendStep1 } from "@/lib/investor-drips/send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INTEREST_VALUES = ["exploring", "warm", "ready_to_talk"] as const;
type Interest = (typeof INTEREST_VALUES)[number];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    ""
  );
}

function siteBaseUrl(request: Request): string {
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL;
  if (envUrl) return envUrl.replace(/\/+$/, "");
  try {
    const u = new URL(request.url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return "https://blockid.au";
  }
}

interface Body {
  investor_name?: string;
  investor_email?: string;
  investor_firm?: string;
  investor_role?: string;
  interest_level?: string;
  message?: string;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token || token.length < 8) {
    return NextResponse.json({ ok: false, error: "invalid_token" }, { status: 400 });
  }

  // 3 leads per IP per 24h — hard cap to keep abuse manageable.
  const ip = clientIp(request);
  const limited = enforceRateLimit("tbr-lead", ip || "anon", request, 3, 24 * 60 * 60_000);
  if (limited) return limited;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const email = (body.investor_email ?? "").trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email) || email.length > 254) {
    return NextResponse.json({ ok: false, error: "invalid_email" }, { status: 400 });
  }
  const interest = body.interest_level as Interest | undefined;
  if (!interest || !INTEREST_VALUES.includes(interest)) {
    return NextResponse.json({ ok: false, error: "invalid_interest" }, { status: 400 });
  }

  const name = (body.investor_name ?? "").trim().slice(0, 120) || null;
  const firm = (body.investor_firm ?? "").trim().slice(0, 160) || null;
  const role = (body.investor_role ?? "").trim().slice(0, 120) || null;
  const message = (body.message ?? "").trim().slice(0, 2000) || null;

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "supabase_unavailable" }, { status: 503 });
  }

  // Verify token maps to a snapshot before inserting anything.
  const owner = await ownerFromShareToken(token);
  if (!owner) {
    return NextResponse.json({ ok: false, error: "unknown_token" }, { status: 404 });
  }

  const country = request.headers.get("cf-ipcountry") ?? null;

  const { data: inserted, error } = await supabase
    .from("tbr_leads")
    .insert({
      share_token: token,
      project_id: owner.projectId,
      investor_name: name,
      investor_email: email,
      investor_firm: firm,
      investor_role: role,
      interest_level: interest,
      message,
      viewer_country: country,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[tbr-lead] insert failed:", error.message);
    return NextResponse.json({ ok: false, error: "insert_failed" }, { status: 500 });
  }

  const leadId = (inserted as { id: number }).id;

  // Fire-and-forget notifications. Never await in the response path beyond
  // what's needed for correctness — Telegram/SMTP latency should not block
  // the investor's UX.
  void notifyFounder({
    request,
    ownerEmail: owner.email,
    ownerUserId: owner.userId,
    ownerProjectId: owner.projectId,
    lead: { id: leadId, name, email, firm, role, interest, message, country },
  });

  // Wave 31c — investor-facing drip Step 1 (T+0 acknowledgement).
  // Fire-and-forget; sendStep1 is fail-soft and gates on investor_unsubscribes.
  void sendStep1({
    leadId,
    investorEmail: email,
    investorName: name,
    shareToken: token,
    projectId: owner.projectId,
    baseUrl: siteBaseUrl(request),
  }).catch((err) => {
    console.warn("[tbr-lead] investor drip step1 failed:", err);
  });

  return NextResponse.json({
    ok: true,
    message: "Thanks — the founder has been notified.",
  });
}

interface NotifyArgs {
  request: Request;
  ownerEmail: string | null;
  ownerUserId: string;
  ownerProjectId: string | null;
  lead: {
    id: number;
    name: string | null;
    email: string;
    firm: string | null;
    role: string | null;
    interest: Interest;
    message: string | null;
    country: string | null;
  };
}

async function notifyFounder(args: NotifyArgs): Promise<void> {
  const { lead } = args;
  const interestLabel: Record<Interest, string> = {
    exploring: "Exploring",
    warm: "Warm",
    ready_to_talk: "Ready to talk",
  };

  // Telegram — reuses the existing helper (web/src/lib/telegram.ts).
  try {
    const lines = [
      `*New investor lead on your BlockID report*`,
      ``,
      `*Interest:* ${mdEscape(interestLabel[lead.interest])}`,
      `*Name:* ${mdEscape(lead.name ?? "(not provided)")}`,
      `*Email:* ${mdEscape(lead.email)}`,
    ];
    if (lead.firm) lines.push(`*Firm:* ${mdEscape(lead.firm)}`);
    if (lead.role) lines.push(`*Role:* ${mdEscape(lead.role)}`);
    if (lead.country) lines.push(`*Country:* ${mdEscape(lead.country)}`);
    if (lead.message) lines.push(``, mdEscape(lead.message).slice(0, 800));
    await sendTelegram(lines.join("\n"));
  } catch (err) {
    console.warn("[tbr-lead] telegram failed:", err);
  }

  // Email — best-effort; sendEmail already handles missing SMTP + Resend.
  if (args.ownerEmail) {
    try {
      const reportLink = `${siteBaseUrl(args.request)}/workspace/business-report`;
      const replyLink = `mailto:${lead.email}?subject=${encodeURIComponent("Following up on your interest in our startup")}`;
      const html = `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a;">
          <h1 style="font-size:20px;margin:0 0 12px;">New investor lead on your BlockID report</h1>
          <p style="color:#475569;font-size:14px;line-height:1.55;margin:0 0 20px;">
            An investor spent time reading your shared Trusted Business Report and asked to be in touch.
          </p>
          <table style="width:100%;border-collapse:collapse;font-size:14px;margin:0 0 20px;">
            <tr><td style="padding:6px 0;color:#475569;width:120px;">Interest</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(interestLabel[lead.interest])}</td></tr>
            <tr><td style="padding:6px 0;color:#475569;">Name</td><td style="padding:6px 0;">${escapeHtml(lead.name ?? "(not provided)")}</td></tr>
            <tr><td style="padding:6px 0;color:#475569;">Email</td><td style="padding:6px 0;"><a href="${escapeHtml(replyLink)}" style="color:#4338ca;">${escapeHtml(lead.email)}</a></td></tr>
            ${lead.firm ? `<tr><td style="padding:6px 0;color:#475569;">Firm</td><td style="padding:6px 0;">${escapeHtml(lead.firm)}</td></tr>` : ""}
            ${lead.role ? `<tr><td style="padding:6px 0;color:#475569;">Role</td><td style="padding:6px 0;">${escapeHtml(lead.role)}</td></tr>` : ""}
            ${lead.country ? `<tr><td style="padding:6px 0;color:#475569;">Country</td><td style="padding:6px 0;">${escapeHtml(lead.country)}</td></tr>` : ""}
          </table>
          ${lead.message ? `<div style="background:#f1f5f9;border-left:3px solid #4338ca;padding:12px 14px;border-radius:6px;font-size:14px;line-height:1.5;color:#0f172a;margin:0 0 20px;">${escapeHtml(lead.message)}</div>` : ""}
          <p style="margin:0 0 24px;">
            <a href="${escapeHtml(replyLink)}" style="display:inline-block;background:#4338ca;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;">Reply via email</a>
            &nbsp;
            <a href="${escapeHtml(reportLink)}" style="display:inline-block;color:#4338ca;text-decoration:none;padding:10px 18px;font-weight:600;">Open dashboard</a>
          </p>
          <p style="color:#94a3b8;font-size:12px;margin:24px 0 0;">Sent by BlockID.au — you can reply to this email to reach the investor directly.</p>
        </div>
      `;
      await sendEmail({
        to: args.ownerEmail,
        subject: "\u{1F3AF} New investor lead on your BlockID report",
        html,
      });
    } catch (err) {
      console.warn("[tbr-lead] email failed:", err);
    }
  }

  // Activity feed (Wave 27C).
  await insertNotification({
    userId: args.ownerUserId,
    projectId: args.ownerProjectId,
    kind: "tbr_lead",
    payload: {
      leadId: lead.id,
      email: lead.email,
      name: lead.name,
      firm: lead.firm,
      interest: lead.interest,
      country: lead.country,
    },
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
