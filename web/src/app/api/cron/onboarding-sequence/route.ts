// GET|POST /api/cron/onboarding-sequence
//
// Post-signup onboarding emails for users who have NOT yet run an SVI analysis.
// Once they run an analysis, the lifecycle sequence (/api/cron/weekly-insights) takes over.
//
// Sequence (triggered from user.created_at):
//   D+1 : Welcome + how to run first SVI analysis
//   D+3 : Evidence Vault explainer — connect GitHub/Stripe/GA4
//   D+7 : Founding 50 upgrade CTA (scarcity-driven)
//
// Max 3 emails per user ever. Sends max 20 users per run. Respects email preferences.

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendEmail } from "@/lib/email";
import {
  canSendEmail,
  ensureEmailPreferences,
  getUnsubscribeUrl,
  getPreferencesUrl,
} from "@/lib/email-preferences";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface OnboardingStep {
  type: string;
  daysAfter: number;
  subject: (name: string) => string;
  body: (name: string, siteUrl: string, unsubUrl: string, prefsUrl: string) => string;
}

const STEPS: OnboardingStep[] = [
  {
    type: "onboarding_d1",
    daysAfter: 1,
    subject: (name) => `${name}, your BlockID workspace is ready`,
    body: (name, siteUrl, unsubUrl, prefsUrl) => `
      <h1 style="font-size:20px;margin:0 0 12px;">Hey ${name}! 👋</h1>
      <p>Welcome to BlockID.au — your AI-powered startup intelligence platform.</p>
      <p>You're 60 seconds away from knowing your <strong>Startup Value Index (SVI)</strong> — the score investors use to evaluate your startup readiness.</p>
      <p style="background:#eff6ff;border-left:3px solid #2563eb;padding:12px 16px;border-radius:0 8px 8px 0;font-size:14px;">
        <strong>Your SVI measures 8 dimensions:</strong> Traction, Market Penetration, Product-Market Fit, Team Strength, Market Size, IP Moat, Financial Health, and Investor Readiness.
      </p>
      <div style="text-align:center;margin:28px 0;">
        <a href="${siteUrl}/#svi" style="display:inline-block;background:#2563eb;color:white;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">Run My First Analysis →</a>
      </div>
      <p style="color:#64748b;font-size:13px;">It's free. Takes 60 seconds. No credit card required.</p>
      <p style="color:#94a3b8;font-size:11px;margin-top:24px;">
        <a href="${unsubUrl}" style="color:#94a3b8;">Unsubscribe</a> · <a href="${prefsUrl}" style="color:#94a3b8;">Email preferences</a>
      </p>`,
  },
  {
    type: "onboarding_d3",
    daysAfter: 3,
    subject: (name) => `${name}, connect your data to boost your SVI score`,
    body: (name, siteUrl, unsubUrl, prefsUrl) => `
      <h1 style="font-size:20px;margin:0 0 12px;">Hi ${name},</h1>
      <p>Did you know that founders who connect at least one data source score <strong>15-30 points higher</strong> on their SVI?</p>
      <p>BlockID's <strong>Evidence Vault</strong> lets you securely connect:</p>
      <ul style="line-height:2;">
        <li>🐙 <strong>GitHub</strong> — code commits, repo activity</li>
        <li>💳 <strong>Stripe</strong> — revenue, MRR, customer count</li>
        <li>📊 <strong>Google Analytics</strong> — traffic, engagement, sessions</li>
        <li>💼 <strong>LinkedIn</strong> — team credibility score</li>
      </ul>
      <div style="text-align:center;margin:28px 0;">
        <a href="${siteUrl}/workspace/evidence" style="display:inline-block;background:#2563eb;color:white;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">Connect Your First Source →</a>
      </div>
      <p style="color:#64748b;font-size:13px;">Your data stays private. We only read — never write.</p>
      <p style="color:#94a3b8;font-size:11px;margin-top:24px;">
        <a href="${unsubUrl}" style="color:#94a3b8;">Unsubscribe</a> · <a href="${prefsUrl}" style="color:#94a3b8;">Email preferences</a>
      </p>`,
  },
  {
    type: "onboarding_d7",
    daysAfter: 7,
    subject: (name) => `${name}, only a few Founding 50 spots left at A$49`,
    body: (name, siteUrl, unsubUrl, prefsUrl) => `
      <h1 style="font-size:20px;margin:0 0 12px;">Hi ${name},</h1>
      <p>We launched with <strong>50 founding accounts</strong> at a one-time price of <strong>A$49</strong>. Spots are filling up.</p>
      <p>The Founding 50 account gives you:</p>
      <ul style="line-height:2;">
        <li>✅ <strong>100 credits</strong> (50 SVI analyses)</li>
        <li>✅ <strong>Evidence Vault</strong> — connect all your data sources</li>
        <li>✅ <strong>Cap Table tools</strong> — equity split, vesting, ESOP</li>
        <li>✅ <strong>Term Sheet AI</strong> — analyse any investor term sheet</li>
        <li>✅ <strong>Lifetime access</strong> — no recurring fees</li>
      </ul>
      <div style="text-align:center;margin:28px 0;">
        <a href="${siteUrl}/founding-50" style="display:inline-block;background:#2563eb;color:white;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">Claim Your Spot — A$49 →</a>
      </div>
      <p style="color:#64748b;font-size:13px;">After the 50 spots are gone, this plan goes back to A$99/mo. No pressure — but the clock is ticking.</p>
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
    const now = Date.now();
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://blockid.au";
    let sent = 0;
    let skipped = 0;
    const MAX_BATCH = 20;

    // Only users who have NOT yet run an SVI analysis
    const { data: usersWithoutAnalysis } = await supabase
      .from("users")
      .select("id, email, display_name, created_at")
      .not(
        "email",
        "in",
        `(select distinct email from svi_analyses)`,
      )
      .order("created_at", { ascending: false })
      .limit(MAX_BATCH * 3);

    for (const u of (usersWithoutAnalysis ?? []).slice(0, MAX_BATCH)) {
      if (!u.email || !u.created_at) continue;

      const daysSinceSignup = Math.floor(
        (now - new Date(u.created_at).getTime()) / 86_400_000,
      );
      const firstName = (u.display_name as string)?.split(" ")[0] ?? "there";

      for (const step of STEPS) {
        if (daysSinceSignup < step.daysAfter) continue;
        if (daysSinceSignup > step.daysAfter + 3) continue;

        const { count } = await supabase
          .from("svi_notifications")
          .select("id", { count: "exact", head: true })
          .eq("email", u.email)
          .eq("notification_type", step.type);

        if ((count ?? 0) > 0) continue;

        const allowed = await canSendEmail(u.email as string, "weekly_reports");
        if (!allowed) { skipped++; continue; }

        const token = await ensureEmailPreferences(u.email as string);
        const unsubUrl = getUnsubscribeUrl(token, "weekly_reports");
        const prefsUrl = getPreferencesUrl(token);

        await sendEmail({
          to: u.email as string,
          subject: step.subject(firstName),
          html: `<div style="max-width:560px;margin:0 auto;font-family:Arial,sans-serif;color:#1e293b;">
            <div style="text-align:center;padding:24px 0;">
              <img src="${siteUrl}/images/logo-transparent.png" alt="BlockID.au" style="height:40px;" />
            </div>
            ${step.body(firstName, siteUrl, unsubUrl, prefsUrl)}
          </div>`,
          unsubscribeUrl: unsubUrl,
        });

        await supabase.from("svi_notifications").insert({
          email: u.email,
          account_id: null,
          notification_type: step.type,
        });

        sent++;
        break;
      }
    }

    return NextResponse.json({ ok: true, sent, skipped, policy: "onboarding_3_emails_pre_analysis" });
  } catch (err) {
    console.error("[onboarding-sequence]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

export { GET as POST };
