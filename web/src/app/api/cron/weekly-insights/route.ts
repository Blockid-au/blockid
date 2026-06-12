// POST /api/cron/weekly-insights — Lifecycle follow-up emails (NOT weekly spam)
//
// Email policy (tối thiểu, tế nhị):
//   1. Ngay khi nhận SVI → handled by SVI analysis route (not here)
//   2. 1 tuần sau → "follow_up_1w"
//   3. 1 tháng sau → "follow_up_1m"
//   4. 3 tháng sau → "follow_up_3m"
//
// That's it. No daily/weekly spam. Every email has unsubscribe link.
// Runs daily to check who is due, but sends max 1 email per user ever per milestone.

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendEmail } from "@/lib/email";
import { canSendEmail, ensureEmailPreferences, getUnsubscribeUrl, getPreferencesUrl } from "@/lib/email-preferences";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Milestone {
  type: string;
  daysAfter: number;
  subject: (name: string, svi: number) => string;
  body: (name: string, svi: number, siteUrl: string, unsubUrl: string, prefsUrl: string) => string;
}

const MILESTONES: Milestone[] = [
  {
    type: "follow_up_1w",
    daysAfter: 7,
    subject: (name, svi) => `${name}, your SVI is ${svi} — here's how to grow it`,
    body: (name, svi, siteUrl, unsubUrl, prefsUrl) => `
      <h1 style="font-size:20px;margin:0 0 12px;">Hey ${name}!</h1>
      <p>It's been a week since you got your SVI score of <strong style="color:#2563eb;">${svi}</strong>.</p>
      <p>Most founders who upload evidence within the first 2 weeks see their score jump by 15-30 points. Here are 3 quick wins:</p>
      <ol style="line-height:1.8;">
        <li>Upload a pitch deck or one-pager</li>
        <li>Add your team's LinkedIn profiles</li>
        <li>Connect any early traction metrics</li>
      </ol>
      <div style="text-align:center;margin:24px 0;">
        <a href="${siteUrl}/dashboard/svi" style="display:inline-block;background:#2563eb;color:white;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:600;">View Your Dashboard</a>
      </div>
      <p style="color:#64748b;font-size:13px;">No pressure — your data is safe and waiting for you whenever you're ready.</p>
      <p style="color:#94a3b8;font-size:11px;margin-top:24px;">
        <a href="${unsubUrl}" style="color:#94a3b8;">Unsubscribe</a> · <a href="${prefsUrl}" style="color:#94a3b8;">Email preferences</a>
      </p>`,
  },
  {
    type: "follow_up_1m",
    daysAfter: 30,
    subject: (name, svi) => `${name}, your startup progress this month (SVI: ${svi})`,
    body: (name, svi, siteUrl, unsubUrl, prefsUrl) => `
      <h1 style="font-size:20px;margin:0 0 12px;">Hi ${name},</h1>
      <p>It's been a month since your first SVI analysis. Your current score: <strong style="color:#2563eb;">${svi}</strong>.</p>
      <p>A quick check-in — have you considered:</p>
      <ul style="line-height:1.8;">
        <li>Setting up your equity structure (it's free)?</li>
        <li>Exploring the AI-powered detailed report for deeper insights?</li>
      </ul>
      <div style="text-align:center;margin:24px 0;">
        <a href="${siteUrl}/workspace/equity-setup" style="display:inline-block;background:#2563eb;color:white;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:600;">Set Up Equity</a>
      </div>
      <p style="color:#64748b;font-size:13px;">We're here to help — reply to this email anytime with questions.</p>
      <p style="color:#94a3b8;font-size:11px;margin-top:24px;">
        <a href="${unsubUrl}" style="color:#94a3b8;">Unsubscribe</a> · <a href="${prefsUrl}" style="color:#94a3b8;">Email preferences</a>
      </p>`,
  },
  {
    type: "follow_up_3m",
    daysAfter: 90,
    subject: (name, svi) => `${name}, 3-month check-in from BlockID (SVI: ${svi})`,
    body: (name, svi, siteUrl, unsubUrl, prefsUrl) => `
      <h1 style="font-size:20px;margin:0 0 12px;">Hi ${name},</h1>
      <p>3 months ago you started your journey with BlockID. Your SVI score: <strong style="color:#2563eb;">${svi}</strong>.</p>
      <p>A lot can change in 3 months — if your startup has evolved, consider running a fresh analysis to see your updated valuation.</p>
      <div style="text-align:center;margin:24px 0;">
        <a href="${siteUrl}/" style="display:inline-block;background:#2563eb;color:white;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:600;">Run New Analysis</a>
      </div>
      <p style="color:#64748b;font-size:13px;">This is the last scheduled email from us. You can always come back to blockid.au anytime.</p>
      <p style="color:#94a3b8;font-size:11px;margin-top:24px;">
        <a href="${unsubUrl}" style="color:#94a3b8;">Unsubscribe</a> · <a href="${prefsUrl}" style="color:#94a3b8;">Email preferences</a>
      </p>`,
  },
];

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });
  }

  try {
    const { data: accounts } = await supabase
      .from("svi_accounts")
      .select("id, email, name, current_svi, created_at")
      .not("current_svi", "is", null);

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://blockid.au";
    let sent = 0;
    let skipped = 0;
    const now = Date.now();
    const MAX_BATCH = 20;

    for (const account of (accounts ?? []).slice(0, MAX_BATCH)) {
      if (!account.current_svi || !account.created_at) continue;

      const daysSinceCreation = Math.floor((now - new Date(account.created_at).getTime()) / 86_400_000);
      const firstName = account.name?.split(" ")[0] ?? "there";

      for (const milestone of MILESTONES) {
        if (daysSinceCreation < milestone.daysAfter) continue;
        // Allow 3-day window (e.g. day 7-10 for 1w milestone)
        if (daysSinceCreation > milestone.daysAfter + 3) continue;

        // Check if already sent this milestone
        const { count } = await supabase
          .from("svi_notifications")
          .select("id", { count: "exact", head: true })
          .eq("email", account.email)
          .eq("notification_type", milestone.type);

        if ((count ?? 0) > 0) continue;

        // Check user preference
        const allowed = await canSendEmail(account.email, "weekly_reports");
        if (!allowed) { skipped++; continue; }

        // Build email with unsubscribe
        const token = await ensureEmailPreferences(account.email);
        const unsubUrl = getUnsubscribeUrl(token, "weekly_reports");
        const prefsUrl = getPreferencesUrl(token);

        await sendEmail({
          to: account.email,
          subject: milestone.subject(firstName, account.current_svi),
          html: `<div style="max-width:560px;margin:0 auto;font-family:Arial,sans-serif;color:#1e293b;">
            <div style="text-align:center;padding:24px 0;">
              <img src="${siteUrl}/images/logo-transparent.png" alt="BlockID.au" style="height:40px;" />
            </div>
            ${milestone.body(firstName, account.current_svi, siteUrl, unsubUrl, prefsUrl)}
          </div>`,
          unsubscribeUrl: unsubUrl,
        });

        // Record to prevent re-sending
        await supabase.from("svi_notifications").insert({
          email: account.email,
          account_id: account.id,
          notification_type: milestone.type,
        });

        sent++;
        break; // Max 1 email per user per cron run
      }
    }

    return NextResponse.json({ ok: true, sent, skipped, policy: "lifecycle_4_emails_only" });
  } catch (err) {
    console.error("[weekly-insights]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

export { GET as POST };
